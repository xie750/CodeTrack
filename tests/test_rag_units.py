from pathlib import Path

import pytest

from backend.app.services.rag.chunking import build_parent_child_chunks
from backend.app.services.rag.parsers import ParsedElement, parse_document
from backend.app.services.rag.profiles import detect_content_profile, detect_file_profile
from backend.app.services.rag.retrieval import RetrievedChunk, rrf_fusion


def test_parent_child_chunking_keeps_heading_metadata():
    elements = [
        ParsedElement("heading", "第一章 核心概念", heading_level=1, heading_path=["第一章 核心概念"], page_no=1),
        ParsedElement("paragraph", "Parent Chunk 提供完整上下文。Child Chunk 用于召回。", heading_path=["第一章 核心概念"], page_no=1),
        ParsedElement("heading", "第二章 引用", heading_level=1, heading_path=["第二章 引用"], page_no=2),
        ParsedElement("paragraph", "citation 必须来自数据库 metadata。", heading_path=["第二章 引用"], page_no=2),
    ]

    groups = build_parent_child_chunks(elements)

    assert len(groups) >= 2
    first_parent, first_children = groups[0]
    assert first_parent.heading_path == ["第一章 核心概念"]
    assert first_parent.page_start == 1
    assert first_children[0].heading_path == first_parent.heading_path
    assert first_children[0].page_start == 1


def test_file_profile_detects_upload_container_type():
    profile = detect_file_profile("lesson.md", "text/markdown", b"# Lesson")

    assert profile.file_type == "markdown"
    assert profile.source_family == "text"
    assert profile.parser_hint == "markdown"


def test_markdown_parser_and_profile_detect_code_exercise_strategy():
    content = """# 链表删除

题目：删除链表头节点。

输入：head
输出：新的头节点

```cpp
ListNode* removeHead(ListNode* head) {
    return head ? head->next : nullptr;
}
```
""".encode("utf-8")

    result = parse_document("linked-list.md", content)
    profile = detect_content_profile("linked-list.md", result.elements)
    groups = build_parent_child_chunks(result.elements, profile)

    assert any(element.element_type == "code" for element in result.elements)
    assert profile.content_profile == "code_exercise"
    assert profile.chunking_strategy == "code_aware"
    assert any("removeHead" in child.content for _, children in groups for child in children)


def test_markdown_parser_and_profile_detect_table_strategy():
    content = """# 复杂度对比

| 结构 | 查找 | 插入 |
| --- | --- | --- |
| 数组 | O(n) | O(n) |
| 哈希表 | O(1) | O(1) |

| 算法 | 最好 | 最坏 |
| --- | --- | --- |
| 快排 | O(n log n) | O(n^2) |
""".encode("utf-8")

    result = parse_document("table-note.md", content)
    profile = detect_content_profile("table-note.md", result.elements)

    assert sum(1 for element in result.elements if element.element_type == "table") == 2
    assert profile.content_profile == "table_heavy"
    assert profile.chunking_strategy == "table_aware"


def test_rrf_fusion_merges_dense_and_lexical_ranks():
    dense = [
        RetrievedChunk("c1", "p1", "d1", "a.md", [], None, None, None, None, "alpha", dense_rank=1),
        RetrievedChunk("c2", "p2", "d1", "a.md", [], None, None, None, None, "beta", dense_rank=2),
    ]
    lexical = [
        RetrievedChunk("c2", "p2", "d1", "a.md", [], None, None, None, None, "beta", lexical_rank=1),
        RetrievedChunk("c3", "p3", "d1", "a.md", [], None, None, None, None, "gamma", lexical_rank=2),
    ]

    fused = rrf_fusion(dense, lexical, 60)

    assert fused[0].child_chunk_id == "c2"
    assert fused[0].dense_rank == 2
    assert fused[0].lexical_rank == 1
    assert {item.child_chunk_id for item in fused} == {"c1", "c2", "c3"}


def test_pdf_parser_preserves_page_metadata_when_dependency_available():
    pytest.importorskip("fitz")

    result = parse_document("simple.pdf", Path("tests/fixtures/simple.pdf").read_bytes())

    assert result.elements
    assert result.elements[0].page_no == 1
    assert "Parent Child Chunk" in result.elements[0].text


def test_docx_parser_preserves_heading_path_when_dependency_available():
    pytest.importorskip("docx")

    result = parse_document("simple.docx", Path("tests/fixtures/simple.docx").read_bytes())

    assert result.elements
    assert any(element.heading_path == ["Core Concept"] for element in result.elements)


def test_pptx_parser_preserves_slide_metadata_when_dependency_available():
    pytest.importorskip("pptx")

    result = parse_document("simple.pptx", Path("tests/fixtures/simple.pptx").read_bytes())

    assert result.elements
    assert any(element.slide_no == 1 for element in result.elements)
    assert any("Slide Concept" in element.text for element in result.elements)
