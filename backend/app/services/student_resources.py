import json
import re
from pathlib import Path
from typing import Any, TypedDict
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

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
from backend.app.services.submissions import iso

try:
    from langgraph.graph import END, StateGraph
except Exception:  # pragma: no cover - optional dependency fallback
    END = None
    StateGraph = None


WORKFLOW_TYPE = "student_ppt_resource_generation"
PROMPT_VERSION = "student_ppt_resource_v0.1"
MAX_SOURCE_COUNT = 5
MAX_SOURCE_CHARS = 900


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


def _serialize_resource(resource: StudentGeneratedResource) -> dict[str, Any]:
    render_payload = _json_loads(resource.render_payload_json, {})
    citations = _json_loads(resource.citations_json, [])
    slides = render_payload.get("slides", []) if isinstance(render_payload, dict) else []
    return {
        "id": resource.id,
        "resource_type": resource.resource_type,
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
    except Exception as exc:
        model_result = None
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


def _render_node(db: Session, state: PptResourceState) -> PptResourceState:
    resource_id = _new_id("res")
    path = _render_pptx(resource_id, state["title"], state["slides"], state["citations"])
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
        render_payload_json=_json_dumps({"slides": state["slides"]}),
        citations_json=_json_dumps(state["citations"]),
        file_path=path,
        file_format="PPTX",
        confidence=state["confidence"],
        saved_to_resource_center=False,
    )
    db.add(resource)
    state["resource"] = resource
    state["file_path"] = path
    record_step(
        db,
        state["run"],
        step_name="render_pptx_and_preview",
        step_order=5,
        output_summary={"resource_id": resource_id, "file_format": "PPTX"},
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

        graph = StateGraph(PptResourceState)
        graph.add_node("create_run", lambda graph_state: _create_run_node(db, graph_state))
        graph.add_node("build_context", lambda graph_state: _context_node(db, user, course, graph_state))
        graph.add_node("generate_content", generate_content_node)
        graph.add_node("render_resource", lambda graph_state: _render_node(db, graph_state))
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
        state = _render_node(db, state)

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
