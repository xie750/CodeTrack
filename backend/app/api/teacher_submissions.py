"""教师任务提交、评分与反馈接口。

这些接口只服务教师端的任务批改闭环，所有读写都先收窄到当前教师已发布任务和班级名册。
"""

import json
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import (
    DiagnosisReview,
    Grade,
    Submission,
    SubmissionVersion,
    Task,
    TaskAssignment,
    TeacherFeedback,
    TeachingAssignment,
    User,
)
from backend.app.services.submissions import iso
from backend.app.services.teacher_scope import class_student_ids, teacher_assignments
from backend.app.models.entities import utc_now

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-submissions"])


class GradePayload(BaseModel):
    score: float = Field(ge=0, le=100)
    comment: str = Field(default="", max_length=4000)
    dimensions: dict[str, Any] = Field(default_factory=dict)


class FeedbackPayload(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    publish: bool = True


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _published_assignments_for_task(
    db: Session, teacher_id: str, task_id: str
) -> list[TaskAssignment]:
    task = db.get(Task, task_id)
    if task is None:
        raise ApiError(404, "TASK_NOT_FOUND", "任务不存在")
    teaching_ids = [item.id for item in teacher_assignments(db, teacher_id, task.course_id)]
    if not teaching_ids:
        raise ApiError(403, "AUTH_FORBIDDEN", "当前教师无权访问该任务")
    return list(
        db.scalars(
            select(TaskAssignment).where(
                TaskAssignment.task_id == task_id,
                TaskAssignment.teaching_assignment_id.in_(teaching_ids),
                TaskAssignment.publish_status == "PUBLISHED",
            )
        ).all()
    )


def _authorized_submission(
    db: Session, user: User, submission_id: str
) -> Submission:
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise ApiError(404, "SUBMISSION_NOT_FOUND", "提交不存在")
    assignments = _published_assignments_for_task(db, user.id, submission.task_id)
    assignment_class_ids = {
        teaching.class_id
        for teaching in db.scalars(
            select(TeachingAssignment).where(
                TeachingAssignment.id.in_([item.teaching_assignment_id for item in assignments])
            )
        ).all()
    }
    if submission.student_id not in class_student_ids(db, sorted(assignment_class_ids)):
        raise ApiError(404, "SUBMISSION_NOT_FOUND", "提交不存在或不在当前教师的教学范围内")
    return submission


def _json_object(raw: str | None) -> dict:
    try:
        value = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _serialize_grade(grade: Grade | None) -> dict | None:
    if grade is None:
        return None
    return {
        "id": grade.id,
        "score": grade.score,
        "status": "grade_published" if grade.status == "PUBLISHED" else "grade_draft",
        "comment": grade.comment,
        "dimensions": _json_object(grade.dimensions_json),
        "published_at": iso(grade.published_at),
    }


def _serialize_submission(db: Session, submission: Submission) -> dict:
    latest: SubmissionVersion | None = submission.versions[-1] if submission.versions else None
    execution = latest.execution if latest else None
    results = execution.test_results if execution else []
    total_tests = len(results)
    passed_tests = len([item for item in results if item.status == "PASSED"])
    diagnosis = latest.diagnosis if latest else None
    review = (
        db.scalar(
            select(DiagnosisReview)
            .where(DiagnosisReview.diagnosis_id == diagnosis.id)
            .order_by(DiagnosisReview.created_at.desc())
        )
        if diagnosis
        else None
    )
    grade = db.scalar(select(Grade).where(Grade.submission_id == submission.id))
    feedback = db.scalars(
        select(TeacherFeedback)
        .where(TeacherFeedback.submission_id == submission.id)
        .order_by(TeacherFeedback.updated_at.desc())
    ).all()
    provider = diagnosis.model_provider if diagnosis else "SYSTEM"
    fallback = provider.upper() in {"RULE", "MOCK", "FALLBACK"}
    return {
        "id": submission.id,
        "task_id": submission.task_id,
        "student": {
            "id": submission.student.id,
            "name": submission.student.display_name,
            "number": submission.student.username or submission.student.id,
        },
        "version": latest.version_no if latest else submission.latest_version_no,
        "source_code": latest.source_code if latest else "",
        "status": submission.status,
        "hint_level": max(
            (item.highest_hint_level or 0 for item in submission.versions), default=0
        ),
        "submitted_at": iso(submission.last_submitted_at),
        "evaluation": (
            {
                "passed_tests": passed_tests,
                "total_tests": total_tests,
                "runtime_ms": sum(item.duration_ms or 0 for item in results),
                "score": round(passed_tests * 100 / total_tests, 1) if total_tests else 0,
                "details": [
                    {
                        "name": item.test_case.name if item.test_case else item.test_case_id,
                        "passed": item.status == "PASSED",
                        "hidden": bool(item.test_case and item.test_case.visibility == "HIDDEN"),
                    }
                    for item in results
                ],
            }
            if execution
            else None
        ),
        "diagnosis": (
            {
                "id": diagnosis.id,
                "type": diagnosis.diagnosis_type,
                "explanation": diagnosis.explanation,
                "confidence": diagnosis.confidence,
                "source": "课程知识库" if fallback else f"{provider}/{diagnosis.model_name}",
                "fallback": fallback,
                "needs_teacher_review": diagnosis.needs_teacher_review,
                "review_status": review.action if review else None,
            }
            if diagnosis
            else None
        ),
        "grade": _serialize_grade(grade),
        "feedback": [
            {
                "id": item.id,
                "content": item.content,
                "status": "feedback_published" if item.status == "PUBLISHED" else "feedback_draft",
                "student_visible": item.student_visible,
                "published_at": iso(item.published_at),
            }
            for item in feedback
        ],
    }


@router.get("/submissions")
def list_teacher_submissions(
    task_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    assignments = _published_assignments_for_task(db, user.id, task_id)
    class_ids = [
        teaching.class_id
        for teaching in db.scalars(
            select(TeachingAssignment).where(
                TeachingAssignment.id.in_([item.teaching_assignment_id for item in assignments])
            )
        ).all()
    ]
    student_ids = class_student_ids(db, class_ids)
    submissions = db.scalars(
        select(Submission)
        .where(Submission.task_id == task_id, Submission.student_id.in_(student_ids))
        .order_by(Submission.last_submitted_at.desc())
    ).all() if student_ids else []
    return ok([_serialize_submission(db, submission) for submission in submissions])


@router.get("/submissions/{submission_id}")
def get_teacher_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    return ok(_serialize_submission(db, _authorized_submission(db, user, submission_id)))


@router.put("/submissions/{submission_id}/grade")
def save_teacher_grade(
    submission_id: str,
    payload: GradePayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    submission = _authorized_submission(db, user, submission_id)
    grade = db.scalar(select(Grade).where(Grade.submission_id == submission.id))
    now = utc_now()
    if grade is None:
        grade = Grade(
            id=_new_id("grade"),
            submission_id=submission.id,
            teacher_id=user.id,
            score=payload.score,
            comment=payload.comment.strip(),
            dimensions_json=json.dumps(payload.dimensions, ensure_ascii=False),
            updated_at=now,
        )
        db.add(grade)
    else:
        grade.teacher_id = user.id
        grade.score = payload.score
        grade.comment = payload.comment.strip()
        grade.dimensions_json = json.dumps(payload.dimensions, ensure_ascii=False)
        grade.status = "DRAFT"
        grade.published_at = None
        grade.updated_at = now
    db.commit()
    return ok(_serialize_grade(grade))


@router.post("/submissions/{submission_id}/grade/publish")
def publish_teacher_grade(
    submission_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    submission = _authorized_submission(db, user, submission_id)
    grade = db.scalar(select(Grade).where(Grade.submission_id == submission.id))
    if grade is None:
        raise ApiError(422, "GRADE_DRAFT_REQUIRED", "请先保存成绩草稿")
    grade.status = "PUBLISHED"
    grade.published_at = grade.published_at or utc_now()
    grade.updated_at = utc_now()
    db.commit()
    return ok(_serialize_grade(grade))


@router.post("/submissions/{submission_id}/feedback")
def save_teacher_feedback(
    submission_id: str,
    payload: FeedbackPayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    submission = _authorized_submission(db, user, submission_id)
    feedback = db.scalar(
        select(TeacherFeedback)
        .where(
            TeacherFeedback.submission_id == submission.id,
            TeacherFeedback.teacher_id == user.id,
        )
        .order_by(TeacherFeedback.updated_at.desc())
    )
    now = utc_now()
    if feedback is None:
        feedback = TeacherFeedback(
            id=_new_id("feedback"),
            submission_id=submission.id,
            teacher_id=user.id,
            content=payload.content.strip(),
            status="PUBLISHED" if payload.publish else "DRAFT",
            student_visible=payload.publish,
            published_at=now if payload.publish else None,
            updated_at=now,
        )
        db.add(feedback)
    else:
        feedback.content = payload.content.strip()
        feedback.status = "PUBLISHED" if payload.publish else "DRAFT"
        feedback.student_visible = payload.publish
        feedback.published_at = (feedback.published_at or now) if payload.publish else None
        feedback.updated_at = now
    db.commit()
    return ok(
        {
            "id": feedback.id,
            "content": feedback.content,
            "status": "feedback_published" if feedback.status == "PUBLISHED" else "feedback_draft",
            "student_visible": feedback.student_visible,
            "published_at": iso(feedback.published_at),
        }
    )
