from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.models import RagChunk, RagDocument, RagKnowledgeBase
from backend.app.services.rag.embeddings import get_embedding_provider
from backend.app.services.rag.rerankers import get_reranker
from backend.app.services.rag.utils import cosine_similarity, json_loads, tokenize_query, vector_from_db, vector_to_db


@dataclass
class RetrievedChunk:
    child_chunk_id: str
    parent_chunk_id: str
    document_id: str
    file_name: str
    heading_path: list[str]
    page_start: int | None
    page_end: int | None
    slide_start: int | None
    slide_end: int | None
    content: str
    dense_rank: int | None = None
    lexical_rank: int | None = None
    fusion_score: float = 0
    rerank_score: float | None = None


def default_retrieval_config(kb: RagKnowledgeBase | None = None) -> dict[str, Any]:
    settings = get_settings()
    config = {
        "dense_top_k": settings.dense_top_k,
        "lexical_top_k": settings.lexical_top_k,
        "rerank_top_n": settings.rerank_top_n,
        "min_rerank_score": settings.min_rerank_score,
        "fusion": "rrf",
        "rrf_k": settings.rrf_k,
    }
    if kb:
        config.update(json_loads(kb.retrieval_config, {}))
    return config


def _child_rows(db: Session, kb_id: str) -> list[tuple[RagChunk, RagDocument]]:
    return list(
        db.execute(
            select(RagChunk, RagDocument)
            .join(RagDocument, RagDocument.id == RagChunk.document_id)
            .where(
                RagChunk.knowledge_base_id == kb_id,
                RagChunk.chunk_type == "child",
                RagChunk.enabled.is_(True),
                RagDocument.status == "READY",
                RagDocument.deleted_at.is_(None),
                RagChunk.document_version_id == RagDocument.active_version_id,
            )
        ).all()
    )


def dense_retrieve(db: Session, kb_id: str, query: str, top_k: int) -> list[RetrievedChunk]:
    provider = get_embedding_provider()
    query_embedding = provider.embed([query])[0]
    if db.bind and db.bind.dialect.name == "postgresql":
        rows = db.execute(
            text(
                """
                SELECT c.id AS child_chunk_id, c.parent_chunk_id, c.document_id, d.name AS file_name,
                       c.heading_path, c.page_start, c.page_end, c.slide_start, c.slide_end, c.content,
                       1 - (c.embedding <=> CAST(:query_embedding AS vector)) AS dense_score
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE c.knowledge_base_id = :kb_id
                  AND c.chunk_type = 'child'
                  AND c.enabled = true
                  AND d.status = 'READY'
                  AND d.deleted_at IS NULL
                  AND c.document_version_id = d.active_version_id
                ORDER BY c.embedding <=> CAST(:query_embedding AS vector)
                LIMIT :top_k
                """
            ),
            {"kb_id": kb_id, "query_embedding": vector_to_db(query_embedding), "top_k": top_k},
        ).mappings()
        return [
            RetrievedChunk(
                child_chunk_id=row["child_chunk_id"],
                parent_chunk_id=row["parent_chunk_id"],
                document_id=row["document_id"],
                file_name=row["file_name"],
                heading_path=json_loads(row["heading_path"], []),
                page_start=row["page_start"],
                page_end=row["page_end"],
                slide_start=row["slide_start"],
                slide_end=row["slide_end"],
                content=row["content"],
                dense_rank=index + 1,
            )
            for index, row in enumerate(rows)
        ]

    scored: list[tuple[float, RagChunk, RagDocument]] = []
    for chunk, document in _child_rows(db, kb_id):
        score = cosine_similarity(query_embedding, vector_from_db(chunk.embedding))
        scored.append((score, chunk, document))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        RetrievedChunk(
            child_chunk_id=chunk.id,
            parent_chunk_id=chunk.parent_chunk_id or "",
            document_id=document.id,
            file_name=document.name,
            heading_path=json_loads(chunk.heading_path, []),
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            slide_start=chunk.slide_start,
            slide_end=chunk.slide_end,
            content=chunk.content,
            dense_rank=index + 1,
        )
        for index, (_, chunk, document) in enumerate(scored[:top_k])
    ]


def lexical_retrieve(db: Session, kb_id: str, query: str, top_k: int) -> list[RetrievedChunk]:
    if db.bind and db.bind.dialect.name == "postgresql":
        rows = db.execute(
            text(
                """
                SELECT c.id AS child_chunk_id, c.parent_chunk_id, c.document_id, d.name AS file_name,
                       c.heading_path, c.page_start, c.page_end, c.slide_start, c.slide_end, c.content,
                       ts_rank_cd(c.search_vector, plainto_tsquery('simple', :query)) AS lexical_score
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE c.knowledge_base_id = :kb_id
                  AND c.chunk_type = 'child'
                  AND c.enabled = true
                  AND d.status = 'READY'
                  AND d.deleted_at IS NULL
                  AND c.document_version_id = d.active_version_id
                  AND c.search_vector @@ plainto_tsquery('simple', :query)
                ORDER BY lexical_score DESC
                LIMIT :top_k
                """
            ),
            {"kb_id": kb_id, "query": query, "top_k": top_k},
        ).mappings()
        return [
            RetrievedChunk(
                child_chunk_id=row["child_chunk_id"],
                parent_chunk_id=row["parent_chunk_id"],
                document_id=row["document_id"],
                file_name=row["file_name"],
                heading_path=json_loads(row["heading_path"], []),
                page_start=row["page_start"],
                page_end=row["page_end"],
                slide_start=row["slide_start"],
                slide_end=row["slide_end"],
                content=row["content"],
                lexical_rank=index + 1,
            )
            for index, row in enumerate(rows)
        ]

    terms = tokenize_query(query)
    scored: list[tuple[float, RagChunk, RagDocument]] = []
    for chunk, document in _child_rows(db, kb_id):
        lowered = chunk.content.lower()
        score = sum(lowered.count(term.lower()) for term in terms)
        if score:
            scored.append((float(score), chunk, document))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        RetrievedChunk(
            child_chunk_id=chunk.id,
            parent_chunk_id=chunk.parent_chunk_id or "",
            document_id=document.id,
            file_name=document.name,
            heading_path=json_loads(chunk.heading_path, []),
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            slide_start=chunk.slide_start,
            slide_end=chunk.slide_end,
            content=chunk.content,
            lexical_rank=index + 1,
        )
        for index, (_, chunk, document) in enumerate(scored[:top_k])
    ]


def rrf_fusion(dense: list[RetrievedChunk], lexical: list[RetrievedChunk], k: int) -> list[RetrievedChunk]:
    merged: dict[str, RetrievedChunk] = {}
    for rank, item in enumerate(dense, start=1):
        current = merged.setdefault(item.child_chunk_id, item)
        current.dense_rank = rank
        current.fusion_score += 1 / (k + rank)
    for rank, item in enumerate(lexical, start=1):
        current = merged.setdefault(item.child_chunk_id, item)
        current.lexical_rank = rank
        current.fusion_score += 1 / (k + rank)
    return sorted(merged.values(), key=lambda item: item.fusion_score, reverse=True)


def retrieve_chunks(
    db: Session,
    kb_id: str,
    query: str,
    *,
    dense_top_k: int | None = None,
    lexical_top_k: int | None = None,
    rerank_top_n: int | None = None,
) -> list[RetrievedChunk]:
    kb = db.get(RagKnowledgeBase, kb_id)
    config = default_retrieval_config(kb)
    dense = dense_retrieve(db, kb_id, query, dense_top_k or int(config["dense_top_k"]))
    lexical = lexical_retrieve(db, kb_id, query, lexical_top_k or int(config["lexical_top_k"]))
    fused = rrf_fusion(dense, lexical, int(config["rrf_k"]))[: get_settings().rerank_candidates]
    if not fused:
        return []
    reranker = get_reranker()
    reranked = reranker.rerank(query, [item.content for item in fused], rerank_top_n or int(config["rerank_top_n"]))
    min_score = config.get("min_rerank_score")
    results: list[RetrievedChunk] = []
    for rerank in reranked:
        item = fused[rerank.index]
        item.rerank_score = rerank.score
        if min_score is None or rerank.score >= float(min_score):
            results.append(item)
    return results


def parent_contexts(db: Session, ranked_children: list[RetrievedChunk]) -> list[tuple[RetrievedChunk, RagChunk]]:
    seen: set[str] = set()
    contexts: list[tuple[RetrievedChunk, RagChunk]] = []
    for child in ranked_children:
        parent_id = child.parent_chunk_id
        if not parent_id or parent_id in seen:
            continue
        parent = db.get(RagChunk, parent_id)
        if parent and parent.enabled:
            seen.add(parent_id)
            contexts.append((child, parent))
        if len(contexts) >= get_settings().max_parent_chunks:
            break
    return contexts
