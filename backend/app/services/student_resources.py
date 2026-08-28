import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, TypedDict
from urllib.parse import urljoin
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.ai.errors import LLMError
from backend.app.ai.llm_client import chat_json
from backend.app.ai.run_recorder import finish_run, new_run_id, record_step, start_run
from backend.app.ai.schemas import AgentRunContext
from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings
from backend.app.models import (
    AgentRun,
    Course,
    KnowledgeSource,
    LearnerEvent,
    StudentGeneratedResource,
    User,
)
from backend.app.models.entities import utc_now
from backend.app.services.learner_profile import serialize_learner_profile
from backend.app.services.presenton_client import (
    PresentonError,
    fetch_presenton_slides_sync,
    generate_presenton_pptx,
    presenton_configured,
)
from backend.app.services.ppt_master_client import (
    PptMasterError,
    generate_ppt_master_pptx,
    ppt_master_configured,
)
from backend.app.services.submissions import iso

try:
    from langgraph.graph import END, StateGraph
except Exception:  # pragma: no cover - optional dependency fallback
    END = None
    StateGraph = None


WORKFLOW_TYPE = "student_ppt_resource_generation"
GENERIC_WORKFLOW_TYPE = "student_resource_generation"
PROMPT_VERSION = "student_ppt_resource_v0.1"
GENERIC_PROMPT_VERSION = "student_resource_v0.2"
MAX_SOURCE_COUNT = 5
MAX_SOURCE_CHARS = 900

SUPPORTED_RESOURCE_TYPES = {
    "PPT",
    "DOCUMENT",
    "MIND_MAP",
    "PRACTICE_SET",
    "KNOWLEDGE_CARD",
    "PODCAST_SCRIPT",
}

RESOURCE_TYPE_LABELS = {
    "PPT": "PPT",
    "DOCUMENT": "文档",
    "MIND_MAP": "思维导图",
    "PRACTICE_SET": "练习题",
    "KNOWLEDGE_CARD": "知识卡片",
    "PODCAST_SCRIPT": "播客稿",
}


class PptResourceState(TypedDict, total=False):
    run_id: str
    student_id: str
    class_id: str
    course_id: str
    session_id: str | None
    message: str
    knowledge_point: str
    profile: dict[str, Any] | None
    sources: list[KnowledgeSource]
    citations: list[dict[str, Any]]
    slides: list[dict[str, Any]]
    title: str
    summary: str
    confidence: float
    file_path: str
    resource: StudentGeneratedResource
    run: AgentRun


class GenericResourceState(TypedDict, total=False):
    run_id: str
    student_id: str
    class_id: str
    course_id: str
    session_id: str | None
    message: str
    resource_type: str
    knowledge_point: str
    profile: dict[str, Any] | None
    sources: list[KnowledgeSource]
    citations: list[dict[str, Any]]
    title: str
    summary: str
    confidence: float
    render_payload: dict[str, Any]
    file_path: str
    file_format: str
    item_count: int
    resource: StudentGeneratedResource
    run: AgentRun


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _json_loads(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _trim(text: str | None, limit: int) -> str:
    value = (text or "").strip()
    if len(value) <= limit:
        return value
    return f"{value[:limit]}..."


def _safe_json_list(raw: str | None) -> list[str]:
    value = _json_loads(raw, [])
    return [str(item) for item in value] if isinstance(value, list) else []


def _terms(text: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9_]{2,}|[\u4e00-\u9fff]{2,}", text)
    grams: list[str] = []
    seen: set[str] = set()
    for word in words:
        lowered = word.lower()
        candidates = [lowered]
        if re.fullmatch(r"[\u4e00-\u9fff]{3,}", word):
            candidates.extend(word[index : index + 2] for index in range(len(word) - 1))
        for item in candidates:
            if item and item not in seen:
                seen.add(item)
                grams.append(item)
    return grams


def _relevance(query: str, source: KnowledgeSource) -> float:
    content = "\n".join(
        [
            source.title or "",
            source.summary or "",
            source.content or "",
            " ".join(_safe_json_list(source.knowledge_points)),
        ]
    ).lower()
    terms = _terms(query)
    if not terms:
        return 0
    return sum(1 for term in terms if term.lower() in content) / max(len(terms), 1)


def _citation(source: KnowledgeSource) -> dict[str, Any]:
    return {
        "source_id": source.id,
        "title": source.title,
        "summary": source.summary,
        "source_type": source.source_type,
        "version": source.version,
        "authority_level": source.authority_level,
    }


def _source_payload(source: KnowledgeSource) -> dict[str, Any]:
    return {
        **_citation(source),
        "chapter": source.chapter,
        "knowledge_points": _safe_json_list(source.knowledge_points),
        "content": _trim(source.content or source.summary, MAX_SOURCE_CHARS),
    }


def _load_sources(db: Session, course_id: str, message: str) -> list[KnowledgeSource]:
    all_sources = list(
        db.scalars(
            select(KnowledgeSource)
            .where(
                KnowledgeSource.course_id == course_id,
                KnowledgeSource.status == "ACTIVE",
                KnowledgeSource.ai_retrievable.is_(True),
                KnowledgeSource.student_visible.is_(True),
            )
            .order_by(KnowledgeSource.authority_level.desc(), KnowledgeSource.updated_at.desc())
        ).all()
    )
    scored = [(source, _relevance(message, source)) for source in all_sources]
    matched = [source for source, score in sorted(scored, key=lambda item: item[1], reverse=True) if score > 0]
    return (matched or all_sources)[:MAX_SOURCE_COUNT]


def _guess_knowledge_point(message: str, sources: list[KnowledgeSource]) -> str:
    candidates = ["队列", "栈与队列", "循环队列", "链表", "二叉树", "机器学习", "Python"]
    for item in candidates:
        if item in message:
            return item
    for source in sources:
        points = _safe_json_list(source.knowledge_points)
        if points:
            return points[0]
    return "自主学习主题"


def _fallback_slides(
    *,
    message: str,
    course: Course,
    knowledge_point: str,
    sources: list[KnowledgeSource],
) -> tuple[str, str, list[dict[str, Any]]]:
    title = f"{knowledge_point}讲解 PPT"
    source_ids = [source.id for source in sources[:3]]
    source_summary = sources[0].summary if sources else f"围绕{knowledge_point}生成学习讲解。"
    slides = [
        {
            "title": title,
            "subtitle": f"{course.name} · 自主学习资源",
            "bullets": [f"学习目标：理解{knowledge_point}的核心概念", "资源类型：AI 生成演示文稿", "使用方式：预览后可加入资源中心"],
            "speaker_notes": "开场说明本资源用于自主学习复习，不替代课堂讲义。",
            "citation_ids": source_ids[:1],
            "layout": "cover",
        },
        {
            "title": f"{knowledge_point}的核心概念",
            "bullets": [source_summary, "关注数据进入、处理和离开的顺序", "把抽象概念和实际场景联系起来理解"],
            "speaker_notes": "先用生活中的排队场景降低理解门槛，再过渡到专业术语。",
            "citation_ids": source_ids[:2],
            "layout": "content",
        },
        {
            "title": "关键操作与状态变化",
            "bullets": ["明确操作入口和出口", "跟踪关键指针或状态变量", "每一步都要维护结构不变式"],
            "speaker_notes": "引导学生用表格或手动画图追踪状态变化。",
            "citation_ids": source_ids[:2],
            "layout": "content",
        },
        {
            "title": "常见错误与边界情况",
            "bullets": ["忽略空结构或满结构", "更新顺序错误导致状态不一致", "只验证普通用例，没有覆盖边界输入"],
            "speaker_notes": "强调边界测试是数据结构实现中最容易暴露问题的部分。",
            "citation_ids": source_ids[1:3] or source_ids[:1],
            "layout": "content",
        },
        {
            "title": "课堂练习建议",
            "bullets": ["先画出状态变化过程", "再写出关键操作伪过程", "最后用 3 到 5 个边界用例自测"],
            "speaker_notes": "这页用于把讲解转成学生下一步行动。",
            "citation_ids": source_ids[:2],
            "layout": "content",
        },
        {
            "title": "学习总结",
            "bullets": [f"{knowledge_point}要同时理解规则和实现细节", "遇到错误时优先检查边界状态", "建议保存本资源并继续生成配套练习"],
            "speaker_notes": "收束重点，并引导学生加入资源中心后继续复习。",
            "citation_ids": source_ids[:1],
            "layout": "summary",
        },
    ]
    summary = f"围绕“{message}”生成 {len(slides)} 页 {knowledge_point}讲解 PPT。"
    return title, summary, slides


def _validate_model_slides(raw: dict[str, Any], allowed_source_ids: set[str]) -> tuple[str, str, list[dict[str, Any]]]:
    title = str(raw.get("title", "")).strip()[:120]
    summary = str(raw.get("summary", "")).strip()[:260]
    slides_raw = raw.get("slides")
    if not title or not isinstance(slides_raw, list) or len(slides_raw) < 4:
        raise ValueError("invalid ppt structure")
    slides: list[dict[str, Any]] = []
    for slide in slides_raw[:10]:
        if not isinstance(slide, dict):
            continue
        slide_title = str(slide.get("title", "")).strip()[:100]
        bullets = [str(item).strip()[:140] for item in slide.get("bullets", []) if str(item).strip()]
        notes = str(slide.get("speaker_notes", "")).strip()[:420]
        raw_citations = slide.get("citation_ids", [])
        citation_ids = [str(item) for item in raw_citations if str(item) in allowed_source_ids][:3] if isinstance(raw_citations, list) else []
        if slide_title and bullets:
            slides.append(
                {
                    "title": slide_title,
                    "subtitle": str(slide.get("subtitle", "")).strip()[:100],
                    "bullets": bullets[:5],
                    "speaker_notes": notes,
                    "citation_ids": citation_ids,
                    "layout": str(slide.get("layout", "content")).strip() or "content",
                }
            )
    if len(slides) < 4:
        raise ValueError("too few valid slides")
    return title, summary or f"{title}，共 {len(slides)} 页。", slides


async def _generate_model_slides(
    *,
    course: Course,
    message: str,
    knowledge_point: str,
    profile: dict[str, Any] | None,
    sources: list[KnowledgeSource],
) -> tuple[str, str, list[dict[str, Any]]] | None:
    settings = get_settings()
    if not settings.model_api_key or not settings.model_name:
        return None
    payload = {
        "course": {"id": course.id, "name": course.name},
        "student_request": message,
        "knowledge_point": knowledge_point,
        "learner_profile": profile,
        "knowledge_sources": [_source_payload(source) for source in sources],
        "task": "生成一个可在浏览器预览并可导出为 PPTX 的完整中文教学演示文稿结构。",
        "requirements": [
            "不是大纲，每页必须有标题、要点和讲稿提示。",
            "每页要点适合直接渲染成幻灯片。",
            "只能引用 knowledge_sources 中存在的 source_id。",
            "不要生成虚构教材、论文或链接。",
        ],
        "output_schema": {
            "title": "PPT title",
            "summary": "short resource summary",
            "slides": "4-10 slides, each has title, subtitle, bullets, speaker_notes, citation_ids, layout",
        },
    }
    allowed = {source.id for source in sources}
    result = await chat_json(
        [
            {
                "role": "system",
                "content": "你是 CodeTrack 的教学资源生成器。只输出 JSON，不要 Markdown。",
            },
            {"role": "user", "content": _json_dumps(payload)},
        ],
        model=settings.model_name,
        api_key=settings.model_api_key,
        base_url=settings.model_api_base_url,
        timeout=35,
    )
    return _validate_model_slides(result.data, allowed)


def _add_text_box(slide, left, top, width, height, text: str, font_size, color, bold: bool = False):
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.clear()
    paragraph = frame.paragraphs[0]
    paragraph.text = text
    paragraph.font.size = font_size
    paragraph.font.bold = bold
    paragraph.font.color.rgb = color
    return box


def _render_pptx(resource_id: str, title: str, slides: list[dict[str, Any]], citations: list[dict[str, Any]]) -> str:
    try:
        from pptx import Presentation
        from pptx.dml.color import RGBColor
        from pptx.enum.shapes import MSO_SHAPE
        from pptx.enum.text import PP_ALIGN
        from pptx.util import Inches, Pt
    except ModuleNotFoundError as exc:
        raise ApiError(
            503,
            "PPT_RENDERER_NOT_INSTALLED",
            "PPT 生成依赖尚未安装，请先安装 backend/requirements.txt 中的 python-pptx。",
            details={"missing_module": exc.name},
        ) from exc

    settings = get_settings()
    storage_dir = Path(settings.resource_storage_dir) / "generated" / "ppt"
    storage_dir.mkdir(parents=True, exist_ok=True)
    path = storage_dir / f"{resource_id}.pptx"
    citation_titles = {item["source_id"]: item["title"] for item in citations}

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    for index, item in enumerate(slides):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        bg = slide.background.fill
        bg.solid()
        bg.fore_color.rgb = RGBColor(248, 251, 255)
        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.18))
        bar.fill.solid()
        bar.fill.fore_color.rgb = RGBColor(23, 108, 245)
        bar.line.color.rgb = RGBColor(23, 108, 245)

        if index == 0:
            _add_text_box(slide, Inches(0.8), Inches(1.35), Inches(11.6), Inches(0.8), item["title"], Pt(34), RGBColor(15, 27, 69), True)
            subtitle = item.get("subtitle") or title
            _add_text_box(slide, Inches(0.86), Inches(2.25), Inches(9.8), Inches(0.45), subtitle, Pt(18), RGBColor(79, 91, 117))
            top = 3.15
        else:
            _add_text_box(slide, Inches(0.65), Inches(0.58), Inches(11.8), Inches(0.52), item["title"], Pt(25), RGBColor(15, 27, 69), True)
            top = 1.55

        bullet_box = slide.shapes.add_textbox(Inches(0.86), Inches(top), Inches(11.5), Inches(3.8))
        frame = bullet_box.text_frame
        frame.clear()
        for bullet_index, bullet in enumerate(item.get("bullets", [])):
            paragraph = frame.paragraphs[0] if bullet_index == 0 else frame.add_paragraph()
            paragraph.text = str(bullet)
            paragraph.level = 0
            paragraph.font.size = Pt(18 if index else 16)
            paragraph.font.color.rgb = RGBColor(35, 48, 74)
            paragraph.space_after = Pt(10)

        notes = item.get("speaker_notes", "")
        if notes:
            _add_text_box(slide, Inches(0.86), Inches(5.6), Inches(8.4), Inches(0.42), f"讲稿提示：{notes}", Pt(10), RGBColor(100, 116, 139))

        ids = [source_id for source_id in item.get("citation_ids", []) if source_id in citation_titles]
        if ids:
            citation_text = "引用：" + "；".join(citation_titles[source_id] for source_id in ids[:2])
            _add_text_box(slide, Inches(0.86), Inches(6.55), Inches(10.6), Inches(0.28), citation_text, Pt(9), RGBColor(90, 105, 130))

        page = slide.shapes.add_textbox(Inches(11.9), Inches(6.55), Inches(0.8), Inches(0.28))
        page.text_frame.text = f"{index + 1}/{len(slides)}"
        page.text_frame.paragraphs[0].alignment = PP_ALIGN.RIGHT
        page.text_frame.paragraphs[0].font.size = Pt(9)
        page.text_frame.paragraphs[0].font.color.rgb = RGBColor(100, 116, 139)

    prs.save(path)
    return str(path)


def _resolve_libreoffice_command(settings: Any) -> str | None:
    configured = str(getattr(settings, "libreoffice_command", "") or "").strip()
    if configured:
        return configured
    for candidate in ("soffice", "libreoffice"):
        found = shutil.which(candidate)
        if found:
            return found
    return None


def _preview_base_metadata(renderer: str) -> dict[str, Any]:
    return {
        "preview_renderer": renderer,
        "preview_format": "PDF",
    }


def _preview_output_dir(resource_id: str) -> Path:
    return (Path(get_settings().resource_storage_dir) / "generated" / "previews" / resource_id).resolve()


def _power_shell_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _render_ppt_pdf_preview_with_powerpoint(resource_id: str, source_path: Path, timeout_seconds: int) -> dict[str, Any]:
    metadata = _preview_base_metadata("powerpoint_pdf")
    if os.name != "nt":
        metadata["preview_error"] = "本机 PowerPoint 预览仅支持 Windows 环境。"
        return metadata

    power_shell = shutil.which("powershell") or shutil.which("pwsh")
    if not power_shell:
        metadata["preview_error"] = "未找到 PowerShell，无法调用本机 PowerPoint 生成预览。"
        return metadata

    preview_dir = _preview_output_dir(resource_id)
    preview_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = preview_dir / f"{source_path.stem}.pdf"
    if pdf_path.exists():
        pdf_path.unlink()

    script = f"""
$ErrorActionPreference = 'Stop'
$inputPath = {_power_shell_literal(str(source_path))}
$outputPath = {_power_shell_literal(str(pdf_path))}
$ppt = $null
$presentation = $null
try {{
  $ppt = New-Object -ComObject PowerPoint.Application
  $presentation = $ppt.Presentations.Open($inputPath, $true, $false, $false)
  $presentation.SaveAs($outputPath, 32)
}} finally {{
  if ($presentation -ne $null) {{
    $presentation.Close() | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null
  }}
  if ($ppt -ne $null) {{
    $ppt.Quit() | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
  }}
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}}
""".strip()
    try:
        completed = subprocess.run(
            [power_shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            cwd=str(preview_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        metadata["preview_error"] = f"PowerPoint 预览转换失败：{exc}"
        return metadata

    if completed.returncode != 0 or not pdf_path.exists() or pdf_path.stat().st_size < 100:
        detail = (completed.stderr or completed.stdout or "未生成 PDF 文件").strip()[-500:]
        metadata["preview_error"] = f"PowerPoint 预览转换失败：{detail}"
        return metadata

    metadata.update(
        {
            "preview_available": True,
            "preview_path": str(pdf_path),
            "preview_media_type": "application/pdf",
        }
    )
    return metadata


def _render_ppt_pdf_preview_with_libreoffice(resource_id: str, source_path: Path, timeout_seconds: int) -> dict[str, Any]:
    settings = get_settings()
    metadata = _preview_base_metadata("libreoffice_pdf")

    command = _resolve_libreoffice_command(settings)
    if not command:
        metadata["preview_error"] = "未找到 LibreOffice/soffice 命令，无法生成真实 PDF 预览。"
        return metadata

    preview_dir = _preview_output_dir(resource_id)
    preview_dir.mkdir(parents=True, exist_ok=True)
    expected_path = preview_dir / f"{source_path.stem}.pdf"
    if expected_path.exists():
        expected_path.unlink()

    args = [
        command,
        "--headless",
        "--invisible",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        str(preview_dir),
        str(source_path),
    ]
    try:
        completed = subprocess.run(
            args,
            cwd=str(preview_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        metadata["preview_error"] = f"LibreOffice 预览转换失败：{exc}"
        return metadata

    pdf_path = expected_path if expected_path.exists() else None
    if not pdf_path:
        candidates = sorted(preview_dir.glob("*.pdf"), key=lambda item: item.stat().st_mtime, reverse=True)
        pdf_path = candidates[0] if candidates else None
    if completed.returncode != 0 or not pdf_path or not pdf_path.exists() or pdf_path.stat().st_size < 100:
        detail = (completed.stderr or completed.stdout or "未生成 PDF 文件").strip()[-500:]
        metadata["preview_error"] = f"LibreOffice 预览转换失败：{detail}"
        return metadata

    metadata.update(
        {
            "preview_available": True,
            "preview_path": str(pdf_path),
            "preview_media_type": "application/pdf",
        }
    )
    return metadata


def _render_ppt_pdf_preview(resource_id: str, pptx_path: str, file_format: str) -> dict[str, Any]:
    settings = get_settings()
    metadata = _preview_base_metadata("local_pdf")
    timeout_seconds = max(10, int(getattr(settings, "ppt_preview_timeout_seconds", 90) or 90))
    mode = str(getattr(settings, "ppt_preview_renderer", "auto") or "auto").strip().lower()
    aliases = {
        "": "auto",
        "office": "powerpoint",
        "powerpoint_pdf": "powerpoint",
        "libreoffice_pdf": "libreoffice",
        "soffice": "libreoffice",
    }
    mode = aliases.get(mode, mode)

    if not bool(getattr(settings, "ppt_preview_enabled", True)):
        metadata["preview_error"] = "PPT PDF 预览已关闭。"
        return metadata
    if file_format.upper() != "PPTX":
        metadata["preview_error"] = f"当前文件格式 {file_format} 不支持 PPT 预览转换。"
        return metadata

    source_path = Path(pptx_path).resolve()
    if not source_path.exists():
        metadata["preview_error"] = "PPTX 文件不存在，无法生成预览。"
        return metadata

    renderers = []
    if mode == "powerpoint":
        renderers = [_render_ppt_pdf_preview_with_powerpoint]
    elif mode == "libreoffice":
        renderers = [_render_ppt_pdf_preview_with_libreoffice]
    else:
        renderers = [_render_ppt_pdf_preview_with_powerpoint, _render_ppt_pdf_preview_with_libreoffice]

    errors: list[str] = []
    last_result: dict[str, Any] | None = None
    for renderer in renderers:
        result = renderer(resource_id, source_path, timeout_seconds)
        last_result = result
        if result.get("preview_available"):
            return result
        if result.get("preview_error"):
            errors.append(str(result["preview_error"]))

    if last_result:
        metadata.update({key: value for key, value in last_result.items() if key.startswith("preview_")})
    metadata["preview_error"] = "；".join(errors) or "未生成真实 PDF 预览。"
    return metadata


def _ppt_renderer_mode(settings: Any) -> str:
    mode = str(getattr(settings, "ppt_renderer", "auto") or "auto").strip().lower()
    aliases = {
        "": "auto",
        "python": "local",
        "python-pptx": "local",
        "local_pptx": "local",
        "pptmaster": "ppt_master",
        "ppt-master": "ppt_master",
    }
    return aliases.get(mode, mode)


def ppt_renderer_config_payload() -> dict[str, Any]:
    settings = get_settings()
    mode = _ppt_renderer_mode(settings)
    presenton_ready = presenton_configured(settings)
    ppt_master_bridge_ready = ppt_master_configured(settings)
    ppt_master_home = Path(settings.ppt_master_home).resolve() if settings.ppt_master_home else None
    ppt_master_skill_dir = ppt_master_home / "skills" / "ppt-master" if ppt_master_home else None
    ppt_master_official_ready = bool(
        ppt_master_bridge_ready
        and ppt_master_home
        and ppt_master_home.exists()
        and ppt_master_skill_dir
        and (ppt_master_skill_dir / "scripts" / "svg_to_pptx.py").exists()
    )
    if mode == "presenton":
        active = "presenton" if presenton_ready else "local_pptx"
    elif mode == "ppt_master":
        if ppt_master_official_ready:
            active = "ppt_master"
        elif ppt_master_bridge_ready:
            active = "ppt_master_bridge"
        else:
            active = "local_pptx"
    elif mode == "local":
        active = "local_pptx"
    elif mode == "auto":
        active = "presenton" if presenton_ready else "local_pptx"
    else:
        active = "local_pptx"
    return {
        "requested": mode,
        "active": active,
        "available": {
            "presenton": presenton_ready,
            "ppt_master": ppt_master_official_ready,
            "ppt_master_bridge": ppt_master_bridge_ready,
            "local_pptx": True,
        },
        "ppt_master": {
            "command_configured": bool(settings.ppt_master_command),
            "home_configured": bool(settings.ppt_master_home),
            "home_exists": bool(ppt_master_home and ppt_master_home.exists()),
            "skill_dir_exists": bool(ppt_master_skill_dir and ppt_master_skill_dir.exists()),
            "official_converter_exists": bool(
                ppt_master_skill_dir and (ppt_master_skill_dir / "scripts" / "svg_to_pptx.py").exists()
            ),
        },
        "fallback": active == "local_pptx" and mode not in {"local", "auto"},
    }


async def _render_ppt_resource_file(
    db: Session,
    state: PptResourceState,
    resource_id: str,
) -> tuple[str, str, dict[str, Any]]:
    settings = get_settings()
    mode = _ppt_renderer_mode(settings)
    metadata: dict[str, Any] = {"renderer": "local_pptx", "renderer_requested": mode}

    if mode not in {"auto", "presenton", "ppt_master", "local"}:
        metadata["renderer_config_error"] = f"未知 PPT 渲染器：{mode}"
        record_step(
            db,
            state["run"],
            step_name="select_ppt_renderer",
            step_order=5,
            status="FAILED",
            output_summary={"fallback": True, "reason": metadata["renderer_config_error"]},
        )

    should_try_ppt_master = mode == "ppt_master" and ppt_master_configured(settings)
    should_try_presenton = mode in {"auto", "presenton"} and presenton_configured(settings)

    if mode == "ppt_master" and not ppt_master_configured(settings):
        metadata["ppt_master_error"] = "PPT Master 未启用或未配置包装命令。"
        record_step(
            db,
            state["run"],
            step_name="select_ppt_master_renderer",
            step_order=5,
            status="FAILED",
            output_summary={"fallback": True, "reason": metadata["ppt_master_error"]},
        )

    if mode == "presenton" and not presenton_configured(settings):
        metadata["presenton_error"] = "Presenton 未启用或未配置服务地址。"
        record_step(
            db,
            state["run"],
            step_name="select_presenton_renderer",
            step_order=5,
            status="FAILED",
            output_summary={"fallback": True, "reason": metadata["presenton_error"]},
        )

    if should_try_ppt_master:
        output_dir = Path(settings.resource_storage_dir) / "generated" / "ppt_master"
        try:
            result = await generate_ppt_master_pptx(
                resource_id=resource_id,
                title=state["title"],
                message=state["message"],
                knowledge_point=state["knowledge_point"],
                slides=state["slides"],
                citations=state["citations"],
                output_dir=output_dir,
                settings=settings,
            )
        except PptMasterError as exc:
            metadata["ppt_master_error"] = str(exc)[:400]
            record_step(
                db,
                state["run"],
                step_name="render_ppt_master_pptx",
                step_order=5,
                status="FAILED",
                output_summary={"fallback": True, "reason": str(exc)[:240]},
            )
        else:
            provider_payload = result.get("provider_payload") if isinstance(result.get("provider_payload"), dict) else {}
            metadata.update(
                {
                    "renderer": "ppt_master",
                    "ppt_master_request_path": result.get("request_path"),
                    "ppt_master_stdout_tail": result.get("stdout_tail"),
                    "ppt_master_stderr_tail": result.get("stderr_tail"),
                    "ppt_master_project_id": provider_payload.get("project_id"),
                    "ppt_master_export_path": provider_payload.get("export_path"),
                    "ppt_master_implementation": provider_payload.get("implementation"),
                    "ppt_master_official_converter_error": provider_payload.get("official_converter_error"),
                }
            )
            record_step(
                db,
                state["run"],
                step_name="render_ppt_master_pptx",
                step_order=5,
                output_summary={"resource_id": resource_id, "file_format": result["file_format"], "renderer": "ppt_master"},
            )
            return str(result["file_path"]), str(result["file_format"]), metadata

    if should_try_presenton:
        output_dir = Path(settings.resource_storage_dir) / "generated" / "presenton"
        try:
            result = await generate_presenton_pptx(
                resource_id=resource_id,
                title=state["title"],
                message=state["message"],
                knowledge_point=state["knowledge_point"],
                slides=state["slides"],
                citations=state["citations"],
                output_dir=output_dir,
                settings=settings,
            )
        except PresentonError as exc:
            metadata["presenton_error"] = str(exc)[:400]
            record_step(
                db,
                state["run"],
                step_name="render_presenton_pptx",
                step_order=5,
                status="FAILED",
                output_summary={"fallback": True, "reason": str(exc)[:240]},
            )
        else:
            provider_payload = result.get("provider_payload") if isinstance(result.get("provider_payload"), dict) else {}
            metadata.update(
                {
                    "renderer": "presenton",
                    "renderer_requested": mode,
                    "presenton_presentation_id": provider_payload.get("presentation_id"),
                    "presenton_edit_path": provider_payload.get("edit_path"),
                    "presenton_edit_url": result.get("edit_url"),
                    "presenton_download_path": result.get("download_path"),
                    "presenton_download_url": result.get("download_url"),
                }
            )
            if isinstance(result.get("presenton_slides"), list):
                state["presenton_slides"] = result["presenton_slides"]
            record_step(
                db,
                state["run"],
                step_name="render_presenton_pptx",
                step_order=5,
                output_summary={
                    "resource_id": resource_id,
                    "file_format": result["file_format"],
                    "presentation_id": provider_payload.get("presentation_id"),
                },
            )
            return str(result["file_path"]), str(result["file_format"]), metadata

    path = _render_pptx(resource_id, state["title"], state["slides"], state["citations"])
    record_step(
        db,
        state["run"],
        step_name="render_local_pptx",
        step_order=6 if (metadata.get("presenton_error") or metadata.get("ppt_master_error") or metadata.get("renderer_config_error")) else 5,
        output_summary={"resource_id": resource_id, "file_format": "PPTX", "renderer": "local_pptx"},
    )
    return path, "PPTX", metadata


def _citation_titles(citations: list[dict[str, Any]]) -> str:
    titles = [str(item.get("title", "")).strip() for item in citations if str(item.get("title", "")).strip()]
    return "；".join(titles[:3]) or "课程知识库"


def _common_source_ids(sources: list[KnowledgeSource], limit: int = 3) -> list[str]:
    return [source.id for source in sources[:limit]]


def _fallback_document(
    *,
    message: str,
    course: Course,
    knowledge_point: str,
    sources: list[KnowledgeSource],
) -> tuple[str, str, dict[str, Any], int]:
    source_ids = _common_source_ids(sources)
    source_summary = sources[0].summary if sources else f"围绕{knowledge_point}生成学习讲解。"
    title = f"{knowledge_point}学习文档"
    sections = [
        {
            "heading": "学习目标",
            "paragraphs": [
                f"本资源面向{course.name}自主学习场景，帮助学生围绕“{message}”形成可复习的完整文档。",
                f"学习后应能说清{knowledge_point}的基本含义、关键操作、边界条件和常见应用。"
            ],
            "citation_ids": source_ids[:1],
        },
        {
            "heading": "核心概念",
            "paragraphs": [
                source_summary,
                f"理解{knowledge_point}时，需要同时关注抽象规则、状态变化和实际实现中的约束。"
            ],
            "citation_ids": source_ids[:2],
        },
        {
            "heading": "关键过程",
            "paragraphs": [
                "先识别输入、输出和状态变量，再按步骤追踪每一次操作对状态的影响。",
                "建议用表格、手绘过程图或伪过程记录中间状态，避免只记结论。"
            ],
            "citation_ids": source_ids[:2],
        },
        {
            "heading": "易错点与自检",
            "paragraphs": [
                "常见问题集中在空结构、满结构、边界输入和更新顺序上。",
                "完成学习后，可以用普通用例、最小用例和边界用例各做一次自测。"
            ],
            "citation_ids": source_ids[1:3] or source_ids[:1],
        },
        {
            "heading": "下一步学习建议",
            "paragraphs": [
                f"先保存本文档，再生成一组{knowledge_point}练习题巩固判断和实现能力。",
                "如果仍不稳定，可以回到 AI 对话窗口继续追问某个小步骤。"
            ],
            "citation_ids": source_ids[:1],
        },
    ]
    summary = f"围绕“{message}”生成 {len(sections)} 节中文学习文档。"
    return title, summary, {"sections": sections}, len(sections)


def _fallback_mind_map(
    *,
    message: str,
    course: Course,
    knowledge_point: str,
    sources: list[KnowledgeSource],
) -> tuple[str, str, dict[str, Any], int]:
    source_ids = _common_source_ids(sources)
    center_id = "center"
    branch_labels = [
        ("concept", "核心概念", [f"{knowledge_point}是什么", "结构规则", "适用场景"]),
        ("operation", "关键操作", ["输入与输出", "状态变化", "复杂度关注"]),
        ("boundary", "边界条件", ["空结构", "满结构", "最小用例"]),
        ("mistake", "常见错误", ["更新顺序", "遗漏判断", "只测普通用例"]),
        ("practice", "练习路径", ["画状态图", "写伪过程", "做边界测试"]),
    ]
    nodes = [
        {
            "id": center_id,
            "label": f"{knowledge_point}学习地图",
            "level": 0,
            "summary": f"{course.name} · {message}",
            "citation_ids": source_ids[:1],
        }
    ]
    edges: list[dict[str, Any]] = []
    for index, (branch_id, label, children) in enumerate(branch_labels, start=1):
        node_id = f"branch_{branch_id}"
        nodes.append(
            {
                "id": node_id,
                "label": label,
                "level": 1,
                "summary": " / ".join(children),
                "citation_ids": source_ids[: min(len(source_ids), 2)],
            }
        )
        edges.append({"source": center_id, "target": node_id, "label": "展开"})
        for child_index, child in enumerate(children, start=1):
            child_id = f"{branch_id}_{child_index}"
            nodes.append(
                {
                    "id": child_id,
                    "label": child,
                    "level": 2,
                    "summary": f"用于理解{knowledge_point}的{label}。",
                    "citation_ids": source_ids[index % len(source_ids): index % len(source_ids) + 1] if source_ids else [],
                }
            )
            edges.append({"source": node_id, "target": child_id, "label": "包含"})
    title = f"{knowledge_point}思维导图"
    summary = f"围绕“{message}”生成 {len(nodes)} 个节点的学习地图。"
    return title, summary, {"nodes": nodes, "edges": edges}, len(nodes)


def _fallback_practice_set(
    *,
    message: str,
    knowledge_point: str,
    sources: list[KnowledgeSource],
) -> tuple[str, str, dict[str, Any], int]:
    source_ids = _common_source_ids(sources)
    title = f"{knowledge_point}巩固练习"
    questions = [
        {
            "type": "single_choice",
            "stem": f"关于{knowledge_point}的核心规则，下列说法更合理的是哪一项？",
            "options": ["只关注最终结果", "需要跟踪状态变化和边界情况", "不需要测试空输入", "实现时无需考虑复杂度"],
            "answer": "需要跟踪状态变化和边界情况",
            "analysis": f"{knowledge_point}学习不能只记结论，必须能解释状态如何变化。",
            "citation_ids": source_ids[:1],
        },
        {
            "type": "short_answer",
            "stem": f"请用自己的话说明{knowledge_point}最容易出错的一个边界情况。",
            "answer": "示例：空结构、满结构、只有一个元素时的状态更新。",
            "analysis": "能主动识别边界情况，说明已经从概念理解走向实现检查。",
            "citation_ids": source_ids[:2],
        },
        {
            "type": "process",
            "stem": f"给定一个小规模样例，请手动画出{knowledge_point}每一步操作后的状态。",
            "answer": "按操作顺序列出状态变量或结构内容，确保每一步都符合不变式。",
            "analysis": "过程追踪可以发现只看最终结果时漏掉的更新顺序问题。",
            "citation_ids": source_ids[:2],
        },
        {
            "type": "debug",
            "stem": f"如果{knowledge_point}实现只能通过普通用例，却过不了边界用例，你会优先检查哪里？",
            "answer": "优先检查空/满判断、指针或索引更新顺序、返回值约定。",
            "analysis": "边界失败通常不是整体思路错误，而是状态维护细节不完整。",
            "citation_ids": source_ids[1:3] or source_ids[:1],
        },
        {
            "type": "reflection",
            "stem": f"完成“{message}”后，写出一个你还不确定的点。",
            "answer": "把不确定点带回 AI 对话继续追问，或生成配套讲解资源。",
            "analysis": "反思题用于把一次练习转成下一轮学习目标。",
            "citation_ids": source_ids[:1],
        },
    ]
    summary = f"围绕“{message}”生成 {len(questions)} 道巩固练习。"
    return title, summary, {"questions": questions}, len(questions)


def _fallback_knowledge_card(
    *,
    message: str,
    knowledge_point: str,
    sources: list[KnowledgeSource],
) -> tuple[str, str, dict[str, Any], int]:
    source_ids = _common_source_ids(sources)
    cards = [
        {
            "front": f"{knowledge_point}是什么？",
            "back": f"{knowledge_point}是一类需要理解规则、状态和边界条件的学习主题。",
            "tips": ["先讲规则", "再画状态", "最后测边界"],
            "citation_ids": source_ids[:1],
        },
        {
            "front": "为什么要画过程？",
            "back": "过程图能暴露状态变化是否符合不变式，特别适合排查更新顺序问题。",
            "tips": ["记录每一步", "标出入口出口", "关注最小用例"],
            "citation_ids": source_ids[:2],
        },
        {
            "front": "如何自检？",
            "back": "用普通用例、空/满或最小用例、连续操作用例分别验证。",
            "tips": ["不要只测一个例子", "把失败原因写成一句话"],
            "citation_ids": source_ids[1:3] or source_ids[:1],
        },
    ]
    title = f"{knowledge_point}知识卡片"
    summary = f"围绕“{message}”生成 {len(cards)} 张复习卡片。"
    return title, summary, {"cards": cards}, len(cards)


def _fallback_podcast_script(
    *,
    message: str,
    course: Course,
    knowledge_point: str,
    sources: list[KnowledgeSource],
) -> tuple[str, str, dict[str, Any], int]:
    source_ids = _common_source_ids(sources)
    title = f"{knowledge_point}播客讲解稿"
    segments = [
        {
            "speaker": "主持人",
            "label": "开场",
            "text": f"今天我们用一段短讲，梳理{course.name}里的{knowledge_point}。问题来自：{message}。",
            "citation_ids": source_ids[:1],
        },
        {
            "speaker": "讲解者",
            "label": "概念",
            "text": f"先抓住主线：{knowledge_point}不是孤立术语，要和操作规则、状态变化、边界情况一起理解。",
            "citation_ids": source_ids[:2],
        },
        {
            "speaker": "主持人",
            "label": "追问",
            "text": "那学生最容易卡在哪里？",
            "citation_ids": [],
        },
        {
            "speaker": "讲解者",
            "label": "易错点",
            "text": "常见卡点是只记住普通情况，没有检查空结构、满结构、最小规模和连续操作后的状态。",
            "citation_ids": source_ids[1:3] or source_ids[:1],
        },
        {
            "speaker": "主持人",
            "label": "行动",
            "text": "听完之后，建议先画一个小例子的状态变化，再生成配套练习检验自己。",
            "citation_ids": source_ids[:1],
        },
    ]
    summary = f"围绕“{message}”生成 {len(segments)} 段双人播客讲解稿。"
    return title, summary, {"segments": segments}, len(segments)


def _fallback_resource_payload(
    *,
    resource_type: str,
    message: str,
    course: Course,
    knowledge_point: str,
    sources: list[KnowledgeSource],
) -> tuple[str, str, dict[str, Any], int]:
    if resource_type == "DOCUMENT":
        return _fallback_document(message=message, course=course, knowledge_point=knowledge_point, sources=sources)
    if resource_type == "MIND_MAP":
        return _fallback_mind_map(message=message, course=course, knowledge_point=knowledge_point, sources=sources)
    if resource_type == "PRACTICE_SET":
        return _fallback_practice_set(message=message, knowledge_point=knowledge_point, sources=sources)
    if resource_type == "KNOWLEDGE_CARD":
        return _fallback_knowledge_card(message=message, knowledge_point=knowledge_point, sources=sources)
    if resource_type == "PODCAST_SCRIPT":
        return _fallback_podcast_script(message=message, course=course, knowledge_point=knowledge_point, sources=sources)
    raise ApiError(400, "UNSUPPORTED_RESOURCE_TYPE", "暂不支持该资源类型。", details={"resource_type": resource_type})


def _render_docx(resource_id: str, title: str, payload: dict[str, Any], citations: list[dict[str, Any]]) -> tuple[str, str]:
    try:
        from docx import Document
    except ModuleNotFoundError as exc:
        raise ApiError(
            503,
            "DOC_RENDERER_NOT_INSTALLED",
            "文档生成依赖尚未安装，请先安装 backend/requirements.txt 中的 python-docx。",
            details={"missing_module": exc.name},
        ) from exc

    settings = get_settings()
    storage_dir = Path(settings.resource_storage_dir) / "generated" / "document"
    storage_dir.mkdir(parents=True, exist_ok=True)
    path = storage_dir / f"{resource_id}.docx"
    document = Document()
    document.add_heading(title, level=1)
    for section in payload.get("sections", []):
        if not isinstance(section, dict):
            continue
        document.add_heading(str(section.get("heading", "学习小节")), level=2)
        for paragraph in section.get("paragraphs", []):
            if str(paragraph).strip():
                document.add_paragraph(str(paragraph).strip())
    if citations:
        document.add_heading("引用来源", level=2)
        for citation in citations[:5]:
            document.add_paragraph(f"{citation.get('title', '')}：{citation.get('summary', '')}", style=None)
    document.save(path)
    return str(path), "DOCX"


def _markdown_lines(resource_type: str, title: str, payload: dict[str, Any], citations: list[dict[str, Any]]) -> list[str]:
    lines = [f"# {title}", ""]
    if resource_type == "DOCUMENT":
        for section in payload.get("sections", []):
            if isinstance(section, dict):
                lines.extend([f"## {section.get('heading', '学习小节')}", ""])
                for paragraph in section.get("paragraphs", []):
                    if str(paragraph).strip():
                        lines.extend([str(paragraph).strip(), ""])
    elif resource_type == "MIND_MAP":
        nodes = payload.get("nodes", [])
        edges = payload.get("edges", [])
        lines.extend(["## 节点", ""])
        for node in nodes if isinstance(nodes, list) else []:
            if isinstance(node, dict):
                indent = "  " * int(node.get("level", 0) or 0)
                lines.append(f"{indent}- {node.get('label', '')}：{node.get('summary', '')}")
        lines.extend(["", "## 关系", ""])
        for edge in edges if isinstance(edges, list) else []:
            if isinstance(edge, dict):
                lines.append(f"- {edge.get('source')} -> {edge.get('target')}：{edge.get('label', '')}")
    elif resource_type == "PRACTICE_SET":
        for index, question in enumerate(payload.get("questions", []), start=1):
            if not isinstance(question, dict):
                continue
            lines.extend([f"## 第 {index} 题", "", str(question.get("stem", "")), ""])
            options = question.get("options", [])
            if isinstance(options, list):
                lines.extend([f"- {option}" for option in options])
                lines.append("")
            lines.extend([f"答案：{question.get('answer', '')}", "", f"解析：{question.get('analysis', '')}", ""])
    elif resource_type == "KNOWLEDGE_CARD":
        for index, card in enumerate(payload.get("cards", []), start=1):
            if isinstance(card, dict):
                lines.extend([f"## 卡片 {index}", "", f"正面：{card.get('front', '')}", "", f"背面：{card.get('back', '')}", ""])
                tips = card.get("tips", [])
                if isinstance(tips, list):
                    lines.extend([f"- {tip}" for tip in tips])
                    lines.append("")
    elif resource_type == "PODCAST_SCRIPT":
        for segment in payload.get("segments", []):
            if isinstance(segment, dict):
                lines.extend([f"## {segment.get('speaker', '')} · {segment.get('label', '')}", "", str(segment.get("text", "")), ""])
    else:
        lines.extend([json.dumps(payload, ensure_ascii=False, indent=2), ""])
    if citations:
        lines.extend(["## 引用来源", ""])
        for citation in citations[:5]:
            lines.append(f"- {citation.get('title', '')}：{citation.get('summary', '')}")
    return lines


def _render_markdown(resource_id: str, resource_type: str, title: str, payload: dict[str, Any], citations: list[dict[str, Any]]) -> tuple[str, str]:
    settings = get_settings()
    storage_dir = Path(settings.resource_storage_dir) / "generated" / resource_type.lower()
    storage_dir.mkdir(parents=True, exist_ok=True)
    path = storage_dir / f"{resource_id}.md"
    path.write_text("\n".join(_markdown_lines(resource_type, title, payload, citations)), encoding="utf-8")
    return str(path), "MD"


def _render_generic_resource(resource_id: str, resource_type: str, title: str, payload: dict[str, Any], citations: list[dict[str, Any]]) -> tuple[str, str]:
    if resource_type == "DOCUMENT":
        try:
            return _render_docx(resource_id, title, payload, citations)
        except ApiError as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            if detail.get("code") == "DOC_RENDERER_NOT_INSTALLED":
                return _render_markdown(resource_id, resource_type, title, payload, citations)
            raise
    return _render_markdown(resource_id, resource_type, title, payload, citations)


def resource_media_type(resource: StudentGeneratedResource) -> str:
    format_map = {
        "PPTX": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "DOCX": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "MD": "text/markdown; charset=utf-8",
        "JSON": "application/json",
    }
    return format_map.get((resource.file_format or "").upper(), "application/octet-stream")


def resource_preview_path(resource: StudentGeneratedResource) -> str | None:
    render_payload = _json_loads(resource.render_payload_json, {})
    if not isinstance(render_payload, dict):
        return None
    metadata = render_payload.get("metadata")
    if not isinstance(metadata, dict):
        return None
    raw_path = metadata.get("preview_path")
    if not isinstance(raw_path, str) or not raw_path.strip():
        return None
    path = Path(raw_path).resolve()
    preview_root = (Path(get_settings().resource_storage_dir) / "generated" / "previews").resolve()
    try:
        path.relative_to(preview_root)
    except ValueError:
        return None
    if not path.exists() or path.suffix.lower() != ".pdf":
        return None
    return str(path)


def ensure_resource_preview(resource: StudentGeneratedResource) -> str | None:
    existing = resource_preview_path(resource)
    if existing:
        return existing
    if resource.resource_type != "PPT" or not resource.file_path:
        return None

    preview_metadata = _render_ppt_pdf_preview(resource.id, resource.file_path, resource.file_format)
    render_payload = _json_loads(resource.render_payload_json, {})
    if not isinstance(render_payload, dict):
        render_payload = {}
    metadata = render_payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    metadata.update(preview_metadata)
    render_payload["metadata"] = metadata
    resource.render_payload_json = _json_dumps(render_payload)
    resource.updated_at = utc_now()
    return resource_preview_path(resource)


def _serialize_resource(resource: StudentGeneratedResource) -> dict[str, Any]:
    render_payload = _json_loads(resource.render_payload_json, {})
    citations = _json_loads(resource.citations_json, [])
    if not isinstance(render_payload, dict):
        render_payload = {}
    metadata = render_payload.get("metadata")
    if isinstance(metadata, dict) and metadata.get("renderer") == "presenton":
        settings = get_settings()
        public_base_url = settings.presenton_public_base_url or settings.presenton_base_url
        edit_path = metadata.get("presenton_edit_path")
        download_path = metadata.get("presenton_download_path")
        if public_base_url and isinstance(edit_path, str) and edit_path and not metadata.get("presenton_edit_url"):
            metadata["presenton_edit_url"] = urljoin(str(public_base_url).rstrip("/") + "/", edit_path.lstrip("/"))
        if public_base_url and isinstance(download_path, str) and download_path and not metadata.get("presenton_download_url"):
            metadata["presenton_download_url"] = urljoin(str(public_base_url).rstrip("/") + "/", download_path.lstrip("/"))
        render_payload["metadata"] = metadata
        if not render_payload.get("presenton_slides") and isinstance(metadata.get("presenton_presentation_id"), str):
            slides_from_presenton = fetch_presenton_slides_sync(str(metadata["presenton_presentation_id"]), settings)
            if slides_from_presenton:
                render_payload["presenton_slides"] = slides_from_presenton
    if isinstance(metadata, dict):
        preview_path = resource_preview_path(resource)
        if preview_path:
            metadata["preview_available"] = True
            metadata["preview_url"] = f"/api/v1/student/resources/{resource.id}/preview"
            metadata["preview_format"] = "PDF"
            render_payload["metadata"] = metadata
    preview_path = resource_preview_path(resource)
    slides = render_payload.get("slides", [])
    sections = render_payload.get("sections", [])
    nodes = render_payload.get("nodes", [])
    questions = render_payload.get("questions", [])
    cards = render_payload.get("cards", [])
    segments = render_payload.get("segments", [])
    item_count = 0
    for collection in (slides, sections, nodes, questions, cards, segments):
        if isinstance(collection, list) and collection:
            item_count = len(collection)
            break
    return {
        "id": resource.id,
        "resource_type": resource.resource_type,
        "resource_type_label": RESOURCE_TYPE_LABELS.get(resource.resource_type, resource.resource_type),
        "title": resource.title,
        "status": resource.status,
        "summary": resource.summary,
        "knowledge_point": resource.knowledge_point,
        "course_id": resource.course_id,
        "run_id": resource.run_id,
        "confidence": resource.confidence,
        "citations": citations,
        "render_payload": render_payload,
        "file_format": resource.file_format,
        "slide_count": len(slides) if isinstance(slides, list) else 0,
        "item_count": item_count,
        "download_available": bool(resource.file_path),
        "preview_available": bool(preview_path),
        "preview_url": f"/api/v1/student/resources/{resource.id}/preview" if preview_path else None,
        "saved_to_resource_center": resource.saved_to_resource_center,
        "created_at": iso(resource.created_at),
        "updated_at": iso(resource.updated_at),
        "saved_at": iso(resource.saved_at),
    }


def _create_run_node(db: Session, state: PptResourceState) -> PptResourceState:
    context = AgentRunContext(
        run_id=state["run_id"],
        workflow_type=WORKFLOW_TYPE,
        student_id=state["student_id"],
        course_id=state["course_id"],
    )
    run = start_run(
        db,
        context,
        input_payload={
            "resource_type": "PPT",
            "message": _trim(state["message"], 300),
            "session_id": state.get("session_id"),
        },
        model_provider="OPENAI_COMPATIBLE" if get_settings().model_api_key else "RULE_FALLBACK",
        model_name=get_settings().model_name or "rule-template",
        prompt_version=PROMPT_VERSION,
    )
    state["run"] = run
    record_step(db, run, step_name="create_run", step_order=1, output_summary={"run_id": run.id})
    return state


def _context_node(db: Session, user: User, course: Course, state: PptResourceState) -> PptResourceState:
    profile = serialize_learner_profile(
        db,
        student_id=user.id,
        course_id=course.id,
        class_id=state["class_id"],
    )
    sources = _load_sources(db, course.id, state["message"])
    knowledge_point = _guess_knowledge_point(state["message"], sources)
    state["profile"] = profile
    state["sources"] = sources
    state["knowledge_point"] = knowledge_point
    record_step(
        db,
        state["run"],
        step_name="build_context",
        step_order=2,
        output_summary={
            "profile_available": profile is not None,
            "source_ids": [source.id for source in sources],
            "knowledge_point": knowledge_point,
        },
    )
    return state


async def _content_node(db: Session, course: Course, state: PptResourceState) -> PptResourceState:
    sources = state.get("sources", [])
    try:
        model_result = await _generate_model_slides(
            course=course,
            message=state["message"],
            knowledge_point=state["knowledge_point"],
            profile=state.get("profile"),
            sources=sources,
        )
    except LLMError as exc:
        model_result = None
        reason = exc.detail or str(exc)
        state["model_content_fallback_error"] = reason
        record_step(
            db,
            state["run"],
            step_name="model_content_generation",
            step_order=3,
            status="FAILED",
            output_summary={"fallback": True, "reason": reason[:240], "llm_error_code": exc.code},
        )
    except Exception as exc:
        model_result = None
        state["model_content_fallback_error"] = str(exc)
        record_step(
            db,
            state["run"],
            step_name="model_content_generation",
            step_order=3,
            status="FAILED",
            output_summary={"fallback": True, "reason": str(exc)[:240]},
        )
    else:
        record_step(
            db,
            state["run"],
            step_name="model_content_generation",
            step_order=3,
            output_summary={"used_model": model_result is not None},
        )

    if model_result is None:
        model_result = _fallback_slides(
            message=state["message"],
            course=course,
            knowledge_point=state["knowledge_point"],
            sources=sources,
        )
    title, summary, slides = model_result
    citations = [_citation(source) for source in sources]
    state["title"] = title
    state["summary"] = summary
    state["slides"] = slides
    state["citations"] = citations
    state["confidence"] = 0.86 if citations else 0.52
    record_step(
        db,
        state["run"],
        step_name="validate_content",
        step_order=4,
        output_summary={"slide_count": len(slides), "citation_count": len(citations)},
    )
    return state


async def _render_node(db: Session, state: PptResourceState) -> PptResourceState:
    resource_id = _new_id("res")
    path, file_format, render_metadata = await _render_ppt_resource_file(db, state, resource_id)
    if state.get("model_content_fallback_error"):
        render_metadata.update(
            {
                "model_content_fallback": True,
                "model_content_fallback_error": state["model_content_fallback_error"],
            }
        )
    preview_metadata = _render_ppt_pdf_preview(resource_id, path, file_format)
    render_metadata.update(preview_metadata)
    record_step(
        db,
        state["run"],
        step_name="render_ppt_pdf_preview",
        step_order=6,
        status="SUCCEEDED" if preview_metadata.get("preview_available") else "FAILED",
        output_summary={
            "resource_id": resource_id,
            "preview_format": preview_metadata.get("preview_format"),
            "preview_available": bool(preview_metadata.get("preview_available")),
            "fallback": not bool(preview_metadata.get("preview_available")),
            "reason": preview_metadata.get("preview_error"),
        },
    )
    resource = StudentGeneratedResource(
        id=resource_id,
        student_id=state["student_id"],
        course_id=state["course_id"],
        class_id=state["class_id"],
        run_id=state["run_id"],
        session_id=state.get("session_id"),
        resource_type="PPT",
        title=state["title"],
        prompt=state["message"],
        knowledge_point=state["knowledge_point"],
        summary=state["summary"],
        status="READY",
        render_payload_json=_json_dumps(
            {
                "slides": state["slides"],
                "presenton_slides": state.get("presenton_slides", []),
                "metadata": render_metadata,
            }
        ),
        citations_json=_json_dumps(state["citations"]),
        file_path=path,
        file_format=file_format,
        confidence=state["confidence"],
        saved_to_resource_center=False,
    )
    db.add(resource)
    state["resource"] = resource
    state["file_path"] = path
    record_step(
        db,
        state["run"],
        step_name="persist_ppt_resource",
        step_order=8,
        output_summary={"resource_id": resource_id, "file_format": file_format, "renderer": render_metadata.get("renderer")},
    )
    return state


def _validate_resource_type(resource_type: str) -> str:
    normalized = (resource_type or "").strip().upper()
    if normalized not in SUPPORTED_RESOURCE_TYPES:
        raise ApiError(
            400,
            "UNSUPPORTED_RESOURCE_TYPE",
            "暂不支持该资源类型。",
            details={"resource_type": resource_type, "supported": sorted(SUPPORTED_RESOURCE_TYPES)},
        )
    return normalized


def _create_generic_run_node(db: Session, state: GenericResourceState) -> GenericResourceState:
    context = AgentRunContext(
        run_id=state["run_id"],
        workflow_type=GENERIC_WORKFLOW_TYPE,
        student_id=state["student_id"],
        course_id=state["course_id"],
    )
    run = start_run(
        db,
        context,
        input_payload={
            "resource_type": state["resource_type"],
            "message": _trim(state["message"], 300),
            "session_id": state.get("session_id"),
        },
        model_provider="RULE_FALLBACK",
        model_name="rule-template",
        prompt_version=GENERIC_PROMPT_VERSION,
    )
    state["run"] = run
    record_step(db, run, step_name="create_run", step_order=1, output_summary={"run_id": run.id})
    return state


def _generic_context_node(db: Session, user: User, course: Course, state: GenericResourceState) -> GenericResourceState:
    profile = serialize_learner_profile(
        db,
        student_id=user.id,
        course_id=course.id,
        class_id=state["class_id"],
    )
    sources = _load_sources(db, course.id, state["message"])
    knowledge_point = _guess_knowledge_point(state["message"], sources)
    state["profile"] = profile
    state["sources"] = sources
    state["knowledge_point"] = knowledge_point
    record_step(
        db,
        state["run"],
        step_name="build_context",
        step_order=2,
        output_summary={
            "profile_available": profile is not None,
            "source_ids": [source.id for source in sources],
            "knowledge_point": knowledge_point,
        },
    )
    return state


def _generic_content_node(db: Session, course: Course, state: GenericResourceState) -> GenericResourceState:
    sources = state.get("sources", [])
    title, summary, render_payload, item_count = _fallback_resource_payload(
        resource_type=state["resource_type"],
        message=state["message"],
        course=course,
        knowledge_point=state["knowledge_point"],
        sources=sources,
    )
    citations = [_citation(source) for source in sources]
    state["title"] = title
    state["summary"] = summary
    state["render_payload"] = render_payload
    state["citations"] = citations
    state["item_count"] = item_count
    state["confidence"] = 0.82 if citations else 0.5
    record_step(
        db,
        state["run"],
        step_name="generate_structured_content",
        step_order=3,
        output_summary={
            "resource_type": state["resource_type"],
            "item_count": item_count,
            "citation_count": len(citations),
        },
    )
    return state


def _generic_render_node(db: Session, state: GenericResourceState) -> GenericResourceState:
    resource_id = _new_id("res")
    path, file_format = _render_generic_resource(
        resource_id,
        state["resource_type"],
        state["title"],
        state["render_payload"],
        state["citations"],
    )
    resource = StudentGeneratedResource(
        id=resource_id,
        student_id=state["student_id"],
        course_id=state["course_id"],
        class_id=state["class_id"],
        run_id=state["run_id"],
        session_id=state.get("session_id"),
        resource_type=state["resource_type"],
        title=state["title"],
        prompt=state["message"],
        knowledge_point=state["knowledge_point"],
        summary=state["summary"],
        status="READY",
        render_payload_json=_json_dumps(state["render_payload"]),
        citations_json=_json_dumps(state["citations"]),
        file_path=path,
        file_format=file_format,
        confidence=state["confidence"],
        saved_to_resource_center=False,
    )
    db.add(resource)
    state["resource"] = resource
    state["file_path"] = path
    state["file_format"] = file_format
    record_step(
        db,
        state["run"],
        step_name="render_resource_file_and_preview",
        step_order=4,
        output_summary={"resource_id": resource_id, "file_format": file_format},
    )
    return state


async def generate_ppt_resource(
    db: Session,
    *,
    user: User,
    class_id: str,
    course: Course,
    message: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    state: PptResourceState = {
        "run_id": new_run_id(),
        "student_id": user.id,
        "class_id": class_id,
        "course_id": course.id,
        "session_id": session_id,
        "message": message.strip(),
    }

    if StateGraph is not None:
        # Keep the graph boundary explicit for future expansion; DB-bound nodes still
        # execute through local closures so permissions and transactions stay in FastAPI.
        async def generate_content_node(graph_state: PptResourceState) -> PptResourceState:
            return await _content_node(db, course, graph_state)

        async def render_resource_node(graph_state: PptResourceState) -> PptResourceState:
            return await _render_node(db, graph_state)

        graph = StateGraph(PptResourceState)
        graph.add_node("create_run", lambda graph_state: _create_run_node(db, graph_state))
        graph.add_node("build_context", lambda graph_state: _context_node(db, user, course, graph_state))
        graph.add_node("generate_content", generate_content_node)
        graph.add_node("render_resource", render_resource_node)
        graph.set_entry_point("create_run")
        graph.add_edge("create_run", "build_context")
        graph.add_edge("build_context", "generate_content")
        graph.add_edge("generate_content", "render_resource")
        graph.add_edge("render_resource", END)
        state = await graph.compile().ainvoke(state)
    else:
        state = _create_run_node(db, state)
        state = _context_node(db, user, course, state)
        state = await _content_node(db, course, state)
        state = await _render_node(db, state)

    resource = state["resource"]
    finish_run(
        db,
        state["run"],
        output={"resource_id": resource.id, "title": resource.title, "slide_count": len(state["slides"])},
        model_provider="OPENAI_COMPATIBLE" if get_settings().model_api_key else "RULE_FALLBACK",
        model_name=get_settings().model_name or "rule-template",
        prompt_version=PROMPT_VERSION,
    )
    return _serialize_resource(resource)


async def generate_learning_resource(
    db: Session,
    *,
    user: User,
    class_id: str,
    course: Course,
    message: str,
    resource_type: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    normalized_type = _validate_resource_type(resource_type)
    if normalized_type == "PPT":
        return await generate_ppt_resource(
            db,
            user=user,
            class_id=class_id,
            course=course,
            message=message,
            session_id=session_id,
        )

    state: GenericResourceState = {
        "run_id": new_run_id(),
        "student_id": user.id,
        "class_id": class_id,
        "course_id": course.id,
        "session_id": session_id,
        "message": message.strip(),
        "resource_type": normalized_type,
    }

    if StateGraph is not None:
        graph = StateGraph(GenericResourceState)
        graph.add_node("create_run", lambda graph_state: _create_generic_run_node(db, graph_state))
        graph.add_node("build_context", lambda graph_state: _generic_context_node(db, user, course, graph_state))
        graph.add_node("generate_content", lambda graph_state: _generic_content_node(db, course, graph_state))
        graph.add_node("render_resource", lambda graph_state: _generic_render_node(db, graph_state))
        graph.set_entry_point("create_run")
        graph.add_edge("create_run", "build_context")
        graph.add_edge("build_context", "generate_content")
        graph.add_edge("generate_content", "render_resource")
        graph.add_edge("render_resource", END)
        state = await graph.compile().ainvoke(state)
    else:
        state = _create_generic_run_node(db, state)
        state = _generic_context_node(db, user, course, state)
        state = _generic_content_node(db, course, state)
        state = _generic_render_node(db, state)

    resource = state["resource"]
    finish_run(
        db,
        state["run"],
        output={
            "resource_id": resource.id,
            "title": resource.title,
            "resource_type": resource.resource_type,
            "item_count": state["item_count"],
        },
        model_provider="RULE_FALLBACK",
        model_name="rule-template",
        prompt_version=GENERIC_PROMPT_VERSION,
    )
    return _serialize_resource(resource)


def get_generated_resource(db: Session, *, student_id: str, resource_id: str) -> StudentGeneratedResource:
    resource = db.get(StudentGeneratedResource, resource_id)
    if resource is None or resource.student_id != student_id:
        raise ApiError(404, "GENERATED_RESOURCE_NOT_FOUND", "生成资源不存在或不可访问。")
    return resource


def save_generated_resource(db: Session, *, user: User, class_id: str, resource_id: str) -> dict[str, Any]:
    resource = get_generated_resource(db, student_id=user.id, resource_id=resource_id)
    if not resource.saved_to_resource_center:
        resource.saved_to_resource_center = True
        resource.saved_at = utc_now()
        resource.updated_at = utc_now()
        db.add(
            LearnerEvent(
                id=_new_id("event"),
                student_id=user.id,
                course_id=resource.course_id,
                class_id=class_id,
                event_type="artifact_saved",
                knowledge_points=_json_dumps([resource.knowledge_point] if resource.knowledge_point else []),
                payload=_json_dumps(
                    {
                        "resource_id": resource.id,
                        "resource_type": resource.resource_type,
                        "source": "ai_resource_card",
                    }
                ),
            )
        )
    return _serialize_resource(resource)


def list_saved_generated_resources(
    db: Session,
    *,
    student_id: str,
    course_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    statement = select(StudentGeneratedResource).where(
        StudentGeneratedResource.student_id == student_id,
        StudentGeneratedResource.saved_to_resource_center.is_(True),
    )
    if course_id:
        statement = statement.where(StudentGeneratedResource.course_id == course_id)
    resources = list(
        db.scalars(
            statement.order_by(StudentGeneratedResource.saved_at.desc(), StudentGeneratedResource.updated_at.desc()).limit(limit)
        ).all()
    )
    return [_serialize_resource(resource) for resource in resources]
