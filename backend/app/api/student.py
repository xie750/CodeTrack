import json

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user
from backend.app.models import (
    AdministrativeClass,
    Course,
    LearnerErrorStat,
    LearnerKnowledgeState,
    LearnerProfileSnapshot,
    Recommendation,
    StudentClassMembership,
    StudentTaskProgress,
    Task,
    TaskAssignment,
    TeachingAssignment,
    User,
)
from backend.app.services.submissions import iso

router = APIRouter(prefix="/api/v1/student", tags=["student"])


def loads_list(value: str) -> list:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


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


@router.get("/learning-context")
def learning_context(db: Session = Depends(get_db), user: User = Depends(current_user)):
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
                "task_type": "CODING",
                "deadline": iso(assignment.deadline),
                "difficulty": "BASIC",
                "knowledge_points": ["链表", "边界处理", "指针"],
                "status": progress.status if progress else "NOT_STARTED",
                "passed_count": progress.passed_count if progress else 0,
                "total_required_count": progress.total_required_count if progress else len(task.test_cases),
                "highest_hint_level": progress.highest_hint_level if progress else 0,
                "latest_summary": "最近一次提交未通过头节点删除用例"
                if progress and progress.status != "NOT_STARTED"
                else "尚未提交，建议先运行公开样例。",
            }
        )
    return ok(data)


@router.get("/profile")
def learner_profile(
    course_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    administrative_class, _ = require_active_class(db, user)
    profile_query = select(LearnerProfileSnapshot).where(
        LearnerProfileSnapshot.student_id == user.id,
        LearnerProfileSnapshot.class_id == administrative_class.id,
    )
    if course_id:
        profile_query = profile_query.where(LearnerProfileSnapshot.course_id == course_id)
    profile = db.scalar(profile_query.order_by(LearnerProfileSnapshot.updated_at.desc()))
    if profile is None:
        raise ApiError(404, "LEARNER_PROFILE_NOT_FOUND", "当前课程暂无足够画像数据")

    course = db.get(Course, profile.course_id)
    teaching = db.scalar(
        select(TeachingAssignment).where(
            TeachingAssignment.class_id == administrative_class.id,
            TeachingAssignment.course_id == profile.course_id,
            TeachingAssignment.status == "ACTIVE",
        )
    )
    teacher = db.get(User, teaching.teacher_id) if teaching else None

    knowledge_states = db.scalars(
        select(LearnerKnowledgeState)
        .where(
            LearnerKnowledgeState.student_id == user.id,
            LearnerKnowledgeState.course_id == profile.course_id,
        )
        .order_by(LearnerKnowledgeState.mastery_score.asc())
    ).all()
    error_stats = db.scalars(
        select(LearnerErrorStat)
        .where(
            LearnerErrorStat.student_id == user.id,
            LearnerErrorStat.course_id == profile.course_id,
        )
        .order_by(LearnerErrorStat.count.desc())
    ).all()
    recommendations = db.scalars(
        select(Recommendation)
        .where(
            Recommendation.student_id == user.id,
            Recommendation.course_id == profile.course_id,
            Recommendation.status == "ACTIVE",
        )
        .order_by(Recommendation.priority.desc())
    ).all()

    return ok(
        {
            "student": {
                "id": user.id,
                "name": user.display_name,
                "class_id": administrative_class.id,
                "class_name": administrative_class.name,
            },
            "course": {
                "id": course.id if course else profile.course_id,
                "name": course.name if course else "",
                "teacher_name": teacher.display_name if teacher else "",
            },
            "overview": {
                "overall_progress": profile.overall_progress,
                "hint_dependency_level": profile.hint_dependency_level,
                "compile_error_rate": profile.compile_error_rate,
                "logic_error_rate": profile.logic_error_rate,
                "recent_task_completion": profile.recent_task_completion,
                "summary": profile.summary_text,
                "recommendation": profile.recommendation_text,
                "updated_at": iso(profile.updated_at),
            },
            "knowledge_states": [
                {
                    "knowledge_point": item.knowledge_point,
                    "mastery_score": item.mastery_score,
                    "state": item.state,
                    "evidence_count": item.evidence_count,
                    "last_evidence": item.last_evidence,
                }
                for item in knowledge_states
            ],
            "frequent_errors": [
                {
                    "error_type": item.error_type,
                    "label": item.label,
                    "count": item.count,
                    "severity": item.severity,
                    "related_knowledge_points": loads_list(item.related_knowledge_points),
                }
                for item in error_stats
            ],
            "recommendations": [
                {
                    "id": item.id,
                    "title": item.title,
                    "reason": item.reason,
                    "priority": item.priority,
                    "related_task_id": item.related_task_id,
                    "related_knowledge_points": loads_list(item.related_knowledge_points),
                    "suggested_action": item.suggested_action,
                }
                for item in recommendations
            ],
        }
    )
