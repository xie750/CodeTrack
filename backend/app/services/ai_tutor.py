import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.ai.errors import LLMError
from backend.app.ai.llm_client import chat_json, request_json
from backend.app.ai.run_recorder import finish_run, new_run_id, record_step, start_run
from backend.app.ai.schemas import AgentRunContext
from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings
from backend.app.models import Course, KnowledgeSource, User
from backend.app.services.learner_profile import serialize_learner_profile


WORKFLOW_TYPE = "student_ai_tutor_chat"
PROMPT_VERSION = "student_ai_tutor_v0.1"
MAX_HISTORY_ITEMS = 6
MAX_SOURCE_COUNT = 6
MAX_SOURCE_CONTENT_CHARS = 1200


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


def _citation(source: KnowledgeSource) -> dict[str, Any]:
    return {
        "source_id": source.id,
        "title": source.title,
        "summary": source.summary,
        "source_type": source.source_type,
        "version": source.version,
        "authority_level": source.authority_level,
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


def validate_ai_tutor_output(
    raw: dict[str, Any],
    *,
    allowed_sources: dict[str, KnowledgeSource],
    default_provider: str,
    fallback_model_name: str,
) -> dict[str, Any]:
    answer = str(raw.get("answer", "")).strip()
    if not answer:
        raise ValueError("missing answer")

    confidence = float(raw.get("confidence", 0.7))
    if confidence < 0 or confidence > 1:
        raise ValueError("confidence out of range")

    raw_source_ids = raw.get("knowledge_source_ids", [])
    if raw_source_ids is None:
        raw_source_ids = []
    if not isinstance(raw_source_ids, list):
        raise ValueError("knowledge_source_ids must be a list")
    source_ids = [str(item) for item in raw_source_ids]
    invalid_ids = [item for item in source_ids if item not in allowed_sources]
    if invalid_ids:
        raise ValueError(f"invalid source reference: {', '.join(invalid_ids)}")

    raw_actions = raw.get("suggested_actions", _default_actions())
    actions = [str(item).strip() for item in raw_actions] if isinstance(raw_actions, list) else []
    actions = [item for item in actions if item][:4] or _default_actions()

    return {
        "answer": answer,
        "confidence": confidence,
        "citations": [_citation(allowed_sources[source_id]) for source_id in source_ids],
        "suggested_actions": actions,
        "profile_used": bool(raw.get("profile_used", True)),
        "source_used": bool(source_ids),
        "safety_note": str(raw.get("safety_note", "")).strip(),
        "model_provider": str(raw.get("model_provider", default_provider)),
        "model_name": str(raw.get("model_name", fallback_model_name)),
    }


def build_ai_tutor_system_prompt() -> str:
    return (
        "你是 CodeTrack 的 AI 助学导师，面向计算机基础课程学生。"
        "你必须使用中文回答，回答要清晰、克制、适合学习场景。"
        "优先结合输入中的学生画像、课程和知识源。涉及课程知识时只能引用给定 knowledge_sources 里的 source_id，"
        "不要编造资料、教材、论文或链接。"
        "如果问题像考核/作业求完整答案，只给思路、分层提示和可执行下一步，不直接给完整答案。"
        "只输出 JSON 对象，不要 Markdown。"
    )


def build_ai_tutor_payload(
    *,
    user: User,
    course: Course,
    message: str,
    profile: dict[str, Any] | None,
    sources: list[KnowledgeSource],
    history: list[dict[str, str]] | None,
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
        "output_schema": {
            "answer": "string, Chinese learning answer",
            "confidence": "float in [0,1]",
            "knowledge_source_ids": "array selected from knowledge_sources.source_id",
            "suggested_actions": "array of 2-4 short Chinese action labels",
            "profile_used": "boolean",
            "source_used": "boolean",
            "safety_note": "string, empty when no special risk",
        },
    }


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

    sources = _load_sources(db, course.id)
    allowed_sources = {source.id: source for source in sources}
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
