"""通用模型客户端。

改造前传输代码写在 `services/model_gateway.py` 里，和诊断的 payload 构造、
输出校验缠在一起，第二个工作流只能再抄一份。这里把「发请求 / 重试 / 分类失败 /
记录耗时与 token」抽成与业务无关的一层。

结构：async 内核 + sync 桥。
- `chat_json` / `request_json` 是 async 的，将来 AI 导师的 SSE 端点直接用；
- `chat_json_sync` / `request_json_sync` 是 `asyncio.run(内核)` 三行桥，
  给现在跑在 `BackgroundTasks` sync 回调（anyio worker 线程，无 running loop）
  里的诊断路径用。`run_execution` 及其调用链一行都不用改。

模块级 `_post_json` 是唯一的可替换 seam：测试 patch 它就能覆盖全部错误路径，
不碰真实网络。
"""

import asyncio
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx

from backend.app.ai.errors import (
    LLMError,
    LLMHTTPError,
    LLMInvalidJSON,
    LLMNotConfigured,
    LLMSchemaInvalid,
    LLMTimeout,
)
from backend.app.models.entities import utc_now


DEFAULT_TIMEOUT = 30.0
DEFAULT_RETRIES = 1


@dataclass
class LLMResult:
    """一次成功调用的全部可观测信息。

    `data` 是 validator 的返回值（没有 validator 时是原始 dict）。
    其余字段直接落 `agent_runs`，用来算失败率、调 prompt、算成本。
    """

    data: Any
    model_provider: str
    model_name: str
    prompt_version: str = ""
    attempts: int = 1
    started_at: datetime | None = None
    finished_at: datetime | None = None
    token_prompt: int | None = None
    token_completion: int | None = None
    raw_body: dict[str, Any] = field(default_factory=dict)

    @property
    def duration_ms(self) -> int | None:
        if not self.started_at or not self.finished_at:
            return None
        return max(0, int((self.finished_at - self.started_at).total_seconds() * 1000))


async def _post_json(
    url: str,
    *,
    json: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """唯一的网络出口。测试 patch 这个函数，不 patch httpx。"""
    async with httpx.AsyncClient(trust_env=False) as client:
        response = await client.post(url, json=json, headers=headers, timeout=timeout)
        response.raise_for_status()
        return response.json()


async def _stream_json_lines(
    url: str,
    *,
    json: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
):
    """OpenAI-compatible SSE stream出口。测试可 patch 这个函数。"""
    async with httpx.AsyncClient(trust_env=False) as client:
        async with client.stream("POST", url, json=json, headers=headers, timeout=timeout) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[len("data:"):].strip()
                if not data or data == "[DONE]":
                    continue
                yield json_module_loads(data)


def json_module_loads(data: str) -> dict[str, Any]:
    value = json.loads(data)
    if not isinstance(value, dict):
        raise ValueError("stream data is not a JSON object")
    return value


def openai_usage(body: dict[str, Any]) -> tuple[int | None, int | None]:
    usage = body.get("usage") or {}
    if not isinstance(usage, dict):
        return None, None
    prompt = usage.get("prompt_tokens")
    completion = usage.get("completion_tokens")
    return (
        int(prompt) if isinstance(prompt, (int, float)) else None,
        int(completion) if isinstance(completion, (int, float)) else None,
    )


def _http_error_detail(response: httpx.Response) -> str:
    base = f"HTTP {response.status_code}"
    try:
        payload = response.json()
    except ValueError:
        text = response.text.strip()
        return f"{base}: {text[:500]}" if text else base

    if not isinstance(payload, dict):
        return base
    error = payload.get("error")
    if isinstance(error, dict):
        code = error.get("code") or error.get("type")
        message = error.get("message")
        parts = [str(item) for item in (code, message) if item]
        request_id = payload.get("request_id") or payload.get("id")
        if request_id:
            parts.append(f"request_id={request_id}")
        return f"{base}: {' | '.join(parts)}" if parts else base
    return f"{base}: {json.dumps(payload, ensure_ascii=False)[:500]}"


async def _send_once(
    url: str,
    *,
    body: dict[str, Any],
    headers: dict[str, str] | None,
    timeout: float,
) -> dict[str, Any]:
    """发一次请求，把 httpx 的异常翻译成 `errors.py` 的分类异常。"""
    try:
        return await _post_json(url, json=body, headers=headers, timeout=timeout)
    except httpx.TimeoutException as exc:
        raise LLMTimeout("模型请求超时", detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise LLMHTTPError(
            "模型返回非 2xx",
            status_code=exc.response.status_code,
            detail=_http_error_detail(exc.response),
        ) from exc
    except httpx.HTTPError as exc:
        raise LLMHTTPError("模型请求传输失败", detail=str(exc)) from exc
    except ValueError as exc:  # 含 json.JSONDecodeError
        raise LLMInvalidJSON("模型响应不是合法 JSON", detail=str(exc)) from exc


async def _call_json(
    url: str,
    *,
    body: dict[str, Any],
    parse: Callable[[dict[str, Any]], dict[str, Any]],
    validator: Callable[[dict[str, Any]], Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = DEFAULT_RETRIES,
    usage: Callable[[dict[str, Any]], tuple[int | None, int | None]] = openai_usage,
    prompt_version: str = "",
    model_provider: str = "",
    model_name: str = "",
) -> LLMResult:
    """带重试的单次逻辑调用。

    重试只对**瞬时**失败生效（超时、传输失败、5xx、响应不是 JSON）。
    `LLMSchemaInvalid` 不重试 —— 同一份 prompt 再来一次大概率还是同样不合规，
    重试只会把学生的等待时间乘以次数。
    """
    started_at = utc_now()
    attempts = 0
    max_attempts = max(1, retries + 1)
    while True:
        attempts += 1
        try:
            raw_body = await _send_once(url, body=body, headers=headers, timeout=timeout)
            try:
                raw = parse(raw_body)
            except LLMError:
                raise
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                raise LLMInvalidJSON("模型响应缺少约定字段", detail=str(exc)) from exc

            data = raw
            if validator is not None:
                try:
                    data = validator(raw)
                except ValueError as exc:
                    raise LLMSchemaInvalid("模型输出未通过 schema 校验", detail=str(exc)) from exc

            token_prompt, token_completion = usage(raw_body)
            return LLMResult(
                data=data,
                model_provider=model_provider,
                model_name=model_name,
                prompt_version=prompt_version,
                attempts=attempts,
                started_at=started_at,
                finished_at=utc_now(),
                token_prompt=token_prompt,
                token_completion=token_completion,
                raw_body=raw_body if isinstance(raw_body, dict) else {},
            )
        except LLMError as exc:
            if not exc.retryable or attempts >= max_attempts:
                exc.attempts = attempts
                raise


def _parse_openai_content(body: dict[str, Any]) -> dict[str, Any]:
    content = body["choices"][0]["message"]["content"]
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    parsed = json.loads(str(content))
    if not isinstance(parsed, dict):
        raise ValueError("模型输出不是 JSON 对象")
    return parsed


async def chat_json(
    messages: list[dict[str, Any]],
    *,
    model: str,
    api_key: str | None = None,
    base_url: str = "https://api.openai.com/v1",
    validator: Callable[[dict[str, Any]], Any] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = DEFAULT_RETRIES,
    temperature: float = 0.1,
    response_format: dict[str, Any] | None = None,
    parse: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    prompt_version: str = "",
    model_provider: str = "OPENAI_COMPATIBLE",
) -> LLMResult:
    """OpenAI 兼容的 `/chat/completions` 调用，返回校验后的 JSON。"""
    if not api_key:
        raise LLMNotConfigured("未配置模型 API Key")
    body: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "response_format": response_format or {"type": "json_object"},
        "messages": messages,
    }
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else None
    return await _call_json(
        f"{base_url.rstrip('/')}/chat/completions",
        body=body,
        parse=parse or _parse_openai_content,
        validator=validator,
        headers=headers,
        timeout=timeout,
        retries=retries,
        prompt_version=prompt_version,
        model_provider=model_provider,
        model_name=model,
    )


async def chat_text_stream(
    messages: list[dict[str, Any]],
    *,
    model: str,
    api_key: str | None = None,
    base_url: str = "https://api.openai.com/v1",
    timeout: float = DEFAULT_TIMEOUT,
    temperature: float = 0.2,
):
    """OpenAI 兼容的原生文本流式输出。逐段 yield `delta.content`。"""
    if not api_key:
        raise LLMNotConfigured("未配置模型 API Key")
    body: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "stream": True,
        "messages": messages,
    }
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        async for chunk in _stream_json_lines(
            f"{base_url.rstrip('/')}/chat/completions",
            json=body,
            headers=headers,
            timeout=timeout,
        ):
            choices = chunk.get("choices")
            if not isinstance(choices, list) or not choices:
                continue
            delta = choices[0].get("delta") if isinstance(choices[0], dict) else None
            if not isinstance(delta, dict):
                continue
            content = delta.get("content")
            if isinstance(content, str) and content:
                yield content
    except httpx.TimeoutException as exc:
        raise LLMTimeout("模型流式请求超时", detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise LLMHTTPError(
            "模型流式返回非 2xx",
            status_code=exc.response.status_code,
            detail=str(exc),
        ) from exc
    except httpx.HTTPError as exc:
        raise LLMHTTPError("模型流式请求传输失败", detail=str(exc)) from exc
    except ValueError as exc:
        raise LLMInvalidJSON("模型流式响应不是合法 JSON", detail=str(exc)) from exc


async def request_json(
    url: str,
    *,
    payload: dict[str, Any],
    validator: Callable[[dict[str, Any]], Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 20.0,
    retries: int = DEFAULT_RETRIES,
    unwrap_key: str | None = "data",
    prompt_version: str = "",
    model_provider: str = "MODEL_GATEWAY",
    model_name: str = "",
) -> LLMResult:
    """自建模型网关调用：直接 POST 业务 payload，从 `data` 取结果。"""

    def parse(body: dict[str, Any]) -> dict[str, Any]:
        raw = body
        if unwrap_key and isinstance(body, dict):
            raw = body.get(unwrap_key, body)
        if not isinstance(raw, dict):
            raise ValueError("网关响应不是 JSON 对象")
        return raw

    return await _call_json(
        url,
        body=payload,
        parse=parse,
        validator=validator,
        headers=headers,
        timeout=timeout,
        retries=retries,
        prompt_version=prompt_version,
        model_provider=model_provider,
        model_name=model_name,
    )


def _run_sync(coro):
    """sync 桥。只能在没有 running loop 的线程里调用。

    诊断路径跑在 `BackgroundTasks` 的 sync 回调里 —— 那是 anyio worker 线程，
    没有 running loop，`asyncio.run` 可用。如果哪天有人从事件循环里调它，
    这里给出的报错要能直接指向 async 内核，而不是 asyncio 的原始报错。
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    coro.close()
    raise RuntimeError(
        "chat_json_sync / request_json_sync 不能在事件循环内调用，请直接 await async 内核"
    )


def chat_json_sync(messages: list[dict[str, Any]], **kwargs) -> LLMResult:
    return _run_sync(chat_json(messages, **kwargs))


def request_json_sync(url: str, **kwargs) -> LLMResult:
    return _run_sync(request_json(url, **kwargs))
