import json
from typing import Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import SessionLocal, get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import (
    AdministrativeClass,
    Course,
    StudentClassMembership,
    StudentKnowledgeGraph,
    StudentTaskProgress,
    Task,
    TaskAssignment,
    TeachingAssignment,
    User,
)
from backend.app.services.learner_profile import serialize_learner_profile
from backend.app.services.submissions import iso
from backend.app.services.ai_tutor import (
    ai_tutor_history_payload,
    append_ai_tutor_message,
    delete_ai_tutor_session,
    ensure_ai_tutor_session,
    generate_student_ai_reply,
    get_ai_tutor_session,
    list_ai_tutor_messages,
    list_ai_tutor_sessions,
    serialize_ai_tutor_message,
    serialize_ai_tutor_session,
    stream_student_ai_reply,
)
from backend.app.services.question_workflow import (
    question_workspace_payload,
    save_question_draft,
    submit_question_answers,
)
from backend.app.services.student_resources import (
    ensure_resource_preview,
    generate_learning_resource,
    generate_ppt_resource,
    get_generated_resource,
    practice_workspace_payload,
    list_saved_generated_resources,
    ppt_renderer_config_payload,
    record_generated_podcast_listened,
    resource_media_type,
    resource_preview_path,
    save_generated_resource,
    serialize_generated_resource,
    submit_generated_practice,
)

router = APIRouter(prefix="/api/v1/student", tags=["student"])


class QuestionAnswerPayload(BaseModel):
    question_id: str
    selected_option_ids: list[str]


class SaveQuestionAnswersRequest(BaseModel):
    answers: list[QuestionAnswerPayload]


class AiChatHistoryItem(BaseModel):
    role: str
    content: str


class StudentAiChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    course_id: str | None = None
    session_id: str | None = None
    page_context: dict[str, Any] = Field(default_factory=dict)
    history: list[AiChatHistoryItem] = Field(default_factory=list, max_length=12)


class StudentAiChatSessionRequest(BaseModel):
    course_id: str | None = None
    first_message: str = Field(default="新的 AI 助学会话", max_length=2000)


class StudentPptGenerateRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    course_id: str | None = None
    session_id: str | None = None


class StudentResourceGenerateRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    resource_type: str = Field(min_length=1, max_length=40)
    course_id: str | None = None
    session_id: str | None = None


class StudentPodcastListenedRequest(BaseModel):
    completed_segment_count: int | None = Field(default=None, ge=0, le=50)


def task_knowledge_points(task: Task) -> list[str]:
    if task.course_id == "course_arch_001":
        return ["机器学习", "过拟合", "模型评估"]
    if task.course_id == "course_network_001":
        return ["Python", "列表遍历", "字典查找"]
    if "二叉树" in task.title:
        return ["二叉树", "递归", "遍历"]
    if "栈" in task.title:
        return ["栈与队列", "括号匹配", "边界处理"]
    return ["链表", "边界处理", "指针"]


def task_difficulty(task: Task) -> str:
    if "二叉树" in task.title or "过拟合" in task.title or "正则化" in task.title:
        return "MEDIUM"
    if "阶段测验" in task.title or "综合" in task.title:
        return "MEDIUM"
    return "BASIC"


def task_type_from_assignment(assignment: TaskAssignment) -> str:
    if assignment.task and assignment.task.workspace_type == "QUESTION_SET":
        return assignment.assignment_mode if assignment.assignment_mode in {"QUIZ", "EXAM"} else "QUIZ"
    mode_map = {
        "PRACTICE": "CODING",
        "QUIZ": "QUIZ",
        "EXAM": "EXAM",
    }
    return mode_map.get(assignment.assignment_mode, "CODING")


def latest_task_summary(task: Task, progress: StudentTaskProgress | None) -> str:
    if progress is None or progress.status == "NOT_STARTED":
        return "尚未提交，建议先运行公开样例。"
    if progress.status == "COMPLETED":
        return "已完成，学习总结和画像已同步更新。"
    if task.course_id == "course_network_001":
        return "最近练习显示 Python 列表遍历和字典查找分支还需要继续巩固。"
    if task.course_id == "course_arch_001":
        return "最近测验显示过拟合、正则化和数据集划分概念还需要继续巩固。"
    if progress.highest_hint_level >= 2:
        return "最近一次修正已经通过部分用例，建议继续核查边界条件。"
    return "最近一次提交未通过头节点删除用例。"


def require_active_class(db: Session, user: User) -> tuple[AdministrativeClass, StudentClassMembership]:
    membership = db.scalar(
        select(StudentClassMembership).where(
            StudentClassMembership.student_id == user.id,
            StudentClassMembership.status == "ACTIVE",
        )
    )
    if membership is None:
        raise ApiError(404, "STUDENT_CLASS_NOT_FOUND", "当前学生尚未绑定行政班")
    administrative_class = db.get(AdministrativeClass, membership.class_id)
    if administrative_class is None:
        raise ApiError(404, "CLASS_NOT_FOUND", "行政班不存在")
    return administrative_class, membership


def resolve_student_course(
    db: Session,
    administrative_class: AdministrativeClass,
    course_id: str | None,
) -> Course:
    query = select(TeachingAssignment).where(
        TeachingAssignment.class_id == administrative_class.id,
        TeachingAssignment.status == "ACTIVE",
    )
    if course_id:
        query = query.where(TeachingAssignment.course_id == course_id)
    teaching = db.scalar(query.order_by(TeachingAssignment.course_id.asc()))
    if teaching is None:
        raise ApiError(404, "COURSE_NOT_IN_STUDENT_CLASS", "当前学生未加入这门课程")
    course = db.get(Course, teaching.course_id)
    if course is None:
        raise ApiError(404, "COURSE_NOT_FOUND", "课程不存在")
    return course


def sse_event(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


def ai_error_payload(exc: ApiError) -> dict:
    detail = exc.detail if isinstance(exc.detail, dict) else {}
    return {
        "code": detail.get("code", "AI_CHAT_FAILED"),
        "message": detail.get("message", "AI 助学导师暂时不可用，请稍后再试。"),
        "details": detail.get("details", {}),
    }


def safe_json_list(raw: str | None) -> list:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return value if isinstance(value, list) else []


def serialize_student_knowledge_graph(graph: StudentKnowledgeGraph, course: Course | None, teacher: User | None) -> dict:
    nodes = safe_json_list(graph.nodes_json)
    edges = safe_json_list(graph.edges_json)
    return {
        "id": graph.id,
        "teaching_assignment_id": graph.teaching_assignment_id,
        "course_id": graph.course_id,
        "course_name": course.name if course else "",
        "class_id": graph.class_id,
        "teacher_id": graph.teacher_id,
        "teacher_name": teacher.display_name if teacher else "",
        "title": graph.title,
        "description": graph.description,
        "status": graph.status,
        "target_classes": safe_json_list(graph.target_classes),
        "source_files": safe_json_list(graph.source_files),
        "source_summary": graph.source_summary,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes": nodes,
        "edges": edges,
        "created_at": iso(graph.created_at),
        "updated_at": iso(graph.updated_at),
        "published_at": iso(graph.published_at),
    }


def generated_resource_model_name(resource: dict) -> str:
    payload = resource.get("render_payload") if isinstance(resource, dict) else {}
    metadata = payload.get("metadata") if isinstance(payload, dict) else {}
    renderer = metadata.get("renderer") if isinstance(metadata, dict) else None
    if renderer == "presenton":
        return "LangGraph + Presenton"
    if renderer == "ppt_master":
        return "LangGraph + PPT Master"
    if renderer == "local_pptx":
        return "LangGraph + python-pptx"
    if resource.get("resource_type") == "PPT":
        return "LangGraph + PPT renderer"
    label = resource.get("resource_type_label") or resource.get("resource_type") or "资源"
    return f"LangGraph + {label}渲染器"


def generated_resource_safety_note(resource: dict) -> str:
    payload = resource.get("render_payload") if isinstance(resource, dict) else {}
    metadata = payload.get("metadata") if isinstance(payload, dict) else {}
    if isinstance(metadata, dict) and metadata.get("presenton_error"):
        return f"Presenton 暂未生成成功，已自动回退到本地 PPTX 渲染器。原因：{metadata.get('presenton_error')}"
    if isinstance(metadata, dict) and metadata.get("ppt_master_error"):
        return f"PPT Master 暂未生成成功，已自动回退到本地 PPTX 渲染器。原因：{metadata.get('ppt_master_error')}"
    if isinstance(metadata, dict) and metadata.get("renderer_config_error"):
        return f"PPT 渲染器配置暂不可用，已自动回退到本地 PPTX 渲染器。原因：{metadata.get('renderer_config_error')}"
    return "AI 生成资源已基于课程资料进行引用校验，建议结合课堂讲义复核关键概念。"


@router.get("/learning-context")
def learning_context(db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    assignments = db.scalars(
        select(TeachingAssignment)
        .where(
            TeachingAssignment.class_id == administrative_class.id,
            TeachingAssignment.status == "ACTIVE",
        )
        .order_by(TeachingAssignment.course_id.asc())
    ).all()

    courses = []
    for teaching in assignments:
        course = db.get(Course, teaching.course_id)
        teacher = db.get(User, teaching.teacher_id)
        task_count = db.scalar(
            select(func.count(TaskAssignment.id)).where(
                TaskAssignment.teaching_assignment_id == teaching.id,
                TaskAssignment.publish_status == "PUBLISHED",
            )
        )
        unfinished_count = db.scalar(
            select(func.count(StudentTaskProgress.id))
            .join(TaskAssignment, StudentTaskProgress.assignment_id == TaskAssignment.id)
            .where(
                TaskAssignment.teaching_assignment_id == teaching.id,
                StudentTaskProgress.student_id == user.id,
                StudentTaskProgress.status.in_(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "NEEDS_REVISION"]),
            )
        )
        courses.append(
            {
                "course_id": teaching.course_id,
                "course_name": course.name if course else "",
                "teacher_id": teaching.teacher_id,
                "teacher_name": teacher.display_name if teacher else "",
                "teaching_assignment_id": teaching.id,
                "task_count": task_count or 0,
                "unfinished_count": unfinished_count or 0,
            }
        )

    return ok(
        {
            "student": {
                "id": user.id,
                "name": user.display_name,
                "class_id": administrative_class.id,
                "class_name": administrative_class.name,
            },
            "courses": courses,
        }
    )


@router.post("/ai-chat")
async def student_ai_chat(
    payload: StudentAiChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    course = resolve_student_course(db, administrative_class, payload.course_id)
    session = ensure_ai_tutor_session(
        db,
        student_id=user.id,
        course_id=course.id,
        session_id=payload.session_id,
        first_message=payload.message.strip(),
    )
    history = ai_tutor_history_payload(db, session=session)
    user_message = append_ai_tutor_message(
        db,
        session=session,
        student_id=user.id,
        course_id=course.id,
        role="student",
        content=payload.message.strip(),
    )
    db.commit()
    result = await generate_student_ai_reply(
        db,
        user=user,
        class_id=administrative_class.id,
        course=course,
        message=payload.message.strip(),
        page_context=payload.page_context,
        history=history or [item.model_dump() for item in payload.history],
    )
    assistant_message = append_ai_tutor_message(
        db,
        session=session,
        student_id=user.id,
        course_id=course.id,
        role="assistant",
        content=result["answer"],
        metadata={
            "confidence": result["confidence"],
            "citations": result["citations"],
            "suggested_actions": result["suggested_actions"],
            "profile_used": result["profile_used"],
            "source_used": result["source_used"],
            "safety_note": result["safety_note"],
            "model_provider": result["model_provider"],
            "model_name": result["model_name"],
        },
        run_id=result["run_id"],
    )
    db.commit()
    result["session"] = serialize_ai_tutor_session(session)
    result["user_message_id"] = user_message.id
    result["assistant_message_id"] = assistant_message.id
    return ok(result)


@router.get("/ai-chat/sessions")
def student_ai_chat_sessions(
    course_id: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    sessions = list_ai_tutor_sessions(db, student_id=user.id, course_id=course_id, query=q)
    return ok([serialize_ai_tutor_session(session) for session in sessions])


@router.post("/ai-chat/sessions")
def student_ai_chat_create_session(
    payload: StudentAiChatSessionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    course = resolve_student_course(db, administrative_class, payload.course_id)
    session = ensure_ai_tutor_session(
        db,
        student_id=user.id,
        course_id=course.id,
        session_id=None,
        first_message=payload.first_message,
    )
    db.commit()
    return ok(serialize_ai_tutor_session(session))


@router.get("/ai-chat/sessions/{session_id}")
def student_ai_chat_session_detail(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    session = get_ai_tutor_session(db, student_id=user.id, session_id=session_id)
    messages = list_ai_tutor_messages(db, session=session)
    return ok(
        {
            "session": serialize_ai_tutor_session(session),
            "messages": [serialize_ai_tutor_message(message) for message in messages],
        }
    )


@router.delete("/ai-chat/sessions/{session_id}")
def student_ai_chat_delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    delete_ai_tutor_session(db, student_id=user.id, session_id=session_id)
    db.commit()
    return ok({"deleted": True, "session_id": session_id})


@router.post("/resources/ppt/generate")
async def student_generate_ppt_resource(
    payload: StudentPptGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    course = resolve_student_course(db, administrative_class, payload.course_id)
    session = ensure_ai_tutor_session(
        db,
        student_id=user.id,
        course_id=course.id,
        session_id=payload.session_id,
        first_message=payload.message.strip(),
    )
    user_message = append_ai_tutor_message(
        db,
        session=session,
        student_id=user.id,
        course_id=course.id,
        role="student",
        content=payload.message.strip(),
        metadata={"intent": "PPT_GENERATION", "resource_type": "PPT"},
    )
    resource = await generate_ppt_resource(
        db,
        user=user,
        class_id=administrative_class.id,
        course=course,
        message=payload.message.strip(),
        session_id=session.id,
    )
    assistant_message = append_ai_tutor_message(
        db,
        session=session,
        student_id=user.id,
        course_id=course.id,
        role="assistant",
        content=f"已生成资源：{resource['title']}",
        metadata={
            "intent": "PPT_GENERATION",
            "resource": resource,
            "confidence": resource["confidence"],
            "citations": resource["citations"],
            "suggested_actions": ["加入资源中心", "打开预览"],
            "profile_used": True,
            "source_used": bool(resource["citations"]),
            "safety_note": generated_resource_safety_note(resource),
            "model_provider": "WORKFLOW",
            "model_name": generated_resource_model_name(resource),
        },
        run_id=resource.get("run_id"),
    )
    db.commit()
    return ok(
        {
            "resource": resource,
            "session": serialize_ai_tutor_session(session),
            "user_message_id": user_message.id,
            "assistant_message_id": assistant_message.id,
        }
    )


@router.post("/resources/generate")
async def student_generate_resource(
    payload: StudentResourceGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    course = resolve_student_course(db, administrative_class, payload.course_id)
    resource_type = payload.resource_type.strip().upper()
    session = ensure_ai_tutor_session(
        db,
        student_id=user.id,
        course_id=course.id,
        session_id=payload.session_id,
        first_message=payload.message.strip(),
    )
    user_message = append_ai_tutor_message(
        db,
        session=session,
        student_id=user.id,
        course_id=course.id,
        role="student",
        content=payload.message.strip(),
        metadata={"intent": "RESOURCE_GENERATION", "resource_type": resource_type},
    )
    resource = await generate_learning_resource(
        db,
        user=user,
        class_id=administrative_class.id,
        course=course,
        message=payload.message.strip(),
        resource_type=resource_type,
        session_id=session.id,
    )
    if resource_type in {"PRACTICE_SET", "PODCAST_SCRIPT"}:
        db.flush()
        resource = save_generated_resource(db, user=user, class_id=administrative_class.id, resource_id=resource["id"])
    suggested_actions = ["加入资源中心", "打开预览"]
    if resource_type == "PRACTICE_SET":
        suggested_actions = ["前往资源中心做题", "打开预览"]
    elif resource_type == "PODCAST_SCRIPT":
        suggested_actions = ["前往资源中心播放", "生成配套练习"]
    assistant_message = append_ai_tutor_message(
        db,
        session=session,
        student_id=user.id,
        course_id=course.id,
        role="assistant",
        content=f"已生成资源：{resource['title']}",
        metadata={
            "intent": "RESOURCE_GENERATION",
            "resource": resource,
            "confidence": resource["confidence"],
            "citations": resource["citations"],
            "suggested_actions": suggested_actions,
            "profile_used": True,
            "source_used": bool(resource["citations"]),
            "safety_note": generated_resource_safety_note(resource),
            "model_provider": "WORKFLOW",
            "model_name": generated_resource_model_name(resource),
        },
        run_id=resource.get("run_id"),
    )
    db.commit()
    return ok(
        {
            "resource": resource,
            "session": serialize_ai_tutor_session(session),
            "user_message_id": user_message.id,
            "assistant_message_id": assistant_message.id,
        }
    )


@router.get("/resources/ppt/renderers")
def student_ppt_renderers(user: User = Depends(current_user)):
    require_role(user, "STUDENT")
    return ok(ppt_renderer_config_payload())


@router.post("/resources/{resource_id}/save")
def student_save_generated_resource(
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    resource = save_generated_resource(db, user=user, class_id=administrative_class.id, resource_id=resource_id)
    db.commit()
    return ok(resource)


@router.get("/resources/generated")
def student_generated_resources(
    course_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    resources = list_saved_generated_resources(db, student_id=user.id, course_id=course_id)
    return ok({"items": resources})


@router.get("/resources/{resource_id}")
def student_generated_resource_detail(
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    resource = get_generated_resource(db, student_id=user.id, resource_id=resource_id)
    if not resource.saved_to_resource_center:
        raise ApiError(409, "RESOURCE_NOT_SAVED", "请先将资源加入资源中心，再打开。")
    return ok(serialize_generated_resource(resource))


@router.get("/resources/{resource_id}/practice")
def student_generated_practice_workspace(
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    return ok(practice_workspace_payload(db, student_id=user.id, resource_id=resource_id))


@router.post("/resources/{resource_id}/practice/submit", status_code=status.HTTP_201_CREATED)
def student_submit_generated_practice(
    resource_id: str,
    payload: SaveQuestionAnswersRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    answers = [answer.model_dump() for answer in payload.answers]
    return ok(submit_generated_practice(db, user=user, class_id=administrative_class.id, resource_id=resource_id, answers=answers))


@router.post("/resources/{resource_id}/podcast/listened")
def student_mark_generated_podcast_listened(
    resource_id: str,
    payload: StudentPodcastListenedRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    return ok(
        record_generated_podcast_listened(
            db,
            user=user,
            class_id=administrative_class.id,
            resource_id=resource_id,
            completed_segment_count=payload.completed_segment_count,
        )
    )


@router.get("/resources/{resource_id}/download")
def student_download_generated_resource(
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    resource = get_generated_resource(db, student_id=user.id, resource_id=resource_id)
    if not resource.saved_to_resource_center:
        raise ApiError(409, "RESOURCE_NOT_SAVED", "请先将资源加入资源中心，再从资源中心导出。")
    if not resource.file_path:
        raise ApiError(404, "RESOURCE_FILE_NOT_READY", "资源文件暂不可导出。")
    filename = f"{resource.title}.{resource.file_format.lower()}"
    return FileResponse(
        resource.file_path,
        filename=filename,
        media_type=resource_media_type(resource),
    )


@router.get("/resources/{resource_id}/preview")
def student_preview_generated_resource(
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    resource = get_generated_resource(db, student_id=user.id, resource_id=resource_id)
    preview_path = resource_preview_path(resource) or ensure_resource_preview(resource)
    if not preview_path:
        raise ApiError(404, "RESOURCE_PREVIEW_NOT_READY", "资源预览暂未生成。")
    db.add(resource)
    db.commit()
    return FileResponse(
        preview_path,
        filename=f"{resource.title}.pdf",
        media_type="application/pdf",
    )


@router.post("/ai-chat/stream")
async def student_ai_chat_stream(
    payload: StudentAiChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    course = resolve_student_course(db, administrative_class, payload.course_id)
    session = ensure_ai_tutor_session(
        db,
        student_id=user.id,
        course_id=course.id,
        session_id=payload.session_id,
        first_message=payload.message.strip(),
    )
    history = ai_tutor_history_payload(db, session=session)
    user_message = append_ai_tutor_message(
        db,
        session=session,
        student_id=user.id,
        course_id=course.id,
        role="student",
        content=payload.message.strip(),
    )
    db.commit()
    session_payload = serialize_ai_tutor_session(session)
    user_message_payload = serialize_ai_tutor_message(user_message)
    student_id = user.id
    class_id = administrative_class.id
    course_id = course.id
    session_id = session.id
    message_text = payload.message.strip()

    async def stream():
        yield sse_event(
            "session",
            {
                "session": session_payload,
                "user_message": user_message_payload,
            },
        )
        yield sse_event("assistant_start", {"session_id": session_id})
        stream_db = SessionLocal()
        try:
            stream_session = get_ai_tutor_session(stream_db, student_id=student_id, session_id=session_id)
            stream_user = stream_db.get(User, student_id)
            stream_course = stream_db.get(Course, course_id)
            if stream_user is None or stream_course is None:
                raise ApiError(404, "AI_CHAT_CONTEXT_NOT_FOUND", "AI 助学上下文不存在。")
            result = None
            async for reply_event in stream_student_ai_reply(
                stream_db,
                user=stream_user,
                class_id=class_id,
                course=stream_course,
                message=message_text,
                page_context=payload.page_context,
                history=history or [item.model_dump() for item in payload.history],
            ):
                if reply_event["type"] == "delta":
                    yield sse_event("delta", {"content": reply_event["content"]})
                elif reply_event["type"] == "final":
                    result = reply_event["data"]
            if result is None:
                raise ApiError(502, "AI_MODEL_REQUEST_FAILED", "AI 模型请求失败，请稍后再试。")
            assistant_message = append_ai_tutor_message(
                stream_db,
                session=stream_session,
                student_id=student_id,
                course_id=course_id,
                role="assistant",
                content=result["answer"],
                metadata={
                    "confidence": result["confidence"],
                    "citations": result["citations"],
                    "suggested_actions": result["suggested_actions"],
                    "profile_used": result["profile_used"],
                    "source_used": result["source_used"],
                    "safety_note": result["safety_note"],
                    "model_provider": result["model_provider"],
                    "model_name": result["model_name"],
                },
                run_id=result["run_id"],
            )
            stream_db.commit()
            result["session"] = serialize_ai_tutor_session(stream_session)
            result["assistant_message_id"] = assistant_message.id
            yield sse_event("final", result)
        except ApiError as exc:
            stream_db.rollback()
            error = ai_error_payload(exc)
            try:
                stream_session = get_ai_tutor_session(stream_db, student_id=student_id, session_id=session_id)
                append_ai_tutor_message(
                    stream_db,
                    session=stream_session,
                    student_id=student_id,
                    course_id=course_id,
                    role="assistant",
                    content=error["message"],
                    status="FAILED",
                    metadata={"error": error},
                )
                stream_db.commit()
            except Exception:
                stream_db.rollback()
            yield sse_event("error", error)
        finally:
            stream_db.close()

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/tasks")
def list_student_tasks(
    course_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    query = (
        select(TaskAssignment, Task, TeachingAssignment, Course, User, StudentTaskProgress)
        .join(Task, TaskAssignment.task_id == Task.id)
        .join(TeachingAssignment, TaskAssignment.teaching_assignment_id == TeachingAssignment.id)
        .join(Course, TeachingAssignment.course_id == Course.id)
        .join(User, TeachingAssignment.teacher_id == User.id)
        .outerjoin(
            StudentTaskProgress,
            (StudentTaskProgress.assignment_id == TaskAssignment.id)
            & (StudentTaskProgress.student_id == user.id),
        )
        .where(
            TeachingAssignment.class_id == administrative_class.id,
            TeachingAssignment.status == "ACTIVE",
            TaskAssignment.publish_status == "PUBLISHED",
        )
        .order_by(TaskAssignment.deadline.asc().nulls_last(), TaskAssignment.id.asc())
    )
    if course_id:
        query = query.where(TeachingAssignment.course_id == course_id)

    data = []
    for assignment, task, teaching, course, teacher, progress in db.execute(query).all():
        data.append(
            {
                "assignment_id": assignment.id,
                "task_id": task.id,
                "course_id": course.id,
                "course_name": course.name,
                "class_id": administrative_class.id,
                "class_name": administrative_class.name,
                "teacher_id": teacher.id,
                "teacher_name": teacher.display_name,
                "title": task.title,
                "task_type": task_type_from_assignment(assignment),
                "workspace_type": task.workspace_type,
                "assignment_mode": assignment.assignment_mode,
                "description": task.description,
                "published_at": iso(assignment.published_at),
                "deadline": iso(assignment.deadline),
                "difficulty": task_difficulty(task),
                "knowledge_points": task_knowledge_points(task),
                "status": progress.status if progress else "NOT_STARTED",
                "passed_count": progress.passed_count if progress else 0,
                "total_required_count": progress.total_required_count if progress else len(task.test_cases),
                "highest_hint_level": progress.highest_hint_level if progress else 0,
                "latest_summary": latest_task_summary(task, progress),
            }
        )
    return ok(data)


@router.get("/courses/{course_id}/knowledge-graph")
def get_course_knowledge_graph(
    course_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    teaching = db.scalar(
        select(TeachingAssignment).where(
            TeachingAssignment.class_id == administrative_class.id,
            TeachingAssignment.course_id == course_id,
            TeachingAssignment.status == "ACTIVE",
        )
    )
    if teaching is None:
        raise ApiError(404, "COURSE_NOT_IN_STUDENT_CLASS", "当前学生未加入这门课程")

    graph = db.scalar(
        select(StudentKnowledgeGraph)
        .where(
            StudentKnowledgeGraph.teaching_assignment_id == teaching.id,
            StudentKnowledgeGraph.class_id == administrative_class.id,
            StudentKnowledgeGraph.course_id == course_id,
            StudentKnowledgeGraph.status == "published",
        )
        .order_by(StudentKnowledgeGraph.updated_at.desc())
    )
    if graph is None:
        raise ApiError(404, "KNOWLEDGE_GRAPH_NOT_FOUND", "当前课程暂无已发布知识图谱")

    return ok(serialize_student_knowledge_graph(graph, db.get(Course, course_id), db.get(User, graph.teacher_id)))


@router.get("/assignments/{assignment_id}/workspace")
def get_assignment_workspace(
    assignment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    return ok(question_workspace_payload(db, assignment_id, administrative_class.id, user))


@router.post("/assignments/{assignment_id}/answers")
def save_assignment_answers(
    assignment_id: str,
    payload: SaveQuestionAnswersRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    answers = [answer.model_dump() for answer in payload.answers]
    return ok(save_question_draft(db, assignment_id, administrative_class.id, user, answers))


@router.post("/assignments/{assignment_id}/submit-answers", status_code=status.HTTP_201_CREATED)
def submit_assignment_answers(
    assignment_id: str,
    payload: SaveQuestionAnswersRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    answers = [answer.model_dump() for answer in payload.answers]
    return ok(submit_question_answers(db, assignment_id, administrative_class.id, user, answers))


@router.get("/profile")
def learner_profile(
    course_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    # 序列化逻辑放在 services/learner_profile.py，教师端个体诊断读同一个函数，
    # 保证两端口径一致（开发方案 §10.2）。
    payload = serialize_learner_profile(
        db,
        student_id=user.id,
        course_id=course_id,
        class_id=administrative_class.id,
    )
    if payload is None:
        raise ApiError(404, "LEARNER_PROFILE_NOT_FOUND", "当前课程暂无足够画像数据")
    return ok(payload)
