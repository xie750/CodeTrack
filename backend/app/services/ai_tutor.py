import json
import re
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.ai.errors import LLMError
from backend.app.ai.llm_client import chat_json, chat_text_stream, request_json
from backend.app.ai.run_recorder import finish_run, new_run_id, record_step, start_run
from backend.app.ai.schemas import AgentRunContext
from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings
from backend.app.models import AiTutorMessage, AiTutorSession, Course, KnowledgeSource, RagChunk, RagDocument, RagKnowledgeBase, User
from backend.app.models.entities import utc_now
from backend.app.services.learner_profile import serialize_learner_profile
from backend.app.services.rag.retrieval import parent_contexts, retrieve_chunks
from backend.app.services.rag.utils import json_loads


WORKFLOW_TYPE = "student_ai_tutor_chat"
PROMPT_VERSION = "student_ai_tutor_v0.1"
MAX_HISTORY_ITEMS = 6
MAX_SOURCE_COUNT = 6
MAX_SOURCE_CONTENT_CHARS = 1200
MAX_PERSONAL_KB_COUNT = 4
MAX_PERSONAL_CONTEXT_CHARS = 1600
MIN_PERSONAL_RELEVANCE = 0.28
MIN_COURSE_RELEVANCE = 0.28
GENERAL_ANSWER_CONFIDENCE = 0.42
PERSONAL_SOURCE_CONFIDENCE_FLOOR = 0.86
COURSE_SOURCE_CONFIDENCE_FLOOR = 0.72
LOW_VALUE_QUERY_TERMS = {
    "的",
    "了",
    "是",
    "吗",
    "呢",
    "啊",
    "吧",
    "和",
    "与",
    "或",
    "在",
    "对",
    "有",
    "个",
    "这",
    "那",
    "你",
    "我",
    "他",
    "她",
    "它",
    "就",
    "都",
    "而",
    "及",
    "中",
    "为",
    "把",
    "被",
    "从",
    "到",
    "上",
    "下",
    "一",
    "不",
    "么",
    "什么",
    "如何",
    "为什么",
    "怎么",
}
LOW_VALUE_QUERY_PHRASES = [
    "帮我",
    "请你",
    "请",
    "介绍一下",
    "介绍",
    "说一下",
    "说说",
    "讲一下",
    "讲讲",
    "告诉我",
    "是什么",
    "怎么样",
    "怎么做",
    "为什么",
    "如何",
    "一下",
]


def _safe_json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return [str(item) for item in value] if isinstance(value, list) else []


def _trim(text: str | None, limit: int) -> str:
    value = (text or "").strip()
    if len(value) <= limit:
        return value
    return f"{value[:limit]}..."


def _compact_text(text: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"[^\w\u4e00-\u9fff]+", "", text.lower()))


def _strip_low_value_phrases(text: str) -> str:
    value = text
    changed = True
    while changed:
        changed = False
        for phrase in LOW_VALUE_QUERY_PHRASES:
            if phrase and phrase in value:
                value = value.replace(phrase, "")
                changed = True
    return value


def _meaningful_terms(text: str) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()
    for term in re.findall(r"[A-Za-z0-9_]{2,}", text.lower()):
        value = term.strip().lower()
        if not value or value in LOW_VALUE_QUERY_TERMS or value in seen:
            continue
        seen.add(value)
        terms.append(value)

    for sequence in re.findall(r"[\u4e00-\u9fff]{2,}", text):
        cleaned = _strip_low_value_phrases(sequence)
        cleaned = "".join(char for char in cleaned if char not in LOW_VALUE_QUERY_TERMS)
        if len(cleaned) >= 2 and cleaned not in seen:
            seen.add(cleaned)
            terms.append(cleaned)
        for index in range(max(0, len(cleaned) - 1)):
            gram = cleaned[index : index + 2]
            if len(gram) == 2 and gram not in LOW_VALUE_QUERY_TERMS and gram not in seen:
                seen.add(gram)
                terms.append(gram)
    return terms


def _personal_relevance_score(query: str, content: str, rerank_score: float | None) -> float:
    compact_query = _compact_text(query)
    compact_content = _compact_text(content)
    if compact_query and compact_content and (compact_query in compact_content or compact_content in compact_query):
        return 1.0

    terms = _meaningful_terms(query)
    if not terms:
        return 0.0
    hit_count = sum(1 for term in terms if term in compact_content)
    overlap_score = hit_count / max(len(terms), 1)
    if hit_count == 0:
        return 0.0
    if hit_count < 2 and overlap_score < 0.6:
        overlap_score = 0.0

    bounded_rerank = rerank_score if rerank_score is not None and 0 <= rerank_score <= 1 else 0.0
    return max(overlap_score, min(bounded_rerank, overlap_score))


def _lexical_relevance_score(query: str, content: str) -> float:
    compact_content = _compact_text(content)
    terms = _meaningful_terms(query)
    if not terms:
        return 0.0
    hit_count = sum(1 for term in terms if term in compact_content)
    if hit_count == 0:
        return 0.0
    return hit_count / max(len(terms), 1)


def _personal_search_query(query: str) -> str:
    terms = _meaningful_terms(query)
    if not terms:
        return query
    longest_terms = [term for term in terms if len(term) >= 3]
    return " ".join(longest_terms[:4] or terms[:4])


def _looks_like_entity_profile_source(search_query: str, content: str) -> bool:
    compact_query = _compact_text(search_query)
    compact_content = _compact_text(content)
    if not compact_query or compact_query not in compact_content[:80]:
        return False
    return any(label in content[:160] for label in ["常见定位", "定位", "角色定位", "英雄定位"])


def _prioritize_personal_sources(search_query: str, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entity_sources = [
        source for source in sources if _looks_like_entity_profile_source(search_query, str(source.get("content", "")))
    ]
    if entity_sources:
        return entity_sources[:MAX_SOURCE_COUNT]
    return sources[:MAX_SOURCE_COUNT]


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_loads(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _session_title(message: str) -> str:
    title = _trim(message.replace("\n", " "), 36)
    return title or "新的 AI 助学会话"


def _citation(source: KnowledgeSource) -> dict[str, Any]:
    return {
        "source_id": source.id,
        "title": source.title,
        "summary": source.summary,
        "source_type": source.source_type,
        "version": source.version,
        "authority_level": source.authority_level,
    }


def _personal_kb_citation(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_id": source["source_id"],
        "title": source["title"],
        "summary": source["summary"],
        "source_type": "STUDENT_KNOWLEDGE_BASE",
        "version": source.get("version", "personal"),
        "authority_level": "PERSONAL",
        "document_id": source.get("document_id"),
        "chunk_id": source.get("chunk_id"),
        "quote": source.get("content", ""),
    }


def _source_payload(source: KnowledgeSource) -> dict[str, Any]:
    return {
        **_citation(source),
        "chapter": source.chapter,
        "knowledge_points": _safe_json_list(source.knowledge_points),
        "content": _trim(source.content or source.summary, MAX_SOURCE_CONTENT_CHARS),
    }


def _load_sources(db: Session, course_id: str) -> list[KnowledgeSource]:
    return list(
        db.scalars(
            select(KnowledgeSource)
            .where(
                KnowledgeSource.course_id == course_id,
                KnowledgeSource.status == "ACTIVE",
                KnowledgeSource.ai_retrievable.is_(True),
                KnowledgeSource.student_visible.is_(True),
            )
            .order_by(KnowledgeSource.authority_level.desc(), KnowledgeSource.updated_at.desc())
            .limit(MAX_SOURCE_COUNT)
        ).all()
    )


def _filter_relevant_course_sources(sources: list[KnowledgeSource], query: str) -> list[KnowledgeSource]:
    scored: list[tuple[float, KnowledgeSource]] = []
    for source in sources:
        content = "\n".join(
            [
                source.title or "",
                source.summary or "",
                source.content or "",
                " ".join(_safe_json_list(source.knowledge_points)),
            ]
        )
        score = _lexical_relevance_score(query, content)
        if score >= MIN_COURSE_RELEVANCE:
            scored.append((score, source))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [source for _, source in scored[:MAX_SOURCE_COUNT]]


def _expanded_parent_content(db: Session, parent: RagChunk) -> str:
    content = parent.content.strip()
    has_structured_body = "\n\n" in content
    if len(content) >= 80 or (has_structured_body and len(content) >= 30):
        return content
    siblings = list(
        db.scalars(
            select(RagChunk)
            .where(
                RagChunk.document_version_id == parent.document_version_id,
                RagChunk.chunk_type == "parent",
                RagChunk.enabled.is_(True),
                RagChunk.chunk_index > parent.chunk_index,
            )
            .order_by(RagChunk.chunk_index.asc())
            .limit(2)
        ).all()
    )
    pieces = [content]
    for sibling in siblings:
        sibling_text = sibling.content.strip()
        if sibling_text:
            pieces.append(sibling_text)
        if len("\n\n".join(pieces)) >= 260:
            break
    return "\n\n".join(pieces)


def _personal_source_payload(
    kb: RagKnowledgeBase,
    child: Any,
    parent: RagChunk,
    content: str,
    relevance_score: float,
) -> dict[str, Any]:
    heading_path = json_loads(parent.heading_path, [])
    quote = _trim(getattr(child, "content", "") or content, 360)
    child_id = getattr(child, "child_chunk_id", None) or getattr(child, "id", "")
    document_id = getattr(child, "document_id", parent.document_id)
    file_name = getattr(child, "file_name", None)
    if not file_name:
        document = parent.document
        file_name = document.name if document else "个人知识库资料"
    source_id = f"personal:{child_id}"
    return {
        "source_id": source_id,
        "knowledge_base_id": kb.id,
        "knowledge_base_name": kb.name,
        "document_id": document_id,
        "document_name": file_name,
        "chunk_id": child_id,
        "parent_chunk_id": parent.id,
        "title": f"我的知识库 / {file_name}",
        "summary": quote,
        "heading_path": heading_path,
        "content": _trim(content, MAX_PERSONAL_CONTEXT_CHARS),
        "relevance_score": round(relevance_score, 4),
        "retrieval_score": getattr(child, "rerank_score", None),
        "version": "personal",
    }


def _direct_personal_sources(db: Session, kb: RagKnowledgeBase, query: str) -> list[dict[str, Any]]:
    terms = _meaningful_terms(query)
    if not terms:
        return []
    rows = list(
        db.execute(
            select(RagChunk, RagDocument)
            .join(RagDocument, RagDocument.id == RagChunk.document_id)
            .where(
                RagChunk.knowledge_base_id == kb.id,
                RagChunk.chunk_type == "child",
                RagChunk.enabled.is_(True),
                RagDocument.status == "READY",
                RagDocument.deleted_at.is_(None),
                RagChunk.document_version_id == RagDocument.active_version_id,
            )
            .order_by(RagChunk.chunk_index.asc())
        ).all()
    )
    scored: list[tuple[float, RagChunk, RagChunk]] = []
    for child, _document in rows:
        parent = db.get(RagChunk, child.parent_chunk_id) if child.parent_chunk_id else None
        if not parent or not parent.enabled:
            continue
        content = _expanded_parent_content(db, parent)
        score = _personal_relevance_score(query, f"{child.content}\n\n{content}", None)
        if score >= MIN_PERSONAL_RELEVANCE:
            scored.append((score, child, parent))
    scored.sort(key=lambda item: (-item[0], item[1].chunk_index))
    return [
        _personal_source_payload(kb, child, parent, _expanded_parent_content(db, parent), score)
        for score, child, parent in scored[:MAX_SOURCE_COUNT]
    ]


def _load_personal_knowledge_sources(db: Session, user: User, query: str) -> list[dict[str, Any]]:
    kbs = list(
        db.scalars(
            select(RagKnowledgeBase)
            .where(
                RagKnowledgeBase.owner_id == user.id,
                RagKnowledgeBase.status != "deleted",
            )
            .order_by(RagKnowledgeBase.updated_at.desc())
            .limit(MAX_PERSONAL_KB_COUNT)
        )
    )
    sources: list[dict[str, Any]] = []
    seen_chunks: set[str] = set()
    seen_parents: set[str] = set()
    search_query = _personal_search_query(query)
    for kb in kbs:
        for child, parent in parent_contexts(db, retrieve_chunks(db, kb.id, search_query, rerank_top_n=6)):
            content = _expanded_parent_content(db, parent)
            relevance_score = _personal_relevance_score(search_query, f"{child.content}\n\n{content}", child.rerank_score)
            if relevance_score < MIN_PERSONAL_RELEVANCE:
                continue
            if child.child_chunk_id in seen_chunks or parent.id in seen_parents:
                continue
            seen_chunks.add(child.child_chunk_id)
            seen_parents.add(parent.id)
            sources.append(_personal_source_payload(kb, child, parent, content, relevance_score))
        for source in _direct_personal_sources(db, kb, search_query):
            chunk_id = str(source.get("chunk_id", ""))
            parent_id = str(source.get("parent_chunk_id", ""))
            if chunk_id in seen_chunks or parent_id in seen_parents:
                continue
            seen_chunks.add(chunk_id)
            seen_parents.add(parent_id)
            sources.append(source)
    return _prioritize_personal_sources(search_query, sources)


def _history_payload(history: list[dict[str, str]] | None) -> list[dict[str, str]]:
    cleaned: list[dict[str, str]] = []
    for item in (history or [])[-MAX_HISTORY_ITEMS:]:
        role = item.get("role")
        content = _trim(item.get("content"), 800)
        if role in {"student", "assistant"} and content:
            cleaned.append({"role": role, "content": content})
    return cleaned


def _default_actions() -> list[str]:
    return ["继续追问", "生成练习", "保存为笔记", "只给一级提示"]


def serialize_ai_tutor_message(message: AiTutorMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "session_id": message.session_id,
        "role": message.role,
        "content": message.content,
        "status": message.status,
        "metadata": _json_loads(message.metadata_json),
        "run_id": message.run_id,
        "created_at": _iso(message.created_at),
    }


def serialize_ai_tutor_session(session: AiTutorSession) -> dict[str, Any]:
    return {
        "id": session.id,
        "student_id": session.student_id,
        "course_id": session.course_id,
        "title": session.title,
        "summary": session.summary,
        "status": session.status,
        "message_count": session.message_count,
        "created_at": _iso(session.created_at),
        "updated_at": _iso(session.updated_at),
        "last_message_at": _iso(session.last_message_at),
    }


def list_ai_tutor_sessions(
    db: Session,
    *,
    student_id: str,
    course_id: str | None = None,
    query: str | None = None,
    limit: int = 50,
) -> list[AiTutorSession]:
    statement = select(AiTutorSession).where(
        AiTutorSession.student_id == student_id,
        AiTutorSession.status == "ACTIVE",
    )
    if course_id:
        statement = statement.where(AiTutorSession.course_id == course_id)
    sessions = list(
        db.scalars(
            statement.order_by(AiTutorSession.updated_at.desc(), AiTutorSession.created_at.desc()).limit(limit)
        ).all()
    )
    keyword = (query or "").strip().lower()
    if not keyword:
        return sessions
    return [
        session
        for session in sessions
        if keyword in session.title.lower() or keyword in session.summary.lower()
    ]


def get_ai_tutor_session(db: Session, *, student_id: str, session_id: str) -> AiTutorSession:
    session = db.get(AiTutorSession, session_id)
    if session is None or session.student_id != student_id or session.status != "ACTIVE":
        raise ApiError(404, "AI_CHAT_SESSION_NOT_FOUND", "AI 助学会话不存在或已不可用。")
    return session


def delete_ai_tutor_session(db: Session, *, student_id: str, session_id: str) -> AiTutorSession:
    session = get_ai_tutor_session(db, student_id=student_id, session_id=session_id)
    session.status = "DELETED"
    session.updated_at = utc_now()
    db.flush()
    return session


def create_ai_tutor_session(
    db: Session,
    *,
    student_id: str,
    course_id: str | None,
    first_message: str,
) -> AiTutorSession:
    now = utc_now()
    session = AiTutorSession(
        id=_new_id("ait"),
        student_id=student_id,
        course_id=course_id,
        title=_session_title(first_message),
        summary=_trim(first_message, 100),
        status="ACTIVE",
        message_count=0,
        created_at=now,
        updated_at=now,
        last_message_at=None,
    )
    db.add(session)
    db.flush()
    return session


def ensure_ai_tutor_session(
    db: Session,
    *,
    student_id: str,
    course_id: str | None,
    session_id: str | None,
    first_message: str,
) -> AiTutorSession:
    if not session_id:
        return create_ai_tutor_session(
            db,
            student_id=student_id,
            course_id=course_id,
            first_message=first_message,
        )
    session = get_ai_tutor_session(db, student_id=student_id, session_id=session_id)
    if course_id and session.course_id and session.course_id != course_id:
        raise ApiError(409, "AI_CHAT_SESSION_COURSE_MISMATCH", "这个历史会话不属于当前课程。")
    if course_id and not session.course_id:
        session.course_id = course_id
    return session


def append_ai_tutor_message(
    db: Session,
    *,
    session: AiTutorSession,
    student_id: str,
    course_id: str | None,
    role: str,
    content: str,
    status: str = "SUCCEEDED",
    metadata: dict[str, Any] | None = None,
    run_id: str | None = None,
) -> AiTutorMessage:
    now = utc_now()
    message = AiTutorMessage(
        id=_new_id("aim"),
        session_id=session.id,
        student_id=student_id,
        course_id=course_id,
        role=role,
        content=content,
        status=status,
        metadata_json=_json_dumps(metadata or {}),
        run_id=run_id,
        created_at=now,
    )
    db.add(message)
    session.message_count = (session.message_count or 0) + 1
    session.last_message_at = now
    session.updated_at = now
    if role == "student":
        session.summary = _trim(content, 100)
        if session.message_count <= 1:
            session.title = _session_title(content)
    elif role == "assistant" and not session.summary:
        session.summary = _trim(content, 100)
    db.flush()
    return message


def list_ai_tutor_messages(db: Session, *, session: AiTutorSession) -> list[AiTutorMessage]:
    return list(
        db.scalars(
            select(AiTutorMessage)
            .where(AiTutorMessage.session_id == session.id)
            .order_by(AiTutorMessage.created_at.asc())
        ).all()
    )


def ai_tutor_history_payload(
    db: Session,
    *,
    session: AiTutorSession,
    limit: int = MAX_HISTORY_ITEMS,
) -> list[dict[str, str]]:
    messages = list(
        db.scalars(
            select(AiTutorMessage)
            .where(
                AiTutorMessage.session_id == session.id,
                AiTutorMessage.status == "SUCCEEDED",
                AiTutorMessage.role.in_(["student", "assistant"]),
            )
            .order_by(AiTutorMessage.created_at.desc())
            .limit(limit)
        ).all()
    )
    return [
        {"role": message.role, "content": message.content}
        for message in reversed(messages)
        if message.content.strip()
    ]


def _bounded_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.7
    if confidence < 0 or confidence > 1:
        raise ValueError("confidence out of range")
    return confidence


def _computed_confidence(
    *,
    model_confidence: float,
    source_ids: list[str],
    personal_source_ids: list[str],
    personal_sources: dict[str, dict[str, Any]],
) -> float:
    if personal_source_ids:
        relevance_scores = [
            float(personal_sources[source_id].get("relevance_score", 0.75))
            for source_id in personal_source_ids
            if source_id in personal_sources
        ]
        top_relevance = max(relevance_scores or [0.75])
        candidate_count = max(1, min(len(personal_sources), 3))
        citation_ratio = min(1.0, len(personal_source_ids) / candidate_count)
        confidence = PERSONAL_SOURCE_CONFIDENCE_FLOOR + 0.06 * citation_ratio + 0.04 * min(top_relevance, 1.0)
        return round(min(confidence, 0.96), 2)

    if source_ids:
        candidate_count = max(1, min(MAX_SOURCE_COUNT, 3))
        citation_ratio = min(1.0, len(source_ids) / candidate_count)
        confidence = COURSE_SOURCE_CONFIDENCE_FLOOR + 0.12 * citation_ratio
        return round(min(confidence, 0.86), 2)

    # 通用模型回答可以继续给学生看，但没有资料引用时不能展示高置信背书。
    return round(min(model_confidence, GENERAL_ANSWER_CONFIDENCE), 2)


def validate_ai_tutor_output(
    raw: dict[str, Any],
    *,
    allowed_sources: dict[str, KnowledgeSource],
    allowed_personal_sources: dict[str, dict[str, Any]] | None = None,
    default_provider: str,
    fallback_model_name: str,
) -> dict[str, Any]:
    answer = str(raw.get("answer", "")).strip()
    if not answer:
        raise ValueError("missing answer")

    model_confidence = _bounded_confidence(raw.get("confidence", 0.7))

    raw_source_ids = raw.get("knowledge_source_ids", [])
    if raw_source_ids is None:
        raw_source_ids = []
    if not isinstance(raw_source_ids, list):
        raise ValueError("knowledge_source_ids must be a list")
    source_ids = [str(item) for item in raw_source_ids]
    invalid_ids = [item for item in source_ids if item not in allowed_sources]
    if invalid_ids:
        raise ValueError(f"invalid source reference: {', '.join(invalid_ids)}")

    raw_personal_source_ids = raw.get("personal_knowledge_source_ids", [])
    if raw_personal_source_ids is None:
        raw_personal_source_ids = []
    if not isinstance(raw_personal_source_ids, list):
        raise ValueError("personal_knowledge_source_ids must be a list")
    personal_sources = allowed_personal_sources or {}
    personal_source_ids = [str(item) for item in raw_personal_source_ids]
    invalid_personal_ids = [item for item in personal_source_ids if item not in personal_sources]
    if invalid_personal_ids:
        raise ValueError(f"invalid personal source reference: {', '.join(invalid_personal_ids)}")

    raw_actions = raw.get("suggested_actions", _default_actions())
    actions = [str(item).strip() for item in raw_actions] if isinstance(raw_actions, list) else []
    actions = [item for item in actions if item][:4] or _default_actions()
    citations = [_citation(allowed_sources[source_id]) for source_id in source_ids]
    citations.extend(_personal_kb_citation(personal_sources[source_id]) for source_id in personal_source_ids)
    confidence = _computed_confidence(
        model_confidence=model_confidence,
        source_ids=source_ids,
        personal_source_ids=personal_source_ids,
        personal_sources=personal_sources,
    )

    return {
        "answer": answer,
        "confidence": confidence,
        "citations": citations,
        "suggested_actions": actions,
        "profile_used": bool(raw.get("profile_used", True)),
        "source_used": bool(source_ids or personal_source_ids),
        "safety_note": str(raw.get("safety_note", "")).strip(),
        "model_provider": str(raw.get("model_provider", default_provider)),
        "model_name": str(raw.get("model_name", fallback_model_name)),
    }


def build_ai_tutor_system_prompt() -> str:
    return (
        "你是 CodeTrack 的 AI 助学导师，面向计算机基础课程学生。"
        "你必须使用中文回答，回答要清晰、克制、适合学习场景。"
        "检索策略是：先看 personal_knowledge_sources；如果它不为空，必须优先依据个人知识库回答，并引用 personal source_id。"
        "只有学生问题与课程资料直接相关时，才引用给定 knowledge_sources 里的 source_id。"
        "如果个人知识库为空且问题明显不是课程问题，就按通用模型能力直接回答，不要硬套课程画像或课程资料。"
        "confidence 字段可以给估计值，但最终置信度由后端按引用情况重算。"
        "不要编造资料、教材、论文或链接。"
        "如果问题像考核/作业求完整答案，只给思路、分层提示和可执行下一步，不直接给完整答案。"
        "只输出 JSON 对象，不要 Markdown。"
    )


def build_ai_tutor_stream_system_prompt() -> str:
    return (
        "你是 CodeTrack 的 AI 助学导师，面向计算机基础课程学生。"
        "你必须使用中文回答，回答要清晰、克制、适合学习场景。"
        "检索策略是：先看 personal_knowledge_sources；如果它不为空，必须优先依据个人知识库回答，不要用课程画像覆盖。"
        "如果个人知识库为空且问题明显不是课程问题，就按通用模型能力直接回答，不要硬套课程画像或课程资料。"
        "不要编造资料、教材、论文或链接。"
        "如果问题像考核/作业求完整答案，只给思路、分层提示和可执行下一步，不直接给完整答案。"
        "直接输出回答正文，不要输出 JSON，不要输出 Markdown 表格。"
    )


def build_ai_tutor_payload(
    *,
    user: User,
    course: Course,
    message: str,
    profile: dict[str, Any] | None,
    sources: list[KnowledgeSource],
    history: list[dict[str, str]] | None,
    personal_sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "prompt_version": PROMPT_VERSION,
        "student": {
            "id": user.id,
            "name": user.display_name,
        },
        "course": {
            "course_id": course.id,
            "course_name": course.name,
        },
        "message": message,
        "history": _history_payload(history),
        "learner_profile": profile,
        "knowledge_sources": [_source_payload(source) for source in sources],
        "personal_knowledge_sources": personal_sources or [],
        "retrieval_policy": {
            "priority": "personal_knowledge_base_first",
            "personal_hit": bool(personal_sources),
            "fallback": "general_model_answer_without_high_confidence_when_no_source_is_cited",
        },
        "output_schema": {
            "answer": "string, Chinese learning answer",
            "confidence": "float in [0,1], backend will recalculate from citations",
            "knowledge_source_ids": "array selected from knowledge_sources.source_id",
            "personal_knowledge_source_ids": "array selected from personal_knowledge_sources.source_id",
            "suggested_actions": "array of 2-4 short Chinese action labels",
            "profile_used": "boolean",
            "source_used": "boolean",
            "safety_note": "string, empty when no special risk",
        },
    }


def build_ai_tutor_stream_messages(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"role": "system", "content": build_ai_tutor_stream_system_prompt()},
        {
            "role": "user",
            "content": (
                "请根据下面 JSON 上下文回答学生问题。直接输出回答正文，回答会被实时展示给学生。\n\n"
                + json.dumps(payload, ensure_ascii=False)
            ),
        },
    ]


def build_ai_tutor_metadata_messages(payload: dict[str, Any], answer: str) -> list[dict[str, Any]]:
    metadata_payload = {
        **payload,
        "generated_answer": answer,
        "metadata_schema": {
            "confidence": "float in [0,1], backend will recalculate from citations",
            "knowledge_source_ids": "array selected from knowledge_sources.source_id",
            "personal_knowledge_source_ids": "array selected from personal_knowledge_sources.source_id",
            "suggested_actions": "array of 2-4 short Chinese action labels",
            "profile_used": "boolean",
            "source_used": "boolean",
            "safety_note": "string, empty when no special risk",
        },
    }
    return [
        {
            "role": "system",
            "content": (
                "你是 CodeTrack 的回答元数据审查器。只基于输入的上下文和 generated_answer 输出 JSON，"
                "不要改写 answer，不要编造 source_id。"
            ),
        },
        {
            "role": "user",
            "content": "请为 generated_answer 生成 metadata_schema 描述的 JSON。\n\n" + json.dumps(metadata_payload, ensure_ascii=False),
        },
    ]


async def generate_student_ai_reply(
    db: Session,
    *,
    user: User,
    class_id: str,
    course: Course,
    message: str,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    get_settings.cache_clear()
    settings = get_settings()
    use_gateway = bool(settings.model_gateway_url)
    missing: list[str] = []
    if not use_gateway:
        if not settings.model_api_key:
            missing.append("CODETRACK_MODEL_API_KEY")
        if not settings.model_name:
            missing.append("CODETRACK_MODEL_NAME")
    if missing:
        raise ApiError(
            503,
            "AI_MODEL_NOT_CONFIGURED",
            "AI 模型配置还不完整，暂时不能发起对话。",
            details={
                "missing": missing,
                "optional": ["CODETRACK_MODEL_API_BASE_URL"],
            },
        )

    sources = _filter_relevant_course_sources(_load_sources(db, course.id), message)
    allowed_sources = {source.id: source for source in sources}
    personal_sources = _load_personal_knowledge_sources(db, user, message)
    allowed_personal_sources = {source["source_id"]: source for source in personal_sources}
    profile = serialize_learner_profile(db, student_id=user.id, course_id=course.id, class_id=class_id)
    fallback_model_name = settings.model_name or "configured-model"
    default_provider = "MODEL_GATEWAY" if use_gateway else "OPENAI_COMPATIBLE"
    payload = build_ai_tutor_payload(
        user=user,
        course=course,
        message=message,
        profile=profile,
        sources=sources,
        history=history,
        personal_sources=personal_sources,
    )

    context = AgentRunContext(
        run_id=new_run_id(),
        workflow_type=WORKFLOW_TYPE,
        student_id=user.id,
        course_id=course.id,
    )
    run = start_run(
        db,
        context,
        input_payload={
            "course_id": course.id,
            "message": _trim(message, 300),
            "knowledge_source_ids": [source.id for source in sources],
            "personal_knowledge_source_ids": [source["source_id"] for source in personal_sources],
            "profile_available": profile is not None,
        },
        model_provider=default_provider,
        model_name=fallback_model_name,
        prompt_version=PROMPT_VERSION,
    )

    def validator(raw: dict[str, Any]) -> dict[str, Any]:
        return validate_ai_tutor_output(
            raw,
            allowed_sources=allowed_sources,
            allowed_personal_sources=allowed_personal_sources,
            default_provider=default_provider,
            fallback_model_name=fallback_model_name,
        )

    try:
        if use_gateway:
            llm_result = await request_json(
                settings.model_gateway_url or "",
                payload=payload,
                validator=validator,
                timeout=35,
                prompt_version=PROMPT_VERSION,
                model_provider=default_provider,
                model_name=fallback_model_name,
            )
        else:
            llm_result = await chat_json(
                [
                    {"role": "system", "content": build_ai_tutor_system_prompt()},
                    {
                        "role": "user",
                        "content": (
                            "请根据下面 JSON 上下文回答学生问题，并严格返回 output_schema 所描述的 JSON。\n\n"
                            + json.dumps(payload, ensure_ascii=False)
                        ),
                    },
                ],
                model=fallback_model_name,
                api_key=settings.model_api_key,
                base_url=settings.model_api_base_url,
                validator=validator,
                timeout=45,
                retries=1,
                temperature=0.2,
                prompt_version=PROMPT_VERSION,
                model_provider=default_provider,
            )
    except LLMError as exc:
        finish_run(
            db,
            run,
            status="FAILED",
            error_code=exc.code,
            error_message=exc.detail or str(exc),
            attempts=getattr(exc, "attempts", 1),
        )
        db.commit()
        raise ApiError(
            502,
            "AI_MODEL_REQUEST_FAILED",
            "AI 模型请求失败，请稍后再试。",
            details={"llm_error_code": exc.code, "agent_run_id": run.id},
        ) from exc

    result: dict[str, Any] = llm_result.data
    result["run_id"] = run.id
    finish_run(
        db,
        run,
        status="SUCCEEDED",
        output={
            "confidence": result["confidence"],
            "source_used": result["source_used"],
            "citation_count": len(result["citations"]),
        },
        attempts=llm_result.attempts,
        model_provider=result["model_provider"],
        model_name=result["model_name"],
        token_prompt=llm_result.token_prompt,
        token_completion=llm_result.token_completion,
    )
    record_step(
        db,
        run,
        step_name="student_ai_reply",
        step_order=1,
        status="SUCCEEDED",
        input_summary={"message": _trim(message, 120), "course_id": course.id},
        output_summary={"confidence": result["confidence"], "actions": result["suggested_actions"]},
        started_at=llm_result.started_at,
        finished_at=llm_result.finished_at,
    )
    db.commit()
    return result


async def stream_student_ai_reply(
    db: Session,
    *,
    user: User,
    class_id: str,
    course: Course,
    message: str,
    history: list[dict[str, str]] | None = None,
):
    get_settings.cache_clear()
    settings = get_settings()
    use_gateway = bool(settings.model_gateway_url)
    missing: list[str] = []
    if not use_gateway:
        if not settings.model_api_key:
            missing.append("CODETRACK_MODEL_API_KEY")
        if not settings.model_name:
            missing.append("CODETRACK_MODEL_NAME")
    if missing:
        raise ApiError(
            503,
            "AI_MODEL_NOT_CONFIGURED",
            "AI 模型配置还不完整，暂时不能发起对话。",
            details={"missing": missing, "optional": ["CODETRACK_MODEL_API_BASE_URL"]},
        )

    if use_gateway:
        result = await generate_student_ai_reply(
            db,
            user=user,
            class_id=class_id,
            course=course,
            message=message,
            history=history,
        )
        yield {"type": "delta", "content": result["answer"]}
        yield {"type": "final", "data": result}
        return

    sources = _filter_relevant_course_sources(_load_sources(db, course.id), message)
    allowed_sources = {source.id: source for source in sources}
    personal_sources = _load_personal_knowledge_sources(db, user, message)
    allowed_personal_sources = {source["source_id"]: source for source in personal_sources}
    profile = serialize_learner_profile(db, student_id=user.id, course_id=course.id, class_id=class_id)
    fallback_model_name = settings.model_name or "configured-model"
    default_provider = "OPENAI_COMPATIBLE"
    payload = build_ai_tutor_payload(
        user=user,
        course=course,
        message=message,
        profile=profile,
        sources=sources,
        history=history,
        personal_sources=personal_sources,
    )

    run = start_run(
        db,
        AgentRunContext(
            run_id=new_run_id(),
            workflow_type=WORKFLOW_TYPE,
            student_id=user.id,
            course_id=course.id,
        ),
        input_payload={
            "course_id": course.id,
            "message": _trim(message, 300),
            "knowledge_source_ids": [source.id for source in sources],
            "personal_knowledge_source_ids": [source["source_id"] for source in personal_sources],
            "profile_available": profile is not None,
            "stream": True,
        },
        model_provider=default_provider,
        model_name=fallback_model_name,
        prompt_version=PROMPT_VERSION,
    )

    answer_parts: list[str] = []
    try:
        async for chunk in chat_text_stream(
            build_ai_tutor_stream_messages(payload),
            model=fallback_model_name,
            api_key=settings.model_api_key,
            base_url=settings.model_api_base_url,
            timeout=45,
            temperature=0.2,
        ):
            answer_parts.append(chunk)
            yield {"type": "delta", "content": chunk}

        answer = "".join(answer_parts).strip()
        if not answer:
            raise ValueError("empty streamed answer")

        def metadata_validator(raw: dict[str, Any]) -> dict[str, Any]:
            return validate_ai_tutor_output(
                {**raw, "answer": answer},
                allowed_sources=allowed_sources,
                allowed_personal_sources=allowed_personal_sources,
                default_provider=default_provider,
                fallback_model_name=fallback_model_name,
            )

        metadata_result = await chat_json(
            build_ai_tutor_metadata_messages(payload, answer),
            model=fallback_model_name,
            api_key=settings.model_api_key,
            base_url=settings.model_api_base_url,
            validator=metadata_validator,
            timeout=30,
            retries=1,
            temperature=0.1,
            prompt_version=PROMPT_VERSION,
            model_provider=default_provider,
        )
    except LLMError as exc:
        finish_run(
            db,
            run,
            status="FAILED",
            error_code=exc.code,
            error_message=exc.detail or str(exc),
            attempts=getattr(exc, "attempts", 1),
        )
        db.commit()
        raise ApiError(
            502,
            "AI_MODEL_REQUEST_FAILED",
            "AI 模型请求失败，请稍后再试。",
            details={"llm_error_code": exc.code, "agent_run_id": run.id},
        ) from exc
    except ValueError as exc:
        finish_run(
            db,
            run,
            status="FAILED",
            error_code="LLM_STREAM_EMPTY",
            error_message=str(exc),
            attempts=1,
        )
        db.commit()
        raise ApiError(
            502,
            "AI_MODEL_REQUEST_FAILED",
            "AI 模型请求失败，请稍后再试。",
            details={"llm_error_code": "LLM_STREAM_EMPTY", "agent_run_id": run.id},
        ) from exc

    result: dict[str, Any] = metadata_result.data
    result["run_id"] = run.id
    finish_run(
        db,
        run,
        status="SUCCEEDED",
        output={
            "confidence": result["confidence"],
            "source_used": result["source_used"],
            "citation_count": len(result["citations"]),
            "stream": True,
        },
        attempts=1,
        model_provider=result["model_provider"],
        model_name=result["model_name"],
        token_prompt=metadata_result.token_prompt,
        token_completion=metadata_result.token_completion,
    )
    record_step(
        db,
        run,
        step_name="student_ai_stream_reply",
        step_order=1,
        status="SUCCEEDED",
        input_summary={"message": _trim(message, 120), "course_id": course.id},
        output_summary={"confidence": result["confidence"], "actions": result["suggested_actions"]},
        started_at=metadata_result.started_at,
        finished_at=metadata_result.finished_at,
    )
    db.commit()
    yield {"type": "final", "data": result}
