from sqlalchemy import func, select
from fastapi.testclient import TestClient

from teacher_backend.app.database import SessionLocal
from teacher_backend.app.main import app
from teacher_backend.app.models import EvaluationResult, Grade, Submission, Task, TestCase as TaskTestCase
from teacher_backend.app.task_grade_seed import TASK_ID, ensure_task_grade_fixture


def test_grade_fixture_is_complete_and_idempotent():
    with TestClient(app):
        with SessionLocal() as db:
            ensure_task_grade_fixture(db)
            ensure_task_grade_fixture(db)

            task = db.get(Task, TASK_ID)
            assert task is not None
            assert task.status == "published"
            assert task.class_id == "class-se1"
            assert db.scalar(select(func.count()).select_from(TaskTestCase).where(TaskTestCase.task_id == TASK_ID)) == 6
            assert db.scalar(select(func.count()).select_from(Submission).where(Submission.task_id == TASK_ID)) == 6

            submission_ids = select(Submission.id).where(Submission.task_id == TASK_ID)
            assert db.scalar(select(func.count()).select_from(EvaluationResult).where(EvaluationResult.submission_id.in_(submission_ids))) == 6
            assert db.scalar(select(func.count()).select_from(Grade).where(Grade.submission_id.in_(submission_ids))) == 6



