from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import (
    ExecutionRun,
    Grade,
    IdempotencyRecord,
    Submission,
    SubmissionVersion,
    StudentTaskProgress,
    Task,
    TaskAssignment,
    TeacherFeedback,
    TestCase as DbTestCase,
)
import backend.app.api.tasks as tasks_api
from backend.app.services.submissions import sync_published_task_progress


TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}
COURSE_ID = "course_ds_001"
CLASS_ID = "class_se_001"


def _cleanup_task(task_id: str) -> None:
    db = SessionLocal()
    try:
        submission_ids = list(db.scalars(select(Submission.id).where(Submission.task_id == task_id)).all())
        version_ids = list(
            db.scalars(select(SubmissionVersion.id).where(SubmissionVersion.submission_id.in_(submission_ids))).all()
        ) if submission_ids else []
        execution_ids = list(
            db.scalars(select(ExecutionRun.id).where(ExecutionRun.submission_version_id.in_(version_ids))).all()
        ) if version_ids else []
        if submission_ids:
            db.execute(delete(Grade).where(Grade.submission_id.in_(submission_ids)))
            db.execute(delete(TeacherFeedback).where(TeacherFeedback.submission_id.in_(submission_ids)))
            db.execute(delete(IdempotencyRecord).where(IdempotencyRecord.submission_id.in_(submission_ids)))
        if execution_ids:
            db.execute(delete(ExecutionRun).where(ExecutionRun.id.in_(execution_ids)))
        if version_ids:
            db.execute(delete(SubmissionVersion).where(SubmissionVersion.id.in_(version_ids)))
        if submission_ids:
            db.execute(delete(Submission).where(Submission.id.in_(submission_ids)))
        assignment_ids = list(db.scalars(select(TaskAssignment.id).where(TaskAssignment.task_id == task_id)).all())
        if assignment_ids:
            db.execute(delete(StudentTaskProgress).where(StudentTaskProgress.assignment_id.in_(assignment_ids)))
            db.execute(delete(TaskAssignment).where(TaskAssignment.id.in_(assignment_ids)))
        db.execute(delete(DbTestCase).where(DbTestCase.task_id == task_id))
        db.execute(delete(Task).where(Task.id == task_id))
        db.commit()
    finally:
        db.close()


def test_teacher_student_coding_task_feedback_chain(monkeypatch, request):
    task_id = None
    request.addfinalizer(lambda: _cleanup_task(task_id) if task_id else None)
    monkeypatch.setattr(tasks_api, "run_execution_background", lambda *_args, **_kwargs: None)

    with TestClient(app) as client:
        title = f"coding-chain-{uuid4().hex[:8]}"
        created = client.post(
            "/api/v1/teacher/tasks",
            headers=TEACHER,
            json={
                "course_id": COURSE_ID,
                "title": title,
                "description": "验证教师发布、学生提交和反馈回传。",
                "workspace_type": "CODING",
                "language": "CPP",
                "interface_spec": "deleteAt(values, position) -> values",
                "learning_objectives": ["链表边界处理"],
                "capability_ids": ["cap_linked_list_boundary"],
                "test_cases": [
                    {
                        "name": "公开用例",
                        "visibility": "PUBLIC",
                        "input_data": {"values": [1, 2, 3], "position": 1},
                        "expected_output": [1, 3],
                        "expected_output_summary": "[1,3]",
                        "error_tag": "LINKED_LIST_HEAD_UPDATE_ERROR",
                    },
                ],
            },
        )
        assert created.status_code == 201, created.text
        task_id = created.json()["data"]["task_id"]

        published = client.post(
            f"/api/v1/teacher/tasks/{task_id}/publish",
            headers=TEACHER,
            json={"class_ids": [CLASS_ID], "assignment_mode": "PRACTICE"},
        )
        assert published.status_code == 200, published.text
        assignment_id = published.json()["data"]["publications"][0]["assignment_id"]

        student_tasks = client.get("/api/v1/student/tasks", headers=STUDENT, params={"course_id": COURSE_ID})
        assert student_tasks.status_code == 200, student_tasks.text
        student_row = next(item for item in student_tasks.json()["data"] if item["task_id"] == task_id)
        assert student_row["assignment_id"] == assignment_id
        assert student_row["status"] == "NOT_STARTED"

        workspace = client.get(
            f"/api/v1/tasks/{task_id}",
            headers=STUDENT,
            params={"assignment_id": assignment_id},
        )
        assert workspace.status_code == 200, workspace.text
        assert workspace.json()["data"]["current_progress"]["status"] == "NOT_STARTED"

        submitted = client.post(
            f"/api/v1/tasks/{task_id}/submissions",
            headers=STUDENT,
            params={"assignment_id": assignment_id},
            json={"language": "CPP", "source_code": "int main() { return 0; }"},
        )
        assert submitted.status_code == 202, submitted.text
        submission_id = submitted.json()["data"]["submission_id"]

        teacher_submissions = client.get(
            "/api/v1/teacher/submissions",
            headers=TEACHER,
            params={"task_id": task_id},
        )
        assert teacher_submissions.status_code == 200, teacher_submissions.text
        submission = teacher_submissions.json()["data"][0]
        assert submission["id"] == submission_id
        assert submission["student"]["id"] == "user_student_001"

        submitted_tasks = client.get(
            "/api/v1/student/tasks",
            headers=STUDENT,
            params={"course_id": COURSE_ID},
        )
        submitted_row = next(item for item in submitted_tasks.json()["data"] if item["task_id"] == task_id)
        assert submitted_row["status"] == "SUBMITTED"

        db = SessionLocal()
        try:
            db_submission = db.get(Submission, submission_id)
            version = db_submission.versions[-1]
            case_id = db.scalar(select(DbTestCase.id).where(DbTestCase.task_id == task_id))
            sync_published_task_progress(
                db,
                db_submission,
                version,
                "PASSED",
                [{"test_case_id": case_id, "status": "PASSED"}],
                {case_id},
            )
            db.commit()
        finally:
            db.close()

        completed_tasks = client.get(
            "/api/v1/student/tasks",
            headers=STUDENT,
            params={"course_id": COURSE_ID},
        )
        completed_row = next(item for item in completed_tasks.json()["data"] if item["task_id"] == task_id)
        assert completed_row["status"] == "COMPLETED"

        saved_grade = client.put(
            f"/api/v1/teacher/submissions/{submission_id}/grade",
            headers=TEACHER,
            json={
                "score": 86,
                "comment": "边界条件处理清晰，建议补充空输入说明。",
                "dimensions": {"autoTest": 36, "codeQuality": 25},
            },
        )
        assert saved_grade.status_code == 200, saved_grade.text
        assert saved_grade.json()["data"]["status"] == "grade_draft"

        feedback = client.post(
            f"/api/v1/teacher/submissions/{submission_id}/feedback",
            headers=TEACHER,
            json={"content": "请在报告中补充空链表和非法位置的分析。", "publish": True},
        )
        assert feedback.status_code == 200, feedback.text
        assert feedback.json()["data"]["student_visible"] is True

        published_grade = client.post(
            f"/api/v1/teacher/submissions/{submission_id}/grade/publish",
            headers=TEACHER,
        )
        assert published_grade.status_code == 200, published_grade.text
        assert published_grade.json()["data"]["status"] == "grade_published"

        student_detail = client.get(
            f"/api/v1/tasks/{task_id}",
            headers=STUDENT,
            params={"assignment_id": assignment_id},
        )
        assert student_detail.status_code == 200, student_detail.text
        review = student_detail.json()["data"]["teacher_review"]
        assert review["grade"]["score"] == 86
        assert review["feedback"][0]["content"] == "请在报告中补充空链表和非法位置的分析。"
