from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, select

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import SessionLocal, get_db
from backend.app.core.security import current_user
from backend.app.models import AgentRun, AgentStep, RagChunk, RagDocument, RagDocumentVersion, User
from backend.app.services.rag.documents import (
    RAG_INGEST_WORKFLOW_TYPE,
    create_text_document,
    create_knowledge_base,
    delete_document,
    document_status,
    ensure_kb_owner,
    list_documents,
    list_knowledge_bases,
    reprocess_document,
    ingest_document_version,
    start_processing_document,
    upload_document,
)
from backend.app.services.rag.utils import json_loads
from backend.app.services.rag.rag_service import rag_query
from backend.app.services.rag.retrieval import retrieve_chunks


router = APIRouter(prefix="/api/v1", tags=["rag-knowledge-base"])


class KnowledgeBaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class RetrieveRequest(BaseModel):
    query: str = Field(min_length=1)
    dense_top_k: int | None = Field(default=None, ge=1, le=100)
    lexical_top_k: int | None = Field(default=None, ge=1, le=100)
    rerank_top_n: int | None = Field(default=None, ge=1, le=50)
    debug: bool = False


class RagQueryRequest(BaseModel):
    query: str = Field(min_length=1)
    stream: bool = False


class TextDocumentCreate(BaseModel):
    title: str = Field(default="pasted-text", min_length=1, max_length=255)
    content: str = Field(min_length=1)


def _run_ingestion_background(document_id: str, version_id: str) -> None:
    db = SessionLocal()
    try:
        ingest_document_version(db, document_id, version_id)
    finally:
        db.close()


@router.post("/knowledge-bases")
def create_kb(payload: KnowledgeBaseCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    kb = create_knowledge_base(db, user, payload.name, payload.description)
    return ok({"id": kb.id, "name": kb.name, "status": kb.status})


@router.get("/knowledge-bases")
def list_kbs(db: Session = Depends(get_db), user: User = Depends(current_user)):
    items = []
    for kb in list_knowledge_bases(db, user):
        document_count = db.scalar(
            select(func.count()).select_from(RagDocument).where(
                RagDocument.knowledge_base_id == kb.id,
                RagDocument.deleted_at.is_(None),
            )
        ) or 0
        chunk_count = db.scalar(
            select(func.count()).select_from(RagChunk).where(
                RagChunk.knowledge_base_id == kb.id,
                RagChunk.chunk_type == "child",
                RagChunk.enabled.is_(True),
            )
        ) or 0
        items.append(
            {
                "id": kb.id,
                "name": kb.name,
                "description": kb.description,
                "status": kb.status,
                "embedding_model": kb.embedding_model,
                "document_count": document_count,
                "chunk_count": chunk_count,
                "created_at": kb.created_at.isoformat(),
                "updated_at": kb.updated_at.isoformat(),
            }
        )
    return ok(
        {
            "items": items
        }
    )


@router.post("/knowledge-bases/{kb_id}/documents", status_code=202)
async def upload_kb_document(
    kb_id: str,
    response: Response,
    file: UploadFile = File(...),
    force: bool = Query(default=False),
    auto_process: bool = Query(default=True),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    content = await file.read()
    document, version, job = upload_document(
        db,
        user,
        kb_id,
        file.filename or "document",
        content,
        file.content_type,
        force=force,
        auto_process=auto_process,
    )
    response.status_code = 202
    return ok(
        {
            "document_id": document.id,
            "version_id": version.id,
            "status": job.status.lower(),
            "progress": job.progress,
            "file_profile": json_loads(document.file_profile, {}),
        }
    )


@router.post("/knowledge-bases/{kb_id}/documents/from-text", status_code=202)
def create_kb_text_document(
    kb_id: str,
    payload: TextDocumentCreate,
    response: Response,
    force: bool = Query(default=False),
    auto_process: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    document, version, job = create_text_document(
        db,
        user,
        kb_id,
        payload.title,
        payload.content,
        force=force,
        auto_process=auto_process,
    )
    response.status_code = 202
    return ok(
        {
            "document_id": document.id,
            "version_id": version.id,
            "status": job.status.lower(),
            "progress": job.progress,
            "file_profile": json_loads(document.file_profile, {}),
        }
    )


@router.get("/knowledge-bases/{kb_id}/documents")
def list_kb_documents(kb_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    documents = list_documents(db, user, kb_id)
    return ok({"items": [_document_payload(db, document) for document in documents]})


@router.get("/documents/{document_id}")
def get_document(document_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return ok(document_status(db, document_id, user))


@router.post("/documents/{document_id}/process")
def process(
    document_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    document, version, job = start_processing_document(db, user, document_id, enqueue=False)
    if job.status == "QUEUED" and not job.celery_task_id:
        job.celery_task_id = "fastapi-background"
        db.commit()
        background_tasks.add_task(_run_ingestion_background, document.id, version.id)
    return ok(
        {
            "document_id": document.id,
            "version_id": version.id,
            "status": job.status.lower(),
            "progress": job.progress,
            "content_profile": json_loads(version.content_profile, {}),
            "cleaning_strategy": version.cleaning_strategy,
            "chunking_strategy": version.chunking_strategy,
        }
    )


@router.get("/documents/{document_id}/ingestion-run")
def get_document_ingestion_run(document_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    document = db.get(RagDocument, document_id)
    if document is None or document.deleted_at is not None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "文档不存在")
    ensure_kb_owner(db, document.knowledge_base_id, user)
    version_id = document.active_version_id or db.scalar(
        select(RagDocumentVersion.id)
        .where(RagDocumentVersion.document_id == document.id)
        .order_by(RagDocumentVersion.version_no.desc())
        .limit(1)
    )
    run = db.scalar(
        select(AgentRun)
        .where(
            AgentRun.workflow_type == RAG_INGEST_WORKFLOW_TYPE,
            AgentRun.input_json.contains(document.id),
            AgentRun.input_json.contains(version_id or ""),
        )
        .order_by(AgentRun.started_at.desc())
        .limit(1)
    )
    if run is None:
        return ok({"run": None})
    steps = list(
        db.scalars(
            select(AgentStep)
            .where(AgentStep.run_id == run.id)
            .order_by(AgentStep.step_order)
        )
    )
    return ok(
        {
            "run": {
                "id": run.id,
                "workflow_type": run.workflow_type,
                "status": run.status,
                "model_provider": run.model_provider,
                "model_name": run.model_name,
                "prompt_version": run.prompt_version,
                "input": json_loads(run.input_json, {}),
                "output": json_loads(run.output_json, {}),
                "error": None
                if not run.error_code
                else {"code": run.error_code, "message": run.error_message},
                "started_at": run.started_at.isoformat(),
                "finished_at": run.finished_at.isoformat() if run.finished_at else None,
                "steps": [
                    {
                        "id": step.id,
                        "name": step.step_name,
                        "order": step.step_order,
                        "status": step.status,
                        "input": json_loads(step.input_summary, {}),
                        "output": json_loads(step.output_summary, {}),
                        "started_at": step.started_at.isoformat(),
                        "finished_at": step.finished_at.isoformat() if step.finished_at else None,
                    }
                    for step in steps
                ],
            }
        }
    )


@router.post("/documents/{document_id}/reprocess")
def reprocess(document_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    document, version, job = reprocess_document(db, user, document_id)
    return ok(
        {
            "document_id": document.id,
            "version_id": version.id,
            "status": job.status.lower(),
            "progress": job.progress,
            "content_profile": json_loads(version.content_profile, {}),
            "cleaning_strategy": version.cleaning_strategy,
            "chunking_strategy": version.chunking_strategy,
        }
    )


@router.delete("/documents/{document_id}")
def delete_kb_document(document_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    delete_document(db, user, document_id)
    return ok({"deleted": True})


@router.get("/documents/{document_id}/chunks")
def list_document_chunks(document_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    document = db.get(RagDocument, document_id)
    if document is None or document.deleted_at is not None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "文档不存在")
    ensure_kb_owner(db, document.knowledge_base_id, user)
    chunks = list(
        db.scalars(
            select(RagChunk)
            .where(
                RagChunk.document_id == document.id,
                RagChunk.document_version_id == document.active_version_id,
                RagChunk.chunk_type == "child",
                RagChunk.enabled.is_(True),
            )
            .order_by(RagChunk.chunk_index)
        )
    )
    return ok(
        {
            "items": [
                {
                    "chunk_id": chunk.id,
                    "document_id": chunk.document_id,
                    "chunk_index": chunk.chunk_index,
                    "content_preview": chunk.content[:240],
                    "content": chunk.content,
                    "heading_path": json_loads(chunk.heading_path, []),
                    "page_start": chunk.page_start,
                    "page_end": chunk.page_end,
                    "slide_start": chunk.slide_start,
                    "slide_end": chunk.slide_end,
                    "char_count": chunk.char_count,
                    "token_count": chunk.token_count,
                    "metadata": json_loads(chunk.metadata_json, {}),
                }
                for chunk in chunks
            ]
        }
    )


@router.post("/knowledge-bases/{kb_id}/retrieve")
def retrieve(kb_id: str, payload: RetrieveRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    ensure_kb_owner(db, kb_id, user)
    results = retrieve_chunks(
        db,
        kb_id,
        payload.query,
        dense_top_k=payload.dense_top_k,
        lexical_top_k=payload.lexical_top_k,
        rerank_top_n=payload.rerank_top_n,
    )
    return ok(
        {
            "query": payload.query,
            "results": [
                {
                    "child_chunk_id": item.child_chunk_id,
                    "parent_chunk_id": item.parent_chunk_id,
                    "document_id": item.document_id,
                    "file_name": item.file_name,
                    "heading_path": item.heading_path,
                    "page_start": item.page_start,
                    "page_end": item.page_end,
                    "slide_start": item.slide_start,
                    "slide_end": item.slide_end,
                    "content": item.content,
                    "dense_rank": item.dense_rank,
                    "lexical_rank": item.lexical_rank,
                    "fusion_score": item.fusion_score,
                    "rerank_score": item.rerank_score,
                }
                for item in results
            ],
        },
        meta={"debug": payload.debug},
    )


@router.post("/knowledge-bases/{kb_id}/rag/query")
def query_rag(kb_id: str, payload: RagQueryRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if payload.stream:
        raise ApiError(400, "RAG_STREAM_NOT_SUPPORTED", "当前接口暂不支持流式 RAG")
    ensure_kb_owner(db, kb_id, user)
    return ok(rag_query(db, kb_id, payload.query))


def _document_payload(db: Session, document: RagDocument) -> dict[str, Any]:
    status_data = document_status(db, document.id)
    return {
        "id": document.id,
        "name": document.name,
        "title": document.name.rsplit(".", 1)[0],
        "filename": document.name,
        "mime_type": document.mime_type,
        "extension": document.extension,
        "size_bytes": document.size_bytes,
        "status": status_data["status"],
        "progress": status_data["progress"],
        "stage": status_data["stage"],
        "chunk_count": status_data["stats"]["children"],
        "active_version_id": document.active_version_id,
        "file_profile": status_data["file_profile"],
        "content_profile": status_data["content_profile"],
        "cleaning_strategy": status_data["cleaning_strategy"],
        "chunking_strategy": status_data["chunking_strategy"],
        "error": status_data["error"],
        "created_at": document.created_at.isoformat(),
        "updated_at": document.updated_at.isoformat(),
    }
