from urllib.parse import quote

from fastapi.testclient import TestClient

from teacher_backend.app.database import SessionLocal
from teacher_backend.app.main import app
from teacher_backend.app.models import AuditLog, Course, User


def test_new_teacher_can_enter_empty_workbench_and_create_course():
    headers = {
        "X-User-Id": "registered-teacher-empty-01",
        "X-User-Name": quote("新教师"),
    }

    course_id = None
    with TestClient(app) as client:
        try:
            bootstrap = client.get("/api/v1/teacher/bootstrap", headers=headers)
            assert bootstrap.status_code == 200
            assert bootstrap.json()["data"]["courses"] == []
            assert bootstrap.json()["data"]["selected_course_id"] == ""

            dashboard = client.get(
                "/api/v1/teacher/dashboard",
                params={"course_id": "", "class_id": ""},
                headers=headers,
            )
            assert dashboard.status_code == 200
            assert dashboard.json()["data"]["summary"]["active_tasks"] == 0

            created = client.post(
                "/api/v1/teacher/courses",
                headers=headers,
                json={
                    "name": "新教师课程初始化验收",
                    "code": "INIT-TEACHER-001",
                    "term": "2026-2027 学年秋季学期",
                    "description": "验证教师从空课程状态进入创建课程流程。",
                    "chapter_titles": [],
                },
            )
            assert created.status_code == 201, created.text
            course = created.json()["data"]
            course_id = course["id"]

            refreshed = client.get("/api/v1/teacher/bootstrap", headers=headers)
            assert refreshed.status_code == 200
            assert refreshed.json()["data"]["selected_course_id"] == course["id"]
            assert any(item["id"] == course["id"] for item in refreshed.json()["data"]["courses"])
        finally:
            with SessionLocal() as db:
                if course_id:
                    course = db.get(Course, course_id)
                    if course:
                        db.delete(course)
                db.query(AuditLog).filter(AuditLog.actor_id == headers["X-User-Id"]).delete(
                    synchronize_session=False
                )
                user = db.get(User, headers["X-User-Id"])
                if user:
                    db.delete(user)
                db.commit()
