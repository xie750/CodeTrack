from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.core.database import SessionLocal
from backend.app.models import StudentClassMembership, User
from backend.app.main import app


def unique_username(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:8]}"


def test_student_registration_initializes_learning_business_flow():
    username = unique_username("stu")
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": username,
                "password": "codetrack123",
                "display_name": "赵同学",
                "role": "STUDENT",
            },
        )

        assert response.status_code == 201
        data = response.json()["data"]
        assert data["token_type"] == "bearer"
        assert data["user"]["username"] == username
        assert data["user"]["role"] == "STUDENT"

        headers = {"Authorization": f"Bearer {data['access_token']}"}
        context = client.get("/api/v1/student/learning-context", headers=headers)
        assert context.status_code == 200
        context_data = context.json()["data"]
        assert context_data["student"]["name"] == "赵同学"
        assert context_data["student"]["class_id"] is None
        assert context_data["student"]["class_name"] == "未加入班级"
        assert context_data["student"]["state"] == "NO_CLASS"
        assert context_data["courses"] == []

        tasks = client.get("/api/v1/student/tasks", headers=headers)
        assert tasks.status_code == 200
        assert tasks.json()["data"] == []

        daily_tasks = client.get("/api/v1/student/daily-tasks", headers=headers)
        assert daily_tasks.status_code == 200
        assert daily_tasks.json()["data"]["summary"]["total"] >= 1

        folders = client.get("/api/v1/student/resources/folders", headers=headers)
        assert folders.status_code == 200
        assert {item["name"] for item in folders.json()["data"]["items"]} >= {"学习笔记", "知识卡片"}

        practice_projects = client.get("/api/v1/student/practice-projects", headers=headers)
        assert practice_projects.status_code == 200
        assert len(practice_projects.json()["data"]["projects"]) >= 1

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.username == username))
        assert user is not None
        assert user.password_hash != "codetrack123"
        membership = db.scalar(
            select(StudentClassMembership).where(
                StudentClassMembership.student_id == user.id,
                StudentClassMembership.class_id == "class_se_001",
            )
        )
        assert membership is None
    finally:
        db.close()


def test_registration_rejects_duplicate_username():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": "wang",
                "password": "codetrack123",
                "display_name": "重复账号",
                "role": "STUDENT",
            },
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "AUTH_REGISTER_USERNAME_EXISTS"


def test_registration_rejects_weak_password():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": unique_username("weak"),
                "password": "12345678",
                "display_name": "弱密码",
                "role": "STUDENT",
            },
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "AUTH_REGISTER_PASSWORD_WEAK"


def test_registered_students_do_not_share_personal_learning_records():
    first_username = unique_username("scope_a")
    second_username = unique_username("scope_b")
    with TestClient(app) as client:
        first = client.post(
            "/api/v1/auth/register",
            json={
                "username": first_username,
                "password": "codetrack123",
                "display_name": "隔离测试甲",
                "role": "STUDENT",
            },
        )
        second = client.post(
            "/api/v1/auth/register",
            json={
                "username": second_username,
                "password": "codetrack123",
                "display_name": "隔离测试乙",
                "role": "STUDENT",
            },
        )
        assert first.status_code == 201
        assert second.status_code == 201
        first_headers = {"Authorization": f"Bearer {first.json()['data']['access_token']}"}
        second_headers = {"Authorization": f"Bearer {second.json()['data']['access_token']}"}

        folder = client.post(
            "/api/v1/student/resources/folders",
            headers=first_headers,
            json={"name": "甲的私有学习记录"},
        )
        assert folder.status_code == 201
        second_folders = client.get("/api/v1/student/resources/folders", headers=second_headers)
        assert second_folders.status_code == 200
        assert "甲的私有学习记录" not in {item["name"] for item in second_folders.json()["data"]["items"]}

        first_session = client.post(
            "/api/v1/student/ai-chat/sessions",
            headers=first_headers,
            json={"first_message": "甲的私有 AI 会话"},
        )
        assert first_session.status_code == 200
        session_id = first_session.json()["data"]["id"]
        second_sessions = client.get("/api/v1/student/ai-chat/sessions", headers=second_headers)
        assert second_sessions.status_code == 200
        assert second_sessions.json()["data"] == []
        forbidden_session = client.get(
            f"/api/v1/student/ai-chat/sessions/{session_id}",
            headers=second_headers,
        )
        assert forbidden_session.status_code == 404

        first_projects = client.get("/api/v1/student/practice-projects", headers=first_headers)
        assert first_projects.status_code == 200
        project_id = first_projects.json()["data"]["projects"][0]["id"]
        material = client.post(
            f"/api/v1/student/practice-projects/{project_id}/materials",
            headers=first_headers,
            json={
                "material_type": "NOTE",
                "title": "甲的私有科研材料",
                "content": "只属于甲的科研过程记录。",
            },
        )
        assert material.status_code == 201
        first_detail = client.get(
            f"/api/v1/student/practice-projects/{project_id}",
            headers=first_headers,
        )
        second_detail = client.get(
            f"/api/v1/student/practice-projects/{project_id}",
            headers=second_headers,
        )
        assert first_detail.status_code == 200
        assert second_detail.status_code == 200
        assert first_detail.json()["data"]["materials"][0]["title"] == "甲的私有科研材料"
        assert second_detail.json()["data"]["materials"] == []
        assert second_detail.json()["data"]["submissions"] == []
        assert second_detail.json()["data"]["activities"] == []


def test_teacher_registration_returns_teacher_token_and_course_scope():
    username = unique_username("tea")
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": username,
                "password": "codetrack123",
                "display_name": "赵老师",
                "role": "TEACHER",
            },
        )

        assert response.status_code == 201
        data = response.json()["data"]
        assert data["user"]["role"] == "TEACHER"

        courses = client.get(
            "/api/v1/teacher/courses",
            headers={"Authorization": f"Bearer {data['access_token']}"},
        )
        assert courses.status_code == 200
        assert {course["title"] for course in courses.json()["data"]} >= {
            "机器学习",
            "Python 程序设计",
            "数据结构",
        }
