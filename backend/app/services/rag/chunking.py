from __future__ import annotations

from dataclasses import dataclass

from backend.app.core.config import get_settings
from backend.app.services.rag.parsers import ParsedElement
from backend.app.services.rag.profiles import ContentProfile, detect_content_profile
from backend.app.services.rag.utils import estimate_tokens, normalize_text


@dataclass
class BuiltChunk:
    chunk_type: str
    chunk_index: int
    content: str
    heading: str | None
    heading_path: list[str]
    page_start: int | None
    page_end: int | None
    slide_start: int | None
    slide_end: int | None
    content_type: str
    token_count: int
    split_reason: str = "length_recursive"
    source_element_start: int | None = None
    source_element_end: int | None = None


def _range(values: list[int | None]) -> tuple[int | None, int | None]:
    present = [value for value in values if value is not None]
    if not present:
        return None, None
    return min(present), max(present)


def _content_type(elements: list[ParsedElement]) -> str:
    types = {item.element_type for item in elements}
    if "code" in types:
        return "code"
    if "table" in types:
        return "table"
    return "text"


def build_parent_chunks(elements: list[ParsedElement], profile: ContentProfile | None = None) -> list[BuiltChunk]:
    profile = profile or detect_content_profile("document", elements)
    if profile.chunking_strategy == "markdown_section":
        return [parent for parent, _ in _build_markdown_section_groups(elements)]
    if profile.chunking_strategy in {"slide_page", "page_recursive"}:
        return _build_scoped_parent_chunks(elements, profile)
    if profile.chunking_strategy in {"code_aware", "table_aware"}:
        return _build_element_aware_parent_chunks(elements, profile)
    return _build_section_parent_chunks(elements)


def _build_section_parent_chunks(elements: list[ParsedElement]) -> list[BuiltChunk]:
    settings = get_settings()
    parents: list[BuiltChunk] = []
    current: list[ParsedElement] = []
    current_heading_path: list[str] = []

    def flush() -> None:
        nonlocal current
        if not current:
            return
        content = normalize_text("\n\n".join(item.text for item in current if item.text.strip()))
        if not content:
            current = []
            return
        page_start, page_end = _range([item.page_no for item in current])
        slide_start, slide_end = _range([item.slide_no for item in current])
        heading_path = current_heading_path or current[-1].heading_path
        parents.append(
            BuiltChunk(
                chunk_type="parent",
                chunk_index=len(parents),
                content=content,
                heading=heading_path[-1] if heading_path else None,
                heading_path=list(heading_path),
                page_start=page_start,
                page_end=page_end,
                slide_start=slide_start,
                slide_end=slide_end,
                content_type=_content_type(current),
                token_count=estimate_tokens(content),
                split_reason="heading_or_parent_size",
            )
        )
        current = []

    for element in elements:
        text = normalize_text(element.text)
        if not text:
            continue
        if element.element_type == "heading" and element.heading_level == 1 and current:
            flush()
        projected = len("\n\n".join([item.text for item in current] + [text]))
        if current and projected > settings.parent_max_chars:
            flush()
        if element.heading_path:
            current_heading_path = list(element.heading_path)
        current.append(element)
        if len("\n\n".join(item.text for item in current)) >= settings.parent_target_chars:
            flush()
    flush()
    return parents


def _build_scoped_parent_chunks(elements: list[ParsedElement], profile: ContentProfile) -> list[BuiltChunk]:
    settings = get_settings()
    parents: list[BuiltChunk] = []
    current: list[ParsedElement] = []
    current_scope: int | None = None
    scope_name = "slide" if profile.chunking_strategy == "slide_page" else "page"

    def scope_of(element: ParsedElement) -> int | None:
        return element.slide_no if scope_name == "slide" else element.page_no

    def flush() -> None:
        nonlocal current
        if not current:
            return
        content = normalize_text("\n\n".join(item.text for item in current if item.text.strip()))
        if not content:
            current = []
            return
        page_start, page_end = _range([item.page_no for item in current])
        slide_start, slide_end = _range([item.slide_no for item in current])
        heading_path = _heading_path(current)
        parents.append(
            BuiltChunk(
                chunk_type="parent",
                chunk_index=len(parents),
                content=content,
                heading=heading_path[-1] if heading_path else None,
                heading_path=heading_path,
                page_start=page_start,
                page_end=page_end,
                slide_start=slide_start,
                slide_end=slide_end,
                content_type=_content_type(current),
                token_count=estimate_tokens(content),
                split_reason=f"{scope_name}_scope",
            )
        )
        current = []

    for element in elements:
        text = normalize_text(element.text)
        if not text:
            continue
        element_scope = scope_of(element)
        projected = len("\n\n".join([item.text for item in current] + [text]))
        if current and element_scope is not None and current_scope is not None and element_scope != current_scope:
            flush()
        elif current and projected > settings.parent_max_chars:
            flush()
        current_scope = element_scope if element_scope is not None else current_scope
        current.append(element)
    flush()
    return parents


def _build_element_aware_parent_chunks(elements: list[ParsedElement], profile: ContentProfile) -> list[BuiltChunk]:
    settings = get_settings()
    parents: list[BuiltChunk] = []
    current: list[ParsedElement] = []
    current_heading_path: list[str] = []

    def flush() -> None:
        nonlocal current
        if not current:
            return
        content = normalize_text("\n\n".join(item.text for item in current if item.text.strip()))
        if not content:
            current = []
            return
        page_start, page_end = _range([item.page_no for item in current])
        slide_start, slide_end = _range([item.slide_no for item in current])
        heading_path = current_heading_path or _heading_path(current)
        parents.append(
            BuiltChunk(
                chunk_type="parent",
                chunk_index=len(parents),
                content=content,
                heading=heading_path[-1] if heading_path else None,
                heading_path=list(heading_path),
                page_start=page_start,
                page_end=page_end,
                slide_start=slide_start,
                slide_end=slide_end,
                content_type=_content_type(current),
                token_count=estimate_tokens(content),
                split_reason="element_aware_parent",
            )
        )
        current = []

    for element in elements:
        text = normalize_text(element.text)
        if not text:
            continue
        if element.heading_path:
            current_heading_path = list(element.heading_path)
        if element.element_type in {"code", "table"}:
            if current and len("\n\n".join(item.text for item in current)) >= settings.child_target_chars:
                flush()
            current.append(element)
            if len(text) >= settings.child_target_chars or profile.chunking_strategy == "table_aware":
                flush()
            continue
        projected = len("\n\n".join([item.text for item in current] + [text]))
        if current and projected > settings.parent_max_chars:
            flush()
        current.append(element)
    flush()
    return parents


def split_child_chunks(parent: BuiltChunk, profile: ContentProfile | None = None) -> list[BuiltChunk]:
    settings = get_settings()
    text = parent.content
    if len(text) <= settings.child_max_chars:
        content = _with_heading_context(parent, text)
        return [
            BuiltChunk(
                chunk_type="child",
                chunk_index=0,
                content=content,
                heading=parent.heading,
                heading_path=list(parent.heading_path),
                page_start=parent.page_start,
                page_end=parent.page_end,
                slide_start=parent.slide_start,
                slide_end=parent.slide_end,
                content_type=parent.content_type,
                token_count=estimate_tokens(content),
                split_reason="within_child_max",
                source_element_start=parent.source_element_start,
                source_element_end=parent.source_element_end,
            )
        ]

    strategy = profile.chunking_strategy if profile else "section_recursive"
    if strategy == "code_aware" or parent.content_type == "code":
        return _split_preserving_blocks(parent, ["\n```", "\n\n"])
    if strategy == "table_aware" or parent.content_type == "table":
        return _split_preserving_blocks(parent, ["\n", "\n\n"])
    if strategy == "plain_recursive":
        return _split_recursive_text(parent, ["\n\n", "\n", "。", "！", "？", "；", ".", "!", "?", ";", "，", ",", " "])
    return _split_recursive_text(parent, ["\n\n", "。", "！", "？", "；", ".", "!", "?", ";", "\n", "，", ",", " "])


def _split_recursive_text(parent: BuiltChunk, separators: list[str]) -> list[BuiltChunk]:
    settings = get_settings()
    text = parent.content
    chunks: list[BuiltChunk] = []
    cursor = 0
    while cursor < len(text):
        hard_end = min(len(text), cursor + settings.child_target_chars)
        end = hard_end
        if hard_end < len(text):
            candidates = [text.rfind(separator, cursor, hard_end) for separator in separators]
            boundary = max(candidates)
            if boundary > cursor + 80:
                end = boundary + 1
        _append_child(chunks, parent, text[cursor:end])
        if end >= len(text):
            break
        cursor = max(end - settings.child_overlap_chars, cursor + 1)
    return chunks


def _split_preserving_blocks(parent: BuiltChunk, separators: list[str]) -> list[BuiltChunk]:
    settings = get_settings()
    blocks = _block_split(parent.content)
    chunks: list[BuiltChunk] = []
    current: list[str] = []

    def flush() -> None:
        nonlocal current
        if not current:
            return
        _append_child(chunks, parent, "\n\n".join(current), normalize=False)
        current = []

    for block in blocks:
        if len(block) > settings.child_max_chars:
            flush()
            temp_parent = BuiltChunk(
                chunk_type=parent.chunk_type,
                chunk_index=parent.chunk_index,
                content=block,
                heading=parent.heading,
                heading_path=list(parent.heading_path),
                page_start=parent.page_start,
                page_end=parent.page_end,
                slide_start=parent.slide_start,
                slide_end=parent.slide_end,
                content_type=parent.content_type,
                token_count=estimate_tokens(block),
                split_reason="long_block_recursive",
                source_element_start=parent.source_element_start,
                source_element_end=parent.source_element_end,
            )
            for child in _split_recursive_text(temp_parent, separators):
                child.chunk_index = len(chunks)
                chunks.append(child)
            continue
        projected = len("\n\n".join(current + [block]))
        if current and projected > settings.child_target_chars:
            flush()
        current.append(block)
    flush()
    return chunks


def _block_split(text: str) -> list[str]:
    blocks = [block.strip() for block in re_split_blocks(text)]
    return [block for block in blocks if block]


def re_split_blocks(text: str) -> list[str]:
    return text.split("\n\n")


def _append_child(chunks: list[BuiltChunk], parent: BuiltChunk, raw_content: str, *, normalize: bool = True) -> None:
    content = _with_heading_context(parent, normalize_text(raw_content) if normalize else raw_content.strip())
    if not content:
        return
    chunks.append(
        BuiltChunk(
            chunk_type="child",
            chunk_index=len(chunks),
            content=content,
            heading=parent.heading,
            heading_path=list(parent.heading_path),
            page_start=parent.page_start,
            page_end=parent.page_end,
            slide_start=parent.slide_start,
            slide_end=parent.slide_end,
            content_type=parent.content_type,
            token_count=estimate_tokens(content),
            split_reason=parent.split_reason,
            source_element_start=parent.source_element_start,
            source_element_end=parent.source_element_end,
        )
    )


def _heading_path(elements: list[ParsedElement]) -> list[str]:
    for element in reversed(elements):
        if element.heading_path:
            return list(element.heading_path)
    return []


def _with_heading_context(parent: BuiltChunk, content: str) -> str:
    heading = (parent.heading or "").strip()
    if not heading or not content:
        return content
    normalized_heading = normalize_text(heading)
    if normalized_heading in content[: max(120, len(normalized_heading) + 20)]:
        return content
    return normalize_text(f"{normalized_heading}\n\n{content}")


def build_parent_child_chunks(elements: list[ParsedElement], profile: ContentProfile | None = None) -> list[tuple[BuiltChunk, list[BuiltChunk]]]:
    profile = profile or detect_content_profile("document", elements)
    if profile.chunking_strategy == "markdown_section":
        return _build_markdown_section_groups(elements)
    return [(parent, split_child_chunks(parent, profile)) for parent in build_parent_chunks(elements, profile)]


def _build_markdown_section_groups(elements: list[ParsedElement]) -> list[tuple[BuiltChunk, list[BuiltChunk]]]:
    sections: list[list[tuple[int, ParsedElement]]] = []
    current: list[tuple[int, ParsedElement]] = []

    def flush() -> None:
        nonlocal current
        if current:
            sections.append(current)
            current = []

    for index, element in enumerate(elements):
        if element.element_type == "heading" and element.heading_level is not None and element.heading_level <= 3 and current:
            flush()
        current.append((index, element))
    flush()

    groups: list[tuple[BuiltChunk, list[BuiltChunk]]] = []
    for section in sections:
        parent = _chunk_from_indexed_elements(section, "parent", len(groups), "markdown_heading_section")
        children = _split_markdown_section_children(parent, section)
        groups.append((parent, children))
    return groups


def _split_markdown_section_children(parent: BuiltChunk, section: list[tuple[int, ParsedElement]]) -> list[BuiltChunk]:
    settings = get_settings()
    content = parent.content
    if len(content) <= settings.child_max_chars:
        child = BuiltChunk(
            chunk_type="child",
            chunk_index=0,
            content=_with_heading_context(parent, content),
            heading=parent.heading,
            heading_path=list(parent.heading_path),
            page_start=parent.page_start,
            page_end=parent.page_end,
            slide_start=parent.slide_start,
            slide_end=parent.slide_end,
            content_type=parent.content_type,
            token_count=estimate_tokens(content),
            split_reason="markdown_heading_section",
            source_element_start=parent.source_element_start,
            source_element_end=parent.source_element_end,
        )
        return [child]

    chunks: list[BuiltChunk] = []
    current: list[tuple[int, ParsedElement]] = []

    def flush(reason: str = "markdown_block_group") -> None:
        nonlocal current
        if not current:
            return
        child = _chunk_from_indexed_elements(current, "child", len(chunks), reason)
        child.content = _with_heading_context(parent, child.content)
        child.token_count = estimate_tokens(child.content)
        chunks.append(child)
        current = []

    for item in section:
        _, element = item
        element_text = _element_text(element)
        if not element_text:
            continue
        if len(element_text) > settings.child_max_chars:
            flush()
            temp = _chunk_from_indexed_elements([item], "parent", parent.chunk_index, "markdown_long_block")
            for child in _split_recursive_text(temp, ["\n\n", "。", "！", "？", "；", ".", "!", "?", ";", "\n", "，", ",", " "]):
                child.chunk_index = len(chunks)
                child.split_reason = "markdown_long_block_recursive"
                chunks.append(child)
            continue
        projected = len("\n\n".join(_element_text(element) for _, element in current + [item] if _element_text(element)))
        if current and projected > settings.child_target_chars:
            flush()
        current.append(item)
    flush()
    return chunks


def _chunk_from_indexed_elements(
    indexed_elements: list[tuple[int, ParsedElement]],
    chunk_type: str,
    chunk_index: int,
    split_reason: str,
) -> BuiltChunk:
    elements = [element for _, element in indexed_elements]
    content = normalize_text("\n\n".join(_element_text(element) for element in elements if _element_text(element)))
    page_start, page_end = _range([item.page_no for item in elements])
    slide_start, slide_end = _range([item.slide_no for item in elements])
    heading_path = _heading_path(elements)
    indexes = [index for index, _ in indexed_elements]
    return BuiltChunk(
        chunk_type=chunk_type,
        chunk_index=chunk_index,
        content=content,
        heading=heading_path[-1] if heading_path else None,
        heading_path=heading_path,
        page_start=page_start,
        page_end=page_end,
        slide_start=slide_start,
        slide_end=slide_end,
        content_type=_content_type(elements),
        token_count=estimate_tokens(content),
        split_reason=split_reason,
        source_element_start=min(indexes) if indexes else None,
        source_element_end=max(indexes) if indexes else None,
    )


def _element_text(element: ParsedElement) -> str:
    return element.text.strip()
