from fastapi.testclient import TestClient

from backend.app.main import app


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
        assert data["task"]["workspace_type"] == "QUESTION_SET"
        assert [question["question_type"] for question in data["questions"]] == [
            "SINGLE_CHOICE",
            "MULTIPLE_CHOICE",
            "TRUE_FALSE",
        ]

        draft = c.post(
            f"/api/v1/student/assignments/{quiz['assignment_id']}/answers",
            json={
                "answers": [
                    {"question_id": "q_linked_quiz_001", "selected_option_ids": ["q_linked_quiz_001_a"]},
                    {"question_id": "q_linked_quiz_002", "selected_option_ids": ["q_linked_quiz_002_a"]},
                    {"question_id": "q_linked_quiz_003", "selected_option_ids": ["q_linked_quiz_003_a"]},
                ]
            },
        )
        assert draft.status_code == 200
        assert draft.json()["data"]["status"] == "DRAFT"

        submitted = c.post(
            f"/api/v1/student/assignments/{quiz['assignment_id']}/submit-answers",
            json={
                "answers": [
                    {"question_id": "q_linked_quiz_001", "selected_option_ids": ["q_linked_quiz_001_a"]},
                    {"question_id": "q_linked_quiz_002", "selected_option_ids": ["q_linked_quiz_002_a"]},
                    {"question_id": "q_linked_quiz_003", "selected_option_ids": ["q_linked_quiz_003_a"]},
                ]
            },
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
