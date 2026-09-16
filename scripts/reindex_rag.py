"""Versioned RAG rebuild; activate all documents in one KB transaction.

python -m scripts.reindex_rag --all                       # inspect only
python -m scripts.reindex_rag --all --provider bge_m3 --model BAAI/bge-m3 --apply
"""
from __future__ import annotations

import argparse
from datetime import datetime
import json
from pathlib import Path
import sqlite3

from sqlalchemy import func, select

from backend.app.core.database import SessionLocal, engine
from backend.app.models import RagDocument, RagDocumentVersion, RagIngestJob, RagKnowledgeBase
from backend.app.services.rag.documents import _chunk_config, ingest_document_version, utc_now
from backend.app.services.rag.embeddings import configured_model, get_embedding_provider
from backend.app.services.rag.utils import json_dumps, json_loads, new_id


def rebuild_knowledge_base(db, kb, *, provider: str, model: str, dim: int,
                           min_rerank_score: float | None = None) -> dict:
    model = configured_model(provider, model)
    encoder = get_embedding_provider(provider, model, dim)
    # Fail before staging if the provider cannot produce valid embeddings.
    encoder.embed(["知识库重建模型检查"])
    documents = list(db.scalars(select(RagDocument).where(
        RagDocument.knowledge_base_id == kb.id, RagDocument.deleted_at.is_(None),
        RagDocument.active_version_id.is_not(None)).order_by(RagDocument.id)))
    if any(doc.status != "READY" for doc in documents):
        raise RuntimeError("A document is being processed or needs recovery; retry after it finishes")
    old_ids = {doc.id: doc.active_version_id for doc in documents}
    old_config = (kb.embedding_provider, kb.embedding_model, kb.embedding_dim)
    staged = []
    for document in documents:
        version_no = (db.scalar(select(func.max(RagDocumentVersion.version_no)).where(
            RagDocumentVersion.document_id == document.id)) or 0) + 1
        version = RagDocumentVersion(id=new_id("ver"), document_id=document.id, version_no=version_no,
            object_key=document.object_key, sha256=document.sha256, chunk_config=json_dumps(_chunk_config()),
            embedding_model=model, embedding_dim=dim, status="QUEUED")
        job = RagIngestJob(id=new_id("job"), document_id=document.id, document_version_id=version.id,
                          status="QUEUED", current_stage="QUEUED", progress=0, retry_count=0)
        db.add_all([version, job])
        db.commit()
        try:
            ingest_document_version(db, document.id, version.id, embedding_config=(provider, model, dim), activate=False)
        except Exception:
            db.rollback()
            db.refresh(document)
            if document.active_version_id:
                document.status = "READY"
                db.commit()
            raise
        staged.append((document.id, version.id))
    # Optimistic guards prevent overwriting a concurrent upload/reprocess/config change.
    db.refresh(kb)
    if (kb.embedding_provider, kb.embedding_model, kb.embedding_dim) != old_config:
        raise RuntimeError("Knowledge base configuration changed during rebuild; staged versions were not activated")
    current = list(db.scalars(select(RagDocument).where(RagDocument.knowledge_base_id == kb.id,
        RagDocument.deleted_at.is_(None), RagDocument.active_version_id.is_not(None)).execution_options(populate_existing=True)))
    if {doc.id: doc.active_version_id for doc in current} != old_ids:
        raise RuntimeError("Active documents changed during rebuild; staged versions were not activated")
    now = utc_now()
    for document_id, version_id in staged:
        document = db.get(RagDocument, document_id)
        previous = db.get(RagDocumentVersion, old_ids[document_id])
        version = db.get(RagDocumentVersion, version_id)
        if version.status != "READY":
            raise RuntimeError("Staged version is not ready")
        previous.superseded_at = now
        version.activated_at = now
        document.active_version_id = version.id
        document.status = "READY"
    kb.embedding_provider, kb.embedding_model, kb.embedding_dim = provider, model, dim
    if min_rerank_score is not None:
        config = json_loads(kb.retrieval_config, {})
        config["min_rerank_score"] = min_rerank_score
        kb.retrieval_config = json_dumps(config)
    kb.updated_at = now
    db.commit()
    return {"knowledge_base_id": kb.id, "documents_rebuilt": len(staged), "embedding_provider": provider,
            "embedding_model": model, "previous_versions": old_ids,
            "active_versions": dict(staged)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--all", action="store_true")
    scope.add_argument("--kb-id")
    parser.add_argument("--provider", choices=["bge_m3", "hash"])
    parser.add_argument("--model")
    parser.add_argument("--dim", type=int, default=1024)
    parser.add_argument("--min-rerank-score", type=float, default=0.15)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.dim != 1024:
        parser.error("Current PostgreSQL schema uses vector(1024); migrate the schema before changing dimensions")
    report = {"apply": args.apply, "knowledge_bases": []}
    if args.apply and engine.dialect.name == "sqlite":
        directory = Path("var/rag-backups")
        directory.mkdir(parents=True, exist_ok=True)
        backup = directory / f"before-reindex-{datetime.now():%Y%m%d-%H%M%S}.db"
        with sqlite3.connect(engine.url.database) as source, sqlite3.connect(backup) as target:
            source.backup(target)
        report["sqlite_backup"] = str(backup.resolve())
    with SessionLocal() as db:
        statement = select(RagKnowledgeBase).where(RagKnowledgeBase.status != "deleted")
        if args.kb_id:
            statement = statement.where(RagKnowledgeBase.id == args.kb_id)
        for kb in db.scalars(statement).all():
            provider = args.provider or kb.embedding_provider
            model = args.model or ("BAAI/bge-m3" if args.provider == "bge_m3" else kb.embedding_model)
            if args.apply:
                item = rebuild_knowledge_base(db, kb, provider=provider, model=model, dim=args.dim,
                                              min_rerank_score=args.min_rerank_score)
            else:
                item = {"knowledge_base_id": kb.id, "current_provider": kb.embedding_provider,
                        "target_provider": provider, "target_model": configured_model(provider, model)}
            report["knowledge_bases"].append(item)
    output = json.dumps(report, ensure_ascii=False, indent=2)
    print(output)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")


if __name__ == "__main__":
    main()
