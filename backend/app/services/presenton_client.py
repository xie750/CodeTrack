from __future__ import annotations

import base64
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import httpx

from backend.app.core.config import Settings, get_settings


class PresentonError(RuntimeError):
    pass


def presenton_configured(settings: Settings | None = None) -> bool:
    value = settings or get_settings()
    return bool(value.presenton_enabled and value.presenton_base_url)


def _headers(settings: Settings) -> dict[str, str]:
    headers: dict[str, str] = {"Accept": "application/json"}
    auth_type = (settings.presenton_auth_type or "bearer").strip().lower()
    if auth_type == "bearer" and settings.presenton_api_key:
        headers["Authorization"] = f"Bearer {settings.presenton_api_key}"
    elif auth_type == "basic":
        if settings.presenton_api_key:
            headers["Authorization"] = f"Basic {settings.presenton_api_key}"
        elif settings.presenton_username and settings.presenton_password:
            raw = f"{settings.presenton_username}:{settings.presenton_password}".encode("utf-8")
            headers["Authorization"] = f"Basic {base64.b64encode(raw).decode('ascii')}"
    return headers


def _build_prompt(
    *,
    title: str,
    message: str,
    knowledge_point: str,
    slides: list[dict[str, Any]],
    citations: list[dict[str, Any]],
) -> str:
    lines = [
        f"请生成一份中文教学 PPT：{title}",
        f"学生需求：{message}",
        f"核心知识点：{knowledge_point or '自主学习主题'}",
        "",
        "生成要求：",
        "- 最终产物要是可直接授课展示的完整幻灯片；可以先规划结构，但不要只停留在空泛目录。",
        "- 面向人工智能专业学生，风格现代、干净、适合课程讲解。",
        "- 每页内容密度适中，标题清晰，避免堆满文字。",
        "- 保留关键概念、易错点、边界情况和练习建议。",
        "- 生成内容应适合导出为可编辑 PPTX。",
        "",
        "建议页结构：",
    ]
    for index, slide in enumerate(slides, start=1):
        bullets = "；".join(str(item) for item in slide.get("bullets", [])[:5])
        notes = str(slide.get("speaker_notes", "")).strip()
        lines.append(f"{index}. {slide.get('title', '')}：{bullets}")
        if notes:
            lines.append(f"   讲解重点：{notes}")
    if citations:
        lines.extend(["", "课程资料引用依据："])
        for citation in citations[:5]:
            lines.append(f"- {citation.get('title', '')}：{citation.get('summary', '')}")
    return "\n".join(lines)


def _slide_markdown(slide: dict[str, Any], index: int) -> str:
    title = str(slide.get("title") or f"第 {index} 页").strip()
    subtitle = str(slide.get("subtitle") or "").strip()
    bullets = [str(item).strip() for item in slide.get("bullets", []) if str(item).strip()]
    notes = str(slide.get("speaker_notes") or "").strip()
    lines = [f"# {title}"]
    if subtitle:
        lines.extend(["", f"_{subtitle}_"])
    if bullets:
        lines.append("")
        lines.extend(f"- {item}" for item in bullets[:6])
    if notes:
        lines.extend(["", f"> 讲稿提示：{notes}"])
    return "\n".join(lines)


def _slides_markdown(slides: list[dict[str, Any]]) -> list[str]:
    return [_slide_markdown(slide, index) for index, slide in enumerate(slides, start=1)]


def _generation_body(settings: Settings, prompt: str, slides: list[dict[str, Any]]) -> dict[str, Any]:
    body: dict[str, Any] = {
        "content": prompt,
        "slides_markdown": _slides_markdown(slides),
        "instructions": "请严格按照 slides_markdown 中的页数和每页内容生成中文教学 PPTX，不要重新规划页数，不要额外增加目录页。",
        "language": settings.presenton_language,
        "tone": "educational",
        "verbosity": "standard",
        "include_title_slide": False,
        "include_table_of_contents": False,
        "export_as": "pptx",
    }
    if settings.presenton_template:
        body["template"] = settings.presenton_template
    return body


def _response_path(data: dict[str, Any]) -> str:
    for key in ("path", "pptx_path", "file_path", "download_path", "download_url", "url"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise PresentonError("Presenton 响应中没有可下载的 PPTX 路径。")


def _compact_text(value: Any, limit: int = 420) -> str:
    chunks: list[str] = []

    def walk(item: Any) -> None:
        if item is None:
            return
        if isinstance(item, str):
            text = item.strip()
            if text and not text.startswith("/") and len(text) <= 1200:
                chunks.append(text)
            return
        if isinstance(item, list):
            for child in item:
                walk(child)
            return
        if isinstance(item, dict):
            for key, child in item.items():
                if str(key).startswith("__"):
                    continue
                walk(child)

    walk(value)
    joined = "；".join(dict.fromkeys(chunks))
    return joined[:limit]


def _slide_title(content: dict[str, Any], fallback: str) -> str:
    title_keys = {
        "title",
        "headline",
        "headline_text",
        "section_title",
        "main_title",
        "slide_title",
        "question",
    }

    def walk(item: Any) -> str | None:
        if isinstance(item, dict):
            for key, value in item.items():
                if str(key) in title_keys and isinstance(value, str) and value.strip():
                    return value.strip()[:120]
            for value in item.values():
                found = walk(value)
                if found:
                    return found
        elif isinstance(item, list):
            for value in item:
                found = walk(value)
                if found:
                    return found
        return None

    return walk(content) or fallback


def _image_url(content: dict[str, Any], base_url: str) -> str | None:
    def walk(item: Any) -> str | None:
        if isinstance(item, dict):
            for key, value in item.items():
                if str(key).endswith("image_url") and isinstance(value, str) and value.strip():
                    return _file_url(base_url, value.strip())
            for value in item.values():
                found = walk(value)
                if found:
                    return found
        elif isinstance(item, list):
            for value in item:
                found = walk(value)
                if found:
                    return found
        return None

    return walk(content)


def _presenton_slides(data: dict[str, Any], base_url: str) -> list[dict[str, Any]]:
    slides = data.get("slides")
    if not isinstance(slides, list):
        return []
    output: list[dict[str, Any]] = []
    for index, slide in enumerate(slides):
        if not isinstance(slide, dict):
            continue
        content = slide.get("content") if isinstance(slide.get("content"), dict) else {}
        fallback = f"第 {index + 1} 页"
        output.append(
            {
                "id": slide.get("id"),
                "index": slide.get("index", index),
                "layout": slide.get("layout"),
                "layout_group": slide.get("layout_group"),
                "title": _slide_title(content, fallback),
                "summary": _compact_text(content),
                "image_url": _image_url(content, base_url),
                "speaker_note": slide.get("speaker_note") or content.get("__speaker_note__"),
                "content": content,
            }
        )
    return output


def _file_url(base_url: str, raw_path: str) -> str:
    if raw_path.startswith("http://") or raw_path.startswith("https://"):
        return raw_path
    return urljoin(base_url.rstrip("/") + "/", raw_path.lstrip("/"))


def _public_url(settings: Settings, raw_path: str | None) -> str | None:
    if not raw_path:
        return None
    base_url = settings.presenton_public_base_url or settings.presenton_base_url
    if not base_url:
        return None
    return _file_url(str(base_url), raw_path)


async def generate_presenton_pptx(
    *,
    resource_id: str,
    title: str,
    message: str,
    knowledge_point: str,
    slides: list[dict[str, Any]],
    citations: list[dict[str, Any]],
    output_dir: Path,
    settings: Settings | None = None,
) -> dict[str, Any]:
    value = settings or get_settings()
    if not presenton_configured(value):
        raise PresentonError("Presenton 未启用或未配置服务地址。")

    base_url = str(value.presenton_base_url).rstrip("/")
    prompt = _build_prompt(
        title=title,
        message=message,
        knowledge_point=knowledge_point,
        slides=slides,
        citations=citations,
    )
    body = _generation_body(value, prompt, slides)

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{resource_id}.pptx"
    headers = _headers(value)
    endpoint = f"{base_url}/api/v1/ppt/presentation/generate"

    try:
        async with httpx.AsyncClient(timeout=value.presenton_timeout_seconds, trust_env=False) as client:
            response = await client.post(endpoint, json=body, headers={**headers, "Content-Type": "application/json"})
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                detail = response.text[:1000] if response.text else response.reason_phrase
                raise PresentonError(f"Presenton 生成接口返回 {response.status_code}：{detail}") from exc
            data = response.json()
            raw_path = _response_path(data if isinstance(data, dict) else {})
            presentation_id = data.get("presentation_id") if isinstance(data, dict) else None
            presentation_detail: dict[str, Any] | None = None
            if isinstance(presentation_id, str) and presentation_id:
                detail_response = await client.get(f"{base_url}/api/v1/ppt/presentation/{presentation_id}", headers=headers)
                try:
                    detail_response.raise_for_status()
                except httpx.HTTPStatusError:
                    presentation_detail = None
                else:
                    detail_data = detail_response.json()
                    presentation_detail = detail_data if isinstance(detail_data, dict) else None
            file_response = await client.get(_file_url(base_url, raw_path), headers=headers)
            try:
                file_response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                detail = file_response.text[:1000] if file_response.text else file_response.reason_phrase
                raise PresentonError(f"Presenton 文件下载返回 {file_response.status_code}：{detail}") from exc
            content = file_response.content
    except PresentonError:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise PresentonError(f"Presenton PPT 生成失败：{exc}") from exc

    if len(content) < 100:
        raise PresentonError("Presenton 返回的 PPTX 文件为空或不完整。")
    output_path.write_bytes(content)
    return {
        "file_path": str(output_path),
        "file_format": "PPTX",
        "provider_payload": data,
        "presentation_detail": presentation_detail,
        "presenton_slides": _presenton_slides(presentation_detail or {}, base_url),
        "download_path": raw_path,
        "edit_url": _public_url(value, data.get("edit_path") if isinstance(data, dict) else None),
        "download_url": _public_url(value, raw_path),
    }


async def fetch_presenton_slides(presentation_id: str, settings: Settings | None = None) -> list[dict[str, Any]]:
    value = settings or get_settings()
    if not presenton_configured(value):
        return []
    base_url = str(value.presenton_base_url).rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=min(value.presenton_timeout_seconds, 30), trust_env=False) as client:
            response = await client.get(f"{base_url}/api/v1/ppt/presentation/{presentation_id}", headers=_headers(value))
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError):
        return []
    return _presenton_slides(data if isinstance(data, dict) else {}, base_url)


def fetch_presenton_slides_sync(presentation_id: str, settings: Settings | None = None) -> list[dict[str, Any]]:
    value = settings or get_settings()
    if not presenton_configured(value):
        return []
    base_url = str(value.presenton_base_url).rstrip("/")
    try:
        with httpx.Client(timeout=min(value.presenton_timeout_seconds, 30), trust_env=False) as client:
            response = client.get(f"{base_url}/api/v1/ppt/presentation/{presentation_id}", headers=_headers(value))
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError):
        return []
    return _presenton_slides(data if isinstance(data, dict) else {}, base_url)
