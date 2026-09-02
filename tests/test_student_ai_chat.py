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
    assert 0.7 <= data["confidence"] < 0.9
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


def test_student_ai_chat_lists_switchable_models(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-general")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "general-chat-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://general.model/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_FINE_TUNED_MODEL_API_KEY", "sk-fine")
    monkeypatch.setenv("CODETRACK_FINE_TUNED_MODEL_NAME", "/models/codetrack-q4_k_m.gguf")
    monkeypatch.setenv("CODETRACK_FINE_TUNED_MODEL_API_BASE_URL", "http://codetrack-model:8080/v1")
    monkeypatch.setenv("CODETRACK_FINE_TUNED_MODEL_LABEL", "CodeTrack 微调模型")
    get_settings.cache_clear()

    with TestClient(app) as client:
        response = client.get("/api/v1/student/ai-chat/models", headers=STUDENT)

    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert [item["key"] for item in items] == ["default", "fine_tuned"]
    assert items[0]["label"] == "通用模型"
    assert items[0]["configured"] is True
    assert items[0]["model_name"] == "general-chat-model"
    assert items[1]["label"] == "CodeTrack 微调模型"
    assert items[1]["configured"] is True
    assert items[1]["model_name"] == "/models/codetrack-q4_k_m.gguf"


def test_student_ai_chat_can_use_fine_tuned_model(monkeypatch):
    calls = []
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-general")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "general-chat-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://general.model/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_FINE_TUNED_MODEL_API_KEY", "sk-fine")
    monkeypatch.setenv("CODETRACK_FINE_TUNED_MODEL_NAME", "/models/codetrack-q4_k_m.gguf")
    monkeypatch.setenv("CODETRACK_FINE_TUNED_MODEL_API_BASE_URL", "http://codetrack-model:8080/v1")
    monkeypatch.setenv("CODETRACK_FINE_TUNED_MODEL_LABEL", "CodeTrack 微调模型")
    get_settings.cache_clear()

    async def fake_stream(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        calls.append({"url": url, "body": json, "headers": headers})
        yield {"choices": [{"delta": {"content": "微调模型会优先按课程任务场景解释边界测试。"}}]}

    monkeypatch.setattr(llm_client, "_stream_json_lines", fake_stream)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/student/ai-chat",
            headers=STUDENT,
            json={
                "message": "边界测试为什么要结合等价类？",
                "course_id": "course_ds_001",
                "model_key": "fine_tuned",
            },
        )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["model_key"] == "fine_tuned"
    assert data["model_label"] == "CodeTrack 微调模型"
    assert data["model_name"] == "/models/codetrack-q4_k_m.gguf"
    assert calls[0]["url"] == "http://codetrack-model:8080/v1/chat/completions"
    assert calls[0]["headers"] == {"Authorization": "Bearer sk-fine"}
    assert calls[0]["body"]["model"] == "/models/codetrack-q4_k_m.gguf"
    assert calls[0]["body"]["stream"] is True
    assert calls[0]["body"]["max_tokens"] == 192


def test_student_ai_chat_can_cite_personal_knowledge_base(monkeypatch):
    calls = []
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-test")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "test-chat-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://model.test/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    async def fake_post(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        prompt_text = json["messages"][1]["content"]
        payload_text = prompt_text.split("\n\n", 1)[1]
        payload = json_module.loads(payload_text)
        personal_sources = payload["personal_knowledge_sources"]
        assert personal_sources
        assert "王者荣耀安琪拉是男的" in personal_sources[0]["content"]
        calls.append(payload)
        return {
            "choices": [
                {
                    "message": {
                        "content": json_module.dumps(
                            {
                                "answer": "根据你的个人知识库记录，王者荣耀安琪拉是男的。",
                                "confidence": 0.35,
                                "knowledge_source_ids": [],
                                "personal_knowledge_source_ids": [personal_sources[0]["source_id"]],
                                "suggested_actions": ["继续追问", "保存为笔记"],
                                "profile_used": True,
                                "source_used": True,
                                "safety_note": "",
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ],
            "usage": {"prompt_tokens": 80, "completion_tokens": 20},
        }

    json_module = json
    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with TestClient(app) as client:
        kb = client.post("/api/v1/knowledge-bases", headers=STUDENT, json={"name": "AI 个人知识库"})
        assert kb.status_code == 200, kb.text
        kb_id = kb.json()["data"]["id"]
        created = client.post(
            f"/api/v1/knowledge-bases/{kb_id}/documents/from-text?auto_process=false",
            headers=STUDENT,
            json={"title": "pasted-text", "content": "王者荣耀安琪拉是男的"},
        )
        assert created.status_code == 202, created.text
        document_id = created.json()["data"]["document_id"]
        processed = client.post(f"/api/v1/documents/{document_id}/process", headers=STUDENT)
        assert processed.status_code == 200, processed.text

        response = client.post(
            "/api/v1/student/ai-chat",
            headers=STUDENT,
            json={"message": "王者荣耀安琪拉是男的女的", "course_id": "course_ds_001"},
        )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert "安琪拉是男的" in data["answer"]
    assert data["confidence"] >= 0.9
    assert data["source_used"] is True
    assert data["citations"][0]["source_type"] == "STUDENT_KNOWLEDGE_BASE"
    assert data["citations"][0]["title"].startswith("我的知识库")
    assert calls


def test_student_ai_chat_retrieves_split_title_description_from_personal_kb(monkeypatch):
    calls = []
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-test")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "test-chat-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://model.test/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    async def fake_post(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        prompt_text = json["messages"][1]["content"]
        payload_text = prompt_text.split("\n\n", 1)[1]
        payload = json_module.loads(payload_text)
        personal_sources = payload["personal_knowledge_sources"]
        assert personal_sources
        assert "马可波罗" in personal_sources[0]["content"]
        assert "常见定位" in personal_sources[0]["content"]
        calls.append(payload)
        return {
            "choices": [
                {
                    "message": {
                        "content": json_module.dumps(
                            {
                                "answer": "根据你的个人知识库，马可波罗常见定位是射手，擅长移动中输出。",
                                "confidence": 0.2,
                                "knowledge_source_ids": [],
                                "personal_knowledge_source_ids": [personal_sources[0]["source_id"]],
                                "suggested_actions": ["继续追问", "保存为笔记"],
                                "profile_used": True,
                                "source_used": True,
                                "safety_note": "",
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ],
            "usage": {"prompt_tokens": 85, "completion_tokens": 20},
        }

    json_module = json
    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with TestClient(app) as client:
        kb = client.post("/api/v1/knowledge-bases", headers=STUDENT, json={"name": "王者荣耀英雄资料"})
        assert kb.status_code == 200, kb.text
        kb_id = kb.json()["data"]["id"]
        created = client.post(
            f"/api/v1/knowledge-bases/{kb_id}/documents/from-text?auto_process=false",
            headers=STUDENT,
            json={
                "title": "heroes",
                "content": (
                    "9. 鲁班七号\n\n"
                    "常见定位：射手，适合持续输出。\n\n"
                    "10. 马可波罗\n\n"
                    "常见定位：射手，马可波罗擅长移动中输出，具备较好的机动性和持续消耗能力。"
                ),
            },
        )
        assert created.status_code == 202, created.text
        document_id = created.json()["data"]["document_id"]
        processed = client.post(f"/api/v1/documents/{document_id}/process", headers=STUDENT)
        assert processed.status_code == 200, processed.text

        response = client.post(
            "/api/v1/student/ai-chat",
            headers=STUDENT,
            json={"message": "介绍一下马可波罗", "course_id": "course_ds_001"},
        )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert "移动中输出" in data["answer"]
    assert data["source_used"] is True
    assert data["confidence"] >= 0.9
    assert data["citations"][0]["source_type"] == "STUDENT_KNOWLEDGE_BASE"
    assert calls


def test_student_ai_chat_keeps_general_answer_low_confidence_without_sources(monkeypatch):
    calls = []
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-test")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "test-chat-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://model.test/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    async def fake_post(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        prompt_text = json["messages"][1]["content"]
        payload_text = prompt_text.split("\n\n", 1)[1]
        payload = json_module.loads(payload_text)
        assert payload["personal_knowledge_sources"] == []
        assert payload["knowledge_sources"] == []
        calls.append(payload)
        return {
            "choices": [
                {
                    "message": {
                        "content": json_module.dumps(
                            {
                                "answer": "火锅底料通常由牛油、辣椒、花椒和香辛料炒制而成。",
                                "confidence": 0.96,
                                "knowledge_source_ids": [],
                                "personal_knowledge_source_ids": [],
                                "suggested_actions": ["继续追问", "换个问题"],
                                "profile_used": False,
                                "source_used": False,
                                "safety_note": "",
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ],
            "usage": {"prompt_tokens": 70, "completion_tokens": 18},
        }

    json_module = json
    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/student/ai-chat",
            headers=STUDENT,
            json={"message": "火锅底料怎么做", "course_id": "course_ds_001"},
        )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert "火锅底料" in data["answer"]
    assert data["confidence"] <= 0.42
    assert data["source_used"] is False
    assert data["citations"] == []
    assert calls


def test_student_ai_chat_does_not_cite_unrelated_personal_knowledge_base(monkeypatch):
    calls = []
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-test")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "test-chat-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://model.test/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    async def fake_post(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        prompt_text = json["messages"][1]["content"]
        payload_text = prompt_text.split("\n\n", 1)[1]
        payload = json_module.loads(payload_text)
        assert payload["personal_knowledge_sources"] == []
        assert payload["knowledge_sources"] == []
        calls.append(payload)
        return {
            "choices": [
                {
                    "message": {
                        "content": json_module.dumps(
                            {
                                "answer": "李白是唐代诗人，字太白，号青莲居士。",
                                "confidence": 0.93,
                                "knowledge_source_ids": [],
                                "personal_knowledge_source_ids": [],
                                "suggested_actions": ["继续追问", "保存为笔记"],
                                "profile_used": False,
                                "source_used": False,
                                "safety_note": "",
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ],
            "usage": {"prompt_tokens": 75, "completion_tokens": 18},
        }

    json_module = json
    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with TestClient(app) as client:
        kb = client.post("/api/v1/knowledge-bases", headers=STUDENT, json={"name": "CodeTrack 规格"})
        assert kb.status_code == 200, kb.text
        kb_id = kb.json()["data"]["id"]
        created = client.post(
            f"/api/v1/knowledge-bases/{kb_id}/documents/from-text?auto_process=false",
            headers=STUDENT,
            json={
                "title": "CodeTrack_RAG_知识库后端实现规格_v1",
                "content": (
                    "CodeTrack RAG 知识库后端实现规格。"
                    "文档生命周期包括 UPLOADED、QUEUED、PARSING、NORMALIZING、CHUNKING、EMBEDDING、READY。"
                    "删除时 READY 进入 DELETING，最终 DELETED。"
                ),
            },
        )
        assert created.status_code == 202, created.text
        document_id = created.json()["data"]["document_id"]
        processed = client.post(f"/api/v1/documents/{document_id}/process", headers=STUDENT)
        assert processed.status_code == 200, processed.text

        response = client.post(
            "/api/v1/student/ai-chat",
            headers=STUDENT,
            json={"message": "帮我介绍一下李白", "course_id": "course_ds_001"},
        )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert "李白" in data["answer"]
    assert data["confidence"] <= 0.42
    assert data["source_used"] is False
    assert data["citations"] == []
    assert calls


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
        assert 0.7 <= messages[-1]["metadata"]["confidence"] < 0.9

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
