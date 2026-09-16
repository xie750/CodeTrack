from __future__ import annotations

from dataclasses import dataclass, replace
import re

from backend.app.core.config import get_settings
from backend.app.services.rag.parsers import ParsedElement
from backend.app.services.rag.profiles import ContentProfile, detect_content_profile
from backend.app.services.rag.utils import estimate_tokens


CHUNKER_VERSION = "structure_v2"


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
    split_reason: str = "structure_boundary"
    source_element_start: int | None = None
    source_element_end: int | None = None


def _range(values: list[int | None]) -> tuple[int | None, int | None]:
    present = [value for value in values if value is not None]
    return (min(present), max(present)) if present else (None, None)


def _text(items: list[tuple[int, ParsedElement]]) -> str:
    # Do not normalize whitespace inside code blocks.
    return "\n\n".join(element.text.strip("\r\n") for _, element in items if element.text.strip())


def _make_chunk(items: list[tuple[int, ParsedElement]], kind: str, index: int, reason: str) -> BuiltChunk:
    elements = [element for _, element in items]
    heading_path = next((list(e.heading_path) for e in reversed(elements) if e.heading_path), [])
    content = _text(items)
    pages = _range([e.page_no for e in elements])
    slides = _range([e.slide_no for e in elements])
    types = {e.element_type for e in elements}
    return BuiltChunk(kind, index, content, heading_path[-1] if heading_path else None,
                      heading_path, *pages, *slides,
                      "code" if "code" in types else "table" if "table" in types else "text",
                      estimate_tokens(content), reason, min(i for i, _ in items), max(i for i, _ in items))


def _fits(text: str, chars: int, tokens: int) -> bool:
    return len(text) <= chars and estimate_tokens(text) <= tokens


def _prefix_end(text: str, max_chars: int, max_tokens: int) -> int:
    end = min(len(text), max_chars)
    if estimate_tokens(text[:end]) <= max_tokens:
        return end
    low, high = 1, end
    while low < high:
        mid = (low + high + 1) // 2
        if estimate_tokens(text[:mid]) <= max_tokens:
            low = mid
        else:
            high = mid - 1
    return low


def split_text(text: str, max_chars: int, max_tokens: int, overlap: int = 0) -> list[str]:
    """Prefer paragraph > sentence > line > word boundaries, with whole-unit overlap."""
    pieces: list[str] = []
    cursor = 0
    while cursor < len(text):
        end = cursor + _prefix_end(text[cursor:], max_chars, max_tokens)
        if end < len(text):
            window = text[cursor:end]
            # Priority matters: max(rfind(...)) previously always favored spaces.
            for pattern in (r"\n\s*\n", r"[。！？；!?;]\s*|\.(?=\s)", r"\n", r"\s"):
                boundaries = [m.end() for m in re.finditer(pattern, window) if m.end() >= len(window) // 2]
                if boundaries:
                    end = cursor + boundaries[-1]
                    break
        piece = text[cursor:end].strip()
        if piece:
            pieces.append(piece)
        if end == len(text):
            break
        next_cursor = end
        if overlap:
            # Never begin an overlap in the middle of a sentence/identifier.
            boundaries = [cursor + m.end() for m in re.finditer(r"[。！？；!?;]\s*|\n+|\.\s+", text[cursor:end])]
            candidates = [pos for pos in boundaries if end - min(overlap, max_chars // 3) <= pos < end]
            if candidates:
                next_cursor = candidates[0]
        cursor = max(cursor + 1, next_cursor)
    return pieces


def _split_rows(text: str, kind: str, max_chars: int, max_tokens: int) -> list[str]:
    lines = text.strip("\r\n").splitlines()
    prefix: list[str] = []
    suffix: list[str] = []
    if kind == "code" and lines and re.match(r"^\s*(`{3,}|~{3,})", lines[0]):
        opening = lines.pop(0)
        fence = re.match(r"^\s*(`{3,}|~{3,})", opening).group(1)
        if lines and re.fullmatch(r"\s*" + re.escape(fence[0]) + "{" + str(len(fence)) + r",}\s*", lines[-1]):
            lines.pop()
        prefix, suffix = [opening], [fence]
    elif kind == "table" and len(lines) > 1 and re.fullmatch(r"[|:\-\s]+", lines[1]):
        prefix, lines = lines[:2], lines[2:]

    def render(rows: list[str]) -> str:
        return "\n".join(prefix + rows + suffix)

    result: list[str] = []
    current: list[str] = []
    for line in lines:
        if current and not _fits(render(current + [line]), max_chars, max_tokens):
            result.append(render(current))
            current = []
        # Keep indivisible lines/rows intact; expose overflow instead of corrupting source.
        current.append(line)
    if current or not result:
        result.append(render(current))
    return result


def _split_element(item: tuple[int, ParsedElement], max_chars: int, max_tokens: int,
                   overlap: int = 0) -> list[tuple[int, ParsedElement]]:
    index, element = item
    if _fits(element.text, max_chars, max_tokens):
        return [item]
    if element.element_type in {"code", "table"}:
        pieces = _split_rows(element.text, element.element_type, max_chars, max_tokens)
    else:
        pieces = split_text(element.text, max_chars, max_tokens, overlap)
    return [(index, replace(element, text=piece)) for piece in pieces]


def _sections(elements: list[ParsedElement]) -> list[list[tuple[int, ParsedElement]]]:
    sections: list[list[tuple[int, ParsedElement]]] = []
    current: list[tuple[int, ParsedElement]] = []
    for index, element in enumerate(elements):
        if not element.text.strip():
            continue
        if current:
            previous = current[-1][1]
            heading_chain = (all(e.element_type == "heading" for _, e in current)
                             and element.heading_path[:len(previous.heading_path)] == previous.heading_path
                             and len(element.heading_path) > len(previous.heading_path))
            if ((not heading_chain and (element.element_type == "heading" or element.heading_path != previous.heading_path))
                    or element.page_no != previous.page_no or element.slide_no != previous.slide_no):
                sections.append(current)
                current = []
        current.append((index, element))
    if current:
        sections.append(current)
    return sections


def _pack(items: list[tuple[int, ParsedElement]], target: int, max_chars: int,
          max_tokens: int) -> list[list[tuple[int, ParsedElement]]]:
    groups: list[list[tuple[int, ParsedElement]]] = []
    current: list[tuple[int, ParsedElement]] = []
    for item in items:
        proposed = _text(current + [item])
        if current and (not _fits(proposed, max_chars, max_tokens)
                        or (len(_text(current)) >= target and item[1].element_type != "heading")):
            groups.append(current)
            current = []
        current.append(item)
    if current:
        groups.append(current)
    return groups


def _heading_prefix(parent: BuiltChunk) -> str:
    limit = min(160, get_settings().child_max_chars // 4)
    return " > ".join(parent.heading_path)[-limit:]


def _children(parent: BuiltChunk, items: list[tuple[int, ParsedElement]], reason: str) -> list[BuiltChunk]:
    settings = get_settings()
    prefix = _heading_prefix(parent)
    reserve_chars = len(prefix) + 2 if prefix else 0
    reserve_tokens = estimate_tokens(prefix)
    chars = max(32, settings.child_max_chars - reserve_chars)
    tokens = max(16, settings.child_max_tokens - reserve_tokens)
    target = min(chars, max(32, settings.child_target_chars - reserve_chars))
    atoms = [piece for item in items for piece in _split_element(item, chars, tokens, settings.child_overlap_chars)]
    children: list[BuiltChunk] = []
    for group in _pack(atoms, target, chars, tokens):
        child = _make_chunk(group, "child", len(children), reason)
        if prefix and not child.content.startswith(prefix):
            child.content = prefix + "\n\n" + child.content
        child.token_count = estimate_tokens(child.content)
        if not _fits(child.content, settings.child_max_chars, settings.child_max_tokens):
            child.split_reason = "atomic_overflow"
        elif len(atoms) > len(items):
            child.split_reason = "structure_preserving_split"
        children.append(child)
    return children


def build_parent_child_chunks(elements: list[ParsedElement], profile: ContentProfile | None = None) -> list[tuple[BuiltChunk, list[BuiltChunk]]]:
    profile = profile or detect_content_profile("document", elements)
    settings = get_settings()
    groups: list[tuple[BuiltChunk, list[BuiltChunk]]] = []
    reason = "markdown_heading_section" if profile.chunking_strategy == "markdown_section" else "structure_boundary"
    for section in _sections(elements):
        atoms = [piece for item in section for piece in _split_element(item, settings.parent_max_chars, settings.parent_max_tokens)]
        for items in _pack(atoms, settings.parent_target_chars, settings.parent_max_chars, settings.parent_max_tokens):
            parent = _make_chunk(items, "parent", len(groups), reason)
            if not _fits(parent.content, settings.parent_max_chars, settings.parent_max_tokens):
                parent.split_reason = "atomic_overflow"
            groups.append((parent, _children(parent, items, reason)))
    return groups


def build_parent_chunks(elements: list[ParsedElement], profile: ContentProfile | None = None) -> list[BuiltChunk]:
    return [parent for parent, _ in build_parent_child_chunks(elements, profile)]


def split_child_chunks(parent: BuiltChunk, profile: ContentProfile | None = None) -> list[BuiltChunk]:
    # Compatibility entry point; ingestion retains the richer ParsedElement list.
    element = ParsedElement(parent.content_type, parent.content, page_no=parent.page_start,
                            slide_no=parent.slide_start, heading_path=parent.heading_path)
    return _children(parent, [(parent.source_element_start or 0, element)], parent.split_reason)
