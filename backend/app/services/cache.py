from __future__ import annotations

import hashlib
import json
import time
from functools import lru_cache
from typing import Any, Callable, TypeVar

from redis import Redis
from redis.exceptions import RedisError

from backend.app.core.config import get_settings


T = TypeVar("T")

_disabled_until = 0.0


def stable_cache_key(namespace: str, *parts: object) -> str:
    raw = json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"codetrack:{namespace}:{digest}"


@lru_cache(maxsize=1)
def _redis_client() -> Redis | None:
    url = (get_settings().redis_url or "").strip()
    if not url:
        return None
    return Redis.from_url(
        url,
        decode_responses=True,
        socket_connect_timeout=0.05,
        socket_timeout=0.05,
        retry_on_timeout=False,
    )


def _client() -> Redis | None:
    if time.monotonic() < _disabled_until:
        return None
    return _redis_client()


def _trip_breaker() -> None:
    global _disabled_until
    _disabled_until = time.monotonic() + 10


def get_json(key: str) -> Any | None:
    client = _client()
    if client is None:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except (RedisError, TypeError, ValueError):
        _trip_breaker()
        return None


def set_json(key: str, value: Any, ttl_seconds: int) -> None:
    client = _client()
    if client is None:
        return
    try:
        client.setex(key, ttl_seconds, json.dumps(value, ensure_ascii=False, default=str))
    except (RedisError, TypeError, ValueError):
        _trip_breaker()


def remember_json(key: str, ttl_seconds: int, factory: Callable[[], T]) -> T:
    cached = get_json(key)
    if cached is not None:
        return cached
    value = factory()
    set_json(key, value, ttl_seconds)
    return value


def invalidate_prefix(prefix: str) -> None:
    client = _client()
    if client is None:
        return
    try:
        for key in client.scan_iter(match=f"{prefix}*", count=200):
            client.delete(key)
    except RedisError:
        _trip_breaker()
