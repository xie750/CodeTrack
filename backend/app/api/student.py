import json
from datetime import date, datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import SessionLocal, get_db
from backend.app.core.security import current_user, require_role
from backend.app.services.cache import invalidate_prefix, remember_json, stable_cache_key
from backend.app.models import (
    AdministrativeClass,
    Course,
    LearnerEvent,
    StudentClassMembership,
    StudentDailyTask,
    StudentKnowledgeGraph,
    StudentTaskProgress,
    Task,
    TaskAssignment,
    TeacherFeedback,
    TeachingAssignment,
    User,
)
from backend.app.services.learner_profile import serialize_learner_profile
from backend.app.services.submissions import iso
from backend.app.services.assignment_schedule import assignment_schedule_status, assignment_start_at
from backend.app.services.ai_tutor import (
    ai_tutor_history_payload,
    append_ai_tutor_message,
    delete_ai_tutor_session,
    ensure_ai_tutor_session,
    generate_student_ai_reply,
    get_ai_tutor_session,
    list_ai_tutor_model_options,
    list_ai_tutor_messages,
    list_ai_tutor_sessions,
    normalize_ai_tutor_model_key,
    serialize_ai_tutor_message,
    serialize_ai_tutor_session,
    stream_student_ai_reply,
)
from backend.app.services.question_workflow import (
    question_workspace_payload,
    save_question_draft,
    submit_question_answers,
)
from backend.app.services.practice_projects import (
    analyze_practice_project_fit,
    create_practice_material,
    create_practice_material_file,
    create_practice_submission,
    get_practice_material_file,
    get_practice_project_detail,
    list_practice_projects,
    refresh_frontier_tracking,
    start_first_practice_project,
)
from backend.app.services.student_resources import (
    create_student_resource_folder,
    ensure_resource_preview,
    generate_learning_resource,
    generate_ppt_resource,
    get_generated_resource,
    practice_workspace_payload,
    list_student_resource_folders,
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

STUDENT_RESOURCE_CACHE_TTL_SECONDS = 30


def _student_resource_cache_prefix(student_id: str) -> str:
    return f"codetrack:student-resources:{student_id}:"


def _invalidate_student_resource_cache(student_id: str) -> None:
    invalidate_prefix(_student_resource_cache_prefix(student_id))


class QuestionAnswerPayload(BaseModel):
    question_id: str
    selected_option_ids: list[str]


class SaveQuestionAnswersRequest(BaseModel):
    answers: list[QuestionAnswerPayload]


class AiChatHistoryItem(BaseModel):
    role: str
    content: str


class StudentAiChatRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    message: str = Field(min_length=1, max_length=2000)
    course_id: str | None = None
    session_id: str | None = None
    model_key: str | None = Field(default=None, max_length=40)
    page_context: dict[str, Any] = Field(default_factory=dict)
    history: list[AiChatHistoryItem] = Field(default_factory=list, max_length=12)


class StudentAiChatSessionRequest(BaseModel):
    course_id: str | None = None
    first_message: str = Field(default="新的 AI 助学会话", max_length=2000)


class StudentKnowledgeNodeDiagnosisRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    course_id: str | None = None
    model_key: str | None = Field(default=None, max_length=40)
    is_self_study: bool = False
    graph: dict[str, Any] = Field(default_factory=dict)
    node: dict[str, Any] = Field(default_factory=dict)
    related_edges: list[dict[str, Any]] = Field(default_factory=list, max_length=120)
    page_context: dict[str, Any] = Field(default_factory=dict)


class StudentPptGenerateRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    course_id: str | None = None
    session_id: str | None = None


class StudentResourceGenerateRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    resource_type: str = Field(min_length=1, max_length=40)
    course_id: str | None = None
    session_id: str | None = None


class StudentResourceFolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class StudentPodcastListenedRequest(BaseModel):
    completed_segment_count: int | None = Field(default=None, ge=0, le=50)


class PracticeProjectSubmissionRequest(BaseModel):
    title: str = Field(default="", max_length=180)
    description: str = Field(default="", max_length=2000)
    materials: list[str] = Field(default_factory=list, max_length=12)
    material_ids: list[str] = Field(default_factory=list, max_length=12)
    note: str = Field(default="", max_length=1200)


class PracticeProjectFrontierRequest(BaseModel):
    focus: str = Field(default="", max_length=120)


class PracticeProjectMaterialRequest(BaseModel):
    material_type: str = Field(default="NOTE", max_length=40)
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=1000)
    content: str = Field(default="", max_length=6000)
    file_name: str | None = Field(default=None, max_length=255)
    file_size: int | None = Field(default=None, ge=0, le=50_000_000)
    mime_type: str | None = Field(default=None, max_length=120)
    external_url: str = Field(default="", max_length=500)


class InterventionReplyRequest(BaseModel):
    content: str = Field(min_length=1, max_length=1200)


class StudentDailyTaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    task_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class StudentDailyTaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    completed: bool | None = None


def today_date_key() -> str:
    return date.today().isoformat()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def serialize_daily_task(task: StudentDailyTask) -> dict:
    return {
        "id": task.id,
        "task_date": task.task_date,
        "title": task.title,
        "completed": task.completed,
        "sort_order": task.sort_order,
        "created_at": iso(task.created_at),
        "updated_at": iso(task.updated_at),
    }


def task_knowledge_points(task: Task) -> list[str]:
    try:
        objectives = json.loads(task.learning_objectives or "[]")
    except (TypeError, ValueError):
        objectives = []
    if isinstance(objectives, list):
        points = [str(item).strip() for item in objectives if str(item).strip()]
        if points:
            return points
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


def _compact_text(value: Any, limit: int = 260) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return f"{text[:limit]}..."


def _bounded_ratio(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(0.0, min(1.0, number))


def _bounded_percent(value: Any, default: int = 0) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        number = default
    return max(0, min(100, number))


def _graph_node_label(graph_context: dict[str, Any], node_id: str | None) -> str:
    nodes = graph_context.get("nodes")
    if not node_id or not isinstance(nodes, list):
        return str(node_id or "")
    for node in nodes:
        if isinstance(node, dict) and str(node.get("id", "")) == node_id:
            return str(node.get("label") or node_id)
    return node_id


def _knowledge_state_for_node(profile: dict[str, Any] | None, node_label: str) -> dict[str, Any] | None:
    if not profile:
        return None
    states = profile.get("knowledge_states")
    if not isinstance(states, list):
        return None
    normalized_label = node_label.strip()
    for item in states:
        if isinstance(item, dict) and str(item.get("knowledge_point", "")).strip() == normalized_label:
            return item
    return None


def _mastery_label_from_score(score: int, has_profile: bool) -> str:
    if not has_profile:
        return "暂无真实证据"
    if score >= 85:
        return "掌握稳定"
    if score >= 70:
        return "基本掌握"
    if score >= 45:
        return "需要巩固"
    return "薄弱待补"


def _safe_string_list(value: Any, limit: int = 5) -> list[str]:
    if not isinstance(value, list):
        return []
    items = [_compact_text(item, 180) for item in value]
    return [item for item in items if item][:limit]


def _parse_diagnosis_answer(answer: str) -> dict[str, Any]:
    text = answer.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return {"summary": answer}
    return value if isinstance(value, dict) else {"summary": answer}


def _node_diagnosis_prompt(
    *,
    node: dict[str, Any],
    graph: dict[str, Any],
    related_edges: list[dict[str, Any]],
    profile: dict[str, Any] | None,
    is_self_study: bool,
) -> str:
    node_id = str(node.get("id", ""))
    prereq_nodes = [
        _graph_node_label(graph, str(edge.get("source", "")))
        for edge in related_edges
        if str(edge.get("target", "")) == node_id and str(edge.get("type", "")) == "前驱"
    ][:6]
    successor_nodes = [
        _graph_node_label(graph, str(edge.get("target", "")))
        for edge in related_edges
        if str(edge.get("source", "")) == node_id and str(edge.get("type", "")) == "后继"
    ][:6]
    related_nodes = [
        _graph_node_label(graph, str(edge.get("target") if str(edge.get("source", "")) == node_id else edge.get("source", "")))
        for edge in related_edges
        if str(edge.get("type", "")) == "相关"
    ][:6]
    context = {
        "page": "自学知识图谱" if is_self_study else "课程知识图谱",
        "node": {
            "id": node_id,
            "label": _compact_text(node.get("label"), 120),
            "type": _compact_text(node.get("type"), 40),
            "description": _compact_text(node.get("description"), 500),
            "difficulty": node.get("difficulty"),
            "source": node.get("source"),
        },
        "graph": {
            "title": _compact_text(graph.get("title"), 120),
            "course_name": _compact_text(graph.get("course_name"), 80),
            "source_summary": _compact_text(graph.get("source_summary"), 360),
            "node_count": graph.get("node_count"),
            "edge_count": graph.get("edge_count"),
            "source_file_count": len(graph.get("source_files") or []) if isinstance(graph.get("source_files"), list) else 0,
            "prerequisites": prereq_nodes,
            "successors": successor_nodes,
            "related_nodes": related_nodes,
        },
        "learner_profile": profile,
    }
    return (
        "请为学生当前知识图谱节点生成一次真实 AI 诊断。请只基于给定上下文、学习画像和可引用资料判断；"
        "如果缺少证据，必须明确说明证据不足，不能编造学习记录、引用或掌握度。\n\n"
        "请把 answer 字段写成一个 JSON 对象字符串，不要 Markdown，不要代码块。JSON 对象字段："
        "summary(string, 80-180字), evidence(string[]), risk_factors(string[]), misconceptions(string[]), "
        "prerequisites(string[]), next_actions(string[]), recommended_practice(string), mastery_label(string)。"
        "其中 evidence 要说明使用了哪些真实画像、图谱关系或课程资料；next_actions 给 2-4 个可执行动作。\n\n"
        f"节点诊断上下文：{json.dumps(context, ensure_ascii=False)}"
    )


def _fallback_node_diagnosis_response(
    *,
    payload: StudentKnowledgeNodeDiagnosisRequest,
    node_label: str,
    mastery_score: int,
    knowledge_state: dict[str, Any] | None,
    error_code: str = "AI_MODEL_UNAVAILABLE",
) -> dict[str, Any]:
    node_id = str(payload.node.get("id", ""))
    prereq_nodes = [
        _graph_node_label(payload.graph, str(edge.get("source", "")))
        for edge in payload.related_edges
        if str(edge.get("target", "")) == node_id and str(edge.get("type", "")) == "前驱"
    ][:4]
    successor_nodes = [
        _graph_node_label(payload.graph, str(edge.get("target", "")))
        for edge in payload.related_edges
        if str(edge.get("source", "")) == node_id and str(edge.get("type", "")) == "后继"
    ][:4]
    has_profile = knowledge_state is not None
    mastery_label = _mastery_label_from_score(mastery_score, has_profile)
    graph_title = _compact_text(payload.graph.get("title"), 80) or ("自学知识图谱" if payload.is_self_study else "课程知识图谱")
    relation_hint = "、".join(prereq_nodes or successor_nodes[:2])
    summary_parts = [
        f"当前节点「{node_label}」已根据{graph_title}结构和学习画像做本地兜底诊断。",
        f"掌握状态为「{mastery_label}」。" if has_profile else "当前没有匹配到该节点的真实画像证据，建议先通过练习补齐可验证记录。",
    ]
    if relation_hint:
        summary_parts.append(f"学习时优先结合相邻节点「{relation_hint}」一起复盘。")
    else:
        summary_parts.append("当前节点关系较少，建议先补充前驱、后继或相关概念，提升图谱可诊断性。")

    evidence = [
        "模型服务暂时不可用，本次使用规则兜底诊断，未编造真实 AI 结论。",
        f"图谱中与该节点直接相连的关系共 {len(payload.related_edges)} 条。",
    ]
    if has_profile:
        evidence.append(f"学习画像中匹配到「{node_label}」掌握度 {mastery_score}%。")
    else:
        evidence.append("学习画像中暂未匹配到该节点的掌握度记录。")

    risk_factors = []
    if not has_profile:
        risk_factors.append("缺少真实作答或资料使用证据，掌握度判断可信度较低。")
    if mastery_score < 70:
        risk_factors.append("该节点建议先做基础诊断题，再进入迁移应用。")
    if not prereq_nodes:
        risk_factors.append("前驱节点不清晰，容易跳过必要基础。")

    misconceptions = [
        f"只记住「{node_label}」的表面定义，没有说明适用条件或边界。",
        "把相邻概念当作同义词，忽略它们在任务中的分工。",
    ]
    next_actions = [
        f"先复盘「{node_label}」的核心定义和一个典型例子。",
        "补充 2 道基础自测题，形成可验证学习证据。",
    ]
    if prereq_nodes:
        next_actions.insert(1, f"回看前驱节点：{', '.join(prereq_nodes[:2])}。")
    if successor_nodes:
        next_actions.append(f"完成后再连接后继节点：{', '.join(successor_nodes[:2])}。")

    return {
        "status": "ready",
        "source": "RULE_FALLBACK",
        "ai_generated": False,
        "node_id": node_id,
        "mastery_score": mastery_score,
        "mastery_label": mastery_label,
        "confidence": 0.36 if has_profile else 0.24,
        "summary": " ".join(summary_parts),
        "evidence": evidence[:8],
        "risk_factors": risk_factors[:5],
        "misconceptions": misconceptions[:5],
        "prerequisites": prereq_nodes,
        "next_actions": next_actions[:4],
        "recommended_practice": f"围绕「{node_label}」生成一组 3-5 道诊断题，覆盖定义理解、相邻概念区分和一个应用场景。",
        "profile_used": has_profile,
        "source_used": bool(payload.related_edges),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_provider": "RULE_FALLBACK",
        "model_name": "knowledge-graph-local-diagnosis",
        "model_key": payload.model_key,
        "model_label": "本地兜底诊断",
        "run_id": None,
        "citations": [],
        "fallback_reason": error_code,
    }


def _safe_payload(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _intervention_action_label(action: str) -> str:
    labels = {
        "class_practice": "去完成练习",
        "class_reminder": "查看跟进要求",
        "student_feedback": "查看教师反馈",
        "risk_reminder": "查看跟进要求",
        "discussion": "提交讨论回应",
    }
    return labels.get(action, "查看详情")


def _intervention_tone(action: str) -> str:
    tones = {
        "class_practice": "practice",
        "class_reminder": "reminder",
        "student_feedback": "feedback",
        "risk_reminder": "risk",
        "discussion": "discussion",
    }
    return tones.get(action, "reminder")


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


@router.get("/interventions")
def list_student_interventions(
    course_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    teaching_query = select(TeachingAssignment).where(
        TeachingAssignment.class_id == administrative_class.id,
        TeachingAssignment.status == "ACTIVE",
    )
    if course_id:
        teaching_query = teaching_query.where(TeachingAssignment.course_id == course_id)
    teachings = list(db.scalars(teaching_query).all())
    teaching_ids = [item.id for item in teachings]
    course_ids = [item.course_id for item in teachings]
    if not teachings:
        return ok({"summary": {"total": 0, "unread": 0, "practice_count": 0, "response_count": 0}, "items": []})

    courses = {row.id: row for row in db.scalars(select(Course).where(Course.id.in_(course_ids))).all()}
    teachers = {
        row.id: row
        for row in db.scalars(select(User).where(User.id.in_({item.teacher_id for item in teachings}))).all()
    }
    teaching_by_id = {item.id: item for item in teachings}

    events = list(
        db.scalars(
            select(LearnerEvent)
            .where(
                LearnerEvent.student_id == user.id,
                LearnerEvent.class_id == administrative_class.id,
                LearnerEvent.teaching_assignment_id.in_(teaching_ids),
                LearnerEvent.event_type.in_(
                    [
                        "teacher_intervention_practice",
                        "teacher_intervention_reminder",
                        "teacher_intervention_feedback",
                        "teacher_intervention_risk",
                        "teacher_intervention_discussion",
                    ]
                ),
            )
            .order_by(LearnerEvent.created_at.desc())
        ).all()
    )

    assignment_ids = [item.assignment_id for item in events if item.assignment_id]
    task_ids = [item.task_id for item in events if item.task_id]
    feedback_ids = [(_safe_payload(item.payload).get("feedback_id")) for item in events]
    progress_by_assignment = {
        row.assignment_id: row
        for row in db.scalars(
            select(StudentTaskProgress).where(
                StudentTaskProgress.student_id == user.id,
                StudentTaskProgress.assignment_id.in_(assignment_ids),
            )
        ).all()
    } if assignment_ids else {}
    assignments = {
        row.id: row
        for row in db.scalars(select(TaskAssignment).where(TaskAssignment.id.in_(assignment_ids))).all()
    } if assignment_ids else {}
    tasks = {row.id: row for row in db.scalars(select(Task).where(Task.id.in_(task_ids))).all()} if task_ids else {}
    feedback = {
        row.id: row
        for row in db.scalars(
            select(TeacherFeedback).where(
                TeacherFeedback.id.in_([item for item in feedback_ids if item]),
                TeacherFeedback.student_visible.is_(True),
                TeacherFeedback.status == "PUBLISHED",
            )
        ).all()
    } if any(feedback_ids) else {}
    responses = list(
        db.scalars(
            select(LearnerEvent).where(
                LearnerEvent.student_id == user.id,
                LearnerEvent.class_id == administrative_class.id,
                LearnerEvent.event_type == "teacher_intervention_response",
            )
        ).all()
    )
    responded_parent_ids = {
        _safe_payload(item.payload).get("parent_event_id")
        for item in responses
        if _safe_payload(item.payload).get("parent_event_id")
    }

    items = []
    for event in events:
        payload = _safe_payload(event.payload)
        action = payload.get("action") or event.event_type.replace("teacher_intervention_", "")
        teaching = teaching_by_id.get(event.teaching_assignment_id or "")
        course = courses.get(event.course_id)
        teacher = teachers.get(teaching.teacher_id) if teaching else None
        progress = progress_by_assignment.get(event.assignment_id or "")
        task = tasks.get(event.task_id or "")
        assignment = assignments.get(event.assignment_id or "")
        feedback_item = feedback.get(payload.get("feedback_id"))
        items.append(
            {
                "id": event.id,
                "type": action,
                "tone": _intervention_tone(action),
                "title": payload.get("title") or (task.title if task else "教师学习跟进"),
                "content": feedback_item.content if feedback_item else payload.get("content", ""),
                "course_id": event.course_id,
                "course_name": course.name if course else "",
                "class_id": event.class_id,
                "class_name": administrative_class.name,
                "teacher_id": teacher.id if teacher else payload.get("teacher_id"),
                "teacher_name": teacher.display_name if teacher else "",
                "knowledge_point": payload.get("knowledge_point"),
                "task_id": event.task_id,
                "assignment_id": event.assignment_id,
                "feedback_id": payload.get("feedback_id"),
                "discussion_id": payload.get("discussion_id"),
                "task_status": progress.status if progress else None,
                "start_at": iso(assignment_start_at(assignment)) if assignment else None,
                "deadline": iso(assignment.deadline) if assignment else None,
                "action_label": _intervention_action_label(action),
                "responded": event.id in responded_parent_ids,
                "created_at": iso(event.created_at),
            }
        )

    return ok(
        {
            "summary": {
                "total": len(items),
                "unread": len([item for item in items if not item["responded"]]),
                "practice_count": len([item for item in items if item["type"] == "class_practice"]),
                "response_count": len(responded_parent_ids),
            },
            "items": items,
        }
    )


@router.post("/interventions/{event_id}/reply", status_code=status.HTTP_201_CREATED)
def reply_student_intervention(
    event_id: str,
    payload: InterventionReplyRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    event = db.get(LearnerEvent, event_id)
    if (
        event is None
        or event.student_id != user.id
        or event.class_id != administrative_class.id
        or not event.event_type.startswith("teacher_intervention_")
    ):
        raise ApiError(404, "INTERVENTION_NOT_FOUND", "教师跟进事项不存在")
    original = _safe_payload(event.payload)
    response = LearnerEvent(
        id=f"evt_intervention_reply_{event_id[-8:]}",
        student_id=user.id,
        course_id=event.course_id,
        class_id=event.class_id,
        teaching_assignment_id=event.teaching_assignment_id,
        assignment_id=event.assignment_id,
        task_id=event.task_id,
        event_type="teacher_intervention_response",
        knowledge_points=event.knowledge_points,
        error_type=None,
        payload=json.dumps(
            {
                "parent_event_id": event.id,
                "parent_action": original.get("action"),
                "content": payload.content.strip(),
            },
            ensure_ascii=False,
        ),
    )
    db.merge(response)
    db.commit()
    return ok({"event_id": event.id, "responded": True, "content": payload.content.strip()})


@router.get("/daily-tasks")
def list_student_daily_tasks(
    task_date: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    require_active_class(db, user)
    day_key = task_date or today_date_key()
    tasks = list(
        db.scalars(
            select(StudentDailyTask)
            .where(
                StudentDailyTask.student_id == user.id,
                StudentDailyTask.task_date == day_key,
            )
            .order_by(StudentDailyTask.sort_order.asc(), StudentDailyTask.created_at.asc())
        ).all()
    )
    completed_count = sum(1 for task in tasks if task.completed)
    return ok(
        {
            "task_date": day_key,
            "summary": {
                "total": len(tasks),
                "completed": completed_count,
                "pending": len(tasks) - completed_count,
            },
            "items": [serialize_daily_task(task) for task in tasks],
        }
    )


@router.post("/daily-tasks", status_code=status.HTTP_201_CREATED)
def create_student_daily_task(
    payload: StudentDailyTaskCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    require_active_class(db, user)
    title = payload.title.strip()
    if not title:
        raise ApiError(422, "DAILY_TASK_TITLE_EMPTY", "今日任务名称不能为空")
    day_key = payload.task_date or today_date_key()
    max_order = db.scalar(
        select(func.max(StudentDailyTask.sort_order)).where(
            StudentDailyTask.student_id == user.id,
            StudentDailyTask.task_date == day_key,
        )
    )
    task = StudentDailyTask(
        id=f"daily_{uuid4().hex[:12]}",
        student_id=user.id,
        task_date=day_key,
        title=title,
        completed=False,
        sort_order=(max_order or 0) + 1,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return ok(serialize_daily_task(task))


@router.patch("/daily-tasks/{daily_task_id}")
def update_student_daily_task(
    daily_task_id: str,
    payload: StudentDailyTaskUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    require_active_class(db, user)
    task = db.get(StudentDailyTask, daily_task_id)
    if task is None or task.student_id != user.id:
        raise ApiError(404, "DAILY_TASK_NOT_FOUND", "今日任务不存在")
    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise ApiError(422, "DAILY_TASK_TITLE_EMPTY", "今日任务名称不能为空")
        task.title = title
    if payload.completed is not None:
        task.completed = payload.completed
    task.updated_at = now_utc()
    db.add(task)
    db.commit()
    db.refresh(task)
    return ok(serialize_daily_task(task))


@router.delete("/daily-tasks/{daily_task_id}")
def delete_student_daily_task(
    daily_task_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    require_active_class(db, user)
    task = db.get(StudentDailyTask, daily_task_id)
    if task is None or task.student_id != user.id:
        raise ApiError(404, "DAILY_TASK_NOT_FOUND", "今日任务不存在")
    db.delete(task)
    db.commit()
    return ok({"deleted": True, "id": daily_task_id})


@router.get("/practice-projects")
def student_practice_projects(db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    return ok(list_practice_projects(db, student_id=user.id, class_id=administrative_class.id))


@router.post("/practice-projects/auto-analysis")
def student_analyze_practice_project_fit(db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    result = analyze_practice_project_fit(db, student=user, class_id=administrative_class.id)
    db.commit()
    return ok(result)


@router.get("/practice-projects/{project_id}")
def student_practice_project_detail(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    return ok(get_practice_project_detail(db, project_id=project_id, student_id=user.id, class_id=administrative_class.id))


@router.post("/practice-projects/start-first", status_code=status.HTTP_201_CREATED)
def student_start_first_practice_project(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    result = start_first_practice_project(db, student=user, class_id=administrative_class.id)
    db.commit()
    return ok(result)


@router.post("/practice-projects/{project_id}/frontier-track")
def student_refresh_practice_frontier(
    project_id: str,
    payload: PracticeProjectFrontierRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    result = refresh_frontier_tracking(
        db,
        project_id=project_id,
        student=user,
        class_id=administrative_class.id,
        focus=payload.focus,
    )
    db.commit()
    return ok(result)


@router.post("/practice-projects/{project_id}/materials", status_code=status.HTTP_201_CREATED)
def student_create_practice_project_material(
    project_id: str,
    payload: PracticeProjectMaterialRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    result = create_practice_material(
        db,
        project_id=project_id,
        student=user,
        class_id=administrative_class.id,
        material_type=payload.material_type,
        title=payload.title,
        description=payload.description,
        content=payload.content,
        file_name=payload.file_name,
        file_size=payload.file_size,
        mime_type=payload.mime_type,
        external_url=payload.external_url,
    )
    db.commit()
    return ok(result)


@router.post("/practice-projects/{project_id}/materials/upload", status_code=status.HTTP_201_CREATED)
def student_upload_practice_project_material(
    project_id: str,
    title: str = Form(default=""),
    description: str = Form(default=""),
    material_type: str = Form(default="CODE_FILE"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    payload = file.file.read()
    result = create_practice_material_file(
        db,
        project_id=project_id,
        student=user,
        class_id=administrative_class.id,
        material_type=material_type,
        title=title,
        description=description,
        content=payload,
        file_name=file.filename,
        mime_type=file.content_type,
    )
    db.commit()
    return ok(result)


@router.get("/practice-projects/{project_id}/materials/{material_id}/download")
def student_download_practice_project_material(
    project_id: str,
    material_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    require_active_class(db, user)
    material = get_practice_material_file(db, project_id=project_id, student_id=user.id, material_id=material_id)
    return FileResponse(
        material.storage_path,
        media_type=material.mime_type or "application/octet-stream",
        filename=material.file_name or material.title,
    )


@router.post("/practice-projects/{project_id}/submissions", status_code=status.HTTP_201_CREATED)
def student_create_practice_project_submission(
    project_id: str,
    payload: PracticeProjectSubmissionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    result = create_practice_submission(
        db,
        project_id=project_id,
        student=user,
        class_id=administrative_class.id,
        title=payload.title,
        description=payload.description,
        materials=payload.materials,
        material_ids=payload.material_ids,
        note=payload.note,
    )
    db.commit()
    return ok(result)


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
        model_key=payload.model_key,
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
            "model_key": result.get("model_key"),
            "model_label": result.get("model_label"),
            "fallback_from_model_key": result.get("fallback_from_model_key"),
            "fallback_from_model_label": result.get("fallback_from_model_label"),
            "model_fallback_reason": result.get("model_fallback_reason"),
        },
        run_id=result["run_id"],
    )
    db.commit()
    result["session"] = serialize_ai_tutor_session(session)
    result["user_message_id"] = user_message.id
    result["assistant_message_id"] = assistant_message.id
    return ok(result)


@router.get("/ai-chat/models")
def student_ai_chat_models(user: User = Depends(current_user)):
    require_role(user, "STUDENT")
    return ok({"items": list_ai_tutor_model_options()})


@router.post("/knowledge-graphs/node-diagnosis")
async def student_knowledge_graph_node_diagnosis(
    payload: StudentKnowledgeNodeDiagnosisRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    node_label = _compact_text(payload.node.get("label"), 120)
    if not node_label:
        raise ApiError(400, "KNOWLEDGE_NODE_REQUIRED", "请选择需要诊断的知识节点")

    model_key = normalize_ai_tutor_model_key(payload.model_key)
    model_options = list_ai_tutor_model_options()
    selected_model = next((item for item in model_options if item["key"] == model_key), None)

    administrative_class, _ = require_active_class(db, user)
    course = resolve_student_course(db, administrative_class, payload.course_id)
    profile = serialize_learner_profile(db, student_id=user.id, course_id=course.id, class_id=administrative_class.id)
    knowledge_state = _knowledge_state_for_node(profile, node_label)
    mastery_score = _bounded_percent(knowledge_state.get("mastery_score") if knowledge_state else None)
    if not selected_model or not selected_model.get("configured"):
        return ok(_fallback_node_diagnosis_response(
            payload=payload,
            node_label=node_label,
            mastery_score=mastery_score,
            knowledge_state=knowledge_state,
            error_code="AI_MODEL_NOT_CONFIGURED",
        ))
    prompt = _node_diagnosis_prompt(
        node=payload.node,
        graph=payload.graph,
        related_edges=payload.related_edges,
        profile=profile,
        is_self_study=payload.is_self_study,
    )
    try:
        result = await generate_student_ai_reply(
            db,
            user=user,
            class_id=administrative_class.id,
            course=course,
            message=prompt,
            model_key=model_key,
            page_context={
                **payload.page_context,
                "feature": "knowledge_graph_node_diagnosis",
                "node_id": payload.node.get("id"),
                "node_label": node_label,
                "scope": "self_study" if payload.is_self_study else "course",
            },
            history=[],
        )
    except ApiError as exc:
        error_code = str(exc.detail.get("code", "")) if isinstance(exc.detail, dict) else ""
        if error_code not in {"AI_MODEL_NOT_CONFIGURED", "AI_MODEL_REQUEST_FAILED"}:
            raise
        return ok(_fallback_node_diagnosis_response(
            payload=payload,
            node_label=node_label,
            mastery_score=mastery_score,
            knowledge_state=knowledge_state,
            error_code=error_code,
        ))
    structured = _parse_diagnosis_answer(str(result.get("answer", "")))
    summary = _compact_text(structured.get("summary") or result.get("answer"), 800)
    evidence = _safe_string_list(structured.get("evidence"), 6)
    if not evidence:
        evidence = [
            "AI 模型已返回诊断正文，但未拆分独立判断依据；请以诊断摘要和引用资料为准。",
        ]
    citations = result.get("citations", [])
    if citations:
        evidence.extend(
            f"引用资料：{_compact_text(citation.get('title'), 80)}"
            for citation in citations[:3]
            if isinstance(citation, dict)
        )

    return ok({
        "status": "ready",
        "source": "AI_MODEL",
        "ai_generated": True,
        "node_id": str(payload.node.get("id", "")),
        "mastery_score": mastery_score,
        "mastery_label": _compact_text(structured.get("mastery_label"), 40)
        or _mastery_label_from_score(mastery_score, knowledge_state is not None),
        "confidence": _bounded_ratio(result.get("confidence"), 0.0),
        "summary": summary,
        "evidence": evidence[:8],
        "risk_factors": _safe_string_list(structured.get("risk_factors"), 5),
        "misconceptions": _safe_string_list(structured.get("misconceptions"), 5),
        "prerequisites": _safe_string_list(structured.get("prerequisites"), 5),
        "next_actions": _safe_string_list(structured.get("next_actions") or result.get("suggested_actions"), 4),
        "recommended_practice": _compact_text(structured.get("recommended_practice"), 220),
        "profile_used": bool(result.get("profile_used")),
        "source_used": bool(result.get("source_used")),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_provider": result.get("model_provider"),
        "model_name": result.get("model_name"),
        "model_key": result.get("model_key"),
        "model_label": result.get("model_label"),
        "run_id": result.get("run_id"),
        "citations": citations,
    })


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
    _invalidate_student_resource_cache(user.id)
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
    if resource.get("saved_to_resource_center"):
        _invalidate_student_resource_cache(user.id)
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


@router.get("/resources/folders")
def student_resource_folders(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    require_active_class(db, user)
    key = stable_cache_key(f"student-resources:{user.id}", "folders")
    items = remember_json(
        key,
        STUDENT_RESOURCE_CACHE_TTL_SECONDS,
        lambda: list_student_resource_folders(db, student_id=user.id),
    )
    return ok({"items": items})


@router.post("/resources/folders", status_code=status.HTTP_201_CREATED)
def student_create_resource_folder(
    payload: StudentResourceFolderCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    require_active_class(db, user)
    folder = create_student_resource_folder(db, student_id=user.id, name=payload.name)
    db.commit()
    _invalidate_student_resource_cache(user.id)
    return ok(folder)


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
    _invalidate_student_resource_cache(user.id)
    return ok(resource)


@router.get("/resources/generated")
def student_generated_resources(
    course_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    key = stable_cache_key(f"student-resources:{user.id}", "generated", course_id or "")
    resources = remember_json(
        key,
        STUDENT_RESOURCE_CACHE_TTL_SECONDS,
        lambda: list_saved_generated_resources(db, student_id=user.id, course_id=course_id),
    )
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
    key = stable_cache_key(f"student-resources:{user.id}", "detail", resource_id)
    data = remember_json(
        key,
        STUDENT_RESOURCE_CACHE_TTL_SECONDS,
        lambda: serialize_generated_resource(resource),
    )
    return ok(data)


@router.get("/resources/{resource_id}/practice")
def student_generated_practice_workspace(
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    key = stable_cache_key(f"student-resources:{user.id}", "practice", resource_id)
    data = remember_json(
        key,
        STUDENT_RESOURCE_CACHE_TTL_SECONDS,
        lambda: practice_workspace_payload(db, student_id=user.id, resource_id=resource_id),
    )
    return ok(data)


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
    result = submit_generated_practice(db, user=user, class_id=administrative_class.id, resource_id=resource_id, answers=answers)
    _invalidate_student_resource_cache(user.id)
    return ok(result)


@router.post("/resources/{resource_id}/podcast/listened")
def student_mark_generated_podcast_listened(
    resource_id: str,
    payload: StudentPodcastListenedRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "STUDENT")
    administrative_class, _ = require_active_class(db, user)
    result = record_generated_podcast_listened(
        db,
        user=user,
        class_id=administrative_class.id,
        resource_id=resource_id,
        completed_segment_count=payload.completed_segment_count,
    )
    _invalidate_student_resource_cache(user.id)
    return ok(result)


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
                model_key=payload.model_key,
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
                    "model_key": result.get("model_key"),
                    "model_label": result.get("model_label"),
                    "fallback_from_model_key": result.get("fallback_from_model_key"),
                    "fallback_from_model_label": result.get("fallback_from_model_label"),
                    "model_fallback_reason": result.get("model_fallback_reason"),
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
        fallback_required_count = (
            len(task.questions) if task.workspace_type == "QUESTION_SET" else len(task.test_cases)
        )
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
                "start_at": iso(assignment_start_at(assignment)),
                "schedule_status": assignment_schedule_status(assignment),
                "deadline": iso(assignment.deadline),
                "difficulty": task_difficulty(task),
                "knowledge_points": task_knowledge_points(task),
                "status": progress.status if progress else "NOT_STARTED",
                "passed_count": progress.passed_count if progress else 0,
                "total_required_count": progress.total_required_count if progress else fallback_required_count,
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
