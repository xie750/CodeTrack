from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.main import app


STUDENT = {"X-Demo-User-Id": "user_student_001"}


def test_student_can_generate_save_and_download_ppt_resource(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/ppt/generate",
            headers=STUDENT,
            json={"course_id": "course_ds_001", "message": "帮我生成关于队列的讲解 PPT"},
        )
        assert generated.status_code == 200
        resource = generated.json()["data"]["resource"]
        assert resource["resource_type"] == "PPT"
        assert resource["status"] == "READY"
        assert resource["slide_count"] >= 4
        assert resource["render_payload"]["slides"]
        assert resource["citations"]
        assert resource["saved_to_resource_center"] is False

        saved = client.post(f"/api/v1/student/resources/{resource['id']}/save", headers=STUDENT)
        assert saved.status_code == 200
        assert saved.json()["data"]["saved_to_resource_center"] is True

        listing = client.get("/api/v1/student/resources/generated", headers=STUDENT)
        assert listing.status_code == 200
        ids = {item["id"] for item in listing.json()["data"]["items"]}
        assert resource["id"] in ids

        downloaded = client.get(f"/api/v1/student/resources/{resource['id']}/download", headers=STUDENT)
        assert downloaded.status_code == 200
        assert downloaded.headers["content-type"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        assert len(downloaded.content) > 1000
