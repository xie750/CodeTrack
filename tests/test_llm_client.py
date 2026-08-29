"""`ai/llm_client.py` 的错误路径覆盖。

全部 patch 模块级 `_post_json` seam，不碰真实网络。
重点是每条失败路径抛出**对应分类**的异常，而不是改造前那样统统 `return None`。
"""

import httpx
import pytest

from backend.app.ai import llm_client
from backend.app.ai.errors import (
    LLMHTTPError,
    LLMInvalidJSON,
    LLMNotConfigured,
    LLMSchemaInvalid,
    LLMTimeout,
)


def chat_body(payload: str) -> dict:
    return {
        "choices": [{"message": {"content": payload}}],
        "usage": {"prompt_tokens": 120, "completion_tokens": 34},
    }


def valid_content() -> str:
    return '{"diagnosis_type":"BOUNDARY_CASE_MISSING","confidence":0.7}'


@pytest.mark.parametrize(
    ("base_url", "expected"),
    [
        ("https://api.deepseek.com", "https://api.deepseek.com/chat/completions"),
        ("https://api.deepseek.com/responses", "https://api.deepseek.com/chat/completions"),
        ("https://api.deepseek.com/chat/completions", "https://api.deepseek.com/chat/completions"),
    ],
)
def test_chat_completions_url_normalizes_provider_base(base_url, expected):
    assert llm_client._chat_completions_url(base_url) == expected


async def test_chat_json_returns_validated_result(monkeypatch):
    calls = []

    async def fake_post(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        calls.append((url, json, headers, timeout))
        return chat_body(valid_content())

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    result = await llm_client.chat_json(
        [{"role": "user", "content": "hi"}],
        model="test-model",
        api_key="sk-test",
        base_url="https://api.test/v1",
        validator=lambda raw: raw["diagnosis_type"],
        prompt_version="diagnosis_v0.1",
    )

    assert result.data == "BOUNDARY_CASE_MISSING"
    assert result.attempts == 1
    assert result.model_name == "test-model"
    assert result.model_provider == "OPENAI_COMPATIBLE"
    assert result.prompt_version == "diagnosis_v0.1"
    assert result.token_prompt == 120
    assert result.token_completion == 34
    assert result.started_at is not None and result.finished_at is not None
    assert result.duration_ms is not None

    url, body, headers, _ = calls[0]
    assert url == "https://api.test/v1/chat/completions"
    assert headers == {"Authorization": "Bearer sk-test"}
    assert body["response_format"] == {"type": "json_object"}


async def test_chat_json_without_api_key_raises_not_configured():
    with pytest.raises(LLMNotConfigured):
        await llm_client.chat_json([{"role": "user", "content": "hi"}], model="test-model")


async def test_chat_json_maps_timeout(monkeypatch):
    async def fake_post(url, **kwargs):
        raise httpx.TimeoutException("too slow")

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with pytest.raises(LLMTimeout) as excinfo:
        await llm_client.chat_json(
            [{"role": "user", "content": "hi"}],
            model="test-model",
            api_key="sk-test",
            retries=0,
        )
    assert excinfo.value.code == "LLM_TIMEOUT"
    assert excinfo.value.attempts == 1


async def test_chat_json_retries_transient_failure_then_succeeds(monkeypatch):
    attempts = {"count": 0}

    async def fake_post(url, **kwargs):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise httpx.TimeoutException("first try times out")
        return chat_body(valid_content())

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    result = await llm_client.chat_json(
        [{"role": "user", "content": "hi"}],
        model="test-model",
        api_key="sk-test",
        retries=1,
    )
    assert attempts["count"] == 2
    assert result.attempts == 2


async def test_chat_json_does_not_retry_schema_failure(monkeypatch):
    attempts = {"count": 0}

    async def fake_post(url, **kwargs):
        attempts["count"] += 1
        return chat_body(valid_content())

    def reject(raw):
        raise ValueError("confidence out of range")

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with pytest.raises(LLMSchemaInvalid) as excinfo:
        await llm_client.chat_json(
            [{"role": "user", "content": "hi"}],
            model="test-model",
            api_key="sk-test",
            validator=reject,
            retries=3,
        )
    # schema 不合规重试没有意义，只调一次。
    assert attempts["count"] == 1
    assert excinfo.value.code == "LLM_SCHEMA_INVALID"


async def test_chat_json_maps_http_status_error(monkeypatch):
    async def fake_post(url, **kwargs):
        request = httpx.Request("POST", url)
        response = httpx.Response(429, request=request)
        raise httpx.HTTPStatusError("rate limited", request=request, response=response)

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with pytest.raises(LLMHTTPError) as excinfo:
        await llm_client.chat_json(
            [{"role": "user", "content": "hi"}],
            model="test-model",
            api_key="sk-test",
            retries=0,
        )
    assert excinfo.value.status_code == 429
    # 4xx 不该被当成瞬时故障重试
    assert excinfo.value.retryable is False


async def test_chat_json_maps_invalid_json_content(monkeypatch):
    async def fake_post(url, **kwargs):
        return chat_body("not json at all")

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with pytest.raises(LLMInvalidJSON):
        await llm_client.chat_json(
            [{"role": "user", "content": "hi"}],
            model="test-model",
            api_key="sk-test",
            retries=0,
        )


async def test_chat_text_stream_yields_delta_content(monkeypatch):
    async def fake_stream(url, *, json, headers=None, timeout=llm_client.DEFAULT_TIMEOUT):
        assert url == "https://api.test/v1/chat/completions"
        assert json["stream"] is True
        assert headers == {"Authorization": "Bearer sk-test"}
        yield {"choices": [{"delta": {"content": "第一段"}}]}
        yield {"choices": [{"delta": {"content": "第二段"}}]}
        yield {"choices": [{"delta": {}}]}

    monkeypatch.setattr(llm_client, "_stream_json_lines", fake_stream)

    chunks = []
    async for chunk in llm_client.chat_text_stream(
        [{"role": "user", "content": "hi"}],
        model="test-model",
        api_key="sk-test",
        base_url="https://api.test/v1",
    ):
        chunks.append(chunk)

    assert chunks == ["第一段", "第二段"]


async def test_request_json_unwraps_data_envelope(monkeypatch):
    async def fake_post(url, *, json, headers=None, timeout=20.0):
        return {"data": {"diagnosis_type": "BOUNDARY_CASE_MISSING"}}

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    result = await llm_client.request_json(
        "http://model.test/diagnose",
        payload={"task": {}},
        validator=lambda raw: raw["diagnosis_type"],
    )
    assert result.data == "BOUNDARY_CASE_MISSING"
    assert result.model_provider == "MODEL_GATEWAY"
    assert result.token_prompt is None


def test_request_json_sync_bridge_works_without_running_loop(monkeypatch):
    async def fake_post(url, *, json, headers=None, timeout=20.0):
        return {"data": {"ok": True}}

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    result = llm_client.request_json_sync("http://model.test/diagnose", payload={})
    assert result.data == {"ok": True}


async def test_sync_bridge_refuses_to_run_inside_event_loop(monkeypatch):
    async def fake_post(url, **kwargs):
        return {"data": {"ok": True}}

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    with pytest.raises(RuntimeError, match="不能在事件循环内调用"):
        llm_client.request_json_sync("http://model.test/diagnose", payload={})
