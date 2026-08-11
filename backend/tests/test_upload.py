from fastapi.testclient import TestClient

from backend.app.main import app


def test_teacher_uploads_and_downloads_real_file():
    with TestClient(app) as client:
        content = b"CodeTrack material upload test"
        response = client.post(
            "/api/v1/teacher/materials/upload",
            headers={"X-User-Id": "teacher-01"},
            data={
                "course_id": "course-ds",
                "chapter_label": "Test chapter",
                "visibility": "teacher",
            },
            files={"file": ("upload-test.txt", content, "text/plain")},
        )
        assert response.status_code == 201, response.text
        uploaded = response.json()["data"]
        assert uploaded["status"] == "ready"
        assert uploaded["size"] == "0.0 MB"

        download = client.get(
            uploaded["content_url"],
            headers={"X-User-Id": "teacher-01"},
        )
        assert download.status_code == 200
        assert download.content == content

        student_download = client.get(
            uploaded["content_url"],
            headers={"X-User-Id": "student-03"},
        )
        assert student_download.status_code == 403

        updated = client.patch(
            f"/api/v1/teacher/materials/{uploaded['id']}",
            headers={"X-User-Id": "teacher-01"},
            json={"visibility": "students"},
        )
        assert updated.status_code == 200
        assert updated.json()["data"]["visibility"] == "students"

        deleted = client.delete(
            f"/api/v1/teacher/materials/{uploaded['id']}",
            headers={"X-User-Id": "teacher-01"},
        )
        assert deleted.status_code == 200
        assert client.get(uploaded["content_url"], headers={"X-User-Id": "teacher-01"}).status_code == 404

        trash = client.get(
            "/api/v1/teacher/materials/trash?course_id=course-ds",
            headers={"X-User-Id": "teacher-01"},
        )
        assert trash.status_code == 200
        assert any(item["id"] == uploaded["id"] for item in trash.json()["data"])

        restored = client.post(
            f"/api/v1/teacher/materials/{uploaded['id']}/restore",
            headers={"X-User-Id": "teacher-01"},
        )
        assert restored.status_code == 200
        assert restored.json()["data"]["status"] == "ready"
        assert client.get(uploaded["content_url"], headers={"X-User-Id": "teacher-01"}).status_code == 200
