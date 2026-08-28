from __future__ import annotations

from datetime import datetime
import json
from uuid import uuid4
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.ai.errors import LLMError, LLMHTTPError, LLMNotConfigured, LLMTimeout
from backend.app.ai.llm_client import chat_json, chat_text_stream
from backend.app.core.config import get_settings

from .database import SessionLocal, get_db
from .models import (
    Chapter,
    ClassGroup,
    Course,
    DiagnosisResult,
    DiagnosisReview,
    Enrollment,
    EvaluationResult,
    KnowledgePoint,
    Material,
    Submission,
    Task,
    TeacherAiMessage,
    TeacherAiSession,
    User,
)


router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-ai"])

PROMPT_VERSION = "teacher-ai-assistant-v1"
MAX_HISTORY = 8
MAX_CONTEXT_CHARS = 18000


class TeacherAiHistoryMessage(BaseModel):
    role: Literal["assistant", "teacher"]
    content: str = Field(min_length=1, max_length=4000)


class TeacherAiChatRequest(BaseModel):
    course_id: str
    class_id: str | None = None
    session_id: str | None = None
    message: str = Field(min_length=1, max_length=4000)
    history: list[TeacherAiHistoryMessage] = Field(default_factory=list, max_length=12)


class TeacherAiSessionRequest(BaseModel):
    course_id: str
    class_id: str | None = None
    first_message: str = Field(default="新的教师 AI 助教会话", max_length=4000)
    title: str | None = Field(default=None, max_length=160)


def envelope(data: Any, **meta: Any) -> dict[str, Any]:
    response = {"data": data}
    if meta:
        response["meta"] = meta
    return response


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _json_loads(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:20]}"


def _trim_text(value: str | None, limit: int) -> str:
    text = (value or "").strip()
    return text if len(text) <= limit else f"{text[:limit - 3]}..."


def _session_title(first_message: str) -> str:
    title = _trim_text(first_message.replace("\n", " "), 30)
    return title or "新的教师 AI 助教会话"


def serialize_teacher_ai_session(session: TeacherAiSession) -> dict[str, Any]:
    return {
        "id": session.id,
        "teacher_id": session.teacher_id,
        "course_id": session.course_id,
        "class_id": session.class_id,
        "title": session.title,
        "summary": session.summary,
        "status": session.status,
        "message_count": session.message_count,
        "created_at": _iso(session.created_at),
        "updated_at": _iso(session.updated_at),
        "last_message_at": _iso(session.last_message_at),
    }


def serialize_teacher_ai_message(message: TeacherAiMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "session_id": message.session_id,
        "role": message.role,
        "content": message.content,
        "status": message.status,
        "metadata": _json_loads(message.metadata_json),
        "created_at": _iso(message.created_at),
    }


def list_teacher_ai_sessions(
    db: Session,
    *,
    teacher_id: str,
    course_id: str | None,
    class_id: str | None,
    query: str | None,
) -> list[TeacherAiSession]:
    statement = select(TeacherAiSession).where(
        TeacherAiSession.teacher_id == teacher_id,
        TeacherAiSession.status == "ACTIVE",
    )
    if course_id:
        statement = statement.where(TeacherAiSession.course_id == course_id)
    if class_id:
        statement = statement.where(or_(TeacherAiSession.class_id == class_id, TeacherAiSession.class_id.is_(None)))
    sessions = list(
        db.scalars(
            statement.order_by(TeacherAiSession.updated_at.desc(), TeacherAiSession.created_at.desc()).limit(60)
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


def get_teacher_ai_session(db: Session, *, teacher_id: str, session_id: str) -> TeacherAiSession:
    session = db.get(TeacherAiSession, session_id)
    if session is None or session.teacher_id != teacher_id or session.status != "ACTIVE":
        raise HTTPException(status_code=404, detail="教师 AI 助教会话不存在或已不可用")
    return session


def create_teacher_ai_session(
    db: Session,
    *,
    teacher_id: str,
    course_id: str,
    class_id: str | None,
    first_message: str,
    title: str | None = None,
) -> TeacherAiSession:
    timestamp = datetime.now()
    session = TeacherAiSession(
        id=_new_id("tai"),
        teacher_id=teacher_id,
        course_id=course_id,
        class_id=class_id,
        title=_trim_text(title, 80) if title and title.strip() else _session_title(first_message),
        summary=_trim_text(first_message, 100),
        status="ACTIVE",
        message_count=0,
        created_at=timestamp,
        updated_at=timestamp,
        last_message_at=None,
    )
    db.add(session)
    db.flush()
    return session


def ensure_teacher_ai_session(
    db: Session,
    *,
    teacher_id: str,
    course_id: str,
    class_id: str | None,
    session_id: str | None,
    first_message: str,
) -> TeacherAiSession:
    if not session_id:
        return create_teacher_ai_session(
            db,
            teacher_id=teacher_id,
            course_id=course_id,
            class_id=class_id,
            first_message=first_message,
        )
    session = get_teacher_ai_session(db, teacher_id=teacher_id, session_id=session_id)
    if session.course_id != course_id:
        raise HTTPException(status_code=409, detail="这个历史会话不属于当前课程")
    if class_id and session.class_id and session.class_id != class_id:
        raise HTTPException(status_code=409, detail="这个历史会话不属于当前教学班")
    if class_id and not session.class_id:
        session.class_id = class_id
    return session


def append_teacher_ai_message(
    db: Session,
    *,
    session: TeacherAiSession,
    teacher_id: str,
    course_id: str,
    role: Literal["teacher", "assistant"],
    content: str,
    status_value: str = "SUCCEEDED",
    metadata: dict[str, Any] | None = None,
) -> TeacherAiMessage:
    timestamp = datetime.now()
    message = TeacherAiMessage(
        id=_new_id("tam"),
        session_id=session.id,
        teacher_id=teacher_id,
        course_id=course_id,
        role=role,
        content=content,
        status=status_value,
        metadata_json=_json_dumps(metadata or {}),
        created_at=timestamp,
    )
    db.add(message)
    session.message_count = (session.message_count or 0) + 1
    session.last_message_at = timestamp
    session.updated_at = timestamp
    if role == "teacher":
        session.summary = _trim_text(content, 100)
        if session.message_count <= 1:
            session.title = _session_title(content)
    elif role == "assistant" and not session.summary:
        session.summary = _trim_text(content, 100)
    db.flush()
    return message


def teacher_ai_history_payload(db: Session, *, session: TeacherAiSession) -> list[dict[str, str]]:
    messages = db.scalars(
        select(TeacherAiMessage)
        .where(TeacherAiMessage.session_id == session.id, TeacherAiMessage.status == "SUCCEEDED")
        .order_by(TeacherAiMessage.created_at.desc())
        .limit(MAX_HISTORY)
    ).all()
    return [
        {"role": message.role, "content": _trim_text(message.content, 1200)}
        for message in reversed(messages)
        if message.role in {"teacher", "assistant"} and message.content.strip()
    ]


def current_teacher(
    x_user_id: str = Header(default="teacher-01"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要教师权限")
    return user


def owned_course(db: Session, teacher: User, course_id: str) -> Course:
    course = db.get(Course, course_id)
    if not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="课程不存在或无权访问")
    return course


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _score_for_submission(submission: Submission) -> int | None:
    if submission.grade:
        return submission.grade.score
    if submission.evaluation:
        return submission.evaluation.score
    return None


def _safe_details(evaluation: EvaluationResult | None) -> list[dict[str, Any]]:
    if not evaluation:
        return []
    try:
        value = json.loads(evaluation.details_json or "[]")
    except json.JSONDecodeError:
        return []
    return value if isinstance(value, list) else []


def _build_teacher_context(db: Session, teacher: User, course_id: str, class_id: str | None) -> dict[str, Any]:
    course = owned_course(db, teacher, course_id)
    class_group = db.get(ClassGroup, class_id) if class_id else None
    if class_id and (not class_group or class_group.course_id != course.id):
        raise HTTPException(status_code=404, detail="教学班不存在或不属于当前课程")

    classes = db.scalars(
        select(ClassGroup)
        .options(selectinload(ClassGroup.enrollments).selectinload(Enrollment.student))
        .where(ClassGroup.course_id == course.id)
        .order_by(ClassGroup.name)
    ).all()
    current_class = class_group or (classes[0] if classes else None)

    enrollments = []
    if current_class:
        enrollments = db.scalars(
            select(Enrollment)
            .options(selectinload(Enrollment.student))
            .where(Enrollment.class_id == current_class.id)
            .order_by(Enrollment.joined_at)
        ).all()
    student_ids = [item.student_id for item in enrollments]

    task_filters = [Task.course_id == course.id]
    if current_class:
        task_filters.append(or_(Task.class_id == current_class.id, Task.class_id.is_(None)))
    tasks = db.scalars(
        select(Task)
        .options(selectinload(Task.test_cases))
        .where(*task_filters)
        .order_by(Task.created_at.desc())
    ).all()
    task_ids = [item.id for item in tasks]
    assigned_task_ids = [item.id for item in tasks if item.status in {"published", "closed"}]

    submissions: list[Submission] = []
    if task_ids and student_ids:
        submissions = db.scalars(
            select(Submission)
            .options(
                selectinload(Submission.student),
                selectinload(Submission.task),
                selectinload(Submission.evaluation),
                selectinload(Submission.grade),
                selectinload(Submission.diagnosis).selectinload(DiagnosisResult.review),
            )
            .where(Submission.task_id.in_(task_ids), Submission.student_id.in_(student_ids))
            .order_by(Submission.submitted_at.desc())
        ).all()

    submissions_by_student: dict[str, list[Submission]] = {}
    submissions_by_task: dict[str, list[Submission]] = {}
    for submission in submissions:
        submissions_by_student.setdefault(submission.student_id, []).append(submission)
        submissions_by_task.setdefault(submission.task_id, []).append(submission)

    student_rows = []
    for enrollment in enrollments:
        student_submissions = submissions_by_student.get(enrollment.student_id, [])
        latest_by_task: dict[str, Submission] = {}
        for submission in sorted(student_submissions, key=lambda item: item.submitted_at):
            latest_by_task[submission.task_id] = submission
        scores = [score for score in (_score_for_submission(item) for item in latest_by_task.values()) if score is not None]
        progress = round(len(latest_by_task) * 100 / len(assigned_task_ids)) if assigned_task_ids else 0
        average_score = round(sum(scores) / len(scores)) if scores else None
        max_hint = max([item.hint_level for item in student_submissions], default=0)
        latest_at = max([item.submitted_at for item in student_submissions], default=None)
        status_value = "normal"
        if (assigned_task_ids and progress < 60) or (average_score is not None and average_score < 60) or max_hint >= 3:
            status_value = "risk"
        elif (assigned_task_ids and progress < 85) or (average_score is not None and average_score < 75) or max_hint >= 2:
            status_value = "attention"
        student_rows.append({
            "id": enrollment.student.id,
            "name": enrollment.student.name,
            "number": enrollment.student.number,
            "progress": progress,
            "average_score": average_score,
            "status": status_value,
            "submission_count": len(student_submissions),
            "max_hint_level": max_hint,
            "latest_submitted_at": _iso(latest_at),
        })

    task_rows = []
    for task in tasks:
        task_submissions = submissions_by_task.get(task.id, [])
        total = len(student_ids) if task.class_id or current_class else 0
        submitted = len({item.student_id for item in task_submissions})
        scores = [score for score in (_score_for_submission(item) for item in task_submissions) if score is not None]
        task_rows.append({
            "id": task.id,
            "title": task.title,
            "type": task.type,
            "chapter": task.chapter_label,
            "status": task.status,
            "difficulty": task.difficulty,
            "publish_at": _iso(task.publish_at),
            "due_at": _iso(task.due_at),
            "submitted": submitted,
            "total": total,
            "completion": round(submitted * 100 / total) if total else 0,
            "average_score": round(sum(scores) / len(scores)) if scores else None,
            "test_cases": [{"name": item.name, "hidden": item.hidden, "weight": item.weight} for item in task.test_cases],
        })

    error_counts: dict[str, int] = {}
    hint_levels: dict[int, int] = {}
    for submission in submissions:
        hint_levels[submission.hint_level] = hint_levels.get(submission.hint_level, 0) + 1
        for detail in _safe_details(submission.evaluation):
            if isinstance(detail, dict) and detail.get("passed") is False:
                name = str(detail.get("name") or "未命名测试点")
                error_counts[name] = error_counts.get(name, 0) + 1

    reviews = db.scalars(
        select(DiagnosisReview)
        .options(
            selectinload(DiagnosisReview.diagnosis)
            .selectinload(DiagnosisResult.submission)
            .selectinload(Submission.student),
            selectinload(DiagnosisReview.diagnosis)
            .selectinload(DiagnosisResult.submission)
            .selectinload(Submission.task),
        )
        .where(DiagnosisReview.teacher_id == teacher.id)
        .order_by(DiagnosisReview.id.desc())
        .limit(20)
    ).all()
    review_rows = []
    for item in reviews:
        submission = item.diagnosis.submission
        if submission.task.course_id != course.id:
            continue
        if current_class and submission.student_id not in student_ids:
            continue
        review_rows.append({
            "id": item.id,
            "status": item.status,
            "student": submission.student.name,
            "task": submission.task.title,
            "diagnosis_type": item.diagnosis.type,
            "confidence": item.diagnosis.confidence,
            "fallback": item.diagnosis.fallback,
            "source": item.diagnosis.source,
            "explanation": item.diagnosis.explanation,
        })

    knowledge = db.scalars(
        select(KnowledgePoint)
        .join(Chapter)
        .where(Chapter.course_id == course.id)
        .order_by(KnowledgePoint.mastery)
    ).all()
    materials = db.scalars(
        select(Material)
        .where(Material.course_id == course.id, Material.status != "deleted", ~Material.status.startswith("folder_deleted|"))
        .order_by(Material.updated_at.desc())
        .limit(12)
    ).all()

    all_scores = [score for score in (_score_for_submission(item) for item in submissions) if score is not None]
    data_sources = [
        {
            "id": "course-profile",
            "label": "课程基础信息",
            "kind": "course",
            "record_count": 1,
            "data": {
                "id": course.id,
                "name": course.name,
                "code": course.code,
                "term": course.term,
                "description": course.description,
                "status": course.status,
                "student_visible": course.student_visible,
                "progress": course.progress,
            },
        },
        {
            "id": "class-roster",
            "label": "当前班级学生画像",
            "kind": "class",
            "record_count": len(student_rows),
            "data": {
                "class": None if not current_class else {
                    "id": current_class.id,
                    "name": current_class.name,
                    "grade": current_class.grade,
                    "major": current_class.major,
                    "schedule": current_class.schedule,
                    "student_count": len(student_rows),
                },
                "students": student_rows,
            },
        },
        {
            "id": "task-submissions",
            "label": "任务发布与提交记录",
            "kind": "submissions",
            "record_count": len(submissions),
            "data": {
                "tasks": task_rows,
                "latest_submissions": [
                    {
                        "id": item.id,
                        "task": item.task.title,
                        "student": item.student.name,
                        "status": item.status,
                        "hint_level": item.hint_level,
                        "score": _score_for_submission(item),
                        "passed_tests": item.evaluation.passed_tests if item.evaluation else None,
                        "total_tests": item.evaluation.total_tests if item.evaluation else None,
                        "submitted_at": _iso(item.submitted_at),
                    }
                    for item in submissions[:24]
                ],
                "error_distribution": sorted(
                    [{"name": name, "count": count} for name, count in error_counts.items()],
                    key=lambda item: item["count"],
                    reverse=True,
                ),
                "hint_distribution": [{"level": level, "count": count} for level, count in sorted(hint_levels.items())],
            },
        },
        {
            "id": "knowledge-materials",
            "label": "课程知识图谱与资料",
            "kind": "knowledge",
            "record_count": len(knowledge) + len(materials),
            "data": {
                "knowledge_points": [
                    {
                        "id": item.id,
                        "name": item.name,
                        "description": item.description,
                        "difficulty": item.difficulty,
                        "mastery": item.mastery,
                    }
                    for item in knowledge
                ],
                "materials": [
                    {
                        "id": item.id,
                        "title": item.title,
                        "type": item.type,
                        "chapter": item.chapter_label,
                        "visibility": item.visibility,
                        "status": item.status,
                        "citations": item.citations,
                        "updated_at": _iso(item.updated_at),
                    }
                    for item in materials
                ],
            },
        },
        {
            "id": "ai-review-records",
            "label": "AI 诊断复核记录",
            "kind": "review",
            "record_count": len(review_rows),
            "data": review_rows,
        },
    ]

    return {
        "generated_at": datetime.now().replace(microsecond=0).isoformat(),
        "teacher": {"id": teacher.id, "name": teacher.name, "department": teacher.department},
        "scope": {
            "course_id": course.id,
            "course_name": course.name,
            "class_id": current_class.id if current_class else None,
            "class_name": current_class.name if current_class else None,
        },
        "analytics_summary": {
            "students": len(student_rows),
            "assigned_tasks": len(assigned_task_ids),
            "average_score": round(sum(all_scores) / len(all_scores)) if all_scores else None,
            "risk_students": len([item for item in student_rows if item["status"] == "risk"]),
            "attention_students": len([item for item in student_rows if item["status"] == "attention"]),
            "pending_ai_reviews": len([item for item in review_rows if item["status"] == "pending"]),
        },
        "data_sources": data_sources,
    }


def _trim_context(context: dict[str, Any]) -> dict[str, Any]:
    text = json.dumps(context, ensure_ascii=False)
    if len(text) <= MAX_CONTEXT_CHARS:
        return context
    trimmed = dict(context)
    trimmed["data_sources"] = []
    for source in context["data_sources"]:
        compact = {key: value for key, value in source.items() if key != "data"}
        if source["id"] == "task-submissions":
            compact["data"] = {
                "tasks": source["data"]["tasks"][:8],
                "latest_submissions": source["data"]["latest_submissions"][:12],
                "error_distribution": source["data"]["error_distribution"][:8],
                "hint_distribution": source["data"]["hint_distribution"],
            }
        elif source["id"] == "class-roster":
            compact["data"] = {
                "class": source["data"]["class"],
                "students": source["data"]["students"][:20],
            }
        elif source["id"] == "knowledge-materials":
            compact["data"] = {
                "knowledge_points": source["data"]["knowledge_points"][:12],
                "materials": source["data"]["materials"][:8],
            }
        else:
            compact["data"] = source["data"]
        trimmed["data_sources"].append(compact)
    return trimmed


def _validate_ai_output(raw: dict[str, Any]) -> dict[str, Any]:
    answer = raw.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("answer 不能为空")

    try:
        confidence = float(raw.get("confidence", 0.65))
    except (TypeError, ValueError):
        confidence = 0.65
    confidence = max(0.0, min(1.0, confidence))

    def string_list(value: Any, limit: int) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value[:limit] if str(item).strip()]

    return {
        "answer": answer.strip(),
        "confidence": confidence,
        "citations": string_list(raw.get("citations"), 8),
        "suggested_actions": string_list(raw.get("suggested_actions"), 6),
        "data_gaps": string_list(raw.get("data_gaps"), 6),
    }


def _source_catalog(context: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": item["id"],
            "label": item["label"],
            "kind": item["kind"],
            "record_count": item["record_count"],
        }
        for item in context["data_sources"]
    ]


def _resolve_citations(citations: list[str], context: dict[str, Any]) -> list[dict[str, Any]]:
    sources = {item["id"]: item for item in _source_catalog(context)}
    resolved = []
    for source_id in citations:
        if source_id in sources and sources[source_id] not in resolved:
            resolved.append(sources[source_id])
    return resolved


def _settings_or_503() -> Any:
    settings = get_settings()
    if not settings.model_api_key or not settings.model_name:
        raise HTTPException(status_code=503, detail="未配置真实模型：请设置 CODETRACK_MODEL_API_KEY 和 CODETRACK_MODEL_NAME 后重试")
    return settings


def _teacher_ai_context_summary(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "scope": context["scope"],
        "analytics_summary": context["analytics_summary"],
        "sources": _source_catalog(context),
        "generated_at": context["generated_at"],
    }


def _teacher_ai_system_prompt(*, json_only: bool) -> str:
    base = (
        "你是 CodeTrack 教师端 AI 助教，服务人工智能专业课程教师。"
        "你必须直接基于用户消息里的真实课程、班级、学生提交、知识图谱和 AI 复核数据分析，"
        "不要编造没有提供的学生、分数、任务或资料。"
        "教师端不需要你生成 PPT 或多模态资源；可以给出学情分析、风险预警、错因归纳、分层辅导和诊断复核建议。"
        "如果证据不足，要明确说明缺少哪些数据。"
    )
    if json_only:
        return (
            base
            + "只输出 JSON 对象，字段为 answer, confidence, citations, suggested_actions, data_gaps。"
            + "citations 只能使用 allowed_citation_ids 中的 id。"
        )
    return (
        base
        + "用中文直接回答教师问题。回答要有层次，但不要输出 JSON。"
        + "涉及数据依据时在句子中点名来源标签，例如“当前班级学生画像”“任务发布与提交记录”。"
    )


def _teacher_ai_payload(message: str, history: list[dict[str, str]], context: dict[str, Any]) -> dict[str, Any]:
    return {
        "teacher_question": message,
        "conversation_history": history[-MAX_HISTORY:],
        "context": context,
        "allowed_citation_ids": [item["id"] for item in context["data_sources"]],
        "source_catalog": _source_catalog(context),
    }


def _teacher_ai_messages(payload: dict[str, Any], *, json_only: bool) -> list[dict[str, Any]]:
    return [
        {"role": "system", "content": _teacher_ai_system_prompt(json_only=json_only)},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _teacher_ai_metadata_messages(payload: dict[str, Any], answer: str) -> list[dict[str, Any]]:
    metadata_payload = {
        **payload,
        "assistant_answer": answer,
        "instruction": (
            "请只为 assistant_answer 补充结构化元数据。answer 字段必须原样返回 assistant_answer；"
            "confidence 为 0 到 1；citations 只能使用 allowed_citation_ids；"
            "suggested_actions 和 data_gaps 用于教师下一步操作。"
        ),
    }
    return _teacher_ai_messages(metadata_payload, json_only=True)


def _fallback_metadata_from_context(context: dict[str, Any]) -> dict[str, Any]:
    summary = context["analytics_summary"]
    actions = ["查看学情分析", "核查 AI 诊断复核记录", "追问薄弱知识点"]
    gaps = []
    if not summary["students"]:
        gaps.append("当前班级暂无学生画像数据")
    if not summary["assigned_tasks"]:
        gaps.append("当前课程暂无已发布任务数据")
    cited_ids = [item["id"] for item in _source_catalog(context) if item["record_count"] > 0][:5]
    confidence = 0.82 if cited_ids and summary["students"] else 0.62
    return {"confidence": confidence, "citations": cited_ids, "suggested_actions": actions, "data_gaps": gaps}


def _llm_error_payload(exc: LLMError) -> dict[str, Any]:
    if isinstance(exc, LLMNotConfigured):
        return {"code": "LLM_NOT_CONFIGURED", "message": "未配置真实模型：请设置 CODETRACK_MODEL_API_KEY 和 CODETRACK_MODEL_NAME 后重试", "details": {}}
    if isinstance(exc, LLMTimeout):
        return {"code": "LLM_TIMEOUT", "message": "真实模型请求超时，请稍后重试", "details": {}}
    if isinstance(exc, LLMHTTPError):
        return {"code": "LLM_HTTP_ERROR", "message": f"真实模型调用失败：{exc.detail or str(exc)}", "details": {"status_code": exc.status_code}}
    return {"code": exc.code, "message": "真实模型响应不可用，请稍后重试", "details": {"detail": exc.detail or str(exc)}}


def sse_event(event: str, data: dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


@router.get("/ai-assistant/sessions")
def teacher_ai_sessions(
    course_id: str | None = None,
    class_id: str | None = None,
    q: str | None = None,
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    if course_id:
        owned_course(db, teacher, course_id)
    sessions = list_teacher_ai_sessions(db, teacher_id=teacher.id, course_id=course_id, class_id=class_id, query=q)
    return envelope([serialize_teacher_ai_session(session) for session in sessions])


@router.post("/ai-assistant/sessions")
def create_teacher_ai_session_endpoint(
    payload: TeacherAiSessionRequest,
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    _build_teacher_context(db, teacher, payload.course_id, payload.class_id)
    session = create_teacher_ai_session(
        db,
        teacher_id=teacher.id,
        course_id=payload.course_id,
        class_id=payload.class_id,
        first_message=payload.first_message,
        title=payload.title,
    )
    db.commit()
    return envelope(serialize_teacher_ai_session(session))


@router.get("/ai-assistant/sessions/{session_id}")
def teacher_ai_session_detail(
    session_id: str,
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    session = get_teacher_ai_session(db, teacher_id=teacher.id, session_id=session_id)
    messages = db.scalars(
        select(TeacherAiMessage)
        .where(TeacherAiMessage.session_id == session.id)
        .order_by(TeacherAiMessage.created_at.asc(), TeacherAiMessage.id.asc())
    ).all()
    return envelope({
        "session": serialize_teacher_ai_session(session),
        "messages": [serialize_teacher_ai_message(message) for message in messages],
    })


@router.delete("/ai-assistant/sessions/{session_id}")
def delete_teacher_ai_session_endpoint(
    session_id: str,
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    session = get_teacher_ai_session(db, teacher_id=teacher.id, session_id=session_id)
    session.status = "DELETED"
    session.updated_at = datetime.now().replace(microsecond=0)
    db.commit()
    return envelope({"id": session_id, "deleted": True})


@router.post("/ai-assistant/chat")
async def teacher_ai_chat(
    payload: TeacherAiChatRequest,
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    context = _trim_context(_build_teacher_context(db, teacher, payload.course_id, payload.class_id))
    settings = _settings_or_503()
    session = ensure_teacher_ai_session(
        db,
        teacher_id=teacher.id,
        course_id=payload.course_id,
        class_id=payload.class_id,
        session_id=payload.session_id,
        first_message=payload.message.strip(),
    )
    history = teacher_ai_history_payload(db, session=session) or [item.model_dump() for item in payload.history[-MAX_HISTORY:]]
    user_message = append_teacher_ai_message(
        db,
        session=session,
        teacher_id=teacher.id,
        course_id=payload.course_id,
        role="teacher",
        content=payload.message.strip(),
    )
    user_payload = _teacher_ai_payload(payload.message, history, context)
    messages = _teacher_ai_messages(user_payload, json_only=True)

    try:
        result = await chat_json(
            messages,
            model=settings.model_name,
            api_key=settings.model_api_key,
            base_url=settings.model_api_base_url,
            validator=_validate_ai_output,
            timeout=45,
            retries=1,
            temperature=0.2,
            prompt_version=PROMPT_VERSION,
            model_provider="OPENAI_COMPATIBLE",
        )
    except LLMNotConfigured as exc:
        raise HTTPException(status_code=503, detail="未配置真实模型：请设置 CODETRACK_MODEL_API_KEY 和 CODETRACK_MODEL_NAME 后重试") from exc
    except LLMTimeout as exc:
        raise HTTPException(status_code=504, detail="真实模型请求超时，请稍后重试") from exc
    except LLMHTTPError as exc:
        detail = exc.detail or str(exc)
        raise HTTPException(status_code=502, detail=f"真实模型调用失败：{detail}") from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=f"真实模型响应不可用：{exc.code}") from exc

    data = result.data
    citations = _resolve_citations(data["citations"], context)
    assistant_message = append_teacher_ai_message(
        db,
        session=session,
        teacher_id=teacher.id,
        course_id=payload.course_id,
        role="assistant",
        content=data["answer"],
        metadata={
            "confidence": round(data["confidence"] * 100),
            "citations": citations,
            "suggested_actions": data["suggested_actions"],
            "data_gaps": data["data_gaps"],
            "model_provider": result.model_provider,
            "model_name": result.model_name,
        },
    )
    db.commit()
    return envelope({
        "id": f"teacher-ai-{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
        "role": "assistant",
        "content": data["answer"],
        "confidence": round(data["confidence"] * 100),
        "citations": citations,
        "suggested_actions": data["suggested_actions"],
        "data_gaps": data["data_gaps"],
        "model": {
            "provider": result.model_provider,
            "name": result.model_name,
            "prompt_version": PROMPT_VERSION,
            "duration_ms": result.duration_ms,
            "token_prompt": result.token_prompt,
            "token_completion": result.token_completion,
        },
        "context": {
            **_teacher_ai_context_summary(context),
        },
        "session": serialize_teacher_ai_session(session),
        "user_message_id": user_message.id,
        "assistant_message_id": assistant_message.id,
    })


@router.post("/ai-assistant/chat/stream")
async def teacher_ai_chat_stream(
    payload: TeacherAiChatRequest,
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    context = _trim_context(_build_teacher_context(db, teacher, payload.course_id, payload.class_id))
    settings = _settings_or_503()
    session = ensure_teacher_ai_session(
        db,
        teacher_id=teacher.id,
        course_id=payload.course_id,
        class_id=payload.class_id,
        session_id=payload.session_id,
        first_message=payload.message.strip(),
    )
    history = teacher_ai_history_payload(db, session=session) or [item.model_dump() for item in payload.history[-MAX_HISTORY:]]
    user_message = append_teacher_ai_message(
        db,
        session=session,
        teacher_id=teacher.id,
        course_id=payload.course_id,
        role="teacher",
        content=payload.message.strip(),
    )
    db.commit()

    session_id = session.id
    teacher_id = teacher.id
    course_id = payload.course_id
    class_id = payload.class_id
    message_text = payload.message.strip()
    session_payload = serialize_teacher_ai_session(session)
    user_message_payload = serialize_teacher_ai_message(user_message)
    user_payload = _teacher_ai_payload(message_text, history, context)
    stream_messages = _teacher_ai_messages(user_payload, json_only=False)

    async def stream():
        yield sse_event("session", {"session": session_payload, "user_message": user_message_payload})
        yield sse_event("assistant_start", {"session_id": session_id})
        stream_db = SessionLocal()
        answer_parts: list[str] = []
        try:
            async for chunk in chat_text_stream(
                stream_messages,
                model=settings.model_name,
                api_key=settings.model_api_key,
                base_url=settings.model_api_base_url,
                timeout=45,
                temperature=0.2,
            ):
                answer_parts.append(chunk)
                yield sse_event("delta", {"content": chunk})

            answer = "".join(answer_parts).strip()
            if not answer:
                raise LLMError("真实模型没有返回可用文本", detail="LLM_STREAM_EMPTY")

            try:
                metadata_result = await chat_json(
                    _teacher_ai_metadata_messages(user_payload, answer),
                    model=settings.model_name,
                    api_key=settings.model_api_key,
                    base_url=settings.model_api_base_url,
                    validator=_validate_ai_output,
                    timeout=30,
                    retries=1,
                    temperature=0.1,
                    prompt_version=PROMPT_VERSION,
                    model_provider="OPENAI_COMPATIBLE",
                )
                metadata = metadata_result.data
                model_provider = metadata_result.model_provider
                model_name = metadata_result.model_name
                duration_ms = metadata_result.duration_ms
                token_prompt = metadata_result.token_prompt
                token_completion = metadata_result.token_completion
            except LLMError:
                metadata = _fallback_metadata_from_context(context)
                model_provider = "OPENAI_COMPATIBLE"
                model_name = settings.model_name
                duration_ms = None
                token_prompt = None
                token_completion = None

            citations = _resolve_citations(metadata["citations"], context)
            stream_session = get_teacher_ai_session(stream_db, teacher_id=teacher_id, session_id=session_id)
            assistant_message = append_teacher_ai_message(
                stream_db,
                session=stream_session,
                teacher_id=teacher_id,
                course_id=course_id,
                role="assistant",
                content=answer,
                metadata={
                    "confidence": round(metadata["confidence"] * 100),
                    "citations": citations,
                    "suggested_actions": metadata["suggested_actions"],
                    "data_gaps": metadata["data_gaps"],
                    "model_provider": model_provider,
                    "model_name": model_name,
                },
            )
            stream_db.commit()
            result = {
                "id": assistant_message.id,
                "role": "assistant",
                "content": answer,
                "confidence": round(metadata["confidence"] * 100),
                "citations": citations,
                "suggested_actions": metadata["suggested_actions"],
                "data_gaps": metadata["data_gaps"],
                "model": {
                    "provider": model_provider,
                    "name": model_name,
                    "prompt_version": PROMPT_VERSION,
                    "duration_ms": duration_ms,
                    "token_prompt": token_prompt,
                    "token_completion": token_completion,
                },
                "context": _teacher_ai_context_summary(context),
                "session": serialize_teacher_ai_session(stream_session),
                "assistant_message_id": assistant_message.id,
            }
            yield sse_event("final", result)
        except LLMError as exc:
            stream_db.rollback()
            error = _llm_error_payload(exc)
            try:
                stream_session = get_teacher_ai_session(stream_db, teacher_id=teacher_id, session_id=session_id)
                append_teacher_ai_message(
                    stream_db,
                    session=stream_session,
                    teacher_id=teacher_id,
                    course_id=course_id,
                    role="assistant",
                    content=error["message"],
                    status_value="FAILED",
                    metadata={"error": error},
                )
                stream_db.commit()
            except Exception:
                stream_db.rollback()
            yield sse_event("error", error)
        finally:
            stream_db.close()

    return StreamingResponse(stream(), media_type="text/event-stream")
