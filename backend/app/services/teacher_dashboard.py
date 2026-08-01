"""教学首页聚合（开发方案 §五 页面模块一）。

## 为什么单独一个聚合接口

§5.2 的六张概览卡片、今日待办、最近任务和班级学情摘要，口径都是「当前这一个教学班」。
如果让前端分别去打 `/analytics/class`、`/alerts`、`/ai-reviews`、`/monitor/board`
再自己拼，会出两个问题：

1. `/monitor/board` 一次只看一个任务（见该模块 docstring），而首页的「平均完成率」
   和「逾期人数」必须横跨该班全部任务，前端拼不出来；
2. 几个接口各自收窄范围，教师切换班级时几张卡片可能落在不同班上。

所以这里按 §15.1 以 `teaching_assignment_id` 为主键做一次聚合。

## 全程只读

本模块不 commit、不写审计。§5.3 明确「该页面只读取学生端产生的数据，不直接修改学生
数据」。`标记已处理` 需要待办状态表，库里没有落点，所以它和教师反馈一起走
`unavailable_actions` 下发原因，前端不自己编文案，也不放能点但存不了的按钮
（与 `services/learning_alerts` 和 `api/teacher_monitor` 同一约定）。

## 状态与逾期口径

与 §九 提交进度看板完全一致：状态走 `derive_progress_status` 从进度表和
`Submission.status` 里取更靠后的一个（编码任务不写进度表）；逾期是独立布尔标记，
不并进派生状态，允许「交晚了」同时成立。
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.models import (
    AdministrativeClass,
    Course,
    StudentTaskProgress,
    Submission,
    Task,
    TaskAssignment,
    TeachingAssignment,
)
from backend.app.models.entities import utc_now
from backend.app.services import ai_review
from backend.app.services.learner_stats import (
    class_error_distribution,
    class_knowledge_matrix,
    round1,
)
from backend.app.services.learning_alerts import as_utc, compute_class_alerts
from backend.app.services.submissions import iso
from backend.app.services.teacher_scope import (
    SUBMITTED_PROGRESS_STATUSES,
    class_student_ids,
    derive_progress_status,
    resolve_diagnosis_scope,
    teacher_assignments,
)

# 首页「最近任务」只列学生端已经能看见的发布记录。
# 刻意不含 SCHEDULED：定时发布还没生效，学生端看不到，算进完成率会凭空拉低分母。
# 含 PAUSED / CLOSED：任务已经在学生端出现过，§8.6 要求历史数据可查。
VISIBLE_PUBLISH_STATUSES = ("PUBLISHED", "PAUSED", "CLOSED")

# 距截止多少天内算「即将截止」，进今日待办。
# 取 7 天与 `services/learning_alerts.INACTIVE_DAYS` 一致：教学节奏按周走，一周内要截止
# 的任务才是教师这周需要盯的。
DUE_SOON_DAYS = 7

# 知识点平均掌握度低于此值算薄弱（与 §十 诊断页热力图同一阈值）
WEAK_MASTERY_THRESHOLD = 60.0

# 首页只给摘要，明细一律下钻到对应模块，避免首页变成第二套报表
TOP_N = 5
TREND_LIMIT = 8

WORKSPACE_TYPE_TO_TASK_TYPE = {
    "CODING": "PROGRAMMING",
    "QUESTION_SET": "QUESTION",
}

# §5.2 C 待办标签的四类。前端按 type 上色，文案统一由后端下发，不在页面里写死中文
TODO_TYPE_LABELS = {
    "TASK": "任务",
    "STUDENT": "学生",
    "AI_REVIEW": "AI 审核",
    "FEEDBACK": "反馈",
}

TODO_LEVEL_RANK = {"HIGH": 0, "WATCH": 1, "NOTICE": 2}

UNAVAILABLE_ACTIONS = [
    {
        "action": "MARK_TODO_DONE",
        "reason": "「标记已处理」需要待办状态表，库里还没有可写落点。待办由规则实时"
        "推导，处理完对应事项后会自动从列表消失。",
        "target_route": None,
    },
    {
        "action": "TEACHER_FEEDBACK",
        "reason": "教师反馈需要 TeacherFeedback 表（§十三 13.1），尚未建表。可以先从待办"
        "进入批改进度查看提交、测试与 AI 诊断。",
        "target_route": None,
    },
]


@dataclass(frozen=True)
class DashboardContext:
    """一次首页查询锁定的教学上下文（§5.2 A）。

    `current` 是唯一的当前教学班 —— 首页要回答「当前教到哪里、这个班学得怎么样」，
    把多个班拍平之后「未开始人数」和「平均完成率」就没有意义了。
    """

    all_assignments: list[TeachingAssignment]
    current: TeachingAssignment
    course: Course | None
    administrative_class: AdministrativeClass | None

    @property
    def term(self) -> str:
        return self.current.term


def resolve_context(
    db: Session,
    teacher_id: str,
    teaching_assignment_id: str | None = None,
    term: str | None = None,
    course_id: str | None = None,
    class_id: str | None = None,
) -> DashboardContext | None:
    """把选择器参数收窄到当前教师真实负责的某一个教学班。

    返回 None 表示这位教师没有任何生效教学安排，由调用方给出空态原因，
    而不是抛 403 让教师以为是权限配错了。
    """
    all_assignments = teacher_assignments(db, teacher_id)
    if not all_assignments:
        return None

    candidates = all_assignments
    if teaching_assignment_id:
        # 深链直接指定教学班时以它为准，其余筛选参数不再参与收窄
        candidates = [item for item in candidates if item.id == teaching_assignment_id]
        if not candidates:
            raise ApiError(
                404, "TEACHING_ASSIGNMENT_NOT_FOUND", "教学安排不存在或不属于当前教师"
            )
    else:
        if term:
            candidates = [item for item in candidates if item.term == term]
        if course_id:
            candidates = [item for item in candidates if item.course_id == course_id]
        if class_id:
            candidates = [item for item in candidates if item.class_id == class_id]
        if not candidates:
            raise ApiError(403, "AUTH_FORBIDDEN", "当前教师没有符合该筛选条件的教学安排")

    current = candidates[0]
    return DashboardContext(
        all_assignments=all_assignments,
        current=current,
        course=db.get(Course, current.course_id),
        administrative_class=db.get(AdministrativeClass, current.class_id),
    )


def _selector_options(db: Session, context: DashboardContext) -> dict:
    """学期 / 课程 / 班级三级选择器。

    下级选项跟着上级收窄，避免教师选出「A 学期 + 只在 B 学期开的班」这种无效组合
    （与 §九 看板的课程班级选项同一做法）。
    """
    assignments = context.all_assignments
    current = context.current

    terms = sorted({item.term for item in assignments}, reverse=True)

    in_term = [item for item in assignments if item.term == current.term]
    course_ids = sorted({item.course_id for item in in_term})
    courses = {
        row.id: row
        for row in db.scalars(select(Course).where(Course.id.in_(course_ids))).all()
    }

    in_course = [item for item in in_term if item.course_id == current.course_id]
    class_ids = sorted({item.class_id for item in in_course})
    class_names = {
        row.id: row.name
        for row in db.scalars(
            select(AdministrativeClass).where(AdministrativeClass.id.in_(class_ids))
        ).all()
    }
    # 一个班在同一课程下只会有一条生效教学安排，这里回填 id 供前端切换时直接带上
    assignment_by_class = {item.class_id: item.id for item in in_course}

    return {
        "terms": [{"term": item, "is_current": item == current.term} for item in terms],
        "courses": [
            {
                "course_id": item,
                "name": courses[item].name if item in courses else item,
                "is_current": item == current.course_id,
            }
            for item in course_ids
        ],
        "classes": [
            {
                "class_id": item,
                "name": class_names.get(item, item),
                "teaching_assignment_id": assignment_by_class.get(item, ""),
                "student_count": len(class_student_ids(db, [item])),
                "is_current": item == current.class_id,
            }
            for item in class_ids
        ],
        "current": {
            "teaching_assignment_id": current.id,
            "term": current.term,
            "course_id": current.course_id,
            "course_name": context.course.name if context.course else current.course_id,
            "class_id": current.class_id,
            "class_name": (
                context.administrative_class.name
                if context.administrative_class
                else current.class_id
            ),
        },
    }


def _publications(db: Session, teaching_assignment_id: str) -> dict[str, list[TaskAssignment]]:
    """当前教学班已经对学生生效过的发布记录，按 task_id 归组。

    同一个任务可能分次下发（多条 TaskAssignment），所以是 list 而不是单条。
    """
    rows = db.scalars(
        select(TaskAssignment)
        .where(
            TaskAssignment.teaching_assignment_id == teaching_assignment_id,
            TaskAssignment.publish_status.in_(VISIBLE_PUBLISH_STATUSES),
        )
        .order_by(TaskAssignment.published_at.desc())
    ).all()
    grouped: dict[str, list[TaskAssignment]] = {}
    for row in rows:
        grouped.setdefault(row.task_id, []).append(row)
    return grouped


def _task_rows(db: Session, context: DashboardContext, roster: set[str]) -> list[dict]:
    """当前教学班每个任务一行，按发布时间倒序。

    分母是整个在册名册而不是「有提交记录的人」：§5.2 的完成率要能反映没动手的学生，
    否则一个班只有两个人交了、都通过了，完成率会显示 100%。
    """
    publications = _publications(db, context.current.id)
    if not publications or not roster:
        return []

    tasks = {
        row.id: row
        for row in db.scalars(select(Task).where(Task.id.in_(list(publications)))).all()
    }
    all_assignment_ids = [item.id for pubs in publications.values() for item in pubs]

    progress_by_key: dict[tuple[str, str], StudentTaskProgress] = {}
    for row in db.scalars(
        select(StudentTaskProgress).where(
            StudentTaskProgress.assignment_id.in_(all_assignment_ids),
            StudentTaskProgress.student_id.in_(roster),
        )
    ).all():
        progress_by_key[(row.assignment_id, row.student_id)] = row

    submission_by_key: dict[tuple[str, str], Submission] = {}
    for row in db.scalars(
        select(Submission).where(
            Submission.task_id.in_(list(publications)),
            Submission.student_id.in_(roster),
        )
    ).all():
        submission_by_key[(row.task_id, row.student_id)] = row

    now = utc_now()
    rows = []
    for task_id, pubs in publications.items():
        task = tasks.get(task_id)
        if task is None:
            continue

        published = [as_utc(item.published_at) for item in pubs if item.published_at]
        deadlines = [as_utc(item.deadline) for item in pubs if item.deadline]
        # 分次下发时截止取最晚的一条，否则还在有效期内的学生会被早期记录误判成逾期
        deadline = max(deadlines) if deadlines else None
        statuses = []
        overdue_students = []
        needs_review = 0

        for student_id in sorted(roster):
            progress = None
            for item in pubs:
                progress = progress_by_key.get((item.id, student_id)) or progress
            submission = submission_by_key.get((task_id, student_id))
            status = derive_progress_status(progress, submission)
            statuses.append(status)
            if deadline and now > deadline and status != "COMPLETED":
                overdue_students.append(student_id)
            if submission is not None and submission.status == "REVIEW_REQUIRED":
                needs_review += 1

        total = len(statuses)
        completed = statuses.count("COMPLETED")
        submitted = len([item for item in statuses if item in SUBMITTED_PROGRESS_STATUSES])
        publish_statuses = sorted({item.publish_status for item in pubs})
        rows.append(
            {
                "task_id": task_id,
                "task_title": task.title,
                "task_type": WORKSPACE_TYPE_TO_TASK_TYPE.get(
                    task.workspace_type, task.workspace_type
                ),
                "publish_statuses": publish_statuses,
                "published_at": iso(min(published)) if published else None,
                "deadline": iso(deadline) if deadline else None,
                "total": total,
                "completed": completed,
                "submitted": submitted,
                "in_progress": statuses.count("IN_PROGRESS"),
                "not_started": statuses.count("NOT_STARTED"),
                "overdue_count": len(overdue_students),
                "overdue_student_ids": overdue_students,
                "needs_review_count": needs_review,
                # 名册为空在上面就返回了，这里 total 必然大于 0
                "completion_rate": round1(completed * 100 / total),
                "submit_rate": round1(submitted * 100 / total),
                # 学生端仍在进行中：已发布、未暂停关闭、且没过截止
                "is_active": "PUBLISHED" in publish_statuses
                and (deadline is None or now <= deadline),
            }
        )

    rows.sort(key=lambda row: (row["published_at"] or "", row["task_id"]), reverse=True)
    return rows


def _pending_ai_review_count(db: Session, task_ids: set[str], roster: set[str]) -> int:
    """待教师审核的 AI 诊断数，与 §十一 审核队列的 `stats.pending` 同源。"""
    rows = ai_review.load_queue(db, task_ids, roster)
    if not rows:
        return 0
    reviews = ai_review.latest_reviews(db, [diagnosis.id for diagnosis, _, _ in rows])
    return ai_review.queue_stats(rows, reviews)["pending"]


def _weak_knowledge_points(matrix: dict) -> list[dict]:
    """薄弱知识点排行：平均掌握度最低的几个。

    没有任何证据的知识点（`avg_mastery` 为 None）不参与排序 —— §11.7 要求真实零值和
    无数据区分开，否则「没人做过」会排在「全班都不会」前面。
    """
    points = [
        item for item in matrix.get("point_averages", []) if item["avg_mastery"] is not None
    ]
    weak_counts: dict[str, int] = {}
    for row in matrix.get("rows", []):
        for cell in row["cells"]:
            score = cell["mastery_score"]
            if score is not None and score < WEAK_MASTERY_THRESHOLD:
                weak_counts[cell["knowledge_point"]] = (
                    weak_counts.get(cell["knowledge_point"], 0) + 1
                )

    points.sort(key=lambda item: (item["avg_mastery"], item["knowledge_point"]))
    return [
        {
            "knowledge_point": item["knowledge_point"],
            "avg_mastery": item["avg_mastery"],
            "covered_students": item["covered_students"],
            "weak_student_count": weak_counts.get(item["knowledge_point"], 0),
        }
        for item in points[:TOP_N]
    ]


def _parse_iso(value: str) -> datetime:
    """把 `iso()` 输出的字符串读回带时区的 datetime。

    `_task_rows` 已经把时间序列化成字符串给前端了，待办这边还要再算一次「还剩几小时」。
    与其把 datetime 和字符串两套并行传下去，这里读回来一次，保证首页展示的截止时间和
    参与判定的截止时间是同一个值。
    """
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _todos(
    task_rows: list[dict],
    pending_ai_review: int,
    alerts: dict,
) -> list[dict]:
    """今日待办（§5.2 C）。

    全部由当前数据实时推导，不落库：处理完对应事项后待办自然消失，不需要「已处理」
    状态。每条都带 `target_route`，「立即处理」直接跳到能真正处置它的页面。
    """
    now = utc_now()
    todos: list[dict] = []

    for row in task_rows:
        deadline = _parse_iso(row["deadline"]) if row["deadline"] else None
        remaining = row["total"] - row["completed"]

        if row["is_active"] and deadline and now <= deadline:
            hours_left = (deadline - now).total_seconds() / 3600
            if hours_left <= DUE_SOON_DAYS * 24:
                todos.append(
                    {
                        "todo_id": f"todo_due_{row['task_id']}",
                        "type": "TASK",
                        # 24 小时内是当天必须处理的，3 天内需要盯，再远只是提醒
                        "level": "HIGH"
                        if hours_left <= 24
                        else "WATCH"
                        if hours_left <= 72
                        else "NOTICE",
                        "title": f"{row['task_title']} 即将截止",
                        "detail": f"还有 {remaining} 名学生未完成，当前完成率 {row['completion_rate']}%",
                        "due_at": row["deadline"],
                        "target_route": f"/teacher/monitor/tasks/{row['task_id']}",
                    }
                )

        if row["overdue_count"]:
            todos.append(
                {
                    "todo_id": f"todo_overdue_{row['task_id']}",
                    "type": "STUDENT",
                    "level": "HIGH",
                    "title": f"{row['task_title']} 有学生逾期",
                    "detail": f"{row['overdue_count']} 名学生已过截止时间仍未完成",
                    "due_at": row["deadline"],
                    "target_route": f"/teacher/monitor/tasks/{row['task_id']}",
                }
            )

    if pending_ai_review:
        todos.append(
            {
                "todo_id": "todo_ai_review",
                "type": "AI_REVIEW",
                "level": "WATCH",
                "title": "AI 诊断待审核",
                "detail": f"{pending_ai_review} 条诊断置信度偏低或规则兜底，需要教师确认后学生才看到「教师已确认」",
                "due_at": None,
                "target_route": "/teacher/ai-review",
            }
        )

    review_required = sum(row["needs_review_count"] for row in task_rows)
    if review_required:
        todos.append(
            {
                "todo_id": "todo_feedback",
                "type": "FEEDBACK",
                "level": "NOTICE",
                "title": "提交待人工复核",
                "detail": f"{review_required} 份提交系统判定为需要人工复核",
                "due_at": None,
                "target_route": "/teacher/monitor/grading",
            }
        )

    high_risk = alerts.get("level_counts", {}).get("HIGH", 0)
    if high_risk:
        todos.append(
            {
                "todo_id": "todo_risk",
                "type": "STUDENT",
                "level": "HIGH",
                "title": "高风险学生需要关注",
                "detail": f"{high_risk} 名学生命中高风险预警规则",
                "due_at": None,
                "target_route": "/teacher/diagnosis",
            }
        )

    todos.sort(
        key=lambda item: (
            TODO_LEVEL_RANK.get(item["level"], 9),
            item["due_at"] or "9999",
            item["todo_id"],
        )
    )
    return todos


def build_overview(db: Session, teacher_id: str, context: DashboardContext) -> dict:
    """§5.2 B/C/D/E 的完整聚合结果。"""
    current = context.current
    roster = class_student_ids(db, [current.class_id])

    # 学情摘要与预警复用学情诊断页的范围收窄和规则，保证首页点进去数字对得上
    scope = resolve_diagnosis_scope(
        db, teacher_id, current.course_id, current.class_id
    )
    alerts = compute_class_alerts(db, scope)

    task_rows = _task_rows(db, context, roster)
    completion_rates = [row["completion_rate"] for row in task_rows]
    overdue_students = {
        student_id for row in task_rows for student_id in row["overdue_student_ids"]
    }
    pending_ai_review = _pending_ai_review_count(db, scope.task_ids, roster)

    matrix = class_knowledge_matrix(db, scope)
    trend = sorted(task_rows, key=lambda row: (row["published_at"] or "", row["task_id"]))

    return {
        "context": {
            **_selector_options(db, context),
            "generated_at": iso(utc_now()),
        },
        # §5.2 B。每张卡片都带 target_route，点击必须能进对应明细页
        "stats": {
            "student_count": {
                "value": len(roster),
                "target_route": f"/teacher/courses/{current.course_id}",
            },
            "active_task_count": {
                "value": len([row for row in task_rows if row["is_active"]]),
                "target_route": "/teacher/tasks",
            },
            "avg_completion_rate": {
                # 没有任何已发布任务时给 None 而不是 0：0% 和「还没发过任务」是两件事
                "value": round1(sum(completion_rates) / len(completion_rates))
                if completion_rates
                else None,
                "target_route": "/teacher/monitor",
            },
            "overdue_student_count": {
                "value": len(overdue_students),
                "target_route": "/teacher/monitor",
            },
            "pending_ai_review_count": {
                "value": pending_ai_review,
                "target_route": "/teacher/ai-review",
            },
            "risk_student_count": {
                "value": alerts["alert_count"],
                "target_route": "/teacher/diagnosis",
            },
        },
        "todos": _todos(task_rows, pending_ai_review, alerts),
        "todo_type_labels": TODO_TYPE_LABELS,
        # §5.2 D 最近任务
        "recent_tasks": [
            {
                key: value
                for key, value in row.items()
                # 逾期学生名单只用于算去重人数，首页不展示，避免把名册塞进首页响应
                if key != "overdue_student_ids"
            }
            for row in task_rows[:TOP_N]
        ],
        # §5.2 E 班级学情摘要
        "class_summary": {
            "completion_trend": [
                {
                    "task_id": row["task_id"],
                    "task_title": row["task_title"],
                    "published_at": row["published_at"],
                    "completion_rate": row["completion_rate"],
                    "submit_rate": row["submit_rate"],
                }
                for row in trend[-TREND_LIMIT:]
            ],
            "top_errors": class_error_distribution(db, scope)[:TOP_N],
            "weak_knowledge_points": _weak_knowledge_points(matrix),
            "roster_with_profile": len(
                {row["student_id"] for row in matrix.get("rows", [])}
            ),
            "analysis_route": "/teacher/diagnosis",
        },
        "unavailable_actions": UNAVAILABLE_ACTIONS,
    }


def empty_overview(reason: str) -> dict:
    """教师还没有生效教学安排时的空态。

    形状和 `build_overview` 保持一致，前端不用为空态写第二套渲染分支。
    """
    return {
        "context": {
            "terms": [],
            "courses": [],
            "classes": [],
            "current": None,
            "generated_at": iso(utc_now()),
        },
        "stats": {
            key: {"value": None, "target_route": None}
            for key in (
                "student_count",
                "active_task_count",
                "avg_completion_rate",
                "overdue_student_count",
                "pending_ai_review_count",
                "risk_student_count",
            )
        },
        "todos": [],
        "todo_type_labels": TODO_TYPE_LABELS,
        "recent_tasks": [],
        "class_summary": {
            "completion_trend": [],
            "top_errors": [],
            "weak_knowledge_points": [],
            "roster_with_profile": 0,
            "analysis_route": "/teacher/diagnosis",
        },
        "unavailable_actions": UNAVAILABLE_ACTIONS,
        "empty_reason": reason,
    }
