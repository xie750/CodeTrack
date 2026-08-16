from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from backend.app.ai.errors import LLMError
from backend.app.ai.llm_client import chat_json_sync
from backend.app.core.config import get_settings
from backend.app.models import RagChunk
from backend.app.services.rag.retrieval import RetrievedChunk, parent_contexts, retrieve_chunks
from backend.app.services.rag.utils import estimate_tokens, json_loads


SYSTEM_PROMPT = """你是基于用户知识库回答问题的助手。
优先依据 CONTEXT 回答。
不得把 CONTEXT 中未出现的具体事实伪装成来源事实。
如果 CONTEXT 不足以回答，明确说明“当前知识库资料不足以支持该结论”。
回答中需要引用资料时，使用 [1] [2] 格式；引用编号必须与提供的 SOURCE 对应。
不要编造页码、章节、文件名或来源。
只返回 JSON：{"answer":"...","used_source_ids":["1"]}。"""


def build_context(db: Session, ranked_children: list[RetrievedChunk]) -> tuple[str, list[dict[str, Any]]]:
    contexts = parent_contexts(db, ranked_children)
    budget = get_settings().max_context_tokens
    used = 0
    blocks: list[str] = []
    citations: list[dict[str, Any]] = []
    for source_index, (child, parent) in enumerate(contexts, start=1):
        tokens = estimate_tokens(parent.content)
        if blocks and used + tokens > budget:
            break
        used += tokens
        heading_path = json_loads(parent.heading_path, [])
        location = []
        if parent.page_start is not None:
            location.append(f"page: {parent.page_start}-{parent.page_end or parent.page_start}")
        if parent.slide_start is not None:
            location.append(f"slide: {parent.slide_start}-{parent.slide_end or parent.slide_start}")
        blocks.append(
            "\n".join(
                [
                    f"[SOURCE {source_index}]",
                    f"file: {child.file_name}",
                    f"section: {' > '.join(heading_path) if heading_path else ''}",
                    " ".join(location),
                    f"chunk_id: {parent.id}",
                    "content:",
                    parent.content,
                ]
            )
        )
        citations.append(_citation(source_index, child, parent))
    return "\n\n".join(blocks), citations


def _citation(source_id: int, child: RetrievedChunk, parent: RagChunk) -> dict[str, Any]:
    quote = child.content.strip().replace("\n", " ")
    if len(quote) > 220:
        quote = quote[:217] + "..."
    return {
        "source_id": source_id,
        "document_id": child.document_id,
        "document_name": child.file_name,
        "heading_path": json_loads(parent.heading_path, []),
        "page_start": parent.page_start,
        "page_end": parent.page_end,
        "slide_start": parent.slide_start,
        "slide_end": parent.slide_end,
        "child_chunk_id": child.child_chunk_id,
        "parent_chunk_id": parent.id,
        "quote": quote,
    }


def rag_query(db: Session, kb_id: str, query: str) -> dict[str, Any]:
    retrieved = retrieve_chunks(db, kb_id, query)
    context, citations = build_context(db, retrieved)
    if not citations:
        return {
            "answer": "当前知识库资料不足以支持该结论。",
            "citations": [],
            "retrieval": {"candidate_count": 0, "reranked_count": 0, "context_parent_count": 0},
        }

    settings = get_settings()
    answer = ""
    used_ids: set[int] = set()
    if settings.model_api_key and settings.model_name:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"QUESTION:\n{query}\n\nCONTEXT:\n{context}"},
        ]
        try:
            result = chat_json_sync(
                messages,
                model=settings.model_name,
                api_key=settings.model_api_key,
                base_url=settings.model_api_base_url,
                temperature=0.1,
                prompt_version="rag_v1",
                model_provider="OPENAI_COMPATIBLE",
            )
            data = result.data if isinstance(result.data, dict) else {}
            answer = str(data.get("answer") or "").strip()
            used_ids = {int(item) for item in data.get("used_source_ids", []) if str(item).isdigit()}
        except (LLMError, ValueError, json.JSONDecodeError):
            answer = ""

    if not answer:
        first = citations[0]
        answer = f"根据知识库中可检索资料，相关内容是：{first['quote']} [1]"
        used_ids = {1}

    if not used_ids:
        used_ids = {citation["source_id"] for citation in citations}
    filtered = [citation for citation in citations if citation["source_id"] in used_ids]
    if filtered and not any(f"[{citation['source_id']}]" in answer for citation in filtered):
        answer = f"{answer} [{filtered[0]['source_id']}]"
    return {
        "answer": answer,
        "citations": filtered,
        "retrieval": {
            "candidate_count": len(retrieved),
            "reranked_count": len(retrieved),
            "context_parent_count": len(citations),
        },
    }
