"""教师端任务监控接口（开发方案 §九 9.1 提交进度看板）。

本模块**全程只读**（§九 9.1「本页只读学生端产生的数据，不直接修改学生数据」）：
不 commit、不写审计。写操作属于 §9.3 批改进度与 §十三 教师反馈，两者都还缺落点 ——
库里既没有 `TeacherFeedback` 也没有 `Grade` 表，教师人工评分无处可存。所以看板只把
下钻入口给出来，不放任何"能点但存不了"的按钮，缺失原因统一由 `unavailable_actions`
下发，前端不自己编文案。

## 一次查询只看一个任务

§9.1 的第一个控件就是"任务选择器"，学生明细表格的每一行是"某个学生在某个任务上的
完成情况"，所以看板始终围绕单个任务展开。不传 `task_id` 时默认取范围内最近发布的
那个任务，而不是把所有任务拍平——拍平之后"未开始人数"就没有意义了。

## 状态口径

编码类任务不写 `StudentTaskProgress`（只有客观题流程维护它），因此状态必须走
`derive_progress_status` 从 `Submission.status` 回退推导，否则已交的学生会被算成未开始。
"逾期"不并进这个派生状态：`PROGRESS_STATUS_RANK` 是一条单调推进的链，把 OVERDUE 塞进去
会和 COMPLETED 抢名次。逾期是独立的布尔标记，可以和"已提交"同时成立（交晚了）。

## 成绩口径

只有 `QUESTION_SET` 任务会写 `StudentTaskProgress.score`（客观题按百分制换算）。编码任务
在现有实现里是二值结果——必过用例全通过即 PASSED，没有任何地方给它算分。所以编码任务的
`score_supported` 为 false，平均成绩返回 null 而不是 0，前端据此显示"不适用"，避免教师把
"没有这个指标"读成"全班 0 分"。
"""

import csv
import io

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import (
    AdministrativeClass,
    Course,
    Diagnosis,
    ExecutionRun,
    Question,
    QuestionAnswer,
    QuestionAttempt,
    StudentTaskProgress,
    Submission,
    Task,
    TaskAssignment,
    TeachingAssignment,
    TestCase,
    TestResult,
    User,
)
from backend.app.models.entities import utc_now
from backend.app.services.learning_alerts import as_utc
from backend.app.services.question_workflow import ERROR_LABELS
from backend.app.services.submissions import iso
from backend.app.services.teacher_scope import (
    SUBMITTED_PROGRESS_STATUSES,
    class_student_ids,
    derive_progress_status,
    teacher_assignments,
)

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-monitor"])


# 监控要覆盖已暂停和已结束的任务：任务已经在学生端出现过，历史提交必须能查
# （§8.6「关闭任务不得删除历史提交」）。只有纯配置草稿 DRAFT 不该出现在看板里。
MONITORABLE_PUBLISH_STATUSES = {"PUBLISHED", "SCHEDULED", "PAUSED", "CLOSED"}

WORKSPACE_TYPE_TO_TASK_TYPE = {
    "CODING": "PROGRAMMING",
    "QUESTION_SET": "QUESTION",
}

# 只有客观题任务会落 StudentTaskProgress.score
SCORED_WORKSPACE_TYPES = {"QUESTION_SET"}

# §14.3 学生任务状态。OVERDUE 不是派生状态里的一档，单独作为筛选值处理
STATUS_OPTIONS = [
    {"value": "NOT_STARTED", "label": "未开始"},
    {"value": "IN_PROGRESS", "label": "进行中"},
    {"value": "SUBMITTED", "label": "已提交"},
    {"value": "NEEDS_REVISION", "label": "需要修改"},
    {"value": "COMPLETED", "label": "已完成"},
    {"value": "OVERDUE", "label": "已逾期"},
]

# 编码题的 `TestCase.error_tag` 是自由字符串，库里没有枚举约束。这里只登记种子数据与
# `services/diagnosis.SOURCE_BY_ERROR_TAG` 里出现过的取值，和客观题的 `ERROR_LABELS`
# 合成一张展示用词表。未登记的标签在页面上原样显示，不静默丢弃。
CODING_ERROR_TAG_LABELS = {
    "LINKED_LIST_HEAD_UPDATE_ERROR": "头指针未更新",
    "EMPTY_LIST_GUARD": "空链表判空缺失",
    "TAIL_DELETE": "尾节点删除错误",
    "INVALID_POSITION": "非法位置未拦截",
    "COMPILE_ERROR_EXPLANATION": "编译错误",
    "UNKNOWN_OR_LOW_CONFIDENCE": "未能归类",
}

ERROR_TAG_LABELS = {**ERROR_LABELS, **CODING_ERROR_TAG_LABELS}

HINT_LEVEL_OPTIONS = [
    {"value": "0", "label": "未使用提示"},
    {"value": "1", "label": "用到一级提示"},
    {"value": "2", "label": "用到二级提示"},
    {"value": "3", "label": "用到三级提示"},
]

UNAVAILABLE_ACTIONS = [
    {
        "action": "TEACHER_SCORE",
        "reason": "教师人工评分需要 Grade 表和成绩发布流程（§九 9.3），当前库里没有可写落点，"
        "看板只展示系统判定结果。",
        "target_route": None,
    },
    {
        "action": "TEACHER_FEEDBACK",
        "reason": "教师反馈需要 TeacherFeedback 表（§十三 13.1），尚未建表。可以先进提交详情"
        "查看代码、测试与 AI 诊断。",
        "target_route": None,
    },
    {
        "action": "BATCH_FEEDBACK",
        "reason": "批量反馈依赖教师反馈写接口，必须与审计日志一起上线（§15.2）。",
        "target_route": None,
    },
]


def _monitor_scope(
    db: Session, teacher_id: str, course_id: str | None, class_id: str | None
) -> list[TeachingAssignment]:
    """把请求参数收窄到当前教师真实负责的教学安排（§15.1）。

    这里刻意不复用 `resolve_diagnosis_scope`：那个函数只收 `publish_status == "PUBLISHED"`
    的发布记录，而监控还要能看已暂停和已结束的任务。权限判定逻辑一致，取数范围不同。
    """
    assignments = teacher_assignments(db, teacher_id, course_id)
    if course_id and not assignments:
        raise ApiError(403, "AUTH_FORBIDDEN", "当前教师在该课程没有生效的教学安排")
    if class_id:
        assignments = [item for item in assignments if item.class_id == class_id]
        if not assignments:
            raise ApiError(403, "AUTH_FORBIDDEN", "无权访问该班级的监控数据")
    return assignments


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


def _class_names(db: Session, class_ids: list[str]) -> dict[str, str]:
    if not class_ids:
        return {}
    return {
        row.id: row.name
        for row in db.scalars(
            select(AdministrativeClass).where(AdministrativeClass.id.in_(class_ids))
        ).all()
    }


def _class_options(
    db: Session,
    assignments: list[TeachingAssignment],
    current_course_id: str | None,
    current_class_id: str | None,
) -> list[dict]:
    """班级选项跟着课程收窄，避免选出跨课程的无效组合。"""
    scoped = [
        item for item in assignments if not current_course_id or item.course_id == current_course_id
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


def _publications(
    db: Session, assignment_ids: list[str]
) -> dict[str, list[TaskAssignment]]:
    """当前范围内可监控的班级发布记录，按 task_id 归组。"""
    if not assignment_ids:
        return {}
    rows = db.scalars(
        select(TaskAssignment)
        .where(
            TaskAssignment.teaching_assignment_id.in_(assignment_ids),
            TaskAssignment.publish_status.in_(sorted(MONITORABLE_PUBLISH_STATUSES)),
        )
        .order_by(TaskAssignment.published_at.desc())
    ).all()
    grouped: dict[str, list[TaskAssignment]] = {}
    for row in rows:
        grouped.setdefault(row.task_id, []).append(row)
    return grouped


def _task_options(
    db: Session,
    publications: dict[str, list[TaskAssignment]],
    assignment_by_id: dict[str, TeachingAssignment],
    class_names: dict[str, str],
    current_task_id: str | None,
) -> list[dict]:
    """可监控任务列表，最近发布的排在最前面 —— 教师进来最常看的就是刚发的那个。"""
    if not publications:
        return []
    tasks = {
        task.id: task
        for task in db.scalars(select(Task).where(Task.id.in_(list(publications)))).all()
    }
    options = []
    for task_id, items in publications.items():
        task = tasks.get(task_id)
        if task is None:
            continue
        published = [as_utc(item.published_at) for item in items if item.published_at]
        deadlines = [as_utc(item.deadline) for item in items if item.deadline]
        option_class_ids = sorted(
            {
                assignment_by_id[item.teaching_assignment_id].class_id
                for item in items
                if item.teaching_assignment_id in assignment_by_id
            }
        )
        options.append(
            {
                "task_id": task_id,
                "title": task.title,
                "task_type": WORKSPACE_TYPE_TO_TASK_TYPE.get(
                    task.workspace_type, task.workspace_type
                ),
                "class_names": [class_names.get(item, item) for item in option_class_ids],
                # 一个任务可能分多个班发布，时间口径取最早发布、最晚截止，覆盖整个监控窗口
                "published_at": iso(min(published)) if published else None,
                "deadline": iso(max(deadlines)) if deadlines else None,
                "publish_statuses": sorted({item.publish_status for item in items}),
                "is_current": task_id == current_task_id,
            }
        )
    options.sort(key=lambda item: (item["published_at"] or "", item["title"]), reverse=True)
    return options


def _error_labels_for_tags(tags: list[str]) -> list[dict]:
    """错误标签中文化。

    三套错误词表在库里并未统一：客观题用 `Question.error_type`（`ERROR_LABELS`），编码题
    用 `TestCase.error_tag` / `TestResult.error_tag`（自由字符串，无枚举），AI 诊断用
    `Diagnosis.diagnosis_type`。这里把已知项合并成一张表做展示映射，未知标签原样返回，
    不猜、不丢 —— 统一词表属于后续的判题模板工作，不在本页范围内。
    """
    return [{"value": tag, "label": ERROR_TAG_LABELS.get(tag, tag)} for tag in tags]


def _coding_error_tags(db: Session, version_ids: list[str]) -> dict[str, list[str]]:
    """每个提交版本失败用例的错误标签。

    走 `TestResult` 而不是 `TestCase`：教师要看的是"这个学生实际错在哪"，不是"这道题
    配了哪些用例"。隐藏用例的标签教师可见，但完整输入输出不在本接口返回（§9.2 双端
    可见性边界）。
    """
    if not version_ids:
        return {}
    tags_by_version: dict[str, set[str]] = {}
    rows = db.execute(
        select(ExecutionRun.submission_version_id, TestResult.error_tag)
        .join(TestResult, TestResult.execution_run_id == ExecutionRun.id)
        .where(
            ExecutionRun.submission_version_id.in_(version_ids),
            TestResult.status == "FAILED",
            TestResult.error_tag != "",
        )
    ).all()
    for version_id, error_tag in rows:
        if error_tag:
            tags_by_version.setdefault(version_id, set()).add(error_tag)
    return {version_id: sorted(tags) for version_id, tags in tags_by_version.items()}


def _question_error_tags(
    db: Session, task_id: str, assignment_ids: list[str], student_ids: list[str]
) -> dict[str, list[str]]:
    """客观题任务里每个学生答错题目的错误类型。"""
    if not assignment_ids or not student_ids:
        return {}
    attempts = db.scalars(
        select(QuestionAttempt)
        .where(
            QuestionAttempt.task_id == task_id,
            QuestionAttempt.assignment_id.in_(assignment_ids),
            QuestionAttempt.student_id.in_(student_ids),
        )
        .order_by(QuestionAttempt.created_at.asc())
    ).all()
    if not attempts:
        return {}

    # 同一学生可能有草稿和已提交多条，取最后一条作为当前作答
    attempt_by_student: dict[str, QuestionAttempt] = {}
    for attempt in attempts:
        attempt_by_student[attempt.student_id] = attempt

    attempt_ids = [item.id for item in attempt_by_student.values()]
    error_by_question = {
        row.id: row.error_type
        for row in db.scalars(select(Question).where(Question.task_id == task_id)).all()
    }
    wrong_by_attempt: dict[str, set[str]] = {}
    for answer in db.scalars(
        select(QuestionAnswer).where(QuestionAnswer.attempt_id.in_(attempt_ids))
    ).all():
        if answer.is_correct:
            continue
        error_type = error_by_question.get(answer.question_id)
        if error_type:
            wrong_by_attempt.setdefault(answer.attempt_id, set()).add(error_type)

    return {
        student_id: sorted(wrong_by_attempt.get(attempt.id, set()))
        for student_id, attempt in attempt_by_student.items()
        if wrong_by_attempt.get(attempt.id)
    }


def _build_rows(
    db: Session,
    task: Task,
    task_publications: list[TaskAssignment],
    assignment_by_id: dict[str, TeachingAssignment],
    class_names: dict[str, str],
) -> list[dict]:
    """名册内每个学生一行。没有提交记录的学生也必须出现，否则"未开始"就统计不出来。"""
    class_by_student: dict[str, str] = {}
    # 同一个班可能有多条发布记录（分次下发），截止时间按班取最晚的一个，
    # 这样"逾期"不会因为某条早期记录把还在有效期内的学生误判成逾期
    deadline_by_class: dict[str, object] = {}
    for publication in task_publications:
        teaching = assignment_by_id.get(publication.teaching_assignment_id)
        if teaching is None:
            continue
        deadline = as_utc(publication.deadline)
        current = deadline_by_class.get(teaching.class_id)
        if deadline and (current is None or deadline > current):
            deadline_by_class[teaching.class_id] = deadline
        for student_id in class_student_ids(db, [teaching.class_id]):
            # 学生跨班重复时保留首次出现的班级，与名册去重口径一致
            class_by_student.setdefault(student_id, teaching.class_id)

    student_ids = sorted(class_by_student)
    if not student_ids:
        return []

    assignment_ids = [item.id for item in task_publications]

    progress_by_student: dict[str, StudentTaskProgress] = {}
    if assignment_ids:
        for progress in db.scalars(
            select(StudentTaskProgress).where(
                StudentTaskProgress.assignment_id.in_(assignment_ids),
                StudentTaskProgress.student_id.in_(student_ids),
            )
        ).all():
            progress_by_student[progress.student_id] = progress

    submission_by_student = {
        row.student_id: row
        for row in db.scalars(
            select(Submission).where(
                Submission.task_id == task.id,
                Submission.student_id.in_(student_ids),
            )
        ).all()
    }
    students = {
        row.id: row for row in db.scalars(select(User).where(User.id.in_(student_ids))).all()
    }

    latest_version_ids = []
    for submission in submission_by_student.values():
        if submission.versions:
            latest_version_ids.append(submission.versions[-1].id)

    coding_tags = (
        _coding_error_tags(db, latest_version_ids)
        if task.workspace_type not in SCORED_WORKSPACE_TYPES
        else {}
    )
    question_tags = (
        _question_error_tags(db, task.id, assignment_ids, student_ids)
        if task.workspace_type in SCORED_WORKSPACE_TYPES
        else {}
    )

    # 只有一个截止时间时逐行复用；多班不同截止时按学生所属班级取
    now = utc_now()
    rows = []
    for student_id in student_ids:
        progress = progress_by_student.get(student_id)
        submission = submission_by_student.get(student_id)
        latest = submission.versions[-1] if submission and submission.versions else None
        diagnosis: Diagnosis | None = latest.diagnosis if latest else None
        status = derive_progress_status(progress, submission)

        # 版本上的提示等级和进度表上的可能不一致（编码任务不写进度表），取更高的那个
        hint_level = progress.highest_hint_level if progress else 0
        if submission:
            hint_level = max(
                [hint_level] + [version.highest_hint_level or 0 for version in submission.versions]
            )

        deadline = deadline_by_class.get(class_by_student[student_id])
        overdue = bool(deadline and now > deadline and status != "COMPLETED")

        error_tags = (
            question_tags.get(student_id, [])
            if task.workspace_type in SCORED_WORKSPACE_TYPES
            else coding_tags.get(latest.id, [])
            if latest
            else []
        )

        student = students.get(student_id)
        rows.append(
            {
                "student_id": student_id,
                "student_name": student.display_name if student else student_id,
                "class_id": class_by_student[student_id],
                "class_name": class_names.get(class_by_student[student_id], ""),
                "status": status,
                "overdue": overdue,
                "submission_id": submission.id if submission else None,
                "submission_status": submission.status if submission else None,
                "version_count": len(submission.versions) if submission else 0,
                "highest_hint_level": hint_level,
                # 编码任务没有分数，这里始终是 None，不要在前端补 0
                "score": progress.score if progress else None,
                "passed_count": progress.passed_count if progress else None,
                "total_required_count": progress.total_required_count if progress else None,
                "error_tags": error_tags,
                "latest_diagnosis_type": diagnosis.diagnosis_type if diagnosis else None,
                "needs_teacher_review": bool(diagnosis and diagnosis.needs_teacher_review),
                "started_at": iso(progress.started_at) if progress else None,
                # 编码任务不写进度表，进度表写了也可能留空，两处取先有值的那个
                "last_submitted_at": iso(
                    (progress.last_submitted_at if progress else None)
                    or (submission.last_submitted_at if submission else None)
                ),
                "passed_at": iso(submission.passed_at) if submission else None,
                "deadline": iso(deadline) if deadline else None,
            }
        )
    return rows


def _stats(rows: list[dict], score_supported: bool) -> dict:
    """概览卡片。始终覆盖整个名册，不受下方筛选影响。

    筛选器的入口就是这些卡片，如果计数跟着筛选走，点开"逾期"之后其余卡片全变 0，
    教师就没法用它们互相对照了（与 §八 8.1 任务列表 `stats` 同一约定）。
    """
    statuses = [row["status"] for row in rows]
    scored = [row["score"] for row in rows if row["score"] is not None]
    submitted = len([item for item in statuses if item in SUBMITTED_PROGRESS_STATUSES])
    completed = len([item for item in statuses if item == "COMPLETED"])
    total = len(rows)
    return {
        "total": total,
        "completed": completed,
        "in_progress": len([item for item in statuses if item == "IN_PROGRESS"]),
        "not_started": len([item for item in statuses if item == "NOT_STARTED"]),
        "needs_revision": len([item for item in statuses if item == "NEEDS_REVISION"]),
        "submitted": submitted,
        "overdue": len([row for row in rows if row["overdue"]]),
        "hint_level_3": len([row for row in rows if row["highest_hint_level"] >= 3]),
        "pending_review": len([row for row in rows if row["needs_teacher_review"]]),
        # 名册为空时给 None 而不是 0：0% 完成率和"没有学生"是两件事
        "submit_rate": round(submitted * 100 / total, 1) if total else None,
        "completion_rate": round(completed * 100 / total, 1) if total else None,
        "score_supported": score_supported,
        "scored_count": len(scored),
        "avg_score": round(sum(scored) / len(scored), 1) if scored else None,
    }


def _apply_filters(
    rows: list[dict],
    status: str | None,
    hint_level: int | None,
    error_type: str | None,
    keyword: str | None,
) -> list[dict]:
    """筛选在 Python 里做。

    `status` 的 OVERDUE、`highest_hint_level` 都是派生字段，SQL 里没有对应列；而 `stats`
    必须覆盖筛选前的整个名册，所以本来就得先把名册整批取出来。名册规模是一个教学班，
    不是全表。
    """
    filtered = rows
    if status == "OVERDUE":
        filtered = [row for row in filtered if row["overdue"]]
    elif status:
        filtered = [row for row in filtered if row["status"] == status]
    if hint_level is not None:
        # 0 表示"未使用提示"，其余表示"至少用到这一级"
        filtered = (
            [row for row in filtered if row["highest_hint_level"] == 0]
            if hint_level == 0
            else [row for row in filtered if row["highest_hint_level"] >= hint_level]
        )
    if error_type:
        filtered = [row for row in filtered if error_type in row["error_tags"]]
    text = (keyword or "").strip().lower()
    if text:
        filtered = [
            row
            for row in filtered
            if text in row["student_name"].lower() or text in row["student_id"].lower()
        ]
    return filtered


def _empty_payload(
    course_id: str | None,
    class_id: str | None,
    course_options: list[dict],
    class_options: list[dict],
    task_options: list[dict],
    page: int,
    page_size: int,
    empty_reason: str,
) -> dict:
    return {
        "scope": {"course_id": course_id, "class_id": class_id, "task_id": None},
        "course_options": course_options,
        "class_options": class_options,
        "task_options": task_options,
        "status_options": STATUS_OPTIONS,
        "hint_level_options": HINT_LEVEL_OPTIONS,
        "error_type_options": [],
        "task": None,
        "stats": _stats([], score_supported=False),
        "items": [],
        "page": page,
        "page_size": page_size,
        "total": 0,
        "total_pages": 1,
        "empty_reason": empty_reason,
        "unavailable_actions": UNAVAILABLE_ACTIONS,
    }


def _board_payload(
    db: Session,
    user: User,
    course_id: str | None,
    class_id: str | None,
    task_id: str | None,
    status: str | None,
    hint_level: int | None,
    error_type: str | None,
    keyword: str | None,
    page: int,
    page_size: int,
) -> tuple[dict, list[dict]]:
    """看板载荷。返回 (分页后的响应, 当前筛选下的全部行) —— 导出要用后者。"""
    all_assignments = teacher_assignments(db, user.id)
    if not course_id and task_id:
        requested_task = db.get(Task, task_id)
        if requested_task and any(item.course_id == requested_task.course_id for item in all_assignments):
            course_id = requested_task.course_id
    course_options = _course_options(db, all_assignments, course_id)

    # 不传课程时落到第一门，保证首屏就有数据，同时把选中值回传给前端
    if not course_id and course_options:
        course_id = course_options[0]["course_id"]
        for option in course_options:
            option["is_current"] = option["course_id"] == course_id

    assignments = _monitor_scope(db, user.id, course_id, class_id)
    class_options = _class_options(db, all_assignments, course_id, class_id)

    if not assignments:
        return (
            _empty_payload(
                course_id,
                class_id,
                course_options,
                class_options,
                [],
                page,
                page_size,
                "当前教师还没有生效的教学安排，暂时没有可监控的任务。",
            ),
            [],
        )

    assignment_by_id = {item.id: item for item in assignments}
    class_names = _class_names(db, sorted({item.class_id for item in assignments}))
    publications = _publications(db, list(assignment_by_id))
    task_options = _task_options(db, publications, assignment_by_id, class_names, task_id)

    if not task_options:
        return (
            _empty_payload(
                course_id,
                class_id,
                course_options,
                class_options,
                [],
                page,
                page_size,
                "该范围内还没有发布过任务。任务发布后，学生进度会自动出现在这里。",
            ),
            [],
        )

    valid_task_ids = {item["task_id"] for item in task_options}
    if task_id and task_id not in valid_task_ids:
        raise ApiError(403, "AUTH_FORBIDDEN", "该任务未在当前教师负责的班级发布")
    if not task_id:
        task_id = task_options[0]["task_id"]
        for option in task_options:
            option["is_current"] = option["task_id"] == task_id

    task = db.get(Task, task_id)
    if task is None:
        raise ApiError(404, "TASK_NOT_FOUND", "任务不存在")

    score_supported = task.workspace_type in SCORED_WORKSPACE_TYPES
    rows = _build_rows(db, task, publications[task_id], assignment_by_id, class_names)
    stats = _stats(rows, score_supported)

    # 错误类型选项只列名册里真实出现过的标签，避免给出选了必然为空的筛选项
    present_tags = sorted({tag for row in rows for tag in row["error_tags"]})

    filtered = _apply_filters(rows, status, hint_level, error_type, keyword)
    total = len(filtered)
    start = (page - 1) * page_size
    page_rows = filtered[start : start + page_size]

    current_option = next(item for item in task_options if item["task_id"] == task_id)
    required_cases = (
        len(
            db.scalars(
                select(TestCase).where(TestCase.task_id == task_id, TestCase.required.is_(True))
            ).all()
        )
        if not score_supported
        else None
    )

    payload = {
        "scope": {"course_id": course_id, "class_id": class_id, "task_id": task_id},
        "course_options": course_options,
        "class_options": class_options,
        "task_options": task_options,
        "status_options": STATUS_OPTIONS,
        "hint_level_options": HINT_LEVEL_OPTIONS,
        "error_type_options": _error_labels_for_tags(present_tags),
        "task": {
            "task_id": task.id,
            "title": task.title,
            "task_type": current_option["task_type"],
            "workspace_type": task.workspace_type,
            "course_id": task.course_id,
            "language": task.language,
            "class_names": current_option["class_names"],
            "published_at": current_option["published_at"],
            "deadline": current_option["deadline"],
            "publish_statuses": current_option["publish_statuses"],
            "score_supported": score_supported,
            "required_test_case_count": required_cases,
            "score_note": (
                "客观题任务按题目分值换算百分制，成绩来自系统自动判定。"
                if score_supported
                else "编程任务当前只有通过/未通过两种系统判定结果，没有分数字段，"
                "平均成绩不适用。人工评分需要 §九 9.3 的评分接口。"
            ),
        },
        "stats": stats,
        "items": page_rows,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "empty_reason": None,
        "unavailable_actions": UNAVAILABLE_ACTIONS,
    }
    return payload, filtered


@router.get("/monitor/board")
def teacher_monitor_board(
    course_id: str | None = Query(default=None, description="课程 ID，缺省取教师第一门课"),
    class_id: str | None = Query(default=None, description="教学班 ID，缺省覆盖该课程全部班级"),
    task_id: str | None = Query(default=None, description="任务 ID，缺省取最近发布的任务"),
    status: str | None = Query(default=None, description="学生任务状态，含 OVERDUE"),
    hint_level: int | None = Query(default=None, ge=0, le=3, description="提示等级筛选"),
    error_type: str | None = Query(default=None, description="错误类型标签"),
    keyword: str | None = Query(default=None, description="按学生姓名或学号搜索"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """提交进度看板（§九 9.1）。只读，概览卡片覆盖整个名册而不是当前页。"""
    require_role(user, "TEACHER")
    payload, _ = _board_payload(
        db,
        user,
        course_id,
        class_id,
        task_id,
        status,
        hint_level,
        error_type,
        keyword,
        page,
        page_size,
    )
    return ok(payload)


# 导出列顺序固定，别按 dict 顺序来 —— 教师会把导出结果直接贴进成绩表
EXPORT_COLUMNS = [
    ("student_id", "学号"),
    ("student_name", "姓名"),
    ("class_name", "班级"),
    ("status_text", "任务状态"),
    ("overdue_text", "是否逾期"),
    ("score_text", "成绩"),
    ("version_count", "提交次数"),
    ("highest_hint_level", "最高提示等级"),
    ("error_text", "错误类型"),
    ("last_submitted_at", "最后提交时间"),
    ("deadline", "截止时间"),
]

STATUS_TEXT = {item["value"]: item["label"] for item in STATUS_OPTIONS}


@router.get("/monitor/board/export")
def teacher_monitor_board_export(
    course_id: str | None = Query(default=None),
    class_id: str | None = Query(default=None),
    task_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    hint_level: int | None = Query(default=None, ge=0, le=3),
    error_type: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """导出当前筛选结果（§九 9.1 导出按钮）。

    走与看板完全相同的取数和范围收窄路径，所以 §15.1「所有导出也必须执行权限校验」
    自动成立 —— 越权的 `class_id` / `task_id` 在 `_board_payload` 里就已经 403 了。
    导出的是筛选后的**全部**行，不是当前页。
    """
    require_role(user, "TEACHER")
    payload, filtered = _board_payload(
        db, user, course_id, class_id, task_id, status, hint_level, error_type, keyword, 1, 1
    )

    task = payload["task"]
    score_supported = bool(task and task["score_supported"])

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([label for _, label in EXPORT_COLUMNS])
    for row in filtered:
        flat = {
            **row,
            "status_text": STATUS_TEXT.get(row["status"], row["status"]),
            "overdue_text": "是" if row["overdue"] else "否",
            # 编码任务没有分数字段，写"不适用"而不是空白或 0
            "score_text": (
                ("" if row["score"] is None else row["score"]) if score_supported else "不适用"
            ),
            "error_text": " / ".join(
                ERROR_TAG_LABELS.get(tag, tag) for tag in row["error_tags"]
            ),
        }
        writer.writerow([flat.get(key, "") for key, _ in EXPORT_COLUMNS])

    filename = f"monitor-{task['task_id'] if task else 'empty'}.csv"
    return Response(
        # BOM 是给 Excel 的：没有它，中文列名在 Excel 里会变乱码
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
