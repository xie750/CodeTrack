"""Quality/safety regressions independent of external model downloads."""
from dataclasses import replace
from types import SimpleNamespace

import pytest

from backend.app.core.config import get_settings
from backend.app.services.rag import embeddings, rag_service, retrieval
from backend.app.services.rag.chunking import build_parent_child_chunks, split_text
from backend.app.services.rag.lexical import bm25_scores
from backend.app.services.rag.parsers import ParsedElement, parse_document
from backend.app.services.rag.profiles import detect_content_profile
from backend.app.services.rag.retrieval import RetrievedChunk, rrf_fusion
from backend.app.services.rag.utils import estimate_tokens, tokenize_query


def chunks(markdown):
    parsed = parse_document("lesson.md", markdown.encode())
    return build_parent_child_chunks(parsed.elements, detect_content_profile("lesson.md", parsed.elements))


def test_long_markdown_has_bounded_parents_children_and_complete_sentences():
    sentences = [f"第{i}条规律说明模型训练中的泛化误差需要使用独立验证集评估。" for i in range(230)]
    groups = chunks("# 机器学习\n\n## 泛化\n\n" + "".join(sentences))
    settings = get_settings()
    for parent, children in groups:
        assert len(parent.content) <= settings.parent_max_chars
        assert parent.token_count <= settings.parent_max_tokens
        for child in children:
            assert len(child.content) <= settings.child_max_chars
            assert child.token_count == estimate_tokens(child.content)
            assert child.token_count <= settings.child_max_tokens
    assert all(any(sentence in child.content for _, children in groups for child in children) for sentence in sentences)


@pytest.mark.parametrize("fence", ["```", "~~~~"])
def test_code_preserves_blank_lines_indentation_and_balanced_fences(fence):
    lines = [f"    result_{i} = values[{i}] + 1" for i in range(95)]
    body = "\n\n".join(lines)
    groups = chunks(f"# 示例\n\n{fence}python\n{body}\n{fence}\n")
    code = [c.content for _, children in groups for c in children if c.content_type == "code"]
    assert len(code) > 1
    assert all(text.count(fence) == 2 for text in code)
    assert all(any(line in text.splitlines() for text in code) for line in lines)
    assert any("\n\n    result_" in text for text in code)


def test_table_repeats_header_and_never_loses_rows():
    header = "| 算法 | 最坏时间复杂度 |\n| --- | --- |"
    rows = [f"| 方法{i} | O(n log n) |" for i in range(140)]
    groups = chunks("# 复杂度\n\n" + header + "\n" + "\n".join(rows))
    tables = [c.content for _, children in groups for c in children if c.content_type == "table"]
    assert len(tables) > 1
    assert all(header in table for table in tables)
    assert all(any(row in table.splitlines() for table in tables) for row in rows)


def test_oversized_atomic_row_is_explicit_and_not_silently_corrupted():
    row = "| 巨大单元格 | " + "数据" * 1600 + " |"
    groups = chunks("# 表\n\n| 名称 | 内容 |\n| --- | --- |\n" + row)
    child = next(c for _, children in groups for c in children if row in c.content)
    assert child.split_reason == "atomic_overflow"


def test_sibling_headings_and_page_locations_do_not_leak():
    elements = [ParsedElement("heading", "小节 A", heading_level=2, heading_path=["章", "小节 A"], page_no=1),
                ParsedElement("paragraph", "甲内容。", heading_path=["章", "小节 A"], page_no=1),
                ParsedElement("heading", "小节 B", heading_level=2, heading_path=["章", "小节 B"], page_no=2),
                ParsedElement("paragraph", "乙内容。", heading_path=["章", "小节 B"], page_no=2)]
    groups = build_parent_child_chunks(elements)
    assert len(groups) == 2
    assert groups[0][0].heading == "小节 A"
    assert groups[0][1][0].page_end == 1
    assert groups[1][1][0].source_element_start == 2
    assert "甲内容" not in groups[1][1][0].content


def test_overlap_cannot_explode_when_configured_larger_than_chunk():
    text = "这是一句完整的中文描述。" * 50
    parts = split_text(text, 90, 90, 200)
    assert len(parts) < 20
    assert all(part.endswith("。") for part in parts)


def test_skipped_heading_levels_do_not_nest_siblings():
    parsed = parse_document("lesson.md", "# 章\n\n### A\n\n甲。\n\n### B\n\n乙。".encode())
    assert parsed.elements[-1].heading_path == ["章", "B"]


def test_heading_only_ancestors_join_the_first_content_section():
    groups = chunks("# 章\n\n## 节\n\n正文证据。")
    assert len(groups) == 1
    assert groups[0][0].heading_path == ["章", "节"]
    assert "正文证据" in groups[0][1][0].content


def test_docx_table_keeps_original_order_and_heading():
    import io
    docx = pytest.importorskip("docx")
    document = docx.Document()
    document.add_heading("第一章", level=1)
    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).text, table.cell(0, 1).text = "算法", "复杂度"
    table.cell(1, 0).text, table.cell(1, 1).text = "二分查找", "O(log n)"
    document.add_heading("第二章", level=1)
    document.add_paragraph("其他内容")
    buffer = io.BytesIO()
    document.save(buffer)
    parsed = parse_document("lesson.docx", buffer.getvalue())
    assert [item.element_type for item in parsed.elements] == ["heading", "table", "heading", "paragraph"]
    assert parsed.elements[1].heading_path == ["第一章"]


def test_chinese_analyzer_matches_terms_inside_natural_question():
    query = set(tokenize_query("请解释为什么梯度下降需要设置学习率？"))
    assert {"梯度", "下降", "学习率"}.issubset(query)
    assert not {"的", "是", "什"}.intersection(query)
    assert "remove_head" in tokenize_query("remove_head(head)")


def test_bm25_rewards_specific_terms_not_long_repeated_boilerplate():
    passages = ["这是模型的知识，学习的过程是这样的。" * 80,
                "梯度下降的学习率控制每次参数更新的步长。",
                "梯度是学习的知识。" * 60]
    scores = bm25_scores("梯度下降的学习率是什么", passages)
    assert max(range(3), key=lambda i: scores[i]) == 1
    assert bm25_scores("quasar_z9", passages) == [0, 0, 0]


@pytest.mark.parametrize("vectors,count,dim", [([], 1, 2), ([[1.0]], 1, 2),
    ([[float("nan"), 1]], 1, 2), ([[0, 0]], 1, 2), ([[float("inf"), 1]], 1, 2)])
def test_embedding_rejects_missing_invalid_or_zero_vectors(vectors, count, dim):
    with pytest.raises(ValueError):
        embeddings.validate_embeddings(vectors, count, dim)


def test_embedding_provider_cache_uses_model_and_dimension(monkeypatch):
    embeddings._get_embedding_provider.cache_clear()
    monkeypatch.setattr(embeddings, "BgeM3EmbeddingProvider", lambda name, dim: (name, dim))
    assert embeddings.get_embedding_provider("bge", "model-a", 8) == ("model-a", 8)
    assert embeddings.get_embedding_provider("bge", "model-b", 16) == ("model-b", 16)
    embeddings._get_embedding_provider.cache_clear()


def result(id="c1", parent="p1", content="证据"):
    return RetrievedChunk(id, parent, "d1", "lesson.md", [], None, None, None, None, content)


def test_rrf_is_repeatable_and_does_not_mutate_inputs():
    first, second = result(), result("c2", "p2")
    original = replace(first)
    one = rrf_fusion([first, second], [second], 60)
    two = rrf_fusion([first, second], [second], 60)
    assert one == two
    assert first == original


def test_context_budget_includes_first_parent_and_source_headers(monkeypatch):
    child = result(content="命中的证据。")
    parent = SimpleNamespace(id="p1", content="无关开头。" * 3000 + child.content + "后续。" * 100,
                             heading_path="[]", page_start=None, page_end=None, slide_start=None, slide_end=None)
    monkeypatch.setattr(rag_service, "parent_contexts", lambda *_: [(child, parent)])
    monkeypatch.setattr(get_settings(), "max_context_tokens", 90)
    context, citations = rag_service.build_context(None, [child])
    assert estimate_tokens(context) <= 90
    assert child.content in context
    assert citations and citations[0]["source_id"] == 1
    assert citations[0]["quote"] in context.replace("\n", " ")


def test_tiny_context_budget_never_overflows(monkeypatch):
    child = result()
    parent = SimpleNamespace(id="p1", content="证据", heading_path="[]",
                             page_start=None, page_end=None, slide_start=None, slide_end=None)
    monkeypatch.setattr(rag_service, "parent_contexts", lambda *_: [(child, parent)])
    monkeypatch.setattr(get_settings(), "max_context_tokens", 1)
    assert rag_service.build_context(None, [child]) == ("", [])


def test_semantic_failure_degrades_to_bm25_with_explicit_diagnostics(monkeypatch):
    kb = SimpleNamespace(status="active", embedding_provider="bge", embedding_model="model-a", retrieval_config="{}")
    db = SimpleNamespace(get=lambda *_: kb)
    monkeypatch.setattr(retrieval, "dense_retrieve", lambda *a: (_ for _ in ()).throw(RuntimeError("offline")))
    monkeypatch.setattr(retrieval, "lexical_retrieve", lambda *a: [result()])
    diagnostics = {}
    assert retrieval.retrieve_chunks(db, "kb", "证据", diagnostics=diagnostics)
    assert diagnostics["warnings"] == ["DENSE_UNAVAILABLE", "NEURAL_RERANK_DISABLED"]
    assert diagnostics["candidate_count"] == 1
    assert diagnostics["reranked_count"] == 0


def test_hash_has_no_spurious_dense_results_and_preserves_parent_diversity(monkeypatch):
    kb = SimpleNamespace(status="active", embedding_provider="hash", embedding_model="hash", retrieval_config="{}")
    db = SimpleNamespace(get=lambda *_: kb)
    monkeypatch.setattr(retrieval, "dense_retrieve", lambda *a: pytest.fail("hash is not semantic"))
    monkeypatch.setattr(retrieval, "lexical_retrieve", lambda *a: [result(), result("c2", content="同章节的证据"), result("c3", "p2", "另一章节的证据")])
    rows = retrieval.retrieve_chunks(db, "kb", "证据")
    assert [item.parent_chunk_id for item in rows] == ["p1", "p2"]
    assert retrieval.retrieve_chunks(db, "kb", "   ") == []
    assert retrieval.retrieve_chunks(db, "kb", "证据", rerank_top_n=0) == []


@pytest.mark.parametrize("answer,source_ids,warning", [
    ("不存在的来源 [99]", [99], "INVALID_MODEL_CITATION"),
    ("未提供来源的结论", None, "MISSING_MODEL_CITATION"),
])
def test_unverifiable_model_citations_fall_back_to_evidence(monkeypatch, answer, source_ids, warning):
    settings = get_settings()
    monkeypatch.setattr(settings, "model_api_key", "test-only")
    monkeypatch.setattr(settings, "model_name", "test-model")

    def retrieve(*args, diagnostics, **kwargs):
        diagnostics.update({"warnings": [], "candidate_count": 1, "reranked_count": 0})
        return [result()]

    monkeypatch.setattr(rag_service, "retrieve_chunks", retrieve)
    monkeypatch.setattr(rag_service, "build_context", lambda *_: ("证据", [{"source_id": 1, "quote": "可靠证据"}]))
    monkeypatch.setattr(rag_service, "chat_json_sync", lambda *a, **k: SimpleNamespace(data={"answer": answer, "used_source_ids": source_ids}))
    response = rag_service.rag_query(None, "kb", "问题")
    assert response["answer_mode"] == "extractive"
    assert "可靠证据" in response["answer"]
    assert "[99]" not in response["answer"]
    assert response["citations"] == [{"source_id": 1, "quote": "可靠证据"}]
    assert warning in response["retrieval"]["warnings"]
