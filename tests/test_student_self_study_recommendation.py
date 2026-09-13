from fastapi.testclient import TestClient

from backend.app.main import app


STUDENT = {"X-Demo-User-Id": "user_student_001"}


def test_self_study_daily_recommendation_returns_external_links():
    with TestClient(app) as client:
        response = client.get("/api/v1/student/self-study/daily-recommendation", headers=STUDENT)

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["topic"]
    assert data["reason"]
    assert data["external_resources"]
    assert data["recommended_actions"]
    assert {item["resource_type"] for item in data["recommended_actions"]} >= {
        "PRACTICE_SET",
        "DOCUMENT",
        "AI_CLASSROOM",
    }
    for resource in data["external_resources"]:
        assert resource["url"].startswith("https://")
        assert resource["title"]
        assert resource["type"]
