from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from teacher_backend.app.main import app


def teacher_headers():
    return {"X-User-Id": "teacher-01"}


def student_headers():
    return {"X-User-Id": "student-03"}


def test_health_and_bootstrap():
    with TestClient(app) as client:
        health = client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        response = client.get("/api/v1/teacher/bootstrap", headers=teacher_headers())
        assert response.status_code == 200
        payload = response.json()["data"]
        assert payload["teacher"]["name"] == "王老师"
        assert any(course["id"] == "course-ds" for course in payload["courses"])


def test_teacher_student_grade_closed_loop():
    with TestClient(app) as client:
        due_at = (datetime.now() + timedelta(days=14)).replace(microsecond=0).isoformat()
        create_response = client.post(
            "/api/v1/teacher/tasks",
            headers=teacher_headers(),
            json={
                "course_id": "course-ds",
                "title": "闭环验收编程任务",
                "type": "programming",
                "chapter_label": "第 2 章 线性表",
                "description": "验证教师发布、学生提交、评测和成绩发布。",
                "starter_code": "ListNode* removeAt(ListNode* head, int index) { return head; }",
                "difficulty": "进阶",
                "due_at": due_at,
                "test_cases": [
                    {"name": "头节点删除", "hidden": False, "weight": 50},
                    {"name": "尾节点删除", "hidden": True, "weight": 50},
                ],
            },
        )
        assert create_response.status_code == 201, create_response.text
        task = create_response.json()["data"]
        assert task["status"] == "draft"

        publish_response = client.post(
            f"/api/v1/teacher/tasks/{task['id']}/publish",
            headers=teacher_headers(),
            json={"class_id": "class-se1", "due_at": due_at},
        )
        assert publish_response.status_code == 200, publish_response.text
        assert publish_response.json()["data"]["status"] == "published"

        student_tasks = client.get("/api/v1/student/tasks", headers=student_headers())
        assert student_tasks.status_code == 200
        assert any(item["id"] == task["id"] for item in student_tasks.json()["data"])
        published_task = next(item for item in student_tasks.json()["data"] if item["id"] == task["id"])
        assert all(not case["hidden"] for case in published_task["test_cases"])

        submit_response = client.post(
            f"/api/v1/student/tasks/{task['id']}/submissions",
            headers=student_headers(),
            json={
                "source_code": "if (!head) return head; if (index == 0) { delete head; } current->next = nullptr;",
                "hint_level": 1,
            },
        )
        assert submit_response.status_code == 201, submit_response.text
        submission = submit_response.json()["data"]
        assert submission["evaluation"]["total_tests"] == 2

        monitor_response = client.get(
            "/api/v1/teacher/submissions",
            params={"task_id": task["id"]},
            headers=teacher_headers(),
        )
        assert monitor_response.status_code == 200
        assert monitor_response.json()["data"][0]["id"] == submission["id"]
        assert len(monitor_response.json()["data"][0]["evaluation"]["details"]) == 2

        grade_response = client.put(
            f"/api/v1/teacher/submissions/{submission['id']}/grade",
            headers=teacher_headers(),
            json={
                "score": 93,
                "comment": "边界处理完整。",
                "dimensions": {"autoTest": 38, "codeQuality": 28, "report": 18, "participation": 9},
            },
        )
        assert grade_response.status_code == 200
        assert grade_response.json()["data"]["status"] == "graded"
        assert grade_response.json()["data"]["dimensions"]["autoTest"] == 38

        publish_grade_response = client.post(
            f"/api/v1/teacher/submissions/{submission['id']}/grade/publish",
            headers=teacher_headers(),
        )
        assert publish_grade_response.status_code == 200
        assert publish_grade_response.json()["data"]["status"] == "grade_published"


def test_permissions_and_business_validation():
    with TestClient(app) as client:
        forbidden = client.get("/api/v1/teacher/courses", headers=student_headers())
        assert forbidden.status_code == 403

        invalid_task = client.post(
            "/api/v1/teacher/tasks",
            headers=teacher_headers(),
            json={
                "course_id": "course-ds",
                "title": "没有测试用例的任务",
                "type": "programming",
                "chapter_label": "第 2 章 线性表",
                "due_at": (datetime.now() + timedelta(days=1)).isoformat(),
                "test_cases": [],
            },
        )
        assert invalid_task.status_code == 422


def test_course_archive_restore_and_delete():
    with TestClient(app) as client:
        created_response = client.post(
            "/api/v1/teacher/courses",
            headers=teacher_headers(),
            json={
                "name": "课程归档接口测试",
                "code": "COURSE-ARCHIVE-TEST",
                "term": "2025-2026 学年秋季学期",
                "description": "用于验证课程归档与删除闭环。",
                "chapter_titles": [],
            },
        )
        assert created_response.status_code == 201, created_response.text
        course = created_response.json()["data"]

        archived_response = client.patch(
            f"/api/v1/teacher/courses/{course['id']}",
            headers=teacher_headers(),
            json={"status": "archived"},
        )
        assert archived_response.status_code == 200, archived_response.text
        assert archived_response.json()["data"]["status"] == "archived"

        restored_response = client.patch(
            f"/api/v1/teacher/courses/{course['id']}",
            headers=teacher_headers(),
            json={"status": "preparing"},
        )
        assert restored_response.status_code == 200, restored_response.text
        assert restored_response.json()["data"]["status"] == "preparing"

        deleted_response = client.delete(
            f"/api/v1/teacher/courses/{course['id']}",
            headers=teacher_headers(),
        )
        assert deleted_response.status_code == 200, deleted_response.text
        assert deleted_response.json()["data"]["deleted"] is True



