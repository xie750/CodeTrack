from __future__ import annotations

from fastapi.testclient import TestClient

from teacher_backend.app.main import app


TEACHER = {"X-User-Id": "teacher-01"}


def test_class_practice_intervention_creates_student_visible_task_and_notifications():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/teacher/analytics/interventions",
            headers=TEACHER,
            json={
                "course_id": "course-ds",
                "class_id": "class-se1",
                "action": "class_practice",
                "title": "链表边界专项练习",
                "content": "请完成一组链表边界条件练习。",
                "knowledge_point": "链表",
            },
        )

        assert response.status_code == 201
        data = response.json()["data"]
        assert data["task_id"]
        assert data["recipients"] >= 1
        assert len(data["notification_ids"]) == data["recipients"]
        assert data["student_visible"] is True

        tasks = client.get("/api/v1/student/tasks", headers={"X-User-Id": "student-03"}).json()["data"]
        assert any(item["id"] == data["task_id"] for item in tasks)


def test_student_feedback_intervention_writes_feedback_and_notification():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/teacher/analytics/interventions",
            headers=TEACHER,
            json={
                "course_id": "course-ds",
                "class_id": "class-se1",
                "student_id": "student-03",
                "action": "student_feedback",
                "title": "教师个性化学习建议",
                "content": "请优先复盘链表头节点删除。",
                "knowledge_point": "链表",
            },
        )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["feedback_id"]
    assert data["recipients"] == 1
    assert len(data["notification_ids"]) == 1


def test_learning_intervention_rejects_student_outside_class():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/teacher/analytics/interventions",
            headers=TEACHER,
            json={
                "course_id": "course-ds",
                "class_id": "class-se1",
                "student_id": "student-missing",
                "action": "risk_reminder",
                "title": "学习提醒",
                "content": "请完成复习。",
            },
        )

    assert response.status_code == 404
