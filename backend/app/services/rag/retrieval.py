from __future__ import annotations

from dataclasses import dataclass, replace
import logging
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.models import RagChunk, RagDocument, RagDocumentVersion, RagKnowledgeBase
from backend.app.services.rag.embeddings import get_embedding_provider, validate_embeddings
from backend.app.services.rag.lexical import bm25_scores
from backend.app.services.rag.rerankers import get_reranker
from backend.app.services.rag.utils import cosine_similarity, json_loads, tokenize_query, vector_from_db, vector_to_db, retrieval_text

logger = logging.getLogger(__name__)


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
    dense_score: float | None = None
    lexical_score: float | None = None


def default_retrieval_config(kb: RagKnowledgeBase | None = None) -> dict[str, Any]:
    settings = get_settings()
    config = {key: getattr(settings, key) for key in
              ("dense_top_k", "lexical_top_k", "rerank_top_n", "min_rerank_score", "rrf_k")}
    config["fusion"] = "rrf"
    if kb:
        config.update(json_loads(kb.retrieval_config, {}))
    return config


def _child_statement(kb_id: str):
    return (select(RagChunk, RagDocument)
            .join(RagDocument, RagDocument.id == RagChunk.document_id)
            .join(RagDocumentVersion, RagDocumentVersion.id == RagChunk.document_version_id)
            .where(RagChunk.knowledge_base_id == kb_id,
                   RagDocument.knowledge_base_id == kb_id,
                   RagChunk.chunk_type == "child", RagChunk.enabled.is_(True),
                   RagDocumentVersion.status == "READY", RagDocument.deleted_at.is_(None),
                   RagChunk.document_version_id == RagDocument.active_version_id))


def _child_rows(db: Session, kb_id: str) -> list[tuple[RagChunk, RagDocument]]:
    return list(db.execute(_child_statement(kb_id).order_by(RagChunk.id)).all())


def _result(chunk: RagChunk, document: RagDocument, **scores) -> RetrievedChunk:
    return RetrievedChunk(chunk.id, chunk.parent_chunk_id or "", document.id, document.name,
                          json_loads(chunk.heading_path, []), chunk.page_start, chunk.page_end,
                          chunk.slide_start, chunk.slide_end, chunk.content, **scores)


def dense_retrieve(db: Session, kb_id: str, query: str, top_k: int) -> list[RetrievedChunk]:
    kb = db.get(RagKnowledgeBase, kb_id)
    if kb is None or top_k <= 0 or kb.embedding_provider in {"hash", "local_hash"}:
        # Hash vectors are a test fixture, not evidence of semantic relevance.
        return []
    provider = get_embedding_provider(kb.embedding_provider, kb.embedding_model, kb.embedding_dim)
    encode = getattr(provider, "embed_query", provider.embed)
    query_embedding = validate_embeddings(encode([query]), 1, kb.embedding_dim)[0]
    statement = _child_statement(kb_id).where(
        RagChunk.embedding.is_not(None),
        RagDocumentVersion.embedding_model == kb.embedding_model,
        RagDocumentVersion.embedding_dim == kb.embedding_dim)
    if db.bind and db.bind.dialect.name == "postgresql":
        statement = statement.order_by(text("chunks.embedding <=> CAST(:query_embedding AS vector)"), RagChunk.id).limit(top_k)
        rows = db.execute(statement, {"query_embedding": vector_to_db(query_embedding)}).all()
    else:
        rows = db.execute(statement).all()
    scored = [(cosine_similarity(query_embedding, vector_from_db(chunk.embedding)), chunk, document)
              for chunk, document in rows]
    scored = sorted((item for item in scored if item[0] > 0), key=lambda item: (-item[0], item[1].id))
    return [_result(chunk, document, dense_rank=index + 1, dense_score=score)
            for index, (score, chunk, document) in enumerate(scored[:top_k])]


def lexical_retrieve(db: Session, kb_id: str, query: str, top_k: int) -> list[RetrievedChunk]:
    terms = sorted(set(tokenize_query(query)))
    if not terms or top_k <= 0:
        return []
    if db.bind and db.bind.dialect.name == "postgresql":
        # Index and query use the same analyzer. OR retrieves candidates; BM25 ranks them.
        statement = (_child_statement(kb_id)
                     .where(text("chunks.search_vector @@ to_tsquery('simple', :terms)"))
                     .order_by(text("ts_rank_cd(chunks.search_vector, to_tsquery('simple', :terms)) DESC"), RagChunk.id)
                     .limit(max(top_k, get_settings().lexical_candidates)))
        rows = list(db.execute(statement, {"terms": " | ".join(terms)}).all())
    else:
        rows = _child_rows(db, kb_id)
    passages = [retrieval_text(document.name, json_loads(chunk.heading_path, []), chunk.content)
                for chunk, document in rows]
    scores = bm25_scores(query, passages)
    ranked = sorted(((score, chunk, document) for score, (chunk, document) in zip(scores, rows) if score > 0),
                    key=lambda item: (-item[0], item[1].id))
    return [_result(chunk, document, lexical_rank=index + 1, lexical_score=score)
            for index, (score, chunk, document) in enumerate(ranked[:top_k])]


def rrf_fusion(dense: list[RetrievedChunk], lexical: list[RetrievedChunk], k: int) -> list[RetrievedChunk]:
    merged: dict[str, RetrievedChunk] = {}
    for rank_field, items in (("dense_rank", dense), ("lexical_rank", lexical)):
        seen: set[str] = set()
        for rank, item in enumerate(items, start=1):
            if item.child_chunk_id in seen:
                continue
            seen.add(item.child_chunk_id)
            current = merged.setdefault(item.child_chunk_id, replace(item, fusion_score=0,
                                        dense_rank=None, lexical_rank=None))
            setattr(current, rank_field, rank)
            setattr(current, rank_field.replace("_rank", "_score"), getattr(item, rank_field.replace("_rank", "_score")))
            current.fusion_score += 1 / (max(0, k) + rank)
    return sorted(merged.values(), key=lambda item: (-item.fusion_score, item.child_chunk_id))


def retrieve_chunks(db: Session, kb_id: str, query: str, *, dense_top_k: int | None = None,
                    lexical_top_k: int | None = None, rerank_top_n: int | None = None,
                    diagnostics: dict[str, Any] | None = None) -> list[RetrievedChunk]:
    stats = diagnostics if diagnostics is not None else {}
    stats.update({"candidate_count": 0, "reranked_count": 0, "warnings": [], "mode": "bm25"})
    kb = db.get(RagKnowledgeBase, kb_id)
    if kb is None or kb.status == "deleted" or not query.strip():
        return []
    config = default_retrieval_config(kb)
    stats.update({"embedding_provider": kb.embedding_provider, "embedding_model": kb.embedding_model})
    dense_limit = max(0, min(200, dense_top_k if dense_top_k is not None else int(config["dense_top_k"])))
    lexical_limit = max(0, min(200, lexical_top_k if lexical_top_k is not None else int(config["lexical_top_k"])))
    output_limit = max(0, min(100, rerank_top_n if rerank_top_n is not None else int(config["rerank_top_n"])))
    if not output_limit:
        return []
    dense: list[RetrievedChunk] = []
    if kb.embedding_provider in {"hash", "local_hash"}:
        stats["warnings"].append("HASH_EMBEDDING_NOT_SEMANTIC")
    elif dense_limit:
        try:
            dense = dense_retrieve(db, kb_id, query, dense_limit)
            stats["mode"] = "hybrid_rrf"
        except (RuntimeError, ValueError, OSError) as exc:
            logger.warning("RAG dense provider unavailable: %s", type(exc).__name__)
            stats["warnings"].append("DENSE_UNAVAILABLE")
    lexical = lexical_retrieve(db, kb_id, query, lexical_limit)
    fused = rrf_fusion(dense, lexical, int(config["rrf_k"]))
    stats.update({"dense_count": len(dense), "lexical_count": len(lexical), "candidate_count": len(fused)})
    # Avoid identical overlapping chunks spending the reranker/context budget.
    unique: list[RetrievedChunk] = []
    seen: set[tuple[str, str]] = set()
    for item in fused:
        key = (item.document_id, " ".join(item.content.split()))
        if key not in seen:
            unique.append(item)
            seen.add(key)
    candidates = unique[:get_settings().rerank_candidates]
    results = candidates
    if candidates and get_settings().rerank_provider not in {"lexical", "hash", "local"}:
        try:
            passages = [retrieval_text(item.file_name, item.heading_path, item.content) for item in candidates]
            ranked = get_reranker().rerank(query, passages, len(candidates))
            results = []
            for rank in ranked:
                if config["min_rerank_score"] is None or rank.score >= float(config["min_rerank_score"]):
                    item = replace(candidates[rank.index], rerank_score=rank.score)
                    results.append(item)
            stats["reranked_count"] = len(candidates)
            stats["mode"] += "+neural_rerank"
        except (RuntimeError, ValueError, OSError) as exc:
            logger.warning("RAG reranker unavailable: %s", type(exc).__name__)
            stats["warnings"].append("RERANK_UNAVAILABLE")
    else:
        stats["warnings"].append("NEURAL_RERANK_DISABLED")
    # Parent collapse prevents six overlapping children from crowding out other sections.
    selected: list[RetrievedChunk] = []
    parents: set[str] = set()
    for item in results:
        key = item.parent_chunk_id or item.child_chunk_id
        if key not in parents:
            parents.add(key)
            selected.append(item)
        if len(selected) >= output_limit:
            break
    stats["returned_count"] = len(selected)
    return selected


def parent_contexts(db: Session, ranked_children: list[RetrievedChunk]) -> list[tuple[RetrievedChunk, RagChunk]]:
    seen: set[str] = set()
    contexts: list[tuple[RetrievedChunk, RagChunk]] = []
    for child in ranked_children:
        parent_id = child.parent_chunk_id
        if not parent_id or parent_id in seen:
            continue
        parent = db.get(RagChunk, parent_id)
        document = db.get(RagDocument, child.document_id)
        # Re-check version/visibility after retrieval (reindex/delete may have intervened).
        if (parent and parent.enabled and document and document.deleted_at is None
                and parent.chunk_type == "parent" and parent.document_id == child.document_id
                and parent.document_version_id == document.active_version_id):
            seen.add(parent_id)
            contexts.append((child, parent))
        if len(contexts) >= get_settings().max_parent_chunks:
            break
    return contexts
