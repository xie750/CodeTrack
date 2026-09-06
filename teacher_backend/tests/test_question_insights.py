from __future__ import annotations

from fastapi.testclient import TestClient

from teacher_backend.app.main import app


TEACHER = {"X-User-Id": "teacher-01"}
STUDENT = {"X-User-Id": "student-03"}


def test_question_insights_expose_quantified_clusters_and_details():
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/teacher/analytics/question-insights",
            headers=TEACHER,
            params={"course_id": "course-ds", "class_id": "class-se1"},
        )

    assert response.status_code == 200
    data = response.json()["data"]

    assert data["scope"]["course_id"] == "course-ds"
    assert data["data_status"]["source"] == "prototype"
    assert data["data_status"]["label"]
    assert data["summary"]["total_questions"] > 0
    assert data["summary"]["question_cluster_count"] == len(data["clusters"])
    assert data["ai_diagnosis"]["mode"] == "RULE_PREVIEW"
    assert data["ai_diagnosis"]["source_label"]
    assert data["ai_diagnosis"]["recommendations"]
    assert data["ai_diagnosis"]["evidence"]

    first = data["clusters"][0]
    assert first["representative_question"]
    assert first["ask_count"] > 0
    assert first["student_count"] > 0
    assert 0 <= first["coverage_rate"] <= 100
    assert 0 <= first["repeat_followup_rate"] <= 100
    assert first["related_errors"]
    assert first["diagnosis"]["teaching_suggestions"]
    assert first["diagnosis"]["practice_suggestions"]
    assert first["sample_questions"]

    sample = first["sample_questions"][0]
    assert sample["student_name"]
    assert sample["question"]
    assert isinstance(sample["followups"], int)
    assert isinstance(sample["resolved"], bool)


def test_question_insights_require_teacher_scope():
    with TestClient(app) as client:
        student_response = client.get(
            "/api/v1/teacher/analytics/question-insights",
            headers=STUDENT,
            params={"course_id": "course-ds", "class_id": "class-se1"},
        )
        unknown_class = client.get(
            "/api/v1/teacher/analytics/question-insights",
            headers=TEACHER,
            params={"course_id": "course-ds", "class_id": "class-missing"},
        )

    assert student_response.status_code == 403
    assert unknown_class.status_code == 404
