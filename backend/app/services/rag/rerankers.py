from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from backend.app.core.config import get_settings
from backend.app.services.rag.utils import tokenize_query


@dataclass
class RerankResult:
    index: int
    score: float


class Reranker(Protocol):
    def rerank(self, query: str, passages: list[str], top_n: int) -> list[RerankResult]:
        ...


class LexicalReranker:
    def rerank(self, query: str, passages: list[str], top_n: int) -> list[RerankResult]:
        terms = tokenize_query(query)
        results: list[RerankResult] = []
        for index, passage in enumerate(passages):
            lowered = passage.lower()
            hits = sum(lowered.count(term.lower()) for term in terms)
            score = hits / max(len(terms), 1)
            results.append(RerankResult(index=index, score=float(score)))
        return sorted(results, key=lambda item: item.score, reverse=True)[:top_n]


class BgeReranker:
    def __init__(self, model_name: str):
        try:
            from sentence_transformers import CrossEncoder
        except ImportError as exc:
            raise RuntimeError("sentence-transformers is required for BGE reranker") from exc
        self._model = CrossEncoder(model_name)

    def rerank(self, query: str, passages: list[str], top_n: int) -> list[RerankResult]:
        pairs = [(query, passage) for passage in passages]
        scores = self._model.predict(pairs)
        results = [RerankResult(index=index, score=float(score)) for index, score in enumerate(scores)]
        return sorted(results, key=lambda item: item.score, reverse=True)[:top_n]


@lru_cache(maxsize=4)
def get_reranker(provider_name: str | None = None) -> Reranker:
    settings = get_settings()
    provider = provider_name or settings.rerank_provider
    if provider in {"lexical", "hash", "local"}:
        return LexicalReranker()
    if provider in {"bge", "bge_m3", "bge-reranker"}:
        return BgeReranker(settings.rerank_model)
    raise ValueError(f"unknown rerank provider: {provider}")
