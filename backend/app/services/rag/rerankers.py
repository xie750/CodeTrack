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
        terms = set(tokenize_query(query))
        results: list[RerankResult] = []
        for index, passage in enumerate(passages):
            hits = len(terms.intersection(tokenize_query(passage)))
            score = hits / max(len(terms), 1)
            results.append(RerankResult(index=index, score=float(score)))
        return sorted(results, key=lambda item: item.score, reverse=True)[:top_n]


class BgeReranker:
    def __init__(self, model_name: str):
        try:
            from sentence_transformers import CrossEncoder
        except ImportError as exc:
            raise RuntimeError("sentence-transformers is required for BGE reranker") from exc
        import torch
        import inspect
        torch.set_num_threads(get_settings().rag_model_threads)
        activation_key = "activation_fn" if "activation_fn" in inspect.signature(CrossEncoder).parameters else "default_activation_function"
        self._model = CrossEncoder(model_name, local_files_only=get_settings().rag_model_local_files_only,
                                   **{activation_key: torch.nn.Sigmoid()})

    def rerank(self, query: str, passages: list[str], top_n: int) -> list[RerankResult]:
        if not passages or top_n <= 0:
            return []
        pairs = [(query, passage) for passage in passages]
        scores = self._model.predict(pairs, batch_size=get_settings().embedding_batch_size, show_progress_bar=False)
        results = [RerankResult(index=index, score=float(score)) for index, score in enumerate(scores)]
        return sorted(results, key=lambda item: item.score, reverse=True)[:top_n]


def get_reranker(provider_name: str | None = None) -> Reranker:
    settings = get_settings()
    provider = provider_name or settings.rerank_provider
    return _get_reranker(provider, settings.rerank_model)


@lru_cache(maxsize=4)
def _get_reranker(provider: str, model: str) -> Reranker:
    if provider in {"lexical", "hash", "local"}:
        return LexicalReranker()
    if provider in {"bge", "bge_m3", "bge-reranker"}:
        return BgeReranker(model)
    raise ValueError(f"unknown rerank provider: {provider}")
