import json

from fastapi import APIRouter, BackgroundTasks, Depends, Header, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok, request_id
from backend.app.core.config import get_settings
from backend.app.core.database import SessionLocal, get_db
from backend.app.core.security import current_user, ensure_course_member
from backend.app.models import Course, Enrollment, Submission, Task, TestCase, User
from backend.app.services.seed import STUDENT_TEMPLATE
from backend.app.services.audit import record_audit
from backend.app.services.submissions import create_submission_version, iso, run_execution

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])


class SubmitCodeRequest(BaseModel):
    language: str
    source_code: str


def run_execution_background(execution_id: str, timeout_seconds: int) -> None:
    db = SessionLocal()
    try:
        run_execution(db, execution_id, timeout_seconds, audit_request_id=f"req_bg_{execution_id}")
    finally:
        db.close()


def progress_for(db: Session, task_id: str, student_id: str) -> dict:
    submission = db.scalar(
        select(Submission).where(Submission.task_id == task_id, Submission.student_id == student_id)
    )
    if submission is None:
        return {
            "submission_id": None,
            "latest_version_id": None,
            "status": "NOT_STARTED",
            "version_no": None,
            "passed_count": 0,
            "total_required_count": 5,
            "highest_hint_level": 0,
        }
    latest = submission.versions[-1] if submission.versions else None
    latest_version_id = latest.id if latest else None
    passed = 0
    total = 5
    if latest and latest.execution:
        total = len(latest.execution.test_results)
        passed = len([result for result in latest.execution.test_results if result.status == "PASSED"])
    return {
        "submission_id": submission.id,
        "latest_version_id": latest_version_id,
        "status": submission.status if submission.status in {"PASSED", "FAILED"} else "IN_PROGRESS",
        "version_no": latest.version_no if latest else None,
        "passed_count": passed,
        "total_required_count": total,
        "highest_hint_level": latest.highest_hint_level if latest else 0,
    }


@router.get("")
def list_tasks(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    tasks = db.scalars(
        select(Task)
        .join(Enrollment, Enrollment.course_id == Task.course_id)
        .where(Task.status == "OPEN", Enrollment.user_id == user.id)
        .order_by(Task.id.asc())
    ).all()
    data = []
    for task in tasks:
        course = db.get(Course, task.course_id)
        progress = progress_for(db, task.id, user.id)
        submission = db.get(Submission, progress["submission_id"]) if progress["submission_id"] else None
        data.append(
            {
                "task_id": task.id,
                "course_id": task.course_id,
                "course_name": course.name if course else "",
                "title": task.title,
                "language": task.language,
                "status": task.status,
                "progress_status": progress["status"],
                "latest_submission_id": progress["submission_id"],
                "latest_version_id": progress["latest_version_id"],
                "last_submitted_at": iso(submission.last_submitted_at) if submission else None,
                "passed_at": iso(submission.passed_at) if submission else None,
            }
        )
    return ok(data)


@router.get("/{task_id}")
def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    task = db.get(Task, task_id)
    if task is None:
        raise ApiError(404, "TASK_NOT_FOUND", "任务不存在")
    ensure_course_member(db, task.course_id, user.id)
    public_tests = (
        db.query(TestCase)
        .filter(TestCase.task_id == task.id, TestCase.visibility == "PUBLIC")
        .order_by(TestCase.sort_order.asc())
        .all()
    )
    data = {
        "task_id": task.id,
        "course_id": task.course_id,
        "title": task.title,
        "language": task.language,
        "status": task.status,
        "description": task.description,
        "interface_spec": {
            "function_signature": task.interface_spec,
            "editable_region": "FUNCTION_ONLY",
            "student_template": STUDENT_TEMPLATE,
            "rules": [
                "空链表返回 nullptr",
                "非法位置返回原链表",
                "删除头节点时返回新的头节点",
            ],
        },
        "learning_objectives": json.loads(task.learning_objectives),
        "public_tests": [
            {
                "test_case_id": case.id,
                "name": case.name,
                "input_summary": json.loads(case.input_data),
                "expected_output_summary": case.expected_output_summary,
            }
            for case in public_tests
        ],
        "current_progress": progress_for(db, task.id, user.id),
    }
    return ok(data)


@router.post("/{task_id}/submissions", status_code=status.HTTP_202_ACCEPTED)
def submit_code(
    task_id: str,
    payload: SubmitCodeRequest,
    background_tasks: BackgroundTasks,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    rid = request_id()
    task = db.get(Task, task_id)
    if task is None:
        raise ApiError(404, "TASK_NOT_FOUND", "任务不存在")
    ensure_course_member(db, task.course_id, user.id, role="STUDENT")
    submission, version, execution, created = create_submission_version(
        db=db,
        task_id=task_id,
        student_id=user.id,
        language=payload.language,
        source_code=payload.source_code,
        idempotency_key=idempotency_key,
    )
    if created:
        background_tasks.add_task(
            run_execution_background,
            execution.id,
            get_settings().sandbox_timeout_seconds,
        )
    record_audit(
        db,
        event_type="SUBMISSION_VERSION_CREATED" if created else "SUBMISSION_IDEMPOTENCY_REUSED",
        request_id=rid,
        user_id=user.id,
        submission_id=submission.id,
        version_id=version.id,
        execution_id=execution.id,
        status="QUEUED" if created else execution.status,
        details={
            "task_id": task_id,
            "language": payload.language,
            "version_no": version.version_no,
            "idempotency_reused": not created,
        },
    )
    db.commit()
    return ok(
        {
            "submission_id": submission.id,
            "version_id": version.id,
            "version_no": version.version_no,
            "execution_id": execution.id,
            "status": "QUEUED" if created else execution.status,
            "status_url": f"/api/v1/executions/{execution.id}",
        },
        rid=rid,
    )
