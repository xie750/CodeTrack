from fastapi.testclient import TestClient

from backend.app.main import app


TEACHER_HEADERS = {"X-User-Id": "teacher-01"}


def test_database_teacher_accounts_and_login():
    with TestClient(app) as client:
        accounts = client.get("/api/v1/teacher/auth/accounts")
        assert accounts.status_code == 200
        teachers = accounts.json()["data"]
        assert {item["name"] for item in teachers} >= {"王老师", "林老师"}

        login = client.post(
            "/api/v1/teacher/auth/login",
            json={"username": "T2024002", "password": "123456"},
        )
        assert login.status_code == 200
        assert login.json()["data"]["id"] == "teacher-02"

        invalid = client.post(
            "/api/v1/teacher/auth/login",
            json={"username": "T2024002", "password": "wrong-password"},
        )
        assert invalid.status_code == 401


def test_course_draft_round_trip_and_delete():
    payload = {
        "values": {"name": "数据库草稿测试", "term": "2026-2027 学年秋季学期"},
        "knowledgePoints": ["线性表", "图"],
        "coverUrl": "/ui-assets/course-preview.png",
    }
    with TestClient(app) as client:
        saved = client.put(
            "/api/v1/teacher/course-draft",
            headers=TEACHER_HEADERS,
            json={"payload": payload},
        )
        assert saved.status_code == 200
        assert saved.json()["data"]["values"]["name"] == "数据库草稿测试"
        assert saved.json()["data"]["savedAt"]

        loaded = client.get("/api/v1/teacher/course-draft", headers=TEACHER_HEADERS)
        assert loaded.status_code == 200
        assert loaded.json()["data"]["knowledgePoints"] == ["线性表", "图"]

        deleted = client.delete("/api/v1/teacher/course-draft", headers=TEACHER_HEADERS)
        assert deleted.status_code == 200
        assert deleted.json()["data"]["deleted"] is True
        assert client.get("/api/v1/teacher/course-draft", headers=TEACHER_HEADERS).json()["data"] is None


def test_announcement_read_state_persists():
    with TestClient(app) as client:
        listed = client.get(
            "/api/v1/teacher/courses/course-ds/announcements",
            headers=TEACHER_HEADERS,
        )
        assert listed.status_code == 200
        announcements = listed.json()["data"]
        assert len(announcements) == 5
        target = next(item for item in announcements if not item["read"])

        marked = client.patch(
            f"/api/v1/teacher/announcements/{target['id']}/read",
            headers=TEACHER_HEADERS,
        )
        assert marked.status_code == 200
        assert marked.json()["data"]["read"] is True

        reloaded = client.get(
            "/api/v1/teacher/courses/course-ds/announcements",
            headers=TEACHER_HEADERS,
        ).json()["data"]
        assert next(item for item in reloaded if item["id"] == target["id"])["read"] is True


def test_teacher_preferences_round_trip():
    with TestClient(app) as client:
        original = client.get("/api/v1/teacher/preferences", headers=TEACHER_HEADERS)
        assert original.status_code == 200

        changed = client.put(
            "/api/v1/teacher/preferences",
            headers=TEACHER_HEADERS,
            json={
                "notifications_enabled": False,
                "ai_assistant_enabled": True,
                "email_digest": True,
            },
        )
        assert changed.status_code == 200
        assert changed.json()["data"]["notifications_enabled"] is False
        assert changed.json()["data"]["email_digest"] is True

        reloaded = client.get("/api/v1/teacher/preferences", headers=TEACHER_HEADERS)
        assert reloaded.json()["data"]["email_digest"] is True
