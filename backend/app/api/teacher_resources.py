"""教师端资料中心接口（开发方案 §七）。

资料既是学生自主学习的来源，也是 AI 导师和 AI 诊断的检索来源，所以三个开关
互相独立、不要合并：

- `status`          资料本身在不在用（ACTIVE / DISABLED / PARSE_PENDING / PARSE_FAILED）
- `student_visible` 学生能不能直接查看
- `ai_retrievable`  是否参与 AI 检索

几条刻意的设计边界：

1. **本模块不改 AI 链路。** 停用资料只是不再作为新的检索候选（`ai_retrievable`
   由本接口维护，检索侧读它）；`ai/guardrails.validate_reference` 和
   `services/diagnosis.py` 一行都不动。§7.4「历史 AI 诊断中的引用不能被抹除」——
   已经写进 `diagnoses.knowledge_source_ids` 的引用照旧可读，停用和编辑都影响不到。
2. **编辑不覆盖历史。** 正文 / 标题 / 摘要 / 版本号有变化时，先把**改动前**的内容
   抄一行进 `knowledge_source_revisions` 再更新主表（§15.2）。
3. **删除要看引用。** 被任何历史诊断引用过的资料不允许删除，只能停用（§7.4）。
4. **上传只落盘 + 记元数据。** §7.4 明确第一版不做文件切片，所以上传件正文为空、
   `status=PARSE_PENDING` 且强制 `ai_retrievable=False` —— 正文是空的还让它参与检索
   等于给 AI 喂空引用。
5. **范围按教学安排收窄**（§15.1）：没有该课程生效教学安排的教师一律 403，
   不靠 `course_id` 单独判断。
"""

import json
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok, request_id
from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import (
    Diagnosis,
    KnowledgeSource,
    KnowledgeSourceRevision,
    Submission,
    SubmissionVersion,
    Task,
    User,
)
from backend.app.models.entities import utc_now
from backend.app.services.audit import record_audit
from backend.app.services.submissions import iso
from backend.app.services.teacher_scope import teacher_assignments

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-resources"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

# §7.2 A 状态筛选器的四态
STATUSES = {"ACTIVE", "DISABLED", "PARSE_PENDING", "PARSE_FAILED"}
# §7.2 B 资料类型选择器：课件、代码、数据集、技术文档，外加种子数据用的教师笔记
SOURCE_TYPES = {"COURSEWARE", "CODE", "DATASET", "TECH_DOC", "TEACHER_NOTE"}
AUTHORITY_LEVELS = {"HIGH", "MEDIUM", "LOW"}
# §7.2 C 共享范围：仅当前班级 / 当前课程 / 教师复用
SHARE_SCOPES = {"CLASS", "COURSE", "TEACHER"}


# --- 请求体 -----------------------------------------------------------------


class ResourceCreatePayload(BaseModel):
    """新建文本资料（§7.2 A「新建文本资料按钮」）。"""

    course_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=160)
    summary: str = Field(default="", max_length=2000)
    content: str = Field(default="", max_length=200_000)
    source_type: str = Field(default="TEACHER_NOTE")
    chapter: str = Field(default="", max_length=120)
    knowledge_points: list[str] = Field(default_factory=list)
    authority_level: str = Field(default="MEDIUM")
    version: str = Field(default="v1.0", max_length=40)
    student_visible: bool = True
    ai_retrievable: bool = True
    share_scope: str = Field(default="COURSE")


class ResourceUpdatePayload(BaseModel):
    """编辑资料（§7.2 B）。字段全部可选，只更新显式传上来的那些。

    `status` 也走这里：§7.2 A 的「停用按钮」就是 `PATCH {"status": "DISABLED"}`，
    不为它单开一个接口。
    """

    title: str | None = Field(default=None, min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=2000)
    content: str | None = Field(default=None, max_length=200_000)
    source_type: str | None = None
    chapter: str | None = Field(default=None, max_length=120)
    knowledge_points: list[str] | None = None
    authority_level: str | None = None
    version: str | None = Field(default=None, min_length=1, max_length=40)
    student_visible: bool | None = None
    ai_retrievable: bool | None = None
    share_scope: str | None = None
    status: str | None = None
    change_note: str = Field(default="", max_length=500)


class ResourceCopyPayload(BaseModel):
    """复制到其他课程（§7.2 C「复制到课程按钮」）。"""

    target_course_id: str = Field(min_length=1)


# --- 内部工具 ---------------------------------------------------------------


def _ensure_course_scope(db: Session, teacher_id: str, course_id: str) -> None:
    """课程必须落在当前教师的生效教学安排内，否则 403（§15.1）。"""
    if not teacher_assignments(db, teacher_id, course_id):
        raise ApiError(403, "AUTH_FORBIDDEN", "当前教师在该课程没有生效的教学安排")


def _teacher_course_ids(db: Session, teacher_id: str) -> list[str]:
    seen: list[str] = []
    for assignment in teacher_assignments(db, teacher_id):
        if assignment.course_id not in seen:
            seen.append(assignment.course_id)
    return seen


def _safe_file_name(name: str | None) -> str:
    """只保留文件名本身，挡掉 ../ 和路径分隔符。"""
    base = Path(name or "upload").name
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", base)
    return cleaned[:255] or "upload"


def _loads_points(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return [str(item) for item in value] if isinstance(value, list) else []


def _dumps_points(points: list[str]) -> str:
    # 去重但保留教师填写的顺序
    unique: list[str] = []
    for point in points:
        cleaned = point.strip()
        if cleaned and cleaned not in unique:
            unique.append(cleaned)
    return json.dumps(unique, ensure_ascii=False)


def _validate_enum(field: str, value: str, allowed: set[str], label: str) -> str:
    if value not in allowed:
        raise ApiError(
            422,
            "RESOURCE_FIELD_INVALID",
            f"{label}只能是 {'、'.join(sorted(allowed))} 之一",
            details={"field": field, "value": value},
        )
    return value


def _reference_counts(db: Session) -> dict[str, int]:
    """每个资料被多少条历史 AI 诊断引用过。

    数据来自 `diagnoses.knowledge_source_ids`，不另建引用表 —— 这样「引用次数」
    永远等于真实发生过的引用，也正好是 §7.4「删除资料前必须检查历史引用」的判据。
    """
    counts: dict[str, int] = {}
    for raw in db.scalars(select(Diagnosis.knowledge_source_ids)).all():
        for source_id in _loads_points(raw):
            counts[source_id] = counts.get(source_id, 0) + 1
    return counts


def _get_source(db: Session, resource_id: str, teacher_id: str) -> KnowledgeSource:
    """取资料并校验它属于当前教师负责的课程。

    找不到和无权访问都返回 404：否则教师能靠状态码探测别的课程有哪些资料 ID。
    """
    source = db.get(KnowledgeSource, resource_id)
    if source is None:
        raise ApiError(404, "RESOURCE_NOT_FOUND", "资料不存在")
    if not teacher_assignments(db, teacher_id, source.course_id):
        raise ApiError(404, "RESOURCE_NOT_FOUND", "资料不存在或不在当前教师的教学范围内")
    return source


def _serialize(source: KnowledgeSource, reference_count: int) -> dict:
    return {
        "resource_id": source.id,
        "course_id": source.course_id,
        "title": source.title,
        "summary": source.summary,
        "content": source.content or "",
        "source_type": source.source_type,
        "chapter": source.chapter or "",
        "knowledge_points": _loads_points(source.knowledge_points),
        "version": source.version,
        "authority_level": source.authority_level,
        "status": source.status or "ACTIVE",
        "student_visible": bool(source.student_visible),
        "ai_retrievable": bool(source.ai_retrievable),
        "share_scope": source.share_scope or "COURSE",
        "file_name": source.file_name,
        "file_size": source.file_size,
        "mime_type": source.mime_type,
        "has_file": bool(source.storage_path),
        "reference_count": reference_count,
        "created_by": source.created_by,
        "created_at": iso(source.created_at),
        "updated_at": iso(source.updated_at),
    }


def _serialize_revision(revision: KnowledgeSourceRevision) -> dict:
    return {
        "revision_id": revision.id,
        "version": revision.version,
        "title": revision.title,
        "summary": revision.summary or "",
        "content": revision.content or "",
        "editor_id": revision.editor_id,
        "change_note": revision.change_note or "",
        "created_at": iso(revision.created_at),
    }


def _append_revision(
    db: Session, source: KnowledgeSource, editor_id: str, change_note: str
) -> KnowledgeSourceRevision:
    """把**改动前**的内容存成一个历史版本。调用点必须在更新主表字段之前。"""
    revision = KnowledgeSourceRevision(
        id=f"ksrev_{uuid4().hex[:12]}",
        source_id=source.id,
        version=source.version,
        title=source.title,
        summary=source.summary or "",
        content=source.content or "",
        editor_id=editor_id,
        change_note=change_note,
    )
    db.add(revision)
    return revision


def _revisions(db: Session, resource_id: str) -> list[KnowledgeSourceRevision]:
    return list(
        db.scalars(
            select(KnowledgeSourceRevision)
            .where(KnowledgeSourceRevision.source_id == resource_id)
            .order_by(KnowledgeSourceRevision.created_at.desc())
        ).all()
    )


# --- 接口 -------------------------------------------------------------------


@router.get("/resources")
def list_resources(
    course_id: str = Query(..., min_length=1),
    status: str | None = Query(default=None),
    chapter: str | None = Query(default=None),
    knowledge_point: str | None = Query(default=None),
    source_type: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """资料列表（§7.2 A）。

    `stats` 和 `filters` 都按**整个课程**统计，不是当前页也不受筛选影响 ——
    这样切换状态标签时其它卡片的计数不会掉成 0，章节 / 知识点下拉也不会因为
    当前筛选把自己的选项筛没了。
    """
    require_role(user, "TEACHER")
    _ensure_course_scope(db, user.id, course_id)

    all_sources = list(
        db.scalars(
            select(KnowledgeSource)
            .where(KnowledgeSource.course_id == course_id)
            .order_by(KnowledgeSource.title.asc())
        ).all()
    )
    counts = _reference_counts(db)

    stats = {
        "total": len(all_sources),
        "active": len([item for item in all_sources if (item.status or "ACTIVE") == "ACTIVE"]),
        "disabled": len([item for item in all_sources if item.status == "DISABLED"]),
        "ai_retrievable": len([item for item in all_sources if item.ai_retrievable]),
        "student_visible": len([item for item in all_sources if item.student_visible]),
        "parse_pending": len([item for item in all_sources if item.status == "PARSE_PENDING"]),
        "parse_failed": len([item for item in all_sources if item.status == "PARSE_FAILED"]),
    }

    chapters: list[str] = []
    points: list[str] = []
    types: list[str] = []
    for item in all_sources:
        if item.chapter and item.chapter not in chapters:
            chapters.append(item.chapter)
        for point in _loads_points(item.knowledge_points):
            if point not in points:
                points.append(point)
        if item.source_type and item.source_type not in types:
            types.append(item.source_type)

    keyword = (q or "").strip().lower()
    filtered = []
    for item in all_sources:
        if status and (item.status or "ACTIVE") != status:
            continue
        if chapter and (item.chapter or "") != chapter:
            continue
        if knowledge_point and knowledge_point not in _loads_points(item.knowledge_points):
            continue
        if source_type and item.source_type != source_type:
            continue
        if keyword and keyword not in item.title.lower() and keyword not in (item.summary or "").lower():
            continue
        filtered.append(item)

    total = len(filtered)
    start = (page - 1) * page_size
    items = [_serialize(item, counts.get(item.id, 0)) for item in filtered[start : start + page_size]]

    return ok(
        {
            "course_id": course_id,
            "stats": stats,
            "items": items,
            "filters": {
                "chapters": sorted(chapters),
                "knowledge_points": sorted(points),
                "source_types": sorted(types),
            },
        },
        meta={"page": page, "page_size": page_size, "total": total},
    )


def _serialize_detail(db: Session, source: KnowledgeSource, teacher_id: str) -> dict:
    """详情载荷。GET 详情和 PATCH 都返回这一份，前端拿到的形状必须一致 ——
    少给一个 `copy_targets` 会让前端读 `.length` 时直接崩掉整块面板。"""
    payload = _serialize(source, _reference_counts(db).get(source.id, 0))
    payload["revisions"] = [_serialize_revision(item) for item in _revisions(db, source.id)]
    # 复制到课程的可选目标：当前教师其它课程
    payload["copy_targets"] = [
        item for item in _teacher_course_ids(db, teacher_id) if item != source.course_id
    ]
    return payload


@router.get("/resources/{resource_id}")
def resource_detail(
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """资料详情，附版本记录与引用次数（§7.2 B / C）。"""
    require_role(user, "TEACHER")
    source = _get_source(db, resource_id, user.id)
    return ok(_serialize_detail(db, source, user.id))


@router.post("/resources")
def create_resource(
    payload: ResourceCreatePayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """新建文本资料（§7.2 A）。文本资料直接可用，所以 status 就是 ACTIVE。"""
    require_role(user, "TEACHER")
    _ensure_course_scope(db, user.id, payload.course_id)

    _validate_enum("source_type", payload.source_type, SOURCE_TYPES, "资料类型")
    _validate_enum("authority_level", payload.authority_level, AUTHORITY_LEVELS, "权威等级")
    _validate_enum("share_scope", payload.share_scope, SHARE_SCOPES, "共享范围")

    rid = request_id()
    source = KnowledgeSource(
        id=f"kb_{uuid4().hex[:16]}",
        course_id=payload.course_id,
        title=payload.title.strip(),
        summary=payload.summary.strip(),
        content=payload.content,
        source_type=payload.source_type,
        chapter=payload.chapter.strip(),
        knowledge_points=_dumps_points(payload.knowledge_points),
        version=payload.version.strip(),
        authority_level=payload.authority_level,
        status="ACTIVE",
        student_visible=payload.student_visible,
        ai_retrievable=payload.ai_retrievable,
        share_scope=payload.share_scope,
        created_by=user.id,
    )
    db.add(source)
    record_audit(
        db,
        event_type="TEACHER_RESOURCE_CREATED",
        request_id=rid,
        user_id=user.id,
        status="ACTIVE",
        details={
            "resource_id": source.id,
            "resource_action": "CREATE",
            "source_type": source.source_type,
            "status": source.status,
        },
    )
    db.commit()
    db.refresh(source)
    return ok(_serialize(source, 0), rid=rid)


@router.patch("/resources/{resource_id}")
def update_resource(
    resource_id: str,
    payload: ResourceUpdatePayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """编辑资料（§7.2 B），也承担 §7.2 A 的停用 / 启用。

    标题、摘要、正文或版本号有变化时先追加一条历史版本再改主表，
    旧版本永远留档（§15.2）。
    """
    require_role(user, "TEACHER")
    source = _get_source(db, resource_id, user.id)

    if payload.source_type is not None:
        _validate_enum("source_type", payload.source_type, SOURCE_TYPES, "资料类型")
    if payload.authority_level is not None:
        _validate_enum("authority_level", payload.authority_level, AUTHORITY_LEVELS, "权威等级")
    if payload.share_scope is not None:
        _validate_enum("share_scope", payload.share_scope, SHARE_SCOPES, "共享范围")
    if payload.status is not None:
        _validate_enum("status", payload.status, STATUSES, "资料状态")

    rid = request_id()

    # 只有这四个字段构成"内容"，改了才值得留一个历史版本；
    # 开关和分类的变化只更新主表，不制造无意义的版本噪音。
    content_changed = any(
        [
            payload.title is not None and payload.title.strip() != source.title,
            payload.summary is not None and payload.summary.strip() != (source.summary or ""),
            payload.content is not None and payload.content != (source.content or ""),
            payload.version is not None and payload.version.strip() != source.version,
        ]
    )
    revision = _append_revision(db, source, user.id, payload.change_note) if content_changed else None

    if payload.title is not None:
        source.title = payload.title.strip()
    if payload.summary is not None:
        source.summary = payload.summary.strip()
    if payload.content is not None:
        source.content = payload.content
    if payload.source_type is not None:
        source.source_type = payload.source_type
    if payload.chapter is not None:
        source.chapter = payload.chapter.strip()
    if payload.knowledge_points is not None:
        source.knowledge_points = _dumps_points(payload.knowledge_points)
    if payload.authority_level is not None:
        source.authority_level = payload.authority_level
    if payload.version is not None:
        source.version = payload.version.strip()
    if payload.student_visible is not None:
        source.student_visible = payload.student_visible
    if payload.ai_retrievable is not None:
        source.ai_retrievable = payload.ai_retrievable
    if payload.share_scope is not None:
        source.share_scope = payload.share_scope
    if payload.status is not None:
        source.status = payload.status

    # 停用的资料一律退出 AI 检索候选（§7.4）。历史诊断里的引用不受影响。
    if source.status != "ACTIVE":
        source.ai_retrievable = False
    # 没有正文的上传件参与检索等于给 AI 喂空引用，这里兜住
    if not (source.content or "").strip() and source.storage_path:
        source.ai_retrievable = False

    source.updated_at = utc_now()

    record_audit(
        db,
        event_type="TEACHER_RESOURCE_UPDATED",
        request_id=rid,
        user_id=user.id,
        status=source.status,
        details={
            "resource_id": source.id,
            "resource_action": "UPDATE",
            "source_type": source.source_type,
            "status": source.status,
            **({"revision_id": revision.id} if revision else {}),
        },
    )
    db.commit()
    db.refresh(source)

    return ok(_serialize_detail(db, source, user.id), rid=rid)


@router.delete("/resources/{resource_id}")
def delete_resource(
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """删除未被使用的资料（§7.2 A）。

    被任何历史 AI 诊断引用过就拒绝：那些诊断已经把这条引用写进学生看到的解释里，
    删掉资料会让历史引用指向空（§7.4「删除资料前必须检查历史引用」）。
    这种情况下正确的动作是停用。
    """
    require_role(user, "TEACHER")
    source = _get_source(db, resource_id, user.id)

    reference_count = _reference_counts(db).get(source.id, 0)
    if reference_count:
        raise ApiError(
            409,
            "RESOURCE_IN_USE",
            f"该资料已被 {reference_count} 条历史 AI 诊断引用，不能删除。请改用停用。",
            details={"resource_id": source.id, "reference_count": reference_count},
        )

    rid = request_id()
    for revision in _revisions(db, source.id):
        db.delete(revision)
    storage_path = source.storage_path
    db.delete(source)
    record_audit(
        db,
        event_type="TEACHER_RESOURCE_DELETED",
        request_id=rid,
        user_id=user.id,
        status="DELETED",
        details={
            "resource_id": source.id,
            "resource_action": "DELETE",
            "source_type": source.source_type,
        },
    )
    db.commit()

    # 库里删干净之后再动磁盘：反过来的话事务回滚了文件已经没了
    if storage_path:
        Path(storage_path).unlink(missing_ok=True)

    return ok({"resource_id": resource_id, "deleted": True}, rid=rid)


@router.post("/resources/upload")
def upload_resource(
    course_id: str = Form(...),
    title: str = Form(...),
    file: UploadFile = File(...),
    summary: str = Form(default=""),
    source_type: str = Form(default="COURSEWARE"),
    chapter: str = Form(default=""),
    knowledge_points: str = Form(default="[]"),
    authority_level: str = Form(default="MEDIUM"),
    version: str = Form(default="v1.0"),
    student_visible: bool = Form(default=True),
    share_scope: str = Form(default="COURSE"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """上传 PDF / PPT / 文档 / 代码资料（§7.2 A）。

    §7.4 明确第一版「先做文本资料和元数据管理，文件自动切片放到后续」，所以这里
    只落盘 + 记元数据：`content` 为空、`status=PARSE_PENDING`、`ai_retrievable=False`。
    等切片和向量化做出来，把这些件解析成正文后再置为 ACTIVE。

    注意 `student_visible` 存下来了，但学生端自主学习目前还是 Mock（§16.3），
    真正把文件送到学生手上要等那一侧接通。
    """
    require_role(user, "TEACHER")
    _ensure_course_scope(db, user.id, course_id)

    _validate_enum("source_type", source_type, SOURCE_TYPES, "资料类型")
    _validate_enum("authority_level", authority_level, AUTHORITY_LEVELS, "权威等级")
    _validate_enum("share_scope", share_scope, SHARE_SCOPES, "共享范围")

    if not title.strip():
        raise ApiError(422, "RESOURCE_FIELD_INVALID", "资料标题不能为空")

    settings = get_settings()
    payload = file.file.read()
    limit = settings.resource_max_upload_mb * 1024 * 1024
    if len(payload) > limit:
        raise ApiError(
            413,
            "RESOURCE_FILE_TOO_LARGE",
            f"上传文件超过 {settings.resource_max_upload_mb} MB 上限",
            details={"size": len(payload)},
        )
    if not payload:
        raise ApiError(422, "RESOURCE_FILE_EMPTY", "上传文件为空")

    resource_id = f"kb_{uuid4().hex[:16]}"
    suffix = Path(file.filename or "").suffix[:16]
    target_dir = Path(settings.resource_storage_dir) / course_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{resource_id}{suffix}"
    target.write_bytes(payload)

    rid = request_id()
    source = KnowledgeSource(
        id=resource_id,
        course_id=course_id,
        title=title.strip(),
        summary=summary.strip(),
        content="",
        source_type=source_type,
        chapter=chapter.strip(),
        knowledge_points=_dumps_points(_loads_points(knowledge_points)),
        version=version.strip() or "v1.0",
        authority_level=authority_level,
        status="PARSE_PENDING",
        student_visible=student_visible,
        # 正文还没解析出来，参与检索只会产生空引用
        ai_retrievable=False,
        share_scope=share_scope,
        file_name=_safe_file_name(file.filename),
        file_size=len(payload),
        mime_type=file.content_type,
        storage_path=str(target),
        created_by=user.id,
    )
    db.add(source)
    record_audit(
        db,
        event_type="TEACHER_RESOURCE_UPLOADED",
        request_id=rid,
        user_id=user.id,
        status="PARSE_PENDING",
        details={
            "resource_id": source.id,
            "resource_action": "UPLOAD",
            "source_type": source.source_type,
            "status": source.status,
        },
    )
    db.commit()
    db.refresh(source)
    return ok(_serialize(source, 0), rid=rid)


@router.post("/resources/{resource_id}/copy")
def copy_resource(
    resource_id: str,
    payload: ResourceCopyPayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """复制到其他课程（§7.2 C）。

    复制的是元数据和正文，不复制版本记录和引用 —— 新资料是一条全新的知识源，
    历史引用只属于原件。目标课程同样要过教学安排校验。
    """
    require_role(user, "TEACHER")
    source = _get_source(db, resource_id, user.id)
    if payload.target_course_id == source.course_id:
        raise ApiError(422, "RESOURCE_COPY_SAME_COURSE", "目标课程与当前课程相同")
    _ensure_course_scope(db, user.id, payload.target_course_id)

    rid = request_id()
    clone = KnowledgeSource(
        id=f"kb_{uuid4().hex[:16]}",
        course_id=payload.target_course_id,
        title=source.title,
        summary=source.summary,
        content=source.content or "",
        source_type=source.source_type,
        chapter=source.chapter or "",
        knowledge_points=source.knowledge_points or "[]",
        version=source.version,
        authority_level=source.authority_level,
        # 复制到新课程后先落成草稿状态由教师确认，避免误把一门课的资料直接
        # 推给另一门课的学生和 AI
        status="DISABLED",
        student_visible=False,
        ai_retrievable=False,
        share_scope=source.share_scope or "COURSE",
        created_by=user.id,
    )
    db.add(clone)
    record_audit(
        db,
        event_type="TEACHER_RESOURCE_COPIED",
        request_id=rid,
        user_id=user.id,
        status="DISABLED",
        details={
            "resource_id": clone.id,
            "resource_action": "COPY",
            "source_type": clone.source_type,
            "target_course_id": clone.course_id,
        },
    )
    db.commit()
    db.refresh(clone)
    return ok(_serialize(clone, 0), rid=rid)


@router.get("/resources/{resource_id}/references")
def resource_references(
    resource_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """引用明细（§7.2 C「引用次数」下钻）。只读历史，不做任何写入。"""
    require_role(user, "TEACHER")
    source = _get_source(db, resource_id, user.id)

    items = []
    for diagnosis in db.scalars(select(Diagnosis)).all():
        if source.id not in _loads_points(diagnosis.knowledge_source_ids):
            continue
        version = db.get(SubmissionVersion, diagnosis.submission_version_id)
        submission = db.get(Submission, version.submission_id) if version else None
        task = db.get(Task, submission.task_id) if submission else None
        student = db.get(User, submission.student_id) if submission else None
        items.append(
            {
                "diagnosis_id": diagnosis.id,
                "diagnosis_type": diagnosis.diagnosis_type,
                "confidence": diagnosis.confidence,
                "task_id": task.id if task else None,
                "task_title": task.title if task else "",
                "student_id": submission.student_id if submission else None,
                "student_name": student.display_name if student else "",
                "created_at": iso(diagnosis.created_at),
            }
        )
    items.sort(key=lambda item: item["created_at"] or "", reverse=True)

    return ok(
        {
            "resource_id": source.id,
            "title": source.title,
            "reference_count": len(items),
            "items": items,
        },
        meta={"total": len(items)},
    )
