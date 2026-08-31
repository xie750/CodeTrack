from fastapi.testclient import TestClient

from backend.app.main import app


STUDENT_HEADERS = {"X-Demo-User-Id": "user_student_001"}
TEACHER_HEADERS = {"X-Demo-User-Id": "user_teacher_001"}
OTHER_STUDENT_HEADERS = {"X-Demo-User-Id": "user_student_002"}


def test_student_practice_project_home_returns_seeded_projects():
    with TestClient(app) as client:
        response = client.get("/api/v1/student/practice-projects", headers=STUDENT_HEADERS)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["recommended_project_id"] == "sales-cleaning"
    assert data["stats"]["project_count"] == 3
    assert data["stats"]["in_progress_count"] == 2
    assert [project["id"] for project in data["projects"]] == [
        "sales-cleaning",
        "log-topk",
        "retention-dashboard",
    ]
    assert data["projects"][0]["course_name"] == "机器学习"
    assert data["projects"][0]["capability_points"]
    assert data["activities"]
    assert len(data["path_steps"]) == 6


def test_student_practice_project_detail_returns_workflow_sections():
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/student/practice-projects/sales-cleaning",
            headers=STUDENT_HEADERS,
        )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["project"]["id"] == "sales-cleaning"
    assert data["project"]["stage"] == "P3 模型训练"
    assert data["metrics"]["completed_stage_count"] == 3
    assert data["task_sections"][0]["title"] == "当前任务说明"
    assert data["submission_requirements"]
    assert data["acceptance_criteria"]
    assert data["mentor_tips"]
    assert data["resources"]
    assert data["submissions"][0]["status_label"] == "已通过"


def test_student_can_submit_practice_project_stage_result():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/student/practice-projects/sales-cleaning/submissions",
            headers=STUDENT_HEADERS,
            json={
                "title": "P3 模型训练阶段成果",
                "description": "提交 ResNet-18 训练日志与对比表。",
                "materials": ["训练日志", "对比表"],
            },
        )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["submission"]["status"] == "SUBMITTED"
    assert data["submission"]["status_label"] == "待审核"
    assert data["submission"]["content"]["materials"] == ["训练日志", "对比表"]
    assert data["detail"]["project"]["status"] == "SUBMITTED"
    assert data["detail"]["metrics"]["submission_count"] == 3
    assert data["detail"]["activities"][0]["text"] == "你提交了 P3 模型训练阶段成果"


def test_teacher_cannot_access_student_practice_projects():
    with TestClient(app) as client:
        response = client.get("/api/v1/student/practice-projects", headers=TEACHER_HEADERS)

    assert response.status_code == 403


def test_practice_projects_are_scoped_to_student_courses():
    with TestClient(app) as client:
        home = client.get("/api/v1/student/practice-projects", headers=OTHER_STUDENT_HEADERS)
        forbidden_detail = client.get(
            "/api/v1/student/practice-projects/sales-cleaning",
            headers=OTHER_STUDENT_HEADERS,
        )

    assert home.status_code == 200
    home_data = home.json()["data"]
    assert home_data["projects"] == []
    assert home_data["recommended_project_id"] is None
    assert home_data["readiness"]["status"] == "PREPARING"
    assert forbidden_detail.status_code == 404
    assert forbidden_detail.json()["error"]["code"] == "PRACTICE_PROJECT_NOT_FOUND"


def test_student_can_start_first_lightweight_practice_project():
    with TestClient(app) as client:
        created = client.post("/api/v1/student/practice-projects/start-first", headers=OTHER_STUDENT_HEADERS)
        home = client.get("/api/v1/student/practice-projects", headers=OTHER_STUDENT_HEADERS)

    assert created.status_code == 201
    created_data = created.json()["data"]
    assert created_data["started"] is True
    assert created_data["detail"]["project"]["id"] == "log-topk"
    assert created_data["detail"]["project"]["status"] == "IN_PROGRESS"
    assert created_data["detail"]["metrics"]["submission_count"] == 0

    home_data = home.json()["data"]
    assert [project["id"] for project in home_data["projects"]] == ["log-topk"]
    assert home_data["recommended_project_id"] == "log-topk"
    assert home_data["readiness"]["status"] == "ACTIVE"
