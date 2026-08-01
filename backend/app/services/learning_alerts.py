"""学情预警规则（只读）。

开发方案 §10.3 列了第一版七条预警规则。这里把它们实现为对现有数据的实时判定：
不新建预警表、不写任何库、不做抄袭认定 —— 系统只标记风险，处置由教师决定。

因为没有 `LearningAlert` 状态表，「标记已处理」和「发送提醒」这类写操作不在本模块
范围内，前端对应按钮应保持禁用并说明原因（迁移执行清单 §15.2）。
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import (
    LearnerErrorStat,
    LearnerEvent,
    StudentTaskProgress,
    Submission,
    SubmissionVersion,
    Task,
    User,
)
from backend.app.models.entities import utc_now
from backend.app.services.submissions import iso
from backend.app.services.teacher_scope import DiagnosisScope, derive_progress_status

# 七条规则的展示文案，code 同时作为前端筛选值
RULE_LABELS = {
    "CONSECUTIVE_INCOMPLETE": "连续两个任务未完成",
    "OVERDUE": "任务逾期",
    "REPEATED_ERROR": "同一错误连续出现三次",
    "HINT_LEVEL_3_DEPENDENCY": "长期依赖三级提示",
    "NO_RECENT_ACTIVITY": "最近七天没有学习行为",
    "SCORE_DROP": "成绩明显下降",
    "REPEATED_FAILURE": "多次提交仍未通过",
}

# 无学习行为的判定窗口
INACTIVE_DAYS = 7

# 成绩下降到达多少分才算「明显」
SCORE_DROP_THRESHOLD = 15

# 依赖三级提示的次数门槛
HINT_LEVEL_3_MIN_COUNT = 2

# 同一错误重复出现的次数门槛
REPEATED_ERROR_MIN_COUNT = 3

# 多次提交仍未通过的版本数门槛
REPEATED_FAILURE_MIN_VERSIONS = 3


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite 取回的是 naive datetime，统一按 UTC 解读后才能和 utc_now() 比较。"""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@dataclass
class _StudentFacts:
    """一个学生在当前范围内的原始事实，规则判定只读这个结构。"""

    student_id: str
    student_name: str
    # 按 published_at 升序的 (task_assignment, 任务标题, 派生状态, 得分)
    task_states: list[tuple[object, str, str, float | None]]
    error_stats: list[LearnerErrorStat]
    hint_level_3_count: int
    unpassed_multi_version: list[tuple[str, int]]
    last_activity_at: datetime | None


def _collect_facts(db: Session, scope: DiagnosisScope) -> list[_StudentFacts]:
    student_ids = sorted(scope.student_ids)
    if not student_ids:
        return []

    names = {
        row.id: row.display_name
        for row in db.scalars(select(User).where(User.id.in_(student_ids))).all()
    }
    task_titles = {
        row.id: row.title
        for row in db.scalars(
            select(Task).where(Task.id.in_(scope.task_ids))
        ).all()
    } if scope.task_ids else {}

    assignment_ids = [item.id for item in scope.task_assignments]
    progress_rows = (
        list(
            db.scalars(
                select(StudentTaskProgress).where(
                    StudentTaskProgress.assignment_id.in_(assignment_ids),
                    StudentTaskProgress.student_id.in_(student_ids),
                )
            ).all()
        )
        if assignment_ids
        else []
    )
    progress_by_key = {(row.assignment_id, row.student_id): row for row in progress_rows}

    submission_rows = (
        list(
            db.scalars(
                select(Submission).where(
                    Submission.task_id.in_(scope.task_ids),
                    Submission.student_id.in_(student_ids),
                )
            ).all()
        )
        if scope.task_ids
        else []
    )
    submission_by_key = {(row.task_id, row.student_id): row for row in submission_rows}
    submission_ids = [row.id for row in submission_rows]

    # 三级提示次数按提交版本统计：SubmissionVersion.highest_hint_level 已经是该版本
    # 用到的最高提示等级，不必再走 Diagnosis → HintRecord 那一跳。
    hint_counts: dict[str, int] = {}
    if submission_ids:
        submission_owner = {row.id: row.student_id for row in submission_rows}
        for version in db.scalars(
            select(SubmissionVersion).where(
                SubmissionVersion.submission_id.in_(submission_ids),
                SubmissionVersion.highest_hint_level >= 3,
            )
        ).all():
            owner = submission_owner.get(version.submission_id)
            if owner:
                hint_counts[owner] = hint_counts.get(owner, 0) + 1

    error_by_student: dict[str, list[LearnerErrorStat]] = {}
    for row in db.scalars(
        select(LearnerErrorStat)
        .where(
            LearnerErrorStat.student_id.in_(student_ids),
            LearnerErrorStat.course_id == scope.course_id,
        )
        .order_by(LearnerErrorStat.count.desc())
    ).all():
        error_by_student.setdefault(row.student_id, []).append(row)

    last_activity: dict[str, datetime] = {}
    for row in db.scalars(
        select(LearnerEvent).where(
            LearnerEvent.student_id.in_(student_ids),
            LearnerEvent.course_id == scope.course_id,
        )
    ).all():
        created = as_utc(row.created_at)
        if created is None:
            continue
        current = last_activity.get(row.student_id)
        if current is None or created > current:
            last_activity[row.student_id] = created

    facts = []
    for student_id in student_ids:
        task_states = []
        unpassed = []
        for task_assignment in scope.task_assignments:
            progress = progress_by_key.get((task_assignment.id, student_id))
            submission = submission_by_key.get((task_assignment.task_id, student_id))
            status = derive_progress_status(progress, submission)
            score = progress.score if progress else None
            title = task_titles.get(task_assignment.task_id, task_assignment.task_id)
            task_states.append((task_assignment, title, status, score))
            if (
                submission is not None
                and submission.passed_at is None
                and submission.latest_version_no >= REPEATED_FAILURE_MIN_VERSIONS
            ):
                unpassed.append((title, submission.latest_version_no))

        facts.append(
            _StudentFacts(
                student_id=student_id,
                student_name=names.get(student_id, ""),
                task_states=task_states,
                error_stats=error_by_student.get(student_id, []),
                hint_level_3_count=hint_counts.get(student_id, 0),
                unpassed_multi_version=unpassed,
                last_activity_at=last_activity.get(student_id),
            )
        )
    return facts


def _evaluate(facts: _StudentFacts, now: datetime) -> list[dict]:
    """对单个学生跑七条规则，返回命中的规则及其证据。"""
    hits: list[dict] = []

    def hit(code: str, evidence: str) -> None:
        hits.append({"code": code, "label": RULE_LABELS[code], "evidence": evidence})

    # 规则一：连续两个任务未完成。按发布时间取最近两次，两次都没完成才算。
    if len(facts.task_states) >= 2:
        recent = facts.task_states[-2:]
        if all(status != "COMPLETED" for _, _, status, _ in recent):
            hit("CONSECUTIVE_INCOMPLETE", "最近两个已发布任务均未完成")

    # 规则二：任务逾期。
    overdue_titles = []
    for task_assignment, title, status, _ in facts.task_states:
        deadline = as_utc(task_assignment.deadline)
        if deadline is not None and deadline < now and status != "COMPLETED":
            overdue_titles.append(title)
    if overdue_titles:
        hit(
            "OVERDUE",
            f"{overdue_titles[0]} 等 {len(overdue_titles)} 个任务已过截止时间仍未完成"
            if len(overdue_titles) > 1
            else f"{overdue_titles[0]} 已过截止时间仍未完成",
        )

    # 规则三：同一错误连续出现三次。LearnerErrorStat.count 已按错误类型累计。
    repeated = [item for item in facts.error_stats if item.count >= REPEATED_ERROR_MIN_COUNT]
    if repeated:
        worst = repeated[0]
        hit("REPEATED_ERROR", f"{worst.label} 已累计出现 {worst.count} 次")

    # 规则四：长期依赖三级提示。
    if facts.hint_level_3_count >= HINT_LEVEL_3_MIN_COUNT:
        hit("HINT_LEVEL_3_DEPENDENCY", f"{facts.hint_level_3_count} 次提交用到三级提示")

    # 规则五：最近七天没有学习行为。从未产生过学习事件的学生同样命中。
    if facts.last_activity_at is None:
        hit("NO_RECENT_ACTIVITY", "该课程下没有任何学习行为记录")
    elif (now - facts.last_activity_at) > timedelta(days=INACTIVE_DAYS):
        days = (now - facts.last_activity_at).days
        hit("NO_RECENT_ACTIVITY", f"最近一次学习行为距今 {days} 天")

    # 规则六：成绩明显下降。只看有分数的任务，按时间取最后两次。
    scored = [item[3] for item in facts.task_states if item[3] is not None]
    if len(scored) >= 2:
        previous, latest = scored[-2], scored[-1]
        if previous - latest >= SCORE_DROP_THRESHOLD:
            hit("SCORE_DROP", f"最近一次得分 {latest:g}，上一次 {previous:g}")

    # 规则七：多次提交仍未通过。
    if facts.unpassed_multi_version:
        title, versions = facts.unpassed_multi_version[0]
        hit("REPEATED_FAILURE", f"{title} 已提交 {versions} 次仍未通过")

    return hits


def _level_for(hits: list[dict]) -> str:
    """命中越多风险越高；逾期直接升到高风险，因为它已经产生教学后果。"""
    codes = {item["code"] for item in hits}
    if "OVERDUE" in codes or len(hits) >= 3:
        return "HIGH"
    if len(hits) == 2:
        return "WATCH"
    return "NOTICE"


def compute_class_alerts(db: Session, scope: DiagnosisScope) -> dict:
    """当前范围内命中预警规则的学生，按风险等级从高到低排列。"""
    now = utc_now()
    facts = _collect_facts(db, scope)

    alerts = []
    for item in facts:
        hits = _evaluate(item, now)
        if not hits:
            continue
        alerts.append(
            {
                "student_id": item.student_id,
                "student_name": item.student_name,
                "level": _level_for(hits),
                "rule_codes": [entry["code"] for entry in hits],
                "rules": hits,
                "last_activity_at": iso(item.last_activity_at),
            }
        )

    level_rank = {"HIGH": 0, "WATCH": 1, "NOTICE": 2}
    alerts.sort(key=lambda row: (level_rank[row["level"]], -len(row["rules"]), row["student_id"]))

    return {
        "roster_total": len(scope.student_ids),
        "alert_count": len(alerts),
        "level_counts": {
            "HIGH": len([row for row in alerts if row["level"] == "HIGH"]),
            "WATCH": len([row for row in alerts if row["level"] == "WATCH"]),
            "NOTICE": len([row for row in alerts if row["level"] == "NOTICE"]),
        },
        "rules": [{"code": code, "label": label} for code, label in RULE_LABELS.items()],
        "alerts": alerts,
        # 前端据此说明为什么处置按钮不可用，而不是自己写死一段文案
        "actions_available": False,
        "actions_disabled_reason": "预警状态表尚未建立，标记已处理与发送提醒暂不可用",
    }
