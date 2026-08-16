from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
import re

from backend.app.services.rag.parsers import ParsedElement


@dataclass(frozen=True)
class FileProfile:
    file_type: str
    source_family: str
    mime_type: str | None
    extension: str
    size_bytes: int
    parser_hint: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class ContentProfile:
    content_profile: str
    cleaning_strategy: str
    chunking_strategy: str
    signals: dict

    def to_dict(self) -> dict:
        return asdict(self)


EXTENSION_FILE_TYPES = {
    ".md": ("markdown", "text"),
    ".markdown": ("markdown", "text"),
    ".txt": ("plain_text", "text"),
    ".pdf": ("pdf", "page_document"),
    ".docx": ("docx", "word_document"),
    ".pptx": ("pptx", "slide_deck"),
}


CODE_TERMS = [
    "```",
    "#include",
    "def ",
    "class ",
    "return ",
    "public:",
    "private:",
    "输入",
    "输出",
    "样例",
    "示例",
    "题目",
    "复杂度",
    "leetcode",
]


def detect_file_profile(filename: str, mime_type: str | None, content: bytes) -> FileProfile:
    extension = Path(filename).suffix.lower()
    file_type, source_family = EXTENSION_FILE_TYPES.get(extension, ("unknown", "unknown"))
    parser_hint = file_type if file_type != "unknown" else "unsupported"
    if file_type == "markdown" and mime_type in {"text/plain", None}:
        parser_hint = "markdown"
    return FileProfile(
        file_type=file_type,
        source_family=source_family,
        mime_type=mime_type,
        extension=extension,
        size_bytes=len(content),
        parser_hint=parser_hint,
    )


def detect_content_profile(filename: str, elements: list[ParsedElement]) -> ContentProfile:
    extension = Path(filename).suffix.lower()
    counts = Counter(element.element_type for element in elements)
    page_count = len({element.page_no for element in elements if element.page_no is not None})
    slide_count = len({element.slide_no for element in elements if element.slide_no is not None})
    heading_count = counts["heading"]
    code_count = counts["code"]
    table_count = counts["table"]
    list_count = counts["list"]
    total_chars = sum(len(element.text) for element in elements)
    code_chars = sum(len(element.text) for element in elements if element.element_type == "code")
    table_chars = sum(len(element.text) for element in elements if element.element_type == "table")
    joined_preview = "\n".join(element.text for element in elements[:80]).lower()
    code_term_hits = sum(1 for term in CODE_TERMS if term.lower() in joined_preview)
    question_like = bool(re.search(r"(练习|习题|题目|输入|输出|样例|示例|解法|复杂度)", joined_preview))
    heading_density = heading_count / max(1, len(elements))
    code_ratio = code_chars / max(1, total_chars)
    table_ratio = table_chars / max(1, total_chars)

    signals = {
        "extension": extension,
        "element_count": len(elements),
        "heading_count": heading_count,
        "paragraph_count": counts["paragraph"],
        "list_count": list_count,
        "code_count": code_count,
        "table_count": table_count,
        "page_count": page_count,
        "slide_count": slide_count,
        "total_chars": total_chars,
        "code_ratio": round(code_ratio, 3),
        "table_ratio": round(table_ratio, 3),
        "code_term_hits": code_term_hits,
        "question_like": question_like,
    }

    if slide_count:
        return ContentProfile("slide_deck", "slide_preserve", "slide_page", signals)
    if page_count and extension == ".pdf":
        return ContentProfile("page_document", "pdf_page_clean", "page_recursive", signals)
    if table_count and not code_count and (table_count >= 2 or table_ratio >= 0.2):
        return ContentProfile("table_heavy", "table_preserve", "table_aware", signals)
    if extension in {".md", ".markdown"} and heading_count >= 2:
        return ContentProfile("sectioned_note", "structure_preserve", "markdown_section", signals)
    if code_count or code_ratio >= 0.15 or code_term_hits >= 3 or question_like:
        return ContentProfile("code_exercise", "code_preserve", "code_aware", signals)
    if heading_count >= 2 or heading_density >= 0.18:
        strategy = "markdown_section" if extension in {".md", ".markdown"} else "section_recursive"
        return ContentProfile("sectioned_note", "structure_preserve", strategy, signals)
    return ContentProfile("plain_note", "plain_text_clean", "plain_recursive", signals)
