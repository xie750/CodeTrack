from __future__ import annotations

import re

from backend.app.services.rag.parsers import ParsedElement
from backend.app.services.rag.profiles import ContentProfile
from backend.app.services.rag.utils import normalize_text


def clean_elements(elements: list[ParsedElement], profile: ContentProfile) -> list[ParsedElement]:
    cleaned: list[ParsedElement] = []
    for element in elements:
        text = _clean_text(element.text, element.element_type, profile.cleaning_strategy)
        if not text:
            continue
        metadata = dict(element.metadata)
        metadata["cleaning_strategy"] = profile.cleaning_strategy
        cleaned.append(
            ParsedElement(
                element_type=element.element_type,
                text=text,
                page_no=element.page_no,
                slide_no=element.slide_no,
                heading_level=element.heading_level,
                heading_path=list(element.heading_path),
                metadata=metadata,
            )
        )
    return cleaned


def _clean_text(text: str, element_type: str, strategy: str) -> str:
    if element_type == "code":
        return _clean_code(text)
    if element_type == "table":
        return _clean_table(text)
    if strategy == "pdf_page_clean":
        return _clean_pdf_text(text)
    if strategy == "slide_preserve":
        return _clean_slide_text(text)
    if strategy == "plain_text_clean":
        return _clean_plain_text(text)
    return normalize_text(text)


def _clean_code(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def _clean_table(text: str) -> str:
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.replace("\r\n", "\n").replace("\r", "\n").splitlines()]
    return "\n".join(line for line in lines if line).strip()


def _clean_pdf_text(text: str) -> str:
    text = normalize_text(text)
    text = re.sub(r"(?<=\w)-\n(?=\w)", "", text)
    text = re.sub(r"(?<![。！？!?；;:：])\n(?!\n)", " ", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _clean_slide_text(text: str) -> str:
    text = normalize_text(text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _clean_plain_text(text: str) -> str:
    text = normalize_text(text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()
