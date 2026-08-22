from fastapi.testclient import TestClient

from teacher_backend.app.main import app


def test_teacher_chapter_content_and_student_visibility():
    teacher_headers = {"X-User-Id": "teacher-01"}
    student_headers = {"X-User-Id": "student-03"}
    with TestClient(app) as client:
        teacher_response = client.get(
            "/api/v1/teacher/courses/course-ds/chapters",
            headers=teacher_headers,
        )
        assert teacher_response.status_code == 200
        chapters = teacher_response.json()["data"]
        assert chapters
        assert {"teaching_mode", "status"}.issubset(chapters[0])

        chapter = chapters[0]
        update_response = client.patch(
            f"/api/v1/teacher/chapters/{chapter['id']}",
            headers=teacher_headers,
            json={"teaching_mode": "案例教学", "status": "published"},
        )
        assert update_response.status_code == 200, update_response.text
        assert update_response.json()["data"]["status"] == "published"

        student_response = client.get(
            "/api/v1/student/courses/course-ds/content",
            headers=student_headers,
        )
        assert student_response.status_code == 200, student_response.text
        student_chapters = student_response.json()["data"]
        assert any(item["id"] == chapter["id"] for item in student_chapters)
        assert all(item["status"] == "published" for item in student_chapters)

        withdraw_response = client.patch(
            f"/api/v1/teacher/chapters/{chapter['id']}",
            headers=teacher_headers,
            json={"status": "draft"},
        )
        assert withdraw_response.status_code == 200
        hidden_response = client.get(
            "/api/v1/student/courses/course-ds/content",
            headers=student_headers,
        )
        assert all(item["id"] != chapter["id"] for item in hidden_response.json()["data"])

        client.patch(
            f"/api/v1/teacher/chapters/{chapter['id']}",
            headers=teacher_headers,
            json={"teaching_mode": "理论讲授", "status": "published"},
        )



