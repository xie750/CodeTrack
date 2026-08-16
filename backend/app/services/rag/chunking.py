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
        return [
            BuiltChunk(
                chunk_type="child",
                chunk_index=0,
                content=text,
                heading=parent.heading,
                heading_path=list(parent.heading_path),
                page_start=parent.page_start,
                page_end=parent.page_end,
                slide_start=parent.slide_start,
                slide_end=parent.slide_end,
                content_type=parent.content_type,
                token_count=estimate_tokens(text),
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
    content = normalize_text(raw_content) if normalize else raw_content.strip()
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
        )
    )


def _heading_path(elements: list[ParsedElement]) -> list[str]:
    for element in reversed(elements):
        if element.heading_path:
            return list(element.heading_path)
    return []


def build_parent_child_chunks(elements: list[ParsedElement], profile: ContentProfile | None = None) -> list[tuple[BuiltChunk, list[BuiltChunk]]]:
    profile = profile or detect_content_profile("document", elements)
    return [(parent, split_child_chunks(parent, profile)) for parent in build_parent_chunks(elements, profile)]
