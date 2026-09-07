from fastapi.testclient import TestClient

from backend.app.main import app


STUDENT = {"X-Demo-User-Id": "user_student_001"}


def test_profile_returns_internal_algorithm_recommendations_without_exposing_formula():
    with TestClient(app) as client:
        response = client.get("/api/v1/student/profile?course_id=course_ds_001", headers=STUDENT)

    assert response.status_code == 200, response.text
    recommendations = response.json()["data"]["recommendations"]
    assert recommendations
    assert any(item["id"].startswith("rec_algo_") for item in recommendations)

    first = recommendations[0]
    assert first["suggested_action"] in {"OPEN_TASK", "RETRY_TASK", "OPEN_SELF_STUDY"}
    assert first["related_knowledge_points"]
    assert "推荐分" not in first["reason"]
    assert "权重" not in first["reason"]

