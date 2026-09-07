from datetime import timedelta

from fastapi.testclient import TestClient

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import TaskAssignment
from backend.app.models.entities import utc_now


def client() -> TestClient:
    test_client = TestClient(app)
    test_client.headers.update({"X-Demo-User-Id": "user_student_001"})
    return test_client


def test_question_workspace_submit_updates_task_progress_and_profile():
    with client() as c:
        tasks = c.get("/api/v1/student/tasks")
        assert tasks.status_code == 200
        quiz = next(item for item in tasks.json()["data"] if item["assignment_id"] == "assign_se1_ds_stage_quiz_001")
        assert quiz["workspace_type"] == "QUESTION_SET"

        workspace = c.get(f"/api/v1/student/assignments/{quiz['assignment_id']}/workspace")
        assert workspace.status_code == 200
        data = workspace.json()["data"]
        assert data["assignment"]["start_at"]
        assert data["task"]["workspace_type"] == "QUESTION_SET"
        assert [question["question_type"] for question in data["questions"]] == [
            "SINGLE_CHOICE",
            "MULTIPLE_CHOICE",
            "TRUE_FALSE",
        ]
        answer_payload = [
            {"question_id": "q_linked_quiz_001", "selected_option_ids": ["q_linked_quiz_001_a"]},
            {"question_id": "q_linked_quiz_002", "selected_option_ids": ["q_linked_quiz_002_a"]},
            {"question_id": "q_linked_quiz_003", "selected_option_ids": ["q_linked_quiz_003_a"]},
        ]

        direct_submit = c.post(
            f"/api/v1/student/assignments/{quiz['assignment_id']}/submit-answers",
            json={"answers": answer_payload},
        )
        assert direct_submit.status_code == 201
        assert direct_submit.json()["data"]["status"] == "SUBMITTED"

        draft = c.post(
            f"/api/v1/student/assignments/{quiz['assignment_id']}/answers",
            json={"answers": answer_payload},
        )
        assert draft.status_code == 200
        assert draft.json()["data"]["status"] == "DRAFT"

        submitted = c.post(
            f"/api/v1/student/assignments/{quiz['assignment_id']}/submit-answers",
            json={"answers": answer_payload},
        )
        assert submitted.status_code == 201
        result = submitted.json()["data"]
        assert result["correct_count"] == 2
        assert result["total_count"] == 3
        assert result["score_percent"] > 0
        assert "summary" in result["profile_signal"]

        refreshed_tasks = c.get("/api/v1/student/tasks").json()["data"]
        refreshed_quiz = next(item for item in refreshed_tasks if item["assignment_id"] == quiz["assignment_id"])
        assert refreshed_quiz["status"] == "COMPLETED"
        assert refreshed_quiz["passed_count"] == 2

        profile = c.get("/api/v1/student/profile?course_id=course_ds_001")
        assert profile.status_code == 200
        profile_data = profile.json()["data"]
        assert profile_data["overview"]["summary"]
        assert any(item["knowledge_point"] == "边界测试" for item in profile_data["knowledge_states"])


def test_question_workspace_blocks_save_and_submit_before_start_time():
    assignment_id = "assign_se1_ds_stage_quiz_001"
    answer_payload = [
        {"question_id": "q_linked_quiz_001", "selected_option_ids": ["q_linked_quiz_001_a"]},
    ]
    with client() as c:
        db = SessionLocal()
        try:
            assignment = db.get(TaskAssignment, assignment_id)
            assert assignment is not None
            original_start_at = assignment.start_at
            assignment.start_at = utc_now() + timedelta(days=2)
            db.commit()
        finally:
            db.close()

        try:
            draft = c.post(
                f"/api/v1/student/assignments/{assignment_id}/answers",
                json={"answers": answer_payload},
            )
            assert draft.status_code == 403
            assert draft.json()["error"]["code"] == "ASSIGNMENT_NOT_STARTED"

            submitted = c.post(
                f"/api/v1/student/assignments/{assignment_id}/submit-answers",
                json={"answers": answer_payload},
            )
            assert submitted.status_code == 403
            assert submitted.json()["error"]["code"] == "ASSIGNMENT_NOT_STARTED"
        finally:
            db = SessionLocal()
            try:
                assignment = db.get(TaskAssignment, assignment_id)
                assert assignment is not None
                assignment.start_at = original_start_at
                db.commit()
            finally:
                db.close()
