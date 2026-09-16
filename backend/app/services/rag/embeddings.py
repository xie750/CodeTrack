from __future__ import annotations

import hashlib
import math
from functools import lru_cache
from typing import Protocol

from backend.app.core.config import get_settings
from backend.app.services.rag.utils import tokenize_query


HASH_MODEL = "codetrack-hash-embedding-v2"


def configured_model(provider: str, model: str) -> str:
    return HASH_MODEL if provider in {"hash", "local_hash"} else model


def validate_embeddings(vectors: list[list[float]], count: int, dim: int) -> list[list[float]]:
    if len(vectors) != count:
        raise ValueError(f"embedding count mismatch: expected {count}, got {len(vectors)}")
    result = []
    for vector in vectors:
        if len(vector) != dim or not all(math.isfinite(value) for value in vector):
            raise ValueError("embedding must have the configured dimension and finite values")
        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            raise ValueError("embedding must not be a zero vector")
        result.append([value / norm for value in vector])
    return result


class EmbeddingProvider(Protocol):
    model_name: str
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]:
        ...


class HashEmbeddingProvider:
    model_name = HASH_MODEL

    def __init__(self, dim: int = 1024):
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            values = [0.0] * self.dim
            for token in tokenize_query(text):
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

    embed_query = embed
    embed_documents = embed


class BgeM3EmbeddingProvider:
    def __init__(self, model_name: str, dim: int):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError("sentence-transformers is required for BGE-M3 embeddings") from exc
        self.model_name = model_name
        self.dim = dim
        import torch
        torch.set_num_threads(get_settings().rag_model_threads)
        self._model = SentenceTransformer(model_name, local_files_only=get_settings().rag_model_local_files_only)
        dimension = getattr(self._model, "get_embedding_dimension", self._model.get_sentence_embedding_dimension)
        actual_dim = dimension()
        if actual_dim != dim:
            raise ValueError(f"embedding dim mismatch: configured {dim}, model produces {actual_dim}")

    def embed(self, texts: list[str]) -> list[list[float]]:
        return self.embed_documents(texts)

    def _encode(self, texts: list[str], task: str) -> list[list[float]]:
        if not texts:
            return []
        lengths = self._model.tokenizer(texts, truncation=False, add_special_tokens=True)["input_ids"]
        if any(len(tokens) > self._model.max_seq_length for tokens in lengths):
            raise ValueError("embedding input exceeds model token limit; re-chunk the document")
        encoder = getattr(self._model, f"encode_{task}", self._model.encode)
        vectors = encoder(texts, normalize_embeddings=True, show_progress_bar=False,
                          batch_size=get_settings().embedding_batch_size)
        return validate_embeddings([list(map(float, vector)) for vector in vectors], len(texts), self.dim)

    def embed_query(self, texts: list[str]) -> list[list[float]]:
        return self._encode(texts, "query")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._encode(texts, "document")


def get_embedding_provider(provider_name: str | None = None, model_name: str | None = None,
                           dim: int | None = None) -> EmbeddingProvider:
    settings = get_settings()
    provider = provider_name or settings.embedding_provider
    return _get_embedding_provider(provider, model_name or settings.embedding_model, dim or settings.embedding_dim)


@lru_cache(maxsize=4)
def _get_embedding_provider(provider: str, model: str, dim: int) -> EmbeddingProvider:
    if provider in {"hash", "local_hash"}:
        return HashEmbeddingProvider(dim)
    if provider in {"bge", "bge_m3", "bge-m3"}:
        return BgeM3EmbeddingProvider(model, dim)
    raise ValueError(f"unknown embedding provider: {provider}")
