from __future__ import annotations

import hashlib
import json
import re
import math
import unicodedata
from typing import Any
from uuid import uuid4


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def json_loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def estimate_tokens(text: str) -> int:
    # Conservative budget estimate, not a replacement for a model's tokenizer.
    parts = re.findall(r"[A-Za-z0-9_]+|[^\s]", text)
    return sum(max(1, math.ceil(len(part) / 4)) for part in parts)


def vector_to_db(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def vector_from_db(value: str | None) -> list[float]:
    if not value:
        return []
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1]
    if not value:
        return []
    return [float(item) for item in value.split(",")]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = sum(a * a for a in left) ** 0.5
    right_norm = sum(b * b for b in right) ** 0.5
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


def tokenize_query(text: str) -> list[str]:
    """Shared index/query analyzer: Chinese n-grams and exact code identifiers.

    No dictionary/model download; n-grams cover unseen subject terminology and
    avoid the old single-character matches dominating Chinese retrieval.
    """
    text = unicodedata.normalize("NFKC", text).lower()
    stopwords = {"the", "a", "an", "is", "are", "of", "to", "and", "what", "how",
                 "什么", "怎么", "如何", "为什么", "是否", "一个", "哪些", "可以", "中的"}
    terms: list[str] = []
    for part in re.findall(r"[a-z0-9_]+|[\u3400-\u9fff]+", text):
        if re.match(r"[a-z0-9_]", part):
            terms.append(part)
            if "_" in part:
                terms.extend(piece for piece in part.split("_") if piece)
        elif len(part) == 1:
            if part not in "的了是在与和及吗呢有为对中":
                terms.append(part)
        else:
            terms.extend(part[i:i + n] for n in (2, 3) for i in range(len(part) - n + 1))
    return [term for term in terms if term not in stopwords]


def retrieval_text(file_name: str, heading_path: list[str], content: str) -> str:
    """Deterministic source context for both dense and lexical indexes."""
    context = [file_name[:160], " > ".join(heading_path)[-240:]]
    return "\n".join(part for part in [*context, content] if part)
