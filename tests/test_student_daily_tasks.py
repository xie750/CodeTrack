from fastapi.testclient import TestClient

from backend.app.main import app


STUDENT = {"X-Demo-User-Id": "user_student_001"}
OTHER_STUDENT = {"X-Demo-User-Id": "user_student_002"}


def test_student_daily_tasks_crud_flow():
    day_key = "2026-09-07"

    with TestClient(app) as client:
        empty = client.get("/api/v1/student/daily-tasks", headers=STUDENT, params={"task_date": day_key})
        assert empty.status_code == 200, empty.text
        assert empty.json()["data"]["summary"] == {"total": 0, "completed": 0, "pending": 0}

        created = client.post(
            "/api/v1/student/daily-tasks",
            headers=STUDENT,
            json={"task_date": day_key, "title": "整理机器学习课堂笔记"},
        )
        assert created.status_code == 201, created.text
        task = created.json()["data"]
        assert task["title"] == "整理机器学习课堂笔记"
        assert task["completed"] is False

        listed = client.get("/api/v1/student/daily-tasks", headers=STUDENT, params={"task_date": day_key})
        assert listed.status_code == 200, listed.text
        assert listed.json()["data"]["summary"] == {"total": 1, "completed": 0, "pending": 1}

        updated = client.patch(
            f"/api/v1/student/daily-tasks/{task['id']}",
            headers=STUDENT,
            json={"completed": True},
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["data"]["completed"] is True

        blocked = client.delete(f"/api/v1/student/daily-tasks/{task['id']}", headers=OTHER_STUDENT)
        assert blocked.status_code == 404, blocked.text

        deleted = client.delete(f"/api/v1/student/daily-tasks/{task['id']}", headers=STUDENT)
        assert deleted.status_code == 200, deleted.text
        assert deleted.json()["data"] == {"deleted": True, "id": task["id"]}

        listed_again = client.get("/api/v1/student/daily-tasks", headers=STUDENT, params={"task_date": day_key})
        assert listed_again.json()["data"]["summary"] == {"total": 0, "completed": 0, "pending": 0}
