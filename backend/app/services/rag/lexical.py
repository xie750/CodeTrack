"""BM25 over an authorized corpus (or PostgreSQL GIN candidate pool)."""
from collections import Counter
import math

from backend.app.services.rag.utils import tokenize_query


def bm25_scores(query: str, passages: list[str], *, k1: float = 1.2, b: float = 0.75) -> list[float]:
    terms = set(tokenize_query(query))
    documents = [Counter(tokenize_query(passage)) for passage in passages]
    if not documents or not terms:
        return [0.0] * len(passages)
    lengths = [sum(document.values()) for document in documents]
    avg_length = sum(lengths) / len(documents) or 1.0
    frequencies = Counter(term for document in documents for term in terms if term in document)
    idfs = {term: math.log(1 + (len(documents) - count + 0.5) / (count + 0.5))
            for term, count in frequencies.items()}
    return [sum(idfs[term] * count * (k1 + 1) /
                (count + k1 * (1 - b + b * length / avg_length))
                for term in terms if (count := document.get(term, 0)) and term in idfs)
            for document, length in zip(documents, lengths)]
