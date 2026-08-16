from __future__ import annotations

import hashlib
import math
from functools import lru_cache
from typing import Protocol

from backend.app.core.config import get_settings


class EmbeddingProvider(Protocol):
    model_name: str
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]:
        ...


class HashEmbeddingProvider:
    model_name = "codetrack-hash-embedding"

    def __init__(self, dim: int = 1024):
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            values = [0.0] * self.dim
            for token in text.lower().split():
                digest = hashlib.sha256(token.encode("utf-8")).digest()
                bucket = int.from_bytes(digest[:4], "big") % self.dim
                sign = 1.0 if digest[4] % 2 == 0 else -1.0
                values[bucket] += sign
            if not any(values):
                digest = hashlib.sha256(text.encode("utf-8")).digest()
                for index, byte in enumerate(digest):
                    values[index % self.dim] += (byte - 127) / 127
            norm = math.sqrt(sum(value * value for value in values)) or 1.0
            vectors.append([value / norm for value in values])
        return vectors


class BgeM3EmbeddingProvider:
    def __init__(self, model_name: str, dim: int):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError("sentence-transformers is required for BGE-M3 embeddings") from exc
        self.model_name = model_name
        self.dim = dim
        self._model = SentenceTransformer(model_name)

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors = self._model.encode(texts, normalize_embeddings=True)
        result = [list(map(float, vector)) for vector in vectors]
        for vector in result:
            if len(vector) != self.dim:
                raise ValueError(f"embedding dim mismatch: expected {self.dim}, got {len(vector)}")
        return result


@lru_cache(maxsize=4)
def get_embedding_provider(provider_name: str | None = None) -> EmbeddingProvider:
    settings = get_settings()
    provider = provider_name or settings.embedding_provider
    if provider in {"hash", "local_hash"}:
        return HashEmbeddingProvider(settings.embedding_dim)
    if provider in {"bge", "bge_m3", "bge-m3"}:
        return BgeM3EmbeddingProvider(settings.embedding_model, settings.embedding_dim)
    raise ValueError(f"unknown embedding provider: {provider}")
