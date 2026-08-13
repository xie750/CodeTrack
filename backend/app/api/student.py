import json

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
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
from backend.app.services.question_workflow import (
    question_workspace_payload,
    save_question_draft,
    submit_question_answers,
)

router = APIRouter(prefix="/api/v1/student", tags=["student"])


class QuestionAnswerPayload(BaseModel):
    question_id: str
    selected_option_ids: list[str]


class SaveQuestionAnswersRequest(BaseModel):
    answers: list[QuestionAnswerPayload]


def task_knowledge_points(task: Task) -> list[str]:
    if "子网" in task.title or task.course_id == "course_network_001":
        return ["计算机网络", "子网划分", "IP 地址"]
    if "二叉树" in task.title:
        return ["二叉树", "递归", "遍历"]
    if "栈" in task.title:
        return ["栈与队列", "括号匹配", "边界处理"]
    return ["链表", "边界处理", "指针"]


def task_difficulty(task: Task) -> str:
    if "二叉树" in task.title or "子网" in task.title:
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
        return "最近练习显示子网掩码换算还需要继续巩固。"
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
