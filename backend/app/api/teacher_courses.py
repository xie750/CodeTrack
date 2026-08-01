"""教师端课程教学接口（开发方案 §六）。

两个子页面共用这一个 router：

- §6.1 课程与班级：教学班卡片、学生名单（带风险等级）、编辑课程教学说明。
- §6.2 课程大纲：章节 — 知识点两层结构的读写与排序。

几条刻意的设计边界：

1. **教师不碰行政班。** §二 2.3 把「创建行政班、改学生专业、删学生」划给管理员端，
   所以 §6.1 只有一个写操作 —— 改课程教学说明。名单是只读的。
2. **风险等级不另写一套规则。** 直接用预警中心那套：`resolve_diagnosis_scope`
   加 `services/learning_alerts.compute_class_alerts`。命中的取其 level，
   没命中就是 NORMAL。否则同一个学生在「课程与班级」和「预警中心」会显示两种风险，
   教师无从判断该信哪个。
3. **知识点是按名称软关联的，不是外键。** 现有 `knowledge_sources.knowledge_points`、
   `questions.knowledge_points`、`learner_knowledge_states.knowledge_point` 存的都是
   名称字符串，本轮不迁外键（见 `migrations/versions/20260801_0008_course_syllabus.py`）。
   由此推出两条硬约束：
   - (course_id, name) 唯一，否则按名字回查会歧义；
   - **被引用的知识点不许改名**，改了名历史引用会静默变成孤儿。
4. **删除要看引用。** §6.2「已被正式任务使用的知识点不得直接删除」「删除前必须检查
   任务、资料和画像关联」——`_usage_index` 同时数资料、题目和画像三处，任一处 > 0
   就只能停用不能删。引用判断是 `json.loads` 后的**精确成员判断**，不是 SQL LIKE：
   `LIKE '%链表%'` 会把「链表边界处理」的引用误算到「链表」头上，删除保护就形同虚设。
5. **范围按教学安排收窄**（§15.1）：没有该课程生效教学安排的教师一律 403，
   不靠 `course_id` 单独判断；单对象读不到统一 404，避免靠状态码探测别人的 ID。
"""

import json
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok, request_id
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import (
    AdministrativeClass,
    Course,
    CourseChapter,
    CourseKnowledgePoint,
    KnowledgeSource,
    LearnerKnowledgeState,
    Question,
    StudentTaskProgress,
    Submission,
    Task,
    TeachingAssignment,
    User,
)
from backend.app.models.entities import utc_now
from backend.app.services.audit import record_audit
from backend.app.services.learning_alerts import as_utc, compute_class_alerts
from backend.app.services.submissions import iso
from backend.app.services.teacher_scope import (
    class_student_ids,
    derive_progress_status,
    published_task_ids,
    resolve_diagnosis_scope,
    teacher_assignments,
)

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-courses"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

# §6.2 知识点标签：类型与难度
POINT_TYPES = {"CONCEPT", "SKILL", "SYNTAX", "ALGORITHM"}
DIFFICULTIES = {"BASIC", "INTERMEDIATE", "ADVANCED"}
SYLLABUS_STATUSES = {"ACTIVE", "ARCHIVED"}
# §6.1 风险筛选器。NORMAL 是「没命中任何预警规则」，不是预警中心的一个等级
RISK_LEVELS = ["NORMAL", "NOTICE", "WATCH", "HIGH"]


# --- 请求体 -----------------------------------------------------------------


class CourseDescriptionPayload(BaseModel):
    """编辑课程教学说明（§6.1 唯一的写操作）。"""

    description: str = Field(default="", max_length=4000)


class ChapterCreatePayload(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(default="", max_length=2000)


class ChapterUpdatePayload(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    summary: str | None = Field(default=None, max_length=2000)
    status: str | None = None


class KnowledgePointCreatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    summary: str = Field(default="", max_length=2000)
    point_type: str = Field(default="CONCEPT")
    difficulty: str = Field(default="BASIC")


class KnowledgePointUpdatePayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    summary: str | None = Field(default=None, max_length=2000)
    point_type: str | None = None
    difficulty: str | None = None
    chapter_id: str | None = None
    status: str | None = None


class SyllabusReorderPayload(BaseModel):
    """拖拽排序（§6.2）。一次只重排一层：要么章节，要么某章节下的知识点。

    跨章节移动知识点走 `PATCH /knowledge-points/{id}` 的 `chapter_id`，不走这里。
    """

    chapters: list[str] | None = None
    chapter_id: str | None = None
    knowledge_points: list[str] | None = None


# --- 内部工具 ---------------------------------------------------------------


def _ensure_course_scope(db: Session, teacher_id: str, course_id: str) -> None:
    """课程必须落在当前教师的生效教学安排内，否则 403（§15.1）。"""
    if not teacher_assignments(db, teacher_id, course_id):
        raise ApiError(403, "AUTH_FORBIDDEN", "当前教师在该课程没有生效的教学安排")


def _validate_enum(field: str, value: str, allowed: set[str], label: str) -> str:
    if value not in allowed:
        raise ApiError(
            422,
            "SYLLABUS_FIELD_INVALID",
            f"{label}只能是 {'、'.join(sorted(allowed))} 之一",
            details={"field": field, "value": value},
        )
    return value


def _loads_points(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return [str(item) for item in value] if isinstance(value, list) else []


def _get_assignment(db: Session, assignment_id: str, teacher_id: str) -> TeachingAssignment:
    """取教学安排并确认属于当前教师；否则 404（不泄漏别人的 ID 是否存在）。"""
    for assignment in teacher_assignments(db, teacher_id):
        if assignment.id == assignment_id:
            return assignment
    raise ApiError(404, "TEACHING_ASSIGNMENT_NOT_FOUND", "教学安排不存在或不在当前教师的教学范围内")


def _get_chapter(db: Session, chapter_id: str, teacher_id: str) -> CourseChapter:
    chapter = db.get(CourseChapter, chapter_id)
    if chapter is None:
        raise ApiError(404, "CHAPTER_NOT_FOUND", "章节不存在")
    if not teacher_assignments(db, teacher_id, chapter.course_id):
        raise ApiError(404, "CHAPTER_NOT_FOUND", "章节不存在或不在当前教师的教学范围内")
    return chapter


def _get_point(db: Session, point_id: str, teacher_id: str) -> CourseKnowledgePoint:
    point = db.get(CourseKnowledgePoint, point_id)
    if point is None:
        raise ApiError(404, "KNOWLEDGE_POINT_NOT_FOUND", "知识点不存在")
    if not teacher_assignments(db, teacher_id, point.course_id):
        raise ApiError(404, "KNOWLEDGE_POINT_NOT_FOUND", "知识点不存在或不在当前教师的教学范围内")
    return point


def _empty_usage() -> dict:
    return {
        "resource_count": 0,
        "question_count": 0,
        "profile_count": 0,
        "resources": [],
        "tasks": [],
    }


def _usage_index(db: Session, course_id: str, names: set[str]) -> dict[str, dict]:
    """一次算出整门课所有知识点名称的引用情况（§6.2 删除前必须检查关联）。

    做成批量的原因：章节树一次要展示全部知识点，逐个查会退化成 N 次全表扫描。

    三个来源都是名称匹配：资料的 `knowledge_points`、题目的 `knowledge_points`
    （经 `tasks.course_id` 收到本课程）、画像的 `learner_knowledge_states`。
    全部 `json.loads` 后做精确成员判断 —— 不用 SQL LIKE，避免「链表」被
    「链表边界处理」的引用污染。
    """
    usage = {name: _empty_usage() for name in names}
    if not usage:
        return usage

    # 资料引用
    sources = db.scalars(
        select(KnowledgeSource).where(KnowledgeSource.course_id == course_id)
    ).all()
    for source in sources:
        for point in _loads_points(source.knowledge_points):
            entry = usage.get(point)
            if entry is None:
                continue
            entry["resource_count"] += 1
            entry["resources"].append({"resource_id": source.id, "title": source.title})

    # 题目引用（正式任务用的知识点）
    question_rows = db.execute(
        select(Question.knowledge_points, Task.id, Task.title)
        .join(Task, Question.task_id == Task.id)
        .where(Task.course_id == course_id)
    ).all()
    for raw, task_id, task_title in question_rows:
        for point in _loads_points(raw):
            entry = usage.get(point)
            if entry is None:
                continue
            entry["question_count"] += 1
            if not any(item["task_id"] == task_id for item in entry["tasks"]):
                entry["tasks"].append({"task_id": task_id, "title": task_title})

    # 学习画像引用
    profile_rows = db.execute(
        select(LearnerKnowledgeState.knowledge_point, func.count())
        .where(LearnerKnowledgeState.course_id == course_id)
        .group_by(LearnerKnowledgeState.knowledge_point)
    ).all()
    for point, count in profile_rows:
        entry = usage.get(point)
        if entry is not None:
            entry["profile_count"] = int(count)

    return usage


def _blocked_reason(usage: dict) -> str | None:
    """知识点为什么不能删。返回 None 表示可以删。"""
    parts = []
    if usage["resource_count"]:
        parts.append(f"{usage['resource_count']} 份资料")
    if usage["question_count"]:
        parts.append(f"{usage['question_count']} 道题目")
    if usage["profile_count"]:
        parts.append(f"{usage['profile_count']} 条学习画像")
    if not parts:
        return None
    return "已被" + "、".join(parts) + "引用，只能停用，不能删除"


def _next_sort_order(db: Session, model, **filters) -> int:
    current = db.scalar(select(func.max(model.sort_order)).filter_by(**filters))
    return int(current or 0) + 1


def _serialize_point(point: CourseKnowledgePoint, usage: dict) -> dict:
    reason = _blocked_reason(usage)
    return {
        "knowledge_point_id": point.id,
        "chapter_id": point.chapter_id,
        "course_id": point.course_id,
        "name": point.name,
        "summary": point.summary or "",
        "point_type": point.point_type,
        "difficulty": point.difficulty,
        "sort_order": point.sort_order,
        "status": point.status,
        "usage": usage,
        # 前端据此禁用删除按钮并解释原因，而不是自己写死一段文案
        "deletable": reason is None,
        "blocked_reason": reason,
        "created_at": iso(point.created_at),
        "updated_at": iso(point.updated_at),
    }


def _serialize_chapter(chapter: CourseChapter, points: list[dict]) -> dict:
    active_points = [item for item in points if item["status"] == "ACTIVE"]
    return {
        "chapter_id": chapter.id,
        "course_id": chapter.course_id,
        "title": chapter.title,
        "summary": chapter.summary or "",
        "sort_order": chapter.sort_order,
        "status": chapter.status,
        "knowledge_points": points,
        "knowledge_point_count": len(points),
        # 名下还有生效知识点就不能删（§6.2），先移走或停用
        "deletable": not active_points,
        "blocked_reason": (
            f"章节下还有 {len(active_points)} 个生效知识点，先移动或停用后才能删除"
            if active_points
            else None
        ),
        "created_at": iso(chapter.created_at),
        "updated_at": iso(chapter.updated_at),
    }


def _syllabus_payload(db: Session, course: Course) -> dict:
    chapters = db.scalars(
        select(CourseChapter)
        .where(CourseChapter.course_id == course.id)
        .order_by(CourseChapter.sort_order, CourseChapter.created_at)
    ).all()
    points = db.scalars(
        select(CourseKnowledgePoint)
        .where(CourseKnowledgePoint.course_id == course.id)
        .order_by(CourseKnowledgePoint.sort_order, CourseKnowledgePoint.created_at)
    ).all()

    usage = _usage_index(db, course.id, {item.name for item in points})
    grouped: dict[str, list[dict]] = {}
    for point in points:
        grouped.setdefault(point.chapter_id, []).append(
            _serialize_point(point, usage.get(point.name, _empty_usage()))
        )

    chapter_rows = [_serialize_chapter(item, grouped.get(item.id, [])) for item in chapters]
    return {
        "scope": {"course_id": course.id, "course_title": course.name},
        "stats": {
            "chapter_count": len(chapter_rows),
            "knowledge_point_count": len(points),
            "bound_point_count": len(
                [name for name, entry in usage.items() if _blocked_reason(entry) is not None]
            ),
        },
        "chapters": chapter_rows,
        "filters": {
            "point_type_options": sorted(POINT_TYPES),
            "difficulty_options": sorted(DIFFICULTIES),
        },
    }


# ---------------------------------------------------------------- §6.1 课程与班级


@router.get("/course-classes")
def course_classes(
    term: str | None = Query(None, description="按学期筛选"),
    keyword: str | None = Query(None, description="按课程名或班级名搜索"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """教学班卡片（§6.1）。

    一行 = 一个「行政班 × 课程」教学安排，不是按课程聚合 —— §6.1 要的是教学班。
    不分页：一名教师的教学安排是个位数量级。

    `stats` 和 `filters` 覆盖整个教学范围，不随 `term` / `keyword` 变化，
    对齐资料中心与任务监控的既有不变量，否则筛一下总数就跟着掉，教师会以为数据丢了。
    """
    require_role(user, "TEACHER")
    assignments = teacher_assignments(db, user.id)

    items = []
    course_options: list[dict] = []
    for assignment in assignments:
        course = db.get(Course, assignment.course_id)
        if course is None:
            continue
        administrative_class = db.get(AdministrativeClass, assignment.class_id)
        items.append(
            {
                "teaching_assignment_id": assignment.id,
                "course_id": assignment.course_id,
                "title": course.name,
                "description": course.description or "",
                "class_id": assignment.class_id,
                "class_name": administrative_class.name if administrative_class else "",
                "grade": administrative_class.grade if administrative_class else "",
                "major_name": administrative_class.major_name if administrative_class else "",
                "semester": assignment.term,
                "status": course.status,
                "student_count": len(class_student_ids(db, [assignment.class_id])),
                "task_count": len(published_task_ids(db, [assignment.id])),
                "created_at": iso(assignment.created_at),
            }
        )
        if not any(option["course_id"] == course.id for option in course_options):
            course_options.append({"course_id": course.id, "name": course.name})

    stats = {
        "class_count": len({item["class_id"] for item in items}),
        "course_count": len({item["course_id"] for item in items}),
        "student_total": len(class_student_ids(db, [item.class_id for item in assignments])),
        "task_total": len(published_task_ids(db, [item.id for item in assignments])),
    }
    terms = sorted({item["semester"] for item in items if item["semester"]})

    filtered = items
    if term:
        filtered = [item for item in filtered if item["semester"] == term]
    if keyword:
        needle = keyword.strip().lower()
        filtered = [
            item
            for item in filtered
            if needle in item["title"].lower() or needle in item["class_name"].lower()
        ]

    return ok(
        {
            "scope": {"term": term or ""},
            "stats": stats,
            "items": filtered,
            "filters": {"terms": terms, "courses": course_options},
        },
        meta={"total": len(filtered)},
    )


@router.get("/course-classes/{teaching_assignment_id}/students")
def course_class_students(
    teaching_assignment_id: str,
    keyword: str | None = Query(None, description="按姓名或学号搜索"),
    risk: str | None = Query(None, description="风险筛选：NORMAL / NOTICE / WATCH / HIGH"),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """教学班学生名单（§6.1）。只读 —— 教师不能删学生或改行政班归属（§二 2.3）。

    风险等级直接复用预警中心的规则（`compute_class_alerts`），并把命中的规则码一起
    返回，前端要能说明「为什么是高风险」，不能只靠一个颜色。
    """
    require_role(user, "TEACHER")
    assignment = _get_assignment(db, teaching_assignment_id, user.id)
    scope = resolve_diagnosis_scope(db, user.id, assignment.course_id, assignment.class_id)

    alerts = compute_class_alerts(db, scope)
    alert_by_student = {row["student_id"]: row for row in alerts["alerts"]}
    rule_labels = {row["code"]: row["label"] for row in alerts["rules"]}

    student_ids = sorted(scope.student_ids)
    assignment_ids = [item.id for item in scope.task_assignments]
    task_ids = sorted(scope.task_ids)

    progress_map: dict[tuple[str, str], StudentTaskProgress] = {}
    submission_map: dict[tuple[str, str], Submission] = {}
    students: list[User] = []
    if student_ids:
        students = list(
            db.scalars(
                select(User).where(User.id.in_(student_ids)).order_by(User.display_name, User.id)
            ).all()
        )
        if assignment_ids:
            for row in db.scalars(
                select(StudentTaskProgress).where(
                    StudentTaskProgress.assignment_id.in_(assignment_ids),
                    StudentTaskProgress.student_id.in_(student_ids),
                )
            ).all():
                progress_map[(row.assignment_id, row.student_id)] = row
        if task_ids:
            for row in db.scalars(
                select(Submission).where(
                    Submission.task_id.in_(task_ids),
                    Submission.student_id.in_(student_ids),
                )
            ).all():
                submission_map[(row.task_id, row.student_id)] = row

    now = utc_now()
    rows = []
    for student in students:
        completed = 0
        in_progress = 0
        not_started = 0
        overdue = 0
        scores: list[float] = []
        for task_assignment in scope.task_assignments:
            progress = progress_map.get((task_assignment.id, student.id))
            submission = submission_map.get((task_assignment.task_id, student.id))
            # 编码类任务不写 StudentTaskProgress，状态要能从 Submission 回退推导
            status = derive_progress_status(progress, submission)
            if status == "COMPLETED":
                completed += 1
            elif status == "NOT_STARTED":
                not_started += 1
            else:
                in_progress += 1
            # SQLite 取回的是 naive datetime，先统一按 UTC 解读再比较
            deadline = as_utc(task_assignment.deadline)
            if deadline and deadline < now and status != "COMPLETED":
                overdue += 1
            if progress is not None and progress.score is not None:
                scores.append(float(progress.score))

        alert = alert_by_student.get(student.id)
        rows.append(
            {
                "student_id": student.id,
                "student_name": student.display_name,
                "username": student.username,
                "risk_level": alert["level"] if alert else "NORMAL",
                "risk_rules": [
                    rule_labels.get(code, code) for code in (alert["rule_codes"] if alert else [])
                ],
                "task_total": len(scope.task_assignments),
                "completed_count": completed,
                "in_progress_count": in_progress,
                "not_started_count": not_started,
                "overdue_count": overdue,
                # 0 分和「没有成绩」是两件事，别用 0 兜底
                "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
                "last_activity_at": alert["last_activity_at"] if alert else None,
            }
        )

    risk_counts = {level: len([row for row in rows if row["risk_level"] == level]) for level in RISK_LEVELS}
    stats = {"total": len(rows), "risk_counts": risk_counts, "task_total": len(scope.task_assignments)}

    filtered = rows
    if risk:
        _validate_enum("risk", risk, set(RISK_LEVELS), "风险等级")
        filtered = [row for row in filtered if row["risk_level"] == risk]
    if keyword:
        needle = keyword.strip().lower()
        filtered = [
            row
            for row in filtered
            if needle in row["student_name"].lower() or needle in (row["username"] or "").lower()
        ]

    total = len(filtered)
    total_pages = max(1, (total + page_size - 1) // page_size)
    start = (page - 1) * page_size
    return ok(
        {
            "scope": {
                "teaching_assignment_id": assignment.id,
                "course_id": assignment.course_id,
                "class_id": assignment.class_id,
                "term": assignment.term,
            },
            "stats": stats,
            "items": filtered[start : start + page_size],
            "filters": {"risk_options": RISK_LEVELS, "rules": alerts["rules"]},
            # 分页同时放进 data：前端的 request() 只返回 data，meta 拿不到（对齐监控看板）
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
        meta={"page": page, "page_size": page_size, "total": total},
    )


@router.patch("/courses/{course_id}/description")
def update_course_description(
    course_id: str,
    payload: CourseDescriptionPayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """编辑课程教学说明（§6.1「编辑课程说明按钮」）。

    只改 `courses.description` 这一个字段。课程的建立、归档和授课关系分配是管理员端
    职责（§二 2.3），本接口不碰。
    """
    require_role(user, "TEACHER")
    course = db.get(Course, course_id)
    if course is None:
        raise ApiError(404, "COURSE_NOT_FOUND", "课程不存在")
    _ensure_course_scope(db, user.id, course_id)

    rid = request_id()
    course.description = payload.description
    record_audit(
        db,
        event_type="TEACHER_COURSE_UPDATED",
        request_id=rid,
        user_id=user.id,
        status=course.status,
        details={"course_id": course.id, "course_action": "UPDATE_DESCRIPTION"},
    )
    db.commit()
    db.refresh(course)
    return ok(
        {
            "course_id": course.id,
            "title": course.name,
            "description": course.description or "",
            "status": course.status,
        },
        rid=rid,
    )


# ---------------------------------------------------------------- §6.2 课程大纲


@router.get("/courses/{course_id}/syllabus")
def course_syllabus(
    course_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """整棵章节 — 知识点树（§6.2）。

    一次返回全量而不分页：章节树本来就要整棵展示，而且引用统计是批量算的，
    拆成分页反而要重复扫描资料和题目。
    """
    require_role(user, "TEACHER")
    course = db.get(Course, course_id)
    if course is None:
        raise ApiError(404, "COURSE_NOT_FOUND", "课程不存在")
    _ensure_course_scope(db, user.id, course_id)
    return ok(_syllabus_payload(db, course))


@router.post("/courses/{course_id}/chapters")
def create_chapter(
    course_id: str,
    payload: ChapterCreatePayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """新建章节（§6.2「新建章节按钮」）。"""
    require_role(user, "TEACHER")
    course = db.get(Course, course_id)
    if course is None:
        raise ApiError(404, "COURSE_NOT_FOUND", "课程不存在")
    _ensure_course_scope(db, user.id, course_id)

    title = payload.title.strip()
    existing = db.scalar(
        select(CourseChapter).where(
            CourseChapter.course_id == course_id, CourseChapter.title == title
        )
    )
    if existing is not None:
        raise ApiError(409, "CHAPTER_TITLE_DUPLICATED", "同名章节已存在")

    rid = request_id()
    chapter = CourseChapter(
        id=f"chp_{uuid4().hex[:16]}",
        course_id=course_id,
        title=title,
        summary=payload.summary.strip(),
        sort_order=_next_sort_order(db, CourseChapter, course_id=course_id),
        status="ACTIVE",
        created_by=user.id,
    )
    db.add(chapter)
    record_audit(
        db,
        event_type="TEACHER_CHAPTER_CREATED",
        request_id=rid,
        user_id=user.id,
        status=chapter.status,
        details={
            "course_id": course_id,
            "chapter_id": chapter.id,
            "syllabus_action": "CREATE_CHAPTER",
        },
    )
    db.commit()
    db.refresh(chapter)
    return ok(_serialize_chapter(chapter, []), rid=rid)


@router.patch("/chapters/{chapter_id}")
def update_chapter(
    chapter_id: str,
    payload: ChapterUpdatePayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """编辑章节名称、说明或状态（§6.2「编辑章节按钮」）。"""
    require_role(user, "TEACHER")
    chapter = _get_chapter(db, chapter_id, user.id)

    if payload.status is not None:
        _validate_enum("status", payload.status, SYLLABUS_STATUSES, "章节状态")
    if payload.title is not None:
        title = payload.title.strip()
        clash = db.scalar(
            select(CourseChapter).where(
                CourseChapter.course_id == chapter.course_id,
                CourseChapter.title == title,
                CourseChapter.id != chapter.id,
            )
        )
        if clash is not None:
            raise ApiError(409, "CHAPTER_TITLE_DUPLICATED", "同名章节已存在")
        chapter.title = title
    if payload.summary is not None:
        chapter.summary = payload.summary.strip()
    if payload.status is not None:
        chapter.status = payload.status

    rid = request_id()
    chapter.updated_at = utc_now()
    record_audit(
        db,
        event_type="TEACHER_CHAPTER_UPDATED",
        request_id=rid,
        user_id=user.id,
        status=chapter.status,
        details={
            "course_id": chapter.course_id,
            "chapter_id": chapter.id,
            "syllabus_action": "UPDATE_CHAPTER",
        },
    )
    db.commit()
    db.refresh(chapter)

    points = db.scalars(
        select(CourseKnowledgePoint)
        .where(CourseKnowledgePoint.chapter_id == chapter.id)
        .order_by(CourseKnowledgePoint.sort_order)
    ).all()
    usage = _usage_index(db, chapter.course_id, {item.name for item in points})
    return ok(
        _serialize_chapter(
            chapter,
            [_serialize_point(item, usage.get(item.name, _empty_usage())) for item in points],
        ),
        rid=rid,
    )


@router.delete("/chapters/{chapter_id}")
def delete_chapter(
    chapter_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """删除章节（§6.2）。名下还有生效知识点时拒绝 —— 先移走或停用。"""
    require_role(user, "TEACHER")
    chapter = _get_chapter(db, chapter_id, user.id)

    active_points = db.scalars(
        select(CourseKnowledgePoint).where(
            CourseKnowledgePoint.chapter_id == chapter.id,
            CourseKnowledgePoint.status == "ACTIVE",
        )
    ).all()
    if active_points:
        raise ApiError(
            409,
            "CHAPTER_NOT_EMPTY",
            f"章节下还有 {len(active_points)} 个生效知识点，先移动或停用后才能删除",
            details={"chapter_id": chapter.id},
        )

    rid = request_id()
    course_id = chapter.course_id
    # 停用态的知识点随章节一起删：它们没有任何引用才可能停在这里
    db.query(CourseKnowledgePoint).filter(CourseKnowledgePoint.chapter_id == chapter.id).delete()
    db.delete(chapter)
    record_audit(
        db,
        event_type="TEACHER_CHAPTER_DELETED",
        request_id=rid,
        user_id=user.id,
        status="DELETED",
        details={
            "course_id": course_id,
            "chapter_id": chapter_id,
            "syllabus_action": "DELETE_CHAPTER",
        },
    )
    db.commit()
    return ok({"chapter_id": chapter_id, "deleted": True}, rid=rid)


@router.post("/chapters/{chapter_id}/knowledge-points")
def create_knowledge_point(
    chapter_id: str,
    payload: KnowledgePointCreatePayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """在章节下新建知识点（§6.2「新建知识点按钮」）。

    名称在课程内必须唯一：资料、题目和画像都是按名称软关联的。
    """
    require_role(user, "TEACHER")
    chapter = _get_chapter(db, chapter_id, user.id)
    _validate_enum("point_type", payload.point_type, POINT_TYPES, "知识点类型")
    _validate_enum("difficulty", payload.difficulty, DIFFICULTIES, "知识点难度")

    name = payload.name.strip()
    clash = db.scalar(
        select(CourseKnowledgePoint).where(
            CourseKnowledgePoint.course_id == chapter.course_id,
            CourseKnowledgePoint.name == name,
        )
    )
    if clash is not None:
        raise ApiError(
            409,
            "KNOWLEDGE_POINT_NAME_DUPLICATED",
            "同课程内已有同名知识点，名称必须唯一才能与资料、题目和画像对上",
        )

    rid = request_id()
    point = CourseKnowledgePoint(
        id=f"kp_{uuid4().hex[:16]}",
        course_id=chapter.course_id,
        chapter_id=chapter.id,
        name=name,
        summary=payload.summary.strip(),
        point_type=payload.point_type,
        difficulty=payload.difficulty,
        sort_order=_next_sort_order(db, CourseKnowledgePoint, chapter_id=chapter.id),
        status="ACTIVE",
        created_by=user.id,
    )
    db.add(point)
    record_audit(
        db,
        event_type="TEACHER_KNOWLEDGE_POINT_CREATED",
        request_id=rid,
        user_id=user.id,
        status=point.status,
        details={
            "course_id": chapter.course_id,
            "chapter_id": chapter.id,
            "knowledge_point_id": point.id,
            "knowledge_point_name": name,
            "syllabus_action": "CREATE_KNOWLEDGE_POINT",
        },
    )
    db.commit()
    db.refresh(point)
    usage = _usage_index(db, point.course_id, {point.name})
    return ok(_serialize_point(point, usage.get(point.name, _empty_usage())), rid=rid)


@router.patch("/knowledge-points/{knowledge_point_id}")
def update_knowledge_point(
    knowledge_point_id: str,
    payload: KnowledgePointUpdatePayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """编辑知识点（§6.2）。

    **改名受限**：知识点一旦被资料、题目或画像引用过就不许改名。软关联靠的是名字，
    改了名那些历史引用会静默变成孤儿 —— 教师看不到，学生画像却会少一个维度。
    要改只能新建一个知识点再把引用迁过去。
    """
    require_role(user, "TEACHER")
    point = _get_point(db, knowledge_point_id, user.id)

    if payload.point_type is not None:
        _validate_enum("point_type", payload.point_type, POINT_TYPES, "知识点类型")
    if payload.difficulty is not None:
        _validate_enum("difficulty", payload.difficulty, DIFFICULTIES, "知识点难度")
    if payload.status is not None:
        _validate_enum("status", payload.status, SYLLABUS_STATUSES, "知识点状态")

    if payload.name is not None and payload.name.strip() != point.name:
        new_name = payload.name.strip()
        usage = _usage_index(db, point.course_id, {point.name}).get(point.name, _empty_usage())
        reason = _blocked_reason(usage)
        if reason is not None:
            raise ApiError(
                409,
                "KNOWLEDGE_POINT_IN_USE",
                f"知识点{reason.replace('只能停用，不能删除', '不能改名')}",
                details={"knowledge_point_id": point.id, "knowledge_point_name": point.name},
            )
        clash = db.scalar(
            select(CourseKnowledgePoint).where(
                CourseKnowledgePoint.course_id == point.course_id,
                CourseKnowledgePoint.name == new_name,
                CourseKnowledgePoint.id != point.id,
            )
        )
        if clash is not None:
            raise ApiError(
                409, "KNOWLEDGE_POINT_NAME_DUPLICATED", "同课程内已有同名知识点"
            )
        point.name = new_name

    if payload.chapter_id is not None and payload.chapter_id != point.chapter_id:
        target = _get_chapter(db, payload.chapter_id, user.id)
        if target.course_id != point.course_id:
            raise ApiError(
                422,
                "SYLLABUS_FIELD_INVALID",
                "只能在同一门课程内移动知识点",
                details={"field": "chapter_id", "value": payload.chapter_id},
            )
        point.chapter_id = target.id
        point.sort_order = _next_sort_order(db, CourseKnowledgePoint, chapter_id=target.id)

    if payload.summary is not None:
        point.summary = payload.summary.strip()
    if payload.point_type is not None:
        point.point_type = payload.point_type
    if payload.difficulty is not None:
        point.difficulty = payload.difficulty
    if payload.status is not None:
        point.status = payload.status

    rid = request_id()
    point.updated_at = utc_now()
    record_audit(
        db,
        event_type="TEACHER_KNOWLEDGE_POINT_UPDATED",
        request_id=rid,
        user_id=user.id,
        status=point.status,
        details={
            "course_id": point.course_id,
            "chapter_id": point.chapter_id,
            "knowledge_point_id": point.id,
            "knowledge_point_name": point.name,
            "syllabus_action": "UPDATE_KNOWLEDGE_POINT",
        },
    )
    db.commit()
    db.refresh(point)
    usage = _usage_index(db, point.course_id, {point.name})
    return ok(_serialize_point(point, usage.get(point.name, _empty_usage())), rid=rid)


@router.delete("/knowledge-points/{knowledge_point_id}")
def delete_knowledge_point(
    knowledge_point_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """删除知识点（§6.2）。被资料、题目或画像引用过就拒绝，只能停用。"""
    require_role(user, "TEACHER")
    point = _get_point(db, knowledge_point_id, user.id)

    usage = _usage_index(db, point.course_id, {point.name}).get(point.name, _empty_usage())
    reason = _blocked_reason(usage)
    if reason is not None:
        raise ApiError(
            409,
            "KNOWLEDGE_POINT_IN_USE",
            f"知识点{reason}",
            details={
                "knowledge_point_id": point.id,
                "knowledge_point_name": point.name,
            },
        )

    rid = request_id()
    course_id = point.course_id
    chapter_id = point.chapter_id
    name = point.name
    db.delete(point)
    record_audit(
        db,
        event_type="TEACHER_KNOWLEDGE_POINT_DELETED",
        request_id=rid,
        user_id=user.id,
        status="DELETED",
        details={
            "course_id": course_id,
            "chapter_id": chapter_id,
            "knowledge_point_id": knowledge_point_id,
            "knowledge_point_name": name,
            "syllabus_action": "DELETE_KNOWLEDGE_POINT",
        },
    )
    db.commit()
    return ok({"knowledge_point_id": knowledge_point_id, "deleted": True}, rid=rid)


@router.get("/knowledge-points/{knowledge_point_id}/usage")
def knowledge_point_usage(
    knowledge_point_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """知识点被谁引用（§6.2「删除前必须检查任务、资料和画像关联」）。

    删除对话框据此列出具体的资料和任务，而不是只说一句「被引用了」。
    """
    require_role(user, "TEACHER")
    point = _get_point(db, knowledge_point_id, user.id)
    usage = _usage_index(db, point.course_id, {point.name}).get(point.name, _empty_usage())
    reason = _blocked_reason(usage)
    return ok(
        {
            "knowledge_point_id": point.id,
            "name": point.name,
            **usage,
            "deletable": reason is None,
            "blocked_reason": reason,
        }
    )


@router.post("/courses/{course_id}/syllabus/reorder")
def reorder_syllabus(
    course_id: str,
    payload: SyllabusReorderPayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """拖拽排序（§6.2）。按传入数组的下标重写 `sort_order`。

    整层一次性提交，而不是逐个 PATCH：拖动一次会改动多行的顺序，分开发会出现中间态。
    """
    require_role(user, "TEACHER")
    course = db.get(Course, course_id)
    if course is None:
        raise ApiError(404, "COURSE_NOT_FOUND", "课程不存在")
    _ensure_course_scope(db, user.id, course_id)

    rid = request_id()
    if payload.chapters is not None:
        ids = payload.chapters
        rows = db.scalars(
            select(CourseChapter).where(
                CourseChapter.course_id == course_id, CourseChapter.id.in_(ids)
            )
        ).all()
        found = {row.id: row for row in rows}
        if len(ids) != len(set(ids)) or len(found) != len(ids):
            raise ApiError(
                422,
                "SYLLABUS_REORDER_INVALID",
                "排序列表必须是本课程章节且不能重复",
                details={"field": "chapters"},
            )
        for index, chapter_id in enumerate(ids):
            found[chapter_id].sort_order = index
            found[chapter_id].updated_at = utc_now()
        action = "REORDER_CHAPTERS"
        details = {"course_id": course_id, "syllabus_action": action}
    elif payload.chapter_id and payload.knowledge_points is not None:
        chapter = _get_chapter(db, payload.chapter_id, user.id)
        if chapter.course_id != course_id:
            raise ApiError(
                422,
                "SYLLABUS_REORDER_INVALID",
                "章节不属于该课程",
                details={"field": "chapter_id"},
            )
        ids = payload.knowledge_points
        rows = db.scalars(
            select(CourseKnowledgePoint).where(
                CourseKnowledgePoint.chapter_id == chapter.id,
                CourseKnowledgePoint.id.in_(ids),
            )
        ).all()
        found = {row.id: row for row in rows}
        if len(ids) != len(set(ids)) or len(found) != len(ids):
            raise ApiError(
                422,
                "SYLLABUS_REORDER_INVALID",
                "排序列表必须是该章节下的知识点且不能重复",
                details={"field": "knowledge_points"},
            )
        for index, point_id in enumerate(ids):
            found[point_id].sort_order = index
            found[point_id].updated_at = utc_now()
        action = "REORDER_KNOWLEDGE_POINTS"
        details = {
            "course_id": course_id,
            "chapter_id": chapter.id,
            "syllabus_action": action,
        }
    else:
        raise ApiError(
            422,
            "SYLLABUS_REORDER_INVALID",
            "需要传 chapters，或同时传 chapter_id 与 knowledge_points",
        )

    record_audit(
        db,
        event_type="TEACHER_SYLLABUS_REORDERED",
        request_id=rid,
        user_id=user.id,
        status="ACTIVE",
        details=details,
    )
    db.commit()
    return ok(_syllabus_payload(db, course), rid=rid)
