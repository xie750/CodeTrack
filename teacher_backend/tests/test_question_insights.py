from __future__ import annotations

import json
from types import SimpleNamespace

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
    assert data["diagnosis_capability"]["mode"] == "REALTIME_MODEL"

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


def test_question_insight_diagnosis_calls_real_model(monkeypatch):
    captured = {}

    monkeypatch.setattr(
        "teacher_backend.app.main.get_settings",
        lambda: SimpleNamespace(
            model_api_key="test-key",
            model_name="test-model",
            model_api_base_url="http://model.test/v1",
        ),
    )

    async def fake_chat_json(messages, **kwargs):
        captured["messages"] = messages
        captured["kwargs"] = kwargs
        payload = json.loads(messages[-1]["content"])
        assert payload["scope"]["course_id"] == "course-ds"
        assert payload["selected_cluster"]["id"] == "q-ds-head-node"
        return SimpleNamespace(
            data={
                "title": "链表头节点实时诊断",
                "summary": "模型基于当前高频疑问判断，头节点删除已经成为班级共性问题。",
                "teaching_suggestions": ["用图示演示 head 指针变化"],
                "practice_suggestions": ["生成头节点删除边界题"],
                "evidence": ["提问次数：42", "覆盖学生：21"],
                "data_gaps": ["尚未接入真实学生 AI 提问日志"],
                "confidence": 0.87,
            },
            model_provider="OPENAI_COMPATIBLE",
            model_name=kwargs["model"],
            duration_ms=120,
            token_prompt=400,
            token_completion=120,
        )

    monkeypatch.setattr("teacher_backend.app.main.chat_json", fake_chat_json)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/teacher/analytics/question-insights/diagnose",
            headers=TEACHER,
            json={"course_id": "course-ds", "class_id": "class-se1", "cluster_id": "q-ds-head-node"},
        )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["summary"].startswith("模型基于当前高频疑问")
    assert data["confidence"] == 87
    assert data["target"]["cluster_id"] == "q-ds-head-node"
    assert data["model"]["name"] == "test-model"
    assert captured["kwargs"]["api_key"] == "test-key"


def test_question_insight_diagnosis_requires_model_configuration(monkeypatch):
    monkeypatch.setattr(
        "teacher_backend.app.main.get_settings",
        lambda: SimpleNamespace(model_api_key=None, model_name=None, model_api_base_url="http://model.test/v1"),
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/teacher/analytics/question-insights/diagnose",
            headers=TEACHER,
            json={"course_id": "course-ds", "class_id": "class-se1"},
        )

    assert response.status_code == 503
    assert "未配置真实模型" in response.json()["detail"]
