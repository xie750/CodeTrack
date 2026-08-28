from __future__ import annotations

import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from teacher_backend.app.main import app


TEACHER = {"X-User-Id": "teacher-01"}


def parse_sse_events(text: str):
    events = []
    for frame in text.strip().split("\n\n"):
        lines = frame.splitlines()
        event = next((line.removeprefix("event:").strip() for line in lines if line.startswith("event:")), None)
        data = "\n".join(line.removeprefix("data:").strip() for line in lines if line.startswith("data:"))
        if event and data:
            events.append({"event": event, "data": json.loads(data)})
    return events


def test_teacher_ai_chat_calls_model_with_real_course_context(monkeypatch):
    captured = {}

    monkeypatch.setattr(
        "teacher_backend.app.teacher_ai.get_settings",
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
        assert payload["context"]["scope"]["course_id"] == "course-ds"
        assert payload["context"]["scope"]["class_id"] == "class-se1"
        source_ids = {item["id"] for item in payload["context"]["data_sources"]}
        assert {"class-roster", "task-submissions", "knowledge-materials"} <= source_ids
        return SimpleNamespace(
            data={
                "answer": "基于真实提交记录，王子轩和周昊然需要优先关注。",
                "confidence": 0.82,
                "citations": ["class-roster", "task-submissions"],
                "suggested_actions": ["查看学情分析", "进入 AI 审核"],
                "data_gaps": [],
            },
            model_provider="OPENAI_COMPATIBLE",
            model_name=kwargs["model"],
            duration_ms=120,
            token_prompt=300,
            token_completion=90,
        )

    monkeypatch.setattr("teacher_backend.app.teacher_ai.chat_json", fake_chat_json)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/teacher/ai-assistant/chat",
            headers=TEACHER,
            json={
                "course_id": "course-ds",
                "class_id": "class-se1",
                "message": "请分析风险学生",
                "history": [],
            },
        )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["content"].startswith("基于真实提交记录")
    assert data["model"]["name"] == "test-model"
    assert [item["id"] for item in data["citations"]] == ["class-roster", "task-submissions"]
    assert captured["kwargs"]["api_key"] == "test-key"


def test_teacher_ai_chat_requires_real_model_configuration(monkeypatch):
    monkeypatch.setattr(
        "teacher_backend.app.teacher_ai.get_settings",
        lambda: SimpleNamespace(model_api_key=None, model_name=None, model_api_base_url="http://model.test/v1"),
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/teacher/ai-assistant/chat",
            headers=TEACHER,
            json={"course_id": "course-ds", "class_id": "class-se1", "message": "请分析风险学生"},
        )

    assert response.status_code == 503
    assert "未配置真实模型" in response.json()["detail"]


def test_teacher_ai_stream_persists_session_and_messages(monkeypatch):
    captured = {}

    monkeypatch.setattr(
        "teacher_backend.app.teacher_ai.get_settings",
        lambda: SimpleNamespace(
            model_api_key="test-key",
            model_name="test-model",
            model_api_base_url="http://model.test/v1",
        ),
    )

    async def fake_chat_text_stream(messages, **kwargs):
        captured["stream_messages"] = messages
        captured["stream_kwargs"] = kwargs
        yield "第一段分析，"
        yield "第二段建议。"

    async def fake_chat_json(messages, **kwargs):
        payload = json.loads(messages[-1]["content"])
        assert payload["assistant_answer"] == "第一段分析，第二段建议。"
        return SimpleNamespace(
            data={
                "answer": payload["assistant_answer"],
                "confidence": 0.88,
                "citations": ["task-submissions"],
                "suggested_actions": ["查看学情分析"],
                "data_gaps": [],
            },
            model_provider="OPENAI_COMPATIBLE",
            model_name=kwargs["model"],
            duration_ms=80,
            token_prompt=220,
            token_completion=40,
        )

    monkeypatch.setattr("teacher_backend.app.teacher_ai.chat_text_stream", fake_chat_text_stream)
    monkeypatch.setattr("teacher_backend.app.teacher_ai.chat_json", fake_chat_json)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/teacher/ai-assistant/chat/stream",
            headers=TEACHER,
            json={
                "course_id": "course-ds",
                "class_id": "class-se1",
                "message": "流式测试：请分析风险学生",
                "history": [],
            },
        )
        assert response.status_code == 200
        events = parse_sse_events(response.content.decode("utf-8"))
        assert [item["event"] for item in events] == ["session", "assistant_start", "delta", "delta", "final"]
        assert events[2]["data"]["content"] == "第一段分析，"
        assert events[-1]["data"]["content"] == "第一段分析，第二段建议。"
        assert events[-1]["data"]["model"]["name"] == "test-model"

        session_id = events[0]["data"]["session"]["id"]
        detail = client.get(f"/api/v1/teacher/ai-assistant/sessions/{session_id}", headers=TEACHER)
        assert detail.status_code == 200
        messages = detail.json()["data"]["messages"]
        assert [item["role"] for item in messages] == ["teacher", "assistant"]
        assert messages[0]["content"] == "流式测试：请分析风险学生"
        assert messages[1]["content"] == "第一段分析，第二段建议。"
        assert captured["stream_kwargs"]["api_key"] == "test-key"


def test_teacher_ai_session_history_can_be_created_listed_and_deleted():
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/teacher/ai-assistant/sessions",
            headers=TEACHER,
            json={
                "course_id": "course-ds",
                "class_id": "class-se1",
                "first_message": "历史会话测试入口",
                "title": "历史会话测试",
            },
        )
        assert created.status_code == 200
        session = created.json()["data"]

        listed = client.get(
            "/api/v1/teacher/ai-assistant/sessions?course_id=course-ds&class_id=class-se1&q=历史会话测试",
            headers=TEACHER,
        )
        assert listed.status_code == 200
        assert any(item["id"] == session["id"] for item in listed.json()["data"])

        detail = client.get(f"/api/v1/teacher/ai-assistant/sessions/{session['id']}", headers=TEACHER)
        assert detail.status_code == 200
        assert detail.json()["data"]["session"]["title"] == "历史会话测试"

        deleted = client.delete(f"/api/v1/teacher/ai-assistant/sessions/{session['id']}", headers=TEACHER)
        assert deleted.status_code == 200
        missing = client.get(f"/api/v1/teacher/ai-assistant/sessions/{session['id']}", headers=TEACHER)
        assert missing.status_code == 404
