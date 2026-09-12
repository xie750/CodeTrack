from datetime import timedelta
from uuid import uuid4

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
            workspace = c.get(f"/api/v1/student/assignments/{assignment_id}/workspace")
            assert workspace.status_code == 200
            assert workspace.json()["data"]["assignment"]["schedule_status"] == "PENDING_START"

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


def test_registered_student_without_class_can_use_joined_question_workspace():
    username = f"quiz_{uuid4().hex[:8]}"
    answer_payload = [
        {"question_id": "q_linked_quiz_001", "selected_option_ids": ["q_linked_quiz_001_a"]},
        {"question_id": "q_linked_quiz_002", "selected_option_ids": ["q_linked_quiz_002_a"]},
        {"question_id": "q_linked_quiz_003", "selected_option_ids": ["q_linked_quiz_003_a"]},
    ]
    with TestClient(app) as c:
        registered = c.post(
            "/api/v1/auth/register",
            json={
                "username": username,
                "password": "codetrack123",
                "display_name": "无班级测验学生",
                "role": "STUDENT",
            },
        )
        assert registered.status_code == 201, registered.text
        headers = {"Authorization": f"Bearer {registered.json()['data']['access_token']}"}

        context = c.get("/api/v1/student/learning-context", headers=headers)
        assert context.status_code == 200
        assert context.json()["data"]["student"]["state"] == "NO_CLASS"

        tasks = c.get("/api/v1/student/tasks", headers=headers)
        assert tasks.status_code == 200
        quiz = next(item for item in tasks.json()["data"] if item["assignment_id"] == "assign_se1_ds_stage_quiz_001")
        assert quiz["workspace_type"] == "QUESTION_SET"

        workspace = c.get(f"/api/v1/student/assignments/{quiz['assignment_id']}/workspace", headers=headers)
        assert workspace.status_code == 200, workspace.text
        assert workspace.json()["data"]["task"]["workspace_type"] == "QUESTION_SET"

        draft = c.post(
            f"/api/v1/student/assignments/{quiz['assignment_id']}/answers",
            headers=headers,
            json={"answers": answer_payload},
        )
        assert draft.status_code == 200, draft.text

        submitted = c.post(
            f"/api/v1/student/assignments/{quiz['assignment_id']}/submit-answers",
            headers=headers,
            json={"answers": answer_payload},
        )
        assert submitted.status_code == 201, submitted.text
        assert submitted.json()["data"]["status"] == "SUBMITTED"


def test_registered_student_builds_initial_profile_from_bootstrap_assessment():
    username = f"bootstrap_{uuid4().hex[:8]}"
    answer_payload = [
        {"question_id": "q_bootstrap_ds_001", "selected_option_ids": ["q_bootstrap_ds_001_b"]},
        {"question_id": "q_bootstrap_ds_002", "selected_option_ids": ["q_bootstrap_ds_002_b"]},
        {"question_id": "q_bootstrap_ds_003", "selected_option_ids": ["q_bootstrap_ds_003_a", "q_bootstrap_ds_003_b"]},
    ]
    with TestClient(app) as c:
        registered = c.post(
            "/api/v1/auth/register",
            json={
                "username": username,
                "password": "codetrack123",
                "display_name": "画像摸底学生",
                "role": "STUDENT",
            },
        )
        assert registered.status_code == 201, registered.text
        headers = {"Authorization": f"Bearer {registered.json()['data']['access_token']}"}

        empty_profile = c.get("/api/v1/student/profile", params={"course_id": "course_ds_001"}, headers=headers)
        assert empty_profile.status_code == 200
        assert empty_profile.json()["data"]["profile_status"] == "EMPTY"

        assignment_id = empty_profile.json()["data"]["bootstrap_assessment"]["assignment_id"]
        assert assignment_id == "assign_bootstrap_ds_profile_001"
        workspace = c.get(f"/api/v1/student/assignments/{assignment_id}/workspace", headers=headers)
        assert workspace.status_code == 200, workspace.text
        assert workspace.json()["data"]["assignment"]["assignment_mode"] == "PROFILE_BOOTSTRAP"

        submitted = c.post(
            f"/api/v1/student/assignments/{assignment_id}/submit-answers",
            headers=headers,
            json={"answers": answer_payload},
        )
        assert submitted.status_code == 201, submitted.text
        assert submitted.json()["data"]["profile_signal"]["profile_status"] == "INITIAL"

        profile = c.get("/api/v1/student/profile", params={"course_id": "course_ds_001"}, headers=headers)
        assert profile.status_code == 200
        profile_data = profile.json()["data"]
        assert profile_data["profile_status"] == "INITIAL"
        assert profile_data["profile_confidence"] == "LOW"
        assert profile_data["bootstrap_assessment"] is None
        assert {item["knowledge_point"] for item in profile_data["knowledge_states"]} >= {
            "链表边界处理",
            "栈与队列",
            "二叉树递归出口",
        }
