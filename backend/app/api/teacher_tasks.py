"""教师端任务中心接口（开发方案 §八 8.1 任务列表）。

本模块**全程只读**：不 commit、不写审计。原因是 §八 8.1 的行内写操作（新建、编辑、
复制、归档、发布）都缺少可写落点：

- `Task` 表没有 §14.1 的五态内容状态字段（种子数据里 `status` 只有 `OPEN` 一种取值），
  也没有章节、知识点、难度、创建时间。归档和复制一旦现在写，写进去的状态没有任何
  接口读得懂。
- 发布会批量初始化全班 `StudentTaskProgress`（§八 8.6「发布后必须初始化所有学生任务
  进度」），必须与写接口、二次确认和审计日志一起上线，不能先放一个能点的按钮。

所以列表页把这些动作按 `unavailable_actions` 渲染成不可用，并显示后端给出的原因 ——
理由文案放后端，前端只负责渲染，避免两边各编一套说辞。

**内容状态是推导出来的，不是存的**。见 `_derive_content_status`：现有数据只能可靠地区分
「已发布 / 已结束 / 可发布」，DRAFT 与 ARCHIVED 只在 `Task.status` 真的写了这两个值时
出现。响应里的 `status_derivation` 把这件事讲清楚，避免前端把「可发布」误读成教师手工
标过的状态。

范围口径按 §15.1：只统计当前教师 `ACTIVE` 教学安排覆盖的课程与班级，`class_id` 越界直接
403。选定班级后，发布记录与完成率都只按该班级口径计算。
"""

import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import (
    AdministrativeClass,
    Course,
    Question,
    StudentTaskProgress,
    Submission,
    Task,
    TaskAssignment,
    TeachingAssignment,
    TestCase,
    User,
)
from backend.app.services.submissions import iso
from backend.app.services.teacher_scope import (
    SUBMITTED_PROGRESS_STATUSES,
    class_student_ids,
    derive_progress_status,
    teacher_assignments,
)

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-tasks"])


# workspace_type 是现有字段，任务类型只能从它推导。§八 8.1 的筛选器还列了「测验」和
# 「补救任务」，但那两个在数据里是 TaskAssignment.assignment_mode（发布模式），不是内容
# 类型 —— 同一份客观题既能按练习发也能按测验发。所以类型筛选只给这两项，发布模式在每行
# 的发布记录里显示，不混成一个筛选器。
WORKSPACE_TYPE_TO_TASK_TYPE = {
    "CODING": "PROGRAMMING",
    "QUESTION_SET": "QUESTION",
}

TASK_TYPE_OPTIONS = [
    {"value": "PROGRAMMING", "label": "编程任务"},
    {"value": "QUESTION", "label": "客观题"},
]

CONTENT_STATUS_ORDER = ["DRAFT", "READY", "PUBLISHED", "CLOSED", "ARCHIVED"]

# 视作「仍在下发中」的班级发布状态。PAUSED 也算已发布：任务已经在学生端出现过，
# 只是暂时不能提交，不能因为暂停就退回「可发布」。
ACTIVE_PUBLISH_STATUSES = {"PUBLISHED", "SCHEDULED", "PAUSED"}

STATUS_DERIVATION = (
    "内容状态由现有数据推导：有生效发布记录记为已发布，全部发布记录已关闭记为已结束，"
    "其余记为可发布。Task 表尚无 §14.1 的五态字段，草稿与已归档只在数据里确实写了这两个"
    "状态时才会出现。"
)

# 选定班级后口径会变窄，这件事必须说出来：一个已经发给软工班的任务，在计科班视角下
# 就是「还没下发」，会显示成可发布。不说明的话教师会以为状态自相矛盾。
CLASS_SCOPED_NOTE = (
    "当前已按班级口径统计：发布记录、完成率和内容状态都只看这个班，"
    "已发给其他班但未发给本班的任务会显示为可发布。"
)

# 六个行内动作背后的写接口都还没有。理由写在后端，前端按 action 找对应文案。
UNAVAILABLE_ACTIONS = [
    {
        "action": "CREATE_TASK",
        "reason": "任务创建接口（§八 8.2）尚未实现，可以进入框架页查看控件清单，但保存草稿还不可用。",
        "target_route": "/teacher/tasks/new",
    },
    {
        "action": "EDIT_TASK",
        "reason": "客观题编辑器与编程任务编辑器（§八 8.3 / 8.4）尚未接入写接口，进去只能看到控件清单。",
        "target_route": None,
    },
    {
        "action": "DUPLICATE_TASK",
        "reason": "复制为新草稿需要任务写接口和 §14.1 的内容状态字段，当前 Task 表没有草稿态可落。",
        "target_route": None,
    },
    {
        "action": "ARCHIVE_TASK",
        "reason": "归档要写 Task.status，现有数据只有 OPEN 一种取值，写入前得先迁移五态枚举，否则写进去没人读得懂。",
        "target_route": None,
    },
    {
        "action": "PUBLISH_TASK",
        "reason": "发布会批量初始化全班学生任务进度（§八 8.6），必须与写接口、二次确认和审计日志一起上线。",
        "target_route": None,
    },
    {
        "action": "STUDENT_PREVIEW",
        "reason": "学生视角预览需要一个教师可读的渲染接口；教师账号不能直接进入学生端路由。",
        "target_route": None,
    },
]


def _json_list(raw: str | None) -> list:
    """capability_ids / learning_objectives 都是 JSON 文本列，脏数据不该让整页 500。"""
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def _derive_content_status(task: Task, publications: list[TaskAssignment]) -> str:
    raw = (task.status or "").upper()
    if raw in {"DRAFT", "ARCHIVED"}:
        return raw
    if any(item.publish_status in ACTIVE_PUBLISH_STATUSES for item in publications):
        return "PUBLISHED"
    if publications and all(item.publish_status == "CLOSED" for item in publications):
        return "CLOSED"
    if raw == "CLOSED":
        return "CLOSED"
    return "READY"


@router.get("/tasks")
def teacher_task_list(
    course_id: str | None = Query(default=None),
    class_id: str | None = Query(default=None),
    task_type: str | None = Query(default=None),
    content_status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """任务列表。分页在后端做，`stats` 始终覆盖整个范围而不是当前页。

    `stats` 有意不受 `task_type` / `content_status` 影响：那两个筛选器的入口就是这些
    卡片和标签，如果计数跟着筛选走，切到「已发布」后其余卡片全变 0，教师就没法用它们
    对比了。`keyword` 会影响 `stats`，因为搜索改变的是「在看哪一批任务」。
    """
    require_role(user, "TEACHER")

    assignments = teacher_assignments(db, user.id, course_id)
    if course_id and not assignments:
        raise ApiError(403, "AUTH_FORBIDDEN", "当前教师在该课程没有生效的教学安排")
    if class_id:
        assignments = [item for item in assignments if item.class_id == class_id]
        if not assignments:
            raise ApiError(403, "AUTH_FORBIDDEN", "无权访问该班级的任务数据")

    # 课程与班级选项始终按教师全部教学安排列出，否则选了班就再也切不回别的班
    all_assignments = teacher_assignments(db, user.id)
    course_options = _course_options(db, all_assignments, course_id)
    class_options = _class_options(db, all_assignments, course_id, class_id)

    if not assignments:
        return ok(_empty_payload(course_id, class_id, course_options, class_options, page, page_size))

    scoped_course_ids = sorted({item.course_id for item in assignments})
    scoped_class_ids = sorted({item.class_id for item in assignments})
    assignment_by_id = {item.id: item for item in assignments}

    tasks = list(
        db.scalars(
            select(Task)
            .where(Task.course_id.in_(scoped_course_ids))
            .order_by(Task.course_id.asc(), Task.title.asc())
        ).all()
    )

    publications_by_task = _publications_by_task(db, list(assignment_by_id))
    courses = {
        course.id: course
        for course in db.scalars(select(Course).where(Course.id.in_(scoped_course_ids))).all()
    }
    class_names = _class_names(db, scoped_class_ids)

    keyword_text = (keyword or "").strip().lower()
    rows = []
    for task in tasks:
        if keyword_text and keyword_text not in task.title.lower():
            continue
        publications = publications_by_task.get(task.id, [])
        course = courses.get(task.course_id)
        rows.append(
            {
                "task_id": task.id,
                "title": task.title,
                "description": task.description,
                "course_id": task.course_id,
                "course_name": course.name if course else "",
                "task_type": WORKSPACE_TYPE_TO_TASK_TYPE.get(task.workspace_type, task.workspace_type),
                "workspace_type": task.workspace_type,
                "content_status": _derive_content_status(task, publications),
                "raw_status": task.status,
                "language": task.language,
                "interface_spec": task.interface_spec,
                "learning_objectives": _json_list(task.learning_objectives),
                "capability_ids": _json_list(task.capability_ids),
                "publications": [
                    {
                        "assignment_id": item.id,
                        "class_id": assignment_by_id[item.teaching_assignment_id].class_id,
                        "class_name": class_names.get(
                            assignment_by_id[item.teaching_assignment_id].class_id, ""
                        ),
                        "term": assignment_by_id[item.teaching_assignment_id].term,
                        "publish_status": item.publish_status,
                        "assignment_mode": item.assignment_mode,
                        "allow_hint_level_3": item.allow_hint_level_3,
                        "published_at": iso(item.published_at),
                        "deadline": iso(item.deadline),
                    }
                    for item in publications
                ],
            }
        )

    stats = {
        "total": len(rows),
        **{status.lower(): 0 for status in CONTENT_STATUS_ORDER},
        "programming": 0,
        "question": 0,
    }
    for row in rows:
        stats[row["content_status"].lower()] = stats.get(row["content_status"].lower(), 0) + 1
        if row["task_type"] == "PROGRAMMING":
            stats["programming"] += 1
        elif row["task_type"] == "QUESTION":
            stats["question"] += 1

    if task_type:
        rows = [row for row in rows if row["task_type"] == task_type]
    if content_status:
        rows = [row for row in rows if row["content_status"] == content_status]

    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]

    _attach_content_counts(db, page_rows)
    _attach_progress(db, page_rows, class_names)

    return ok(
        {
            "scope": {
                "course_id": course_id,
                "class_id": class_id,
                "course_ids": scoped_course_ids,
                "class_ids": scoped_class_ids,
            },
            "course_options": course_options,
            "class_options": class_options,
            "task_type_options": TASK_TYPE_OPTIONS,
            "content_status_order": CONTENT_STATUS_ORDER,
            "status_derivation": (
                f"{STATUS_DERIVATION}{CLASS_SCOPED_NOTE}" if class_id else STATUS_DERIVATION
            ),
            "stats": stats,
            "items": page_rows,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "unavailable_actions": UNAVAILABLE_ACTIONS,
        }
    )


def _empty_payload(
    course_id: str | None,
    class_id: str | None,
    course_options: list[dict],
    class_options: list[dict],
    page: int,
    page_size: int,
) -> dict:
    """教师没有任何生效教学安排时的空壳。空列表和「加载失败」是两回事，仍返回 200。"""
    return {
        "scope": {
            "course_id": course_id,
            "class_id": class_id,
            "course_ids": [],
            "class_ids": [],
        },
        "course_options": course_options,
        "class_options": class_options,
        "task_type_options": TASK_TYPE_OPTIONS,
        "content_status_order": CONTENT_STATUS_ORDER,
        "status_derivation": STATUS_DERIVATION,
        "stats": {
            "total": 0,
            **{status.lower(): 0 for status in CONTENT_STATUS_ORDER},
            "programming": 0,
            "question": 0,
        },
        "items": [],
        "page": page,
        "page_size": page_size,
        "total": 0,
        "total_pages": 1,
        "unavailable_actions": UNAVAILABLE_ACTIONS,
    }


def _course_options(
    db: Session, assignments: list[TeachingAssignment], current_course_id: str | None
) -> list[dict]:
    course_ids = sorted({item.course_id for item in assignments})
    if not course_ids:
        return []
    courses = {
        course.id: course
        for course in db.scalars(select(Course).where(Course.id.in_(course_ids))).all()
    }
    return [
        {
            "course_id": course_id,
            "name": courses[course_id].name if course_id in courses else course_id,
            "term": courses[course_id].term if course_id in courses else "",
            "is_current": course_id == current_course_id,
        }
        for course_id in course_ids
    ]


def _class_options(
    db: Session,
    assignments: list[TeachingAssignment],
    current_course_id: str | None,
    current_class_id: str | None,
) -> list[dict]:
    """班级选项跟着课程收窄：选了课程就只列该课程的班，避免选出跨课程的无效组合。"""
    scoped = [
        item
        for item in assignments
        if not current_course_id or item.course_id == current_course_id
    ]
    class_ids = sorted({item.class_id for item in scoped})
    names = _class_names(db, class_ids)
    return [
        {
            "class_id": class_id,
            "name": names.get(class_id, class_id),
            "is_current": class_id == current_class_id,
        }
        for class_id in class_ids
    ]


def _class_names(db: Session, class_ids: list[str]) -> dict[str, str]:
    if not class_ids:
        return {}
    return {
        row.id: row.name
        for row in db.scalars(
            select(AdministrativeClass).where(AdministrativeClass.id.in_(class_ids))
        ).all()
    }


def _publications_by_task(
    db: Session, teaching_assignment_ids: list[str]
) -> dict[str, list[TaskAssignment]]:
    """一次查完当前范围内所有发布记录，避免每行任务再查一次。

    注意不过滤 `publish_status`：已关闭的发布记录决定任务是否算「已结束」，
    过滤掉就会把结课任务算回「可发布」。
    """
    if not teaching_assignment_ids:
        return {}
    grouped: dict[str, list[TaskAssignment]] = {}
    rows = db.scalars(
        select(TaskAssignment)
        .where(TaskAssignment.teaching_assignment_id.in_(teaching_assignment_ids))
        .order_by(TaskAssignment.published_at.asc())
    ).all()
    for row in rows:
        grouped.setdefault(row.task_id, []).append(row)
    return grouped


def _attach_content_counts(db: Session, rows: list[dict]) -> None:
    """测试用例数与题目数。只查当前页的任务。"""
    task_ids = [row["task_id"] for row in rows]
    if not task_ids:
        return

    cases: dict[str, list[TestCase]] = {}
    for case in db.scalars(select(TestCase).where(TestCase.task_id.in_(task_ids))).all():
        cases.setdefault(case.task_id, []).append(case)

    questions: dict[str, list[Question]] = {}
    for question in db.scalars(select(Question).where(Question.task_id.in_(task_ids))).all():
        questions.setdefault(question.task_id, []).append(question)

    for row in rows:
        task_cases = cases.get(row["task_id"], [])
        task_questions = questions.get(row["task_id"], [])
        row["test_case_count"] = len(task_cases)
        # 学生端只看得到公开用例，这个数字是教师判断任务是否可自检的关键
        row["public_test_case_count"] = len(
            [item for item in task_cases if item.visibility == "PUBLIC"]
        )
        row["required_test_case_count"] = len([item for item in task_cases if item.required])
        row["question_count"] = len(task_questions)
        # 没题目时是 None 而不是 0：「没有题目」和「题目总分 0」是两件事
        row["question_total_score"] = (
            round(sum(item.score for item in task_questions), 2) if task_questions else None
        )


def _attach_progress(db: Session, rows: list[dict], class_names: dict[str, str]) -> None:
    """每行任务的完成情况，口径与任务监控（§九 9.1）一致：`derive_progress_status`。

    未发布的任务没有名册可算，`completion_rate` 给 null 而不是 0 —— 前端要能区分
    「还没发布」和「发布了但没人完成」。
    """
    task_ids = [row["task_id"] for row in rows]
    if not task_ids:
        return

    # 只有生效发布记录才带来学生名册；已关闭的班级仍要计入历史完成率，
    # 所以这里统一用「有发布记录的班级」，与内容状态推导保持一致
    roster_by_task: dict[str, set[str]] = {}
    assignment_ids_by_task: dict[str, list[str]] = {}
    for row in rows:
        row_class_ids = sorted({item["class_id"] for item in row["publications"]})
        roster_by_task[row["task_id"]] = class_student_ids(db, row_class_ids)
        assignment_ids_by_task[row["task_id"]] = [
            item["assignment_id"] for item in row["publications"]
        ]

    all_assignment_ids = sorted({aid for ids in assignment_ids_by_task.values() for aid in ids})
    progress_by_key: dict[tuple[str, str], StudentTaskProgress] = {}
    if all_assignment_ids:
        for progress in db.scalars(
            select(StudentTaskProgress).where(
                StudentTaskProgress.assignment_id.in_(all_assignment_ids)
            )
        ).all():
            progress_by_key[(progress.assignment_id, progress.student_id)] = progress

    submission_by_key: dict[tuple[str, str], Submission] = {}
    for submission in db.scalars(
        select(Submission).where(Submission.task_id.in_(task_ids))
    ).all():
        submission_by_key[(submission.task_id, submission.student_id)] = submission

    for row in rows:
        task_id = row["task_id"]
        roster = roster_by_task.get(task_id, set())
        assignment_ids = assignment_ids_by_task.get(task_id, [])
        statuses = []
        for student_id in roster:
            progress = next(
                (
                    progress_by_key[(assignment_id, student_id)]
                    for assignment_id in assignment_ids
                    if (assignment_id, student_id) in progress_by_key
                ),
                None,
            )
            statuses.append(
                derive_progress_status(progress, submission_by_key.get((task_id, student_id)))
            )

        completed = len([item for item in statuses if item == "COMPLETED"])
        row["roster_total"] = len(roster)
        row["submitted_count"] = len(
            [item for item in statuses if item in SUBMITTED_PROGRESS_STATUSES]
        )
        row["completed_count"] = completed
        row["not_started_count"] = len([item for item in statuses if item == "NOT_STARTED"])
        row["completion_rate"] = round(completed / len(roster), 4) if roster else None
        row["published_class_names"] = [
            class_names.get(item["class_id"], item["class_id"]) for item in row["publications"]
        ]
