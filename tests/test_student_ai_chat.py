import json

from fastapi.testclient import TestClient

from backend.app.ai import llm_client
from backend.app.core.config import get_settings
from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import AgentRun


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

