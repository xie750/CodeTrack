import json

from fastapi.testclient import TestClient

from backend.app.ai import llm_client
from backend.app.core.config import get_settings
from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import AgentRun, AiTutorMessage, AiTutorSession


STUDENT = {"X-Demo-User-Id": "user_student_001"}


def test_student_ai_chat_reports_missing_model_config(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/student/ai-chat",
            headers=STUDENT,
            json={"message": "边界测试为什么要结合等价类？", "course_id": "course_ds_001"},
        )

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "AI_MODEL_NOT_CONFIGURED"
    assert "CODETRACK_MODEL_API_KEY" in body["error"]["details"]["missing"]
    assert "CODETRACK_MODEL_NAME" in body["error"]["details"]["missing"]


def test_student_ai_chat_calls_openai_compatible_model(monkeypatch):
    calls = []
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-test")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "test-chat-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://model.test/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    async def fake_post(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        calls.append({"url": url, "body": json, "headers": headers, "timeout": timeout})
        return {
            "choices": [
                {
                    "message": {
                        "content": json_module.dumps(
                            {
                                "answer": "边界测试先找临界点，等价类划分先确定输入类别，两者结合能减少遗漏。",
                                "confidence": 0.82,
                                "knowledge_source_ids": ["kb_boundary_test_reasoning"],
                                "suggested_actions": ["生成练习", "保存为笔记"],
                                "profile_used": True,
                                "source_used": True,
                                "safety_note": "",
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ],
            "usage": {"prompt_tokens": 100, "completion_tokens": 30},
        }

    json_module = json
    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/student/ai-chat",
            headers=STUDENT,
            json={"message": "边界测试为什么要结合等价类？", "course_id": "course_ds_001"},
        )

    assert response.status_code == 200
    data = response.json()["data"]
    assert "边界测试" in data["answer"]
    assert data["confidence"] == 0.82
    assert data["source_used"] is True
    assert data["profile_used"] is True
    assert data["citations"][0]["source_id"] == "kb_boundary_test_reasoning"
    assert data["suggested_actions"] == ["生成练习", "保存为笔记"]
    assert data["run_id"].startswith("run_")

    assert calls[0]["url"] == "https://model.test/v1/chat/completions"
    assert calls[0]["headers"] == {"Authorization": "Bearer sk-test"}
    assert calls[0]["body"]["model"] == "test-chat-model"
    prompt_text = calls[0]["body"]["messages"][1]["content"]
    assert "边界测试为什么要结合等价类" in prompt_text
    assert "kb_boundary_test_reasoning" in prompt_text
    assert "CODETRACK_MODEL_API_KEY" not in prompt_text

    db = SessionLocal()
    try:
        run = db.get(AgentRun, data["run_id"])
        assert run is not None
        assert run.workflow_type == "student_ai_tutor_chat"
        assert run.status == "SUCCEEDED"
        assert run.model_name == "test-chat-model"
        assert run.token_prompt == 100
        assert run.token_completion == 30
    finally:
        db.close()


def test_student_ai_chat_stream_persists_session_and_messages(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-test")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "test-chat-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://model.test/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    async def fake_stream(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        assert json["stream"] is True
        yield {"choices": [{"delta": {"content": "边界测试要先找临界点。"}}]}
        yield {"choices": [{"delta": {"content": "再结合等价类减少遗漏。"}}]}

    async def fake_post(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        return {
            "choices": [
                {
                    "message": {
                        "content": json_module.dumps(
                            {
                                "confidence": 0.88,
                                "knowledge_source_ids": ["kb_boundary_test_reasoning"],
                                "suggested_actions": ["继续解释", "生成练习"],
                                "profile_used": True,
                                "source_used": True,
                                "safety_note": "",
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ],
            "usage": {"prompt_tokens": 90, "completion_tokens": 20},
        }

    json_module = json
    monkeypatch.setattr(llm_client, "_stream_json_lines", fake_stream)
    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/student/ai-chat/stream",
            headers=STUDENT,
            json={"message": "边界测试怎么理解？", "course_id": "course_ds_001"},
        )
        assert response.status_code == 200
        stream_text = response.text
        assert "event: session" in stream_text
        assert "event: delta" in stream_text
        assert "event: final" in stream_text

        sessions = client.get("/api/v1/student/ai-chat/sessions?course_id=course_ds_001", headers=STUDENT)
        assert sessions.status_code == 200
        session_id = sessions.json()["data"][0]["id"]
        detail = client.get(f"/api/v1/student/ai-chat/sessions/{session_id}", headers=STUDENT)
        assert detail.status_code == 200
        messages = detail.json()["data"]["messages"]
        assert [item["role"] for item in messages[-2:]] == ["student", "assistant"]
        assert messages[-1]["content"] == "边界测试要先找临界点。再结合等价类减少遗漏。"
        assert messages[-1]["metadata"]["confidence"] == 0.88

    db = SessionLocal()
    try:
        assert db.get(AiTutorSession, session_id) is not None
        message_count = db.query(AiTutorMessage).filter(AiTutorMessage.session_id == session_id).count()
        assert message_count >= 2
    finally:
        db.close()


def test_student_ai_chat_session_can_be_deleted(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-test")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "test-chat-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://model.test/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    async def fake_stream(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        yield {"choices": [{"delta": {"content": "可以。"}}]}

    async def fake_post(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        return {
            "choices": [
                {
                    "message": {
                        "content": json_module.dumps(
                            {
                                "confidence": 0.8,
                                "knowledge_source_ids": [],
                                "suggested_actions": ["继续追问"],
                                "profile_used": True,
                                "source_used": False,
                                "safety_note": "",
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ],
            "usage": {},
        }

    json_module = json
    monkeypatch.setattr(llm_client, "_stream_json_lines", fake_stream)
    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/student/ai-chat/stream",
            headers=STUDENT,
            json={"message": "测试删除会话", "course_id": "course_ds_001"},
        )
        assert response.status_code == 200
        sessions = client.get("/api/v1/student/ai-chat/sessions?course_id=course_ds_001", headers=STUDENT).json()["data"]
        session_id = sessions[0]["id"]
        deleted = client.delete(f"/api/v1/student/ai-chat/sessions/{session_id}", headers=STUDENT)
        assert deleted.status_code == 200
        sessions_after = client.get("/api/v1/student/ai-chat/sessions?course_id=course_ds_001", headers=STUDENT).json()["data"]
        assert all(item["id"] != session_id for item in sessions_after)
        detail = client.get(f"/api/v1/student/ai-chat/sessions/{session_id}", headers=STUDENT)
        assert detail.status_code == 404
