from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.ai.run_recorder import finish_run, new_run_id as new_agent_run_id, record_step, start_run
from backend.app.ai.schemas import AgentRunContext
from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings
from backend.app.models import (
    AgentRun,
    RagChunk,
    RagDocument,
    RagDocumentElement,
    RagDocumentVersion,
    RagIngestJob,
    RagKnowledgeBase,
    User,
)
from backend.app.services.rag.chunking import build_parent_child_chunks
from backend.app.services.rag.cleaning import clean_elements
from backend.app.services.rag.embeddings import get_embedding_provider
from backend.app.services.rag.parsers import SUPPORTED_EXTENSIONS, parse_document
from backend.app.services.rag.profiles import ContentProfile, detect_content_profile, detect_file_profile
from backend.app.services.rag.storage import get_object_storage
from backend.app.services.rag.utils import estimate_tokens, json_dumps, json_loads, new_id, sha256_bytes, sha256_text, vector_to_db


INGEST_PROGRESS = {
    "QUEUED": 0,
    "PARSING": 15,
    "NORMALIZING": 30,
    "CHUNKING": 45,
    "EMBEDDING": 70,
    "INDEXING": 88,
    "READY": 100,
}

RAG_INGEST_WORKFLOW_TYPE = "rag_document_ingestion"
RAG_INGEST_PROMPT_VERSION = "rag_ingest_agents_v0.1"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_kb_owner(db: Session, kb_id: str, user: User) -> RagKnowledgeBase:
    kb = db.get(RagKnowledgeBase, kb_id)
    if kb is None or kb.status == "deleted":
        raise ApiError(404, "KB_NOT_FOUND", "知识库不存在")
    if kb.owner_id != user.id:
        raise ApiError(403, "KB_PERMISSION_DENIED", "无权访问该知识库")
    return kb


def create_knowledge_base(db: Session, user: User, name: str, description: str | None = None) -> RagKnowledgeBase:
    settings = get_settings()
    kb = RagKnowledgeBase(
        id=new_id("kb"),
        owner_id=user.id,
        name=name.strip(),
        description=description,
        embedding_provider=settings.embedding_provider,
        embedding_model=settings.embedding_model,
        embedding_dim=settings.embedding_dim,
        chunk_mode="parent_child",
        retrieval_config=json_dumps(
            {
                "dense_top_k": settings.dense_top_k,
                "lexical_top_k": settings.lexical_top_k,
                "rerank_top_n": settings.rerank_top_n,
                "min_rerank_score": settings.min_rerank_score,
                "fusion": "rrf",
                "rrf_k": settings.rrf_k,
            }
        ),
        status="active",
    )
    db.add(kb)
    db.commit()
    db.refresh(kb)
    return kb


def list_knowledge_bases(db: Session, user: User) -> list[RagKnowledgeBase]:
    return list(db.scalars(select(RagKnowledgeBase).where(RagKnowledgeBase.owner_id == user.id, RagKnowledgeBase.status != "deleted")))


def _next_version_no(db: Session, document_id: str) -> int:
    current = db.scalar(select(func.max(RagDocumentVersion.version_no)).where(RagDocumentVersion.document_id == document_id))
    return int(current or 0) + 1


def _object_key(kb_id: str, document_id: str, sha256: str, filename: str) -> str:
    safe_name = Path(filename).name.replace("\\", "_").replace("/", "_")
    return f"knowledge-bases/{kb_id}/documents/{document_id}/{sha256}/{safe_name}"


def upload_document(
    db: Session,
    user: User,
    kb_id: str,
    filename: str,
    content: bytes,
    mime_type: str | None,
    *,
    force: bool = False,
    auto_process: bool = True,
) -> tuple[RagDocument, RagDocumentVersion, RagIngestJob]:
    kb = ensure_kb_owner(db, kb_id, user)
    if not content:
        raise ApiError(400, "DOCUMENT_EMPTY", "上传文件为空")
    if len(content) > get_settings().max_upload_mb * 1024 * 1024:
        raise ApiError(413, "FILE_TOO_LARGE", "上传文件超过大小限制")
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ApiError(400, "UNSUPPORTED_FILE_TYPE", "暂不支持该文件类型", {"extension": extension})

    digest = sha256_bytes(content)
    file_profile = detect_file_profile(filename, mime_type, content)
    if not force:
        existing = db.scalar(
            select(RagDocument).where(
                RagDocument.knowledge_base_id == kb.id,
                RagDocument.sha256 == digest,
                RagDocument.deleted_at.is_(None),
            )
        )
        if existing:
            raise ApiError(409, "DUPLICATE_DOCUMENT", "该知识库中已存在相同文件", {"existing_document_id": existing.id})
    _purge_deleted_duplicates(db, kb.id, digest)

    document_id = new_id("doc")
    object_key = _object_key(kb.id, document_id, digest, filename)
    try:
        storage = get_object_storage()
        storage.put_bytes(object_key, content, mime_type)
    except Exception as exc:
        raise ApiError(502, "OBJECT_STORAGE_ERROR", "原文件保存到对象存储失败", {"error": type(exc).__name__}) from exc

    version = RagDocumentVersion(
        id=new_id("ver"),
        document_id=document_id,
        version_no=1,
        object_key=object_key,
        sha256=digest,
        parser_name=None,
        parser_version=None,
        chunk_config=json_dumps(_chunk_config()),
        content_profile=json_dumps({}),
        cleaning_strategy="generic_clean",
        chunking_strategy="section_recursive",
        embedding_model=kb.embedding_model,
        embedding_dim=kb.embedding_dim,
        status="QUEUED" if auto_process else "UPLOADED",
    )
    document = RagDocument(
        id=document_id,
        knowledge_base_id=kb.id,
        owner_id=user.id,
        name=Path(filename).name,
        mime_type=mime_type,
        extension=extension,
        size_bytes=len(content),
        sha256=digest,
        object_key=object_key,
        file_profile=json_dumps(file_profile.to_dict()),
        status="QUEUED" if auto_process else "UPLOADED",
        progress=0,
    )
    job = RagIngestJob(
        id=new_id("job"),
        document_id=document_id,
        document_version_id=version.id,
        status="QUEUED" if auto_process else "UPLOADED",
        current_stage="QUEUED" if auto_process else "UPLOADED",
        progress=0,
    )
    try:
        db.add_all([document, version, job])
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        storage.delete(object_key)
        raise ApiError(409, "DUPLICATE_DOCUMENT", "该知识库中已存在相同文件") from exc

    if auto_process:
        enqueue_ingest_job(db, job)
    db.refresh(document)
    db.refresh(version)
    db.refresh(job)
    return document, version, job


def _purge_deleted_duplicates(db: Session, kb_id: str, sha256: str) -> None:
    deleted_documents = list(
        db.scalars(
            select(RagDocument).where(
                RagDocument.knowledge_base_id == kb_id,
                RagDocument.sha256 == sha256,
                RagDocument.deleted_at.is_not(None),
            )
        )
    )
    if not deleted_documents:
        return
    storage = get_object_storage()
    for document in deleted_documents:
        _delete_document_records(db, document, storage=storage, delete_object=True)
    db.commit()


def create_text_document(
    db: Session,
    user: User,
    kb_id: str,
    title: str,
    content: str,
    *,
    force: bool = False,
    auto_process: bool = False,
) -> tuple[RagDocument, RagDocumentVersion, RagIngestJob]:
    filename = f"{title.strip() or 'pasted-text'}.txt"
    return upload_document(
        db,
        user,
        kb_id,
        filename,
        content.encode("utf-8"),
        "text/plain",
        force=force,
        auto_process=auto_process,
    )


def list_documents(db: Session, user: User, kb_id: str) -> list[RagDocument]:
    ensure_kb_owner(db, kb_id, user)
    return list(
        db.scalars(
            select(RagDocument)
            .where(
                RagDocument.knowledge_base_id == kb_id,
                RagDocument.owner_id == user.id,
                RagDocument.deleted_at.is_(None),
            )
            .order_by(RagDocument.created_at.desc())
        )
    )


def start_processing_document(
    db: Session,
    user: User,
    document_id: str,
    *,
    enqueue: bool = True,
) -> tuple[RagDocument, RagDocumentVersion, RagIngestJob]:
    document = db.get(RagDocument, document_id)
    if document is None or document.deleted_at is not None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "文档不存在")
    ensure_kb_owner(db, document.knowledge_base_id, user)
    if document.status in {"PARSING", "NORMALIZING", "CHUNKING", "EMBEDDING", "INDEXING", "QUEUED"}:
        job = db.scalar(
            select(RagIngestJob)
            .where(RagIngestJob.document_id == document.id)
            .order_by(RagIngestJob.created_at.desc())
            .limit(1)
        )
        version = db.get(RagDocumentVersion, job.document_version_id) if job else None
        if job and version:
            return document, version, job
    if document.status == "FAILED":
        return reprocess_document(db, user, document.id)

    version = db.scalar(
        select(RagDocumentVersion)
        .where(RagDocumentVersion.document_id == document.id)
        .order_by(RagDocumentVersion.version_no.desc())
        .limit(1)
    )
    if version is None:
        raise ApiError(404, "DOCUMENT_VERSION_NOT_FOUND", "文档版本不存在")
    job = db.scalar(
        select(RagIngestJob).where(
            RagIngestJob.document_id == document.id,
            RagIngestJob.document_version_id == version.id,
        )
    )
    if job is None:
        job = RagIngestJob(
            id=new_id("job"),
            document_id=document.id,
            document_version_id=version.id,
            status="QUEUED",
            current_stage="QUEUED",
            progress=0,
        )
        db.add(job)
    document.status = "QUEUED"
    document.progress = 0
    document.failed_stage = None
    document.error_code = None
    document.error_message = None
    version.status = "QUEUED"
    job.status = "QUEUED"
    job.current_stage = "QUEUED"
    job.progress = 0
    job.celery_task_id = None
    job.updated_at = utc_now()
    db.commit()
    if enqueue:
        enqueue_ingest_job(db, job)
    db.refresh(document)
    db.refresh(version)
    db.refresh(job)
    return document, version, job


def enqueue_ingest_job(db: Session, job: RagIngestJob) -> None:
    try:
        from backend.app.workers.tasks.ingest_document import ingest_document_version_task

        result = ingest_document_version_task.delay(job.document_id, job.document_version_id)
        job.celery_task_id = getattr(result, "id", None)
        db.commit()
    except Exception as exc:
        db.refresh(job)
        job.status = "QUEUE_FAILED"
        job.current_stage = "QUEUE_FAILED"
        job.error_payload = json_dumps({"code": "QUEUE_FAILED", "message": str(exc)})
        document = db.get(RagDocument, job.document_id)
        version = db.get(RagDocumentVersion, job.document_version_id)
        if document and version and document.status == "FAILED" and version.status == "FAILED":
            return
        if document:
            document.status = "QUEUE_FAILED"
            document.error_code = "QUEUE_FAILED"
            document.error_message = "文档处理任务投递失败"
        if version:
            version.status = "QUEUE_FAILED"
        db.commit()


def _chunk_config(profile: ContentProfile | None = None) -> dict[str, Any]:
    settings = get_settings()
    config = {
        "parent_target_chars": settings.parent_target_chars,
        "parent_max_chars": settings.parent_max_chars,
        "child_target_chars": settings.child_target_chars,
        "child_max_chars": settings.child_max_chars,
        "child_overlap_chars": settings.child_overlap_chars,
    }
    if profile:
        config.update(
            {
                "content_profile": profile.content_profile,
                "cleaning_strategy": profile.cleaning_strategy,
                "chunking_strategy": profile.chunking_strategy,
            }
        )
    return config


def _set_stage(db: Session, document: RagDocument, version: RagDocumentVersion, job: RagIngestJob, stage: str) -> None:
    progress = INGEST_PROGRESS.get(stage, document.progress)
    document.status = stage
    document.progress = progress
    document.updated_at = utc_now()
    version.status = stage
    job.status = stage
    job.current_stage = stage
    job.progress = progress
    job.updated_at = utc_now()
    if stage == "PARSING" and job.started_at is None:
        job.started_at = utc_now()
    db.commit()


def _start_ingest_agent_run(db: Session, document: RagDocument, version: RagDocumentVersion) -> AgentRun:
    file_profile = json_loads(document.file_profile, {})
    run = start_run(
        db,
        AgentRunContext(
            run_id=new_agent_run_id(),
            workflow_type=RAG_INGEST_WORKFLOW_TYPE,
            student_id=document.owner_id,
            course_id=None,
        ),
        input_payload={
            "knowledge_base_id": document.knowledge_base_id,
            "document_id": document.id,
            "document_version_id": version.id,
            "filename": document.name,
            "file_profile": file_profile,
        },
        model_provider="RULE_FALLBACK",
        model_name="rag-ingest-agent-workflow",
        prompt_version=RAG_INGEST_PROMPT_VERSION,
    )
    record_step(
        db,
        run,
        step_name="file_intake_agent",
        step_order=1,
        output_summary={
            "file_type": file_profile.get("file_type"),
            "source_family": file_profile.get("source_family"),
            "size_bytes": document.size_bytes,
            "status": "accepted",
        },
    )
    return run


def _chunk_quality_report(
    *,
    profile: ContentProfile,
    chunk_groups: list[tuple[Any, list[Any]]],
) -> dict[str, Any]:
    settings = get_settings()
    parents = [parent for parent, _children in chunk_groups]
    children = [child for _parent, child_group in chunk_groups for child in child_group]
    risk_flags: list[str] = []

    empty_children = [child for child in children if not child.content.strip()]
    oversized_children = [child for child in children if len(child.content) > settings.child_max_chars]
    tiny_children = [child for child in children if len(child.content.strip()) < 80]
    missing_heading_children = [
        child
        for child in children
        if profile.chunking_strategy in {"markdown_section", "section_recursive"} and not child.heading_path
    ]
    code_block_split_risks = [
        child
        for child in children
        if child.content_type == "code" and child.content.count("```") % 2 == 1
    ]

    if empty_children:
        risk_flags.append("EMPTY_CHILD_CHUNK")
    if oversized_children:
        risk_flags.append("CHILD_CHUNK_TOO_LARGE")
    if len(tiny_children) > max(2, len(children) // 3):
        risk_flags.append("TOO_MANY_TINY_CHUNKS")
    if missing_heading_children:
        risk_flags.append("MISSING_HEADING_CONTEXT")
    if code_block_split_risks:
        risk_flags.append("CODE_BLOCK_SPLIT_RISK")
    if not parents or not children:
        risk_flags.append("NO_RETRIEVABLE_CHUNKS")

    return {
        "status": "PASSED" if not risk_flags else "WARNING",
        "risk_flags": risk_flags,
        "parent_count": len(parents),
        "child_count": len(children),
        "empty_child_count": len(empty_children),
        "oversized_child_count": len(oversized_children),
        "tiny_child_count": len(tiny_children),
        "missing_heading_child_count": len(missing_heading_children),
        "code_block_split_risk_count": len(code_block_split_risks),
        "chunking_strategy": profile.chunking_strategy,
    }


def ingest_document_version(db: Session, document_id: str, version_id: str) -> None:
    document = db.get(RagDocument, document_id)
    version = db.get(RagDocumentVersion, version_id)
    job = db.scalar(
        select(RagIngestJob).where(
            RagIngestJob.document_id == document_id,
            RagIngestJob.document_version_id == version_id,
        )
    )
    if document is None or version is None or job is None:
        raise RuntimeError("document/version/job not found")
    if document.deleted_at is not None:
        return
    if version.status == "READY" and document.active_version_id == version.id:
        return

    run: AgentRun | None = None
    try:
        run = _start_ingest_agent_run(db, document, version)

        db.execute(delete(RagChunk).where(RagChunk.document_version_id == version.id))
        db.execute(delete(RagDocumentElement).where(RagDocumentElement.document_version_id == version.id))
        db.commit()

        _set_stage(db, document, version, job, "PARSING")
        content = get_object_storage().get_bytes(version.object_key)
        parsed = parse_document(document.name, content)
        if not parsed.elements:
            raise ApiError(422, "DOCUMENT_EMPTY", "文档解析结果为空")
        record_step(
            db,
            run,
            step_name="document_parser_agent",
            step_order=2,
            output_summary={
                "parser_name": parsed.parser_name,
                "parser_version": parsed.parser_version,
                "element_count": len(parsed.elements),
            },
        )

        version.parser_name = parsed.parser_name
        version.parser_version = parsed.parser_version
        _set_stage(db, document, version, job, "NORMALIZING")

        profile = detect_content_profile(document.name, parsed.elements)
        version.content_profile = json_dumps(profile.to_dict())
        version.cleaning_strategy = profile.cleaning_strategy
        version.chunking_strategy = profile.chunking_strategy
        version.chunk_config = json_dumps(_chunk_config(profile))
        record_step(
            db,
            run,
            step_name="content_profile_agent",
            step_order=3,
            output_summary={
                "content_profile": profile.content_profile,
                "cleaning_strategy": profile.cleaning_strategy,
                "chunking_strategy": profile.chunking_strategy,
                "signals": profile.signals,
            },
        )
        elements = clean_elements(parsed.elements, profile)
        record_step(
            db,
            run,
            step_name="cleaning_strategy_agent",
            step_order=4,
            output_summary={
                "strategy": profile.cleaning_strategy,
                "input_element_count": len(parsed.elements),
                "output_element_count": len(elements),
            },
        )
        for index, element in enumerate(elements):
            db.add(
                RagDocumentElement(
                    id=new_id("elm"),
                    document_version_id=version.id,
                    seq_no=index,
                    element_type=element.element_type,
                    text=element.text,
                    page_no=element.page_no,
                    slide_no=element.slide_no,
                    heading_level=element.heading_level,
                    heading_path=json_dumps(element.heading_path),
                    metadata_json=json_dumps(element.metadata),
                )
            )
        db.commit()

        _set_stage(db, document, version, job, "CHUNKING")
        chunk_groups = build_parent_child_chunks(elements, profile)
        if not chunk_groups:
            raise ApiError(422, "CHUNKING_FAILED", "文档没有生成可检索切片")
        child_count = sum(len(children) for _parent, children in chunk_groups)
        record_step(
            db,
            run,
            step_name="chunk_planner_agent",
            step_order=5,
            output_summary={
                "chunking_strategy": profile.chunking_strategy,
                "parent_target_chars": get_settings().parent_target_chars,
                "child_target_chars": get_settings().child_target_chars,
            },
        )
        record_step(
            db,
            run,
            step_name="chunk_builder_agent",
            step_order=6,
            output_summary={
                "parent_count": len(chunk_groups),
                "child_count": child_count,
            },
        )
        quality = _chunk_quality_report(profile=profile, chunk_groups=chunk_groups)
        record_step(
            db,
            run,
            step_name="retrieval_quality_agent",
            step_order=7,
            status="SUCCEEDED" if quality["status"] == "PASSED" else "WARNING",
            output_summary=quality,
        )

        _set_stage(db, document, version, job, "EMBEDDING")
        provider = get_embedding_provider()
        parent_records: list[tuple[str, Any, list[Any]]] = []
        child_texts = [child.content for _, children in chunk_groups for child in children]
        embeddings: list[list[float]] = []
        batch_size = max(1, get_settings().embedding_batch_size)
        for offset in range(0, len(child_texts), batch_size):
            embeddings.extend(provider.embed(child_texts[offset : offset + batch_size]))
        if any(len(vector) != version.embedding_dim for vector in embeddings):
            raise ApiError(500, "EMBEDDING_DIM_MISMATCH", "Embedding 维度与知识库配置不一致")
        record_step(
            db,
            run,
            step_name="embedding_agent",
            step_order=8,
            output_summary={
                "child_count": len(child_texts),
                "embedding_count": len(embeddings),
                "embedding_dim": version.embedding_dim,
            },
        )

        _set_stage(db, document, version, job, "INDEXING")
        embedding_index = 0
        parent_index = 0
        child_global_index = 0
        for parent, children in chunk_groups:
            parent_id = new_id("chk_parent")
            parent_records.append((parent_id, parent, children))
            db.add(_chunk_record(parent_id, document, version, parent, parent_index, None, None))
            parent_index += 1
            for child in children:
                embedding = embeddings[embedding_index]
                embedding_index += 1
                db.add(_chunk_record(new_id("chk_child"), document, version, child, child_global_index, parent_id, embedding))
                child_global_index += 1
        db.commit()
        _refresh_search_vectors(db, version.id)
        record_step(
            db,
            run,
            step_name="index_agent",
            step_order=9,
            output_summary={
                "parent_count": parent_index,
                "child_count": child_global_index,
                "active_version_id": version.id,
            },
        )

        old_active = document.active_version_id
        if old_active and old_active != version.id:
            old_version = db.get(RagDocumentVersion, old_active)
            if old_version:
                old_version.superseded_at = utc_now()
        version.activated_at = utc_now()
        document.active_version_id = version.id
        _set_stage(db, document, version, job, "READY")
        job.finished_at = utc_now()
        finish_run(
            db,
            run,
            status="SUCCEEDED",
            output={
                "document_id": document.id,
                "document_version_id": version.id,
                "parent_count": parent_index,
                "child_count": child_global_index,
                "quality": quality,
            },
        )
        db.commit()
    except ApiError as exc:
        if run is not None:
            finish_run(
                db,
                run,
                status="FAILED",
                output={"document_id": document_id, "document_version_id": version_id, "failed_stage": job.current_stage},
                error_code=exc.detail["code"],
                error_message=exc.detail["message"],
            )
        _mark_failed(db, document, version, job, job.current_stage, exc.detail["code"], exc.detail["message"])
        raise
    except Exception as exc:
        if run is not None:
            finish_run(
                db,
                run,
                status="FAILED",
                output={"document_id": document_id, "document_version_id": version_id, "failed_stage": job.current_stage},
                error_code="INDEXING_FAILED",
                error_message=str(exc),
            )
        _mark_failed(db, document, version, job, job.current_stage, "INDEXING_FAILED", str(exc))
        raise


def _chunk_record(
    chunk_id: str,
    document: RagDocument,
    version: RagDocumentVersion,
    chunk: Any,
    chunk_index: int,
    parent_id: str | None,
    embedding: list[float] | None,
) -> RagChunk:
    return RagChunk(
        id=chunk_id,
        knowledge_base_id=document.knowledge_base_id,
        document_id=document.id,
        document_version_id=version.id,
        parent_chunk_id=parent_id,
        chunk_type=chunk.chunk_type,
        chunk_index=chunk_index,
        content=chunk.content,
        content_hash=sha256_text(chunk.content),
        heading=chunk.heading,
        heading_path=json_dumps(chunk.heading_path),
        page_start=chunk.page_start,
        page_end=chunk.page_end,
        slide_start=chunk.slide_start,
        slide_end=chunk.slide_end,
        content_type=chunk.content_type,
        char_count=len(chunk.content),
        token_count=chunk.token_count or estimate_tokens(chunk.content),
        embedding=vector_to_db(embedding) if embedding is not None else None,
        search_vector=chunk.content,
        enabled=True,
        metadata_json=json_dumps(
            {
                "knowledge_base_id": document.knowledge_base_id,
                "document_id": document.id,
                "document_version_id": version.id,
                "parent_chunk_id": parent_id,
                "chunk_index": chunk_index,
                "file_profile": json_loads(document.file_profile, {}),
                "content_profile": json_loads(version.content_profile, {}),
                "cleaning_strategy": version.cleaning_strategy,
                "chunking_strategy": version.chunking_strategy,
                "split_reason": getattr(chunk, "split_reason", None),
                "source_element_start": getattr(chunk, "source_element_start", None),
                "source_element_end": getattr(chunk, "source_element_end", None),
                "permission_scope": "owner",
            }
        ),
    )


def _refresh_search_vectors(db: Session, version_id: str) -> None:
    if db.bind and db.bind.dialect.name == "postgresql":
        db.execute(
            text(
                """
                UPDATE chunks
                SET search_vector = to_tsvector('simple', coalesce(content, ''))
                WHERE document_version_id = :version_id AND chunk_type = 'child'
                """
            ),
            {"version_id": version_id},
        )
    db.commit()


def _mark_failed(db: Session, document: RagDocument, version: RagDocumentVersion, job: RagIngestJob, stage: str, code: str, message: str) -> None:
    now = utc_now()
    document.status = "FAILED"
    document.failed_stage = stage
    document.error_code = code
    document.error_message = message
    document.updated_at = now
    version.status = "FAILED"
    job.status = "FAILED"
    job.current_stage = stage
    job.error_payload = json_dumps({"code": code, "message": message, "stage": stage})
    job.finished_at = now
    job.updated_at = now
    db.commit()


def document_status(db: Session, document_id: str, user: User | None = None) -> dict[str, Any]:
    document = db.get(RagDocument, document_id)
    if document is None or document.deleted_at is not None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "文档不存在")
    if user and document.owner_id != user.id:
        raise ApiError(403, "KB_PERMISSION_DENIED", "无权访问该文档")
    active_or_latest = document.active_version_id or db.scalar(
        select(RagDocumentVersion.id)
        .where(RagDocumentVersion.document_id == document.id)
        .order_by(RagDocumentVersion.version_no.desc())
        .limit(1)
    )
    version_id = active_or_latest or ""
    version = db.get(RagDocumentVersion, version_id) if version_id else None
    stats = {
        "elements": db.scalar(select(func.count()).select_from(RagDocumentElement).where(RagDocumentElement.document_version_id == version_id)) or 0,
        "parents": db.scalar(select(func.count()).select_from(RagChunk).where(RagChunk.document_version_id == version_id, RagChunk.chunk_type == "parent")) or 0,
        "children": db.scalar(select(func.count()).select_from(RagChunk).where(RagChunk.document_version_id == version_id, RagChunk.chunk_type == "child")) or 0,
        "embedded_children": db.scalar(
            select(func.count()).select_from(RagChunk).where(
                RagChunk.document_version_id == version_id,
                RagChunk.chunk_type == "child",
                RagChunk.embedding.is_not(None),
            )
        )
        or 0,
    }
    return {
        "id": document.id,
        "name": document.name,
        "status": document.status.lower(),
        "progress": document.progress,
        "stage": (document.failed_stage or document.status).lower(),
        "active_version_id": document.active_version_id,
        "file_profile": json_loads(document.file_profile, {}),
        "content_profile": json_loads(version.content_profile, {}) if version else {},
        "cleaning_strategy": version.cleaning_strategy if version else None,
        "chunking_strategy": version.chunking_strategy if version else None,
        "stats": stats,
        "error": None
        if not document.error_code
        else {"code": document.error_code, "message": document.error_message, "stage": document.failed_stage},
    }


def reprocess_document(db: Session, user: User, document_id: str) -> tuple[RagDocument, RagDocumentVersion, RagIngestJob]:
    document = db.get(RagDocument, document_id)
    if document is None or document.deleted_at is not None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "文档不存在")
    ensure_kb_owner(db, document.knowledge_base_id, user)
    version = RagDocumentVersion(
        id=new_id("ver"),
        document_id=document.id,
        version_no=_next_version_no(db, document.id),
        object_key=document.object_key,
        sha256=document.sha256,
        chunk_config=json_dumps(_chunk_config()),
        content_profile=json_dumps({}),
        cleaning_strategy="generic_clean",
        chunking_strategy="section_recursive",
        embedding_model=get_settings().embedding_model,
        embedding_dim=get_settings().embedding_dim,
        status="QUEUED",
    )
    job = RagIngestJob(
        id=new_id("job"),
        document_id=document.id,
        document_version_id=version.id,
        status="QUEUED",
        current_stage="QUEUED",
        progress=0,
        retry_count=1,
    )
    document.status = "QUEUED"
    document.progress = 0
    document.failed_stage = None
    document.error_code = None
    document.error_message = None
    db.add_all([version, job])
    db.commit()
    enqueue_ingest_job(db, job)
    return document, version, job


def delete_document(db: Session, user: User, document_id: str) -> None:
    document = db.get(RagDocument, document_id)
    if document is None or document.deleted_at is not None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "文档不存在")
    ensure_kb_owner(db, document.knowledge_base_id, user)
    _delete_document_records(db, document, storage=get_object_storage(), delete_object=True)
    db.commit()


def _delete_document_records(db: Session, document: RagDocument, *, storage: Any | None = None, delete_object: bool = False) -> None:
    version_ids = list(
        db.scalars(select(RagDocumentVersion.id).where(RagDocumentVersion.document_id == document.id))
    )
    if version_ids:
        db.execute(delete(RagDocumentElement).where(RagDocumentElement.document_version_id.in_(version_ids)))
        db.execute(delete(RagChunk).where(RagChunk.document_version_id.in_(version_ids)))
        db.execute(delete(RagIngestJob).where(RagIngestJob.document_version_id.in_(version_ids)))
        db.execute(delete(RagDocumentVersion).where(RagDocumentVersion.id.in_(version_ids)))
    if delete_object and storage is not None:
        try:
            storage.delete(document.object_key)
        except Exception:
            pass
    db.delete(document)
