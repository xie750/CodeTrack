"""学习画像驱动的下一步推荐。

推荐是产品内核能力，不作为独立页面暴露给学生。前端只消费标题、理由和动作；
底层评分规则留在后端，便于后续替换为更复杂的模型或策略。
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import (
    LearnerErrorStat,
    LearnerEvent,
    LearnerKnowledgeState,
    Recommendation,
    StudentTaskProgress,
    Task,
    TaskAssignment,
    TeachingAssignment,
)
from backend.app.models.entities import utc_now


ALGORITHM_RECOMMENDATION_PREFIX = "rec_algo_"
ACTIVE_TASK_STATUSES = {"NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "NEEDS_REVISION"}
REVIEW_EVENT_TYPES = {"HINT_VIEWED", "DIAGNOSIS_GENERATED", "QUESTION_SET_SUBMITTED", "GENERATED_PRACTICE_SUBMITTED"}
WEAK_MASTERY_THRESHOLD = 70


@dataclass(frozen=True)
class RecommendationCandidate:
    key: str
    recommendation_type: str
    title: str
    reason: str
    priority: int
    suggested_action: str
    related_task_id: str | None
    related_knowledge_points: list[str]


def _loads_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [str(item) for item in parsed] if isinstance(parsed, list) else []


def _dumps_list(value: list[str]) -> str:
    return json.dumps(value, ensure_ascii=False)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _recommendation_id(candidate: RecommendationCandidate, student_id: str, course_id: str) -> str:
    raw = "|".join([student_id, course_id, candidate.key, candidate.recommendation_type])
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:18]
    return f"{ALGORITHM_RECOMMENDATION_PREFIX}{digest}"


def _status_weight(status: str) -> int:
    return {
        "NEEDS_REVISION": 34,
        "SUBMITTED": 28,
        "IN_PROGRESS": 24,
        "NOT_STARTED": 18,
    }.get(status, 0)


def _deadline_weight(deadline: datetime | None, now: datetime) -> int:
    value = _as_utc(deadline)
    if value is None:
        return 0
    remaining = value - now
    if remaining < timedelta(0):
        return 44
    if remaining <= timedelta(days=1):
        return 38
    if remaining <= timedelta(days=3):
        return 28
    if remaining <= timedelta(days=7):
        return 16
    return 4


def _task_points(task: Task) -> list[str]:
    points = _loads_list(task.learning_objectives)
    if points:
        return points
    if "二叉树" in task.title:
        return ["二叉树", "递归", "遍历"]
    if "栈" in task.title or "括号" in task.title:
        return ["栈与队列", "括号匹配", "边界处理"]
    if "过拟合" in task.title or "正则化" in task.title:
        return ["过拟合与正则化", "模型评估"]
    if "Python" in task.title or "字典" in task.title:
        return ["Python 列表与字典查找", "下标判断"]
    return ["链表", "边界处理", "指针"]


def _recent_event_points(db: Session, student_id: str, course_id: str, limit: int = 8) -> set[str]:
    events = db.scalars(
        select(LearnerEvent)
        .where(
            LearnerEvent.student_id == student_id,
            LearnerEvent.course_id == course_id,
            LearnerEvent.event_type.in_(REVIEW_EVENT_TYPES),
        )
        .order_by(LearnerEvent.created_at.desc(), LearnerEvent.id.desc())
        .limit(limit)
    ).all()
    points: set[str] = set()
    for event in events:
        points.update(_loads_list(event.knowledge_points))
    return points


def _weak_knowledge_states(db: Session, student_id: str, course_id: str) -> list[LearnerKnowledgeState]:
    states = list(
        db.scalars(
            select(LearnerKnowledgeState)
            .where(
                LearnerKnowledgeState.student_id == student_id,
                LearnerKnowledgeState.course_id == course_id,
            )
            .order_by(LearnerKnowledgeState.mastery_score.asc(), LearnerKnowledgeState.updated_at.desc())
        ).all()
    )
    return [item for item in states if item.state == "WEAK" or item.mastery_score < WEAK_MASTERY_THRESHOLD]


def _error_pressure_by_point(db: Session, student_id: str, course_id: str) -> dict[str, int]:
    stats = db.scalars(
        select(LearnerErrorStat).where(
            LearnerErrorStat.student_id == student_id,
            LearnerErrorStat.course_id == course_id,
        )
    ).all()
    pressure: dict[str, int] = {}
    for stat in stats:
        base = stat.count * (3 if stat.severity == "HIGH" else 2 if stat.severity == "MEDIUM" else 1)
        for point in _loads_list(stat.related_knowledge_points):
            pressure[point] = pressure.get(point, 0) + base
    return pressure


def build_learning_recommendation_candidates(
    db: Session,
    *,
    student_id: str,
    class_id: str,
    course_id: str,
    now: datetime | None = None,
) -> list[RecommendationCandidate]:
    """生成候选动作并排序，供画像页、首页和任务完成后复用。"""
    current_time = _as_utc(now) or utc_now()
    weak_states = _weak_knowledge_states(db, student_id, course_id)
    weak_points = {item.knowledge_point for item in weak_states}
    recent_points = _recent_event_points(db, student_id, course_id)
    error_pressure = _error_pressure_by_point(db, student_id, course_id)

    candidates: list[RecommendationCandidate] = []
    task_rows = db.execute(
        select(TaskAssignment, Task, StudentTaskProgress)
        .join(TeachingAssignment, TaskAssignment.teaching_assignment_id == TeachingAssignment.id)
        .join(Task, TaskAssignment.task_id == Task.id)
        .outerjoin(
            StudentTaskProgress,
            (StudentTaskProgress.assignment_id == TaskAssignment.id)
            & (StudentTaskProgress.student_id == student_id),
        )
        .where(
            TeachingAssignment.class_id == class_id,
            TeachingAssignment.course_id == course_id,
            TeachingAssignment.status == "ACTIVE",
            TaskAssignment.publish_status == "PUBLISHED",
        )
        .order_by(TaskAssignment.deadline.asc().nulls_last(), TaskAssignment.id.asc())
    ).all()

    for assignment, task, progress in task_rows:
        status = progress.status if progress else "NOT_STARTED"
        if status not in ACTIVE_TASK_STATUSES:
            continue
        points = _task_points(task)
        overlap = [point for point in points if point in weak_points or point in recent_points]
        progress_gap = 0
        if progress and progress.total_required_count:
            progress_gap = round((1 - progress.passed_count / max(progress.total_required_count, 1)) * 18)
        hint_weight = 8 if progress and progress.highest_hint_level >= 2 else 0
        priority = (
            _status_weight(status)
            + _deadline_weight(assignment.deadline, current_time)
            + progress_gap
            + hint_weight
            + min(18, len(overlap) * 7)
        )
        if priority <= 0:
            continue
        focus = overlap[0] if overlap else points[0]
        action = "OPEN_TASK" if status in {"NOT_STARTED", "IN_PROGRESS"} else "RETRY_TASK"
        reason = (
            f"{task.title} 当前仍未形成完成证据，且与 {focus} 相关；"
            "建议先处理这项任务，再用测试结果更新学习画像。"
        )
        candidates.append(
            RecommendationCandidate(
                key=f"task:{assignment.id}",
                recommendation_type="TASK",
                title=f"优先完成：{task.title}",
                reason=reason,
                priority=priority,
                suggested_action=action,
                related_task_id=task.id,
                related_knowledge_points=points,
            )
        )

    for state in weak_states:
        pressure = error_pressure.get(state.knowledge_point, 0)
        recently_seen = state.knowledge_point in recent_points
        priority = round((WEAK_MASTERY_THRESHOLD - state.mastery_score) * 0.8) + min(28, pressure * 3)
        if recently_seen:
            priority += 10
        reason = (
            f"{state.knowledge_point} 的掌握度仍低于稳定线，最近依据是：{state.last_evidence or '学习行为记录不足'}。"
            "建议先做一次专项复盘，再通过练习验证。"
        )
        candidates.append(
            RecommendationCandidate(
                key=f"review:{state.knowledge_point}",
                recommendation_type="REVIEW",
                title=f"复盘 {state.knowledge_point}",
                reason=reason,
                priority=priority,
                suggested_action="OPEN_SELF_STUDY",
                related_task_id=None,
                related_knowledge_points=[state.knowledge_point],
            )
        )

    candidates.sort(key=lambda item: (-item.priority, item.recommendation_type, item.title))
    return candidates


def serialize_recommendation_candidate(
    candidate: RecommendationCandidate,
    *,
    student_id: str,
    course_id: str,
) -> dict:
    return {
        "id": _recommendation_id(candidate, student_id, course_id),
        "title": candidate.title,
        "reason": candidate.reason,
        "priority": candidate.priority,
        "related_task_id": candidate.related_task_id,
        "related_knowledge_points": candidate.related_knowledge_points,
        "suggested_action": candidate.suggested_action,
    }


def serialize_stored_recommendation(item: Recommendation) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "reason": item.reason,
        "priority": item.priority,
        "related_task_id": item.related_task_id,
        "related_knowledge_points": _loads_list(item.related_knowledge_points),
        "suggested_action": item.suggested_action,
    }


def build_learning_recommendation_payloads(
    db: Session,
    *,
    student_id: str,
    class_id: str,
    course_id: str,
    stored_recommendations: list[Recommendation],
    limit: int = 6,
) -> list[dict]:
    generated = [
        serialize_recommendation_candidate(candidate, student_id=student_id, course_id=course_id)
        for candidate in build_learning_recommendation_candidates(
            db,
            student_id=student_id,
            class_id=class_id,
            course_id=course_id,
        )
    ]
    stored = [serialize_stored_recommendation(item) for item in stored_recommendations]

    merged: dict[str, dict] = {}
    for item in [*generated, *stored]:
        key = "|".join(
            [
                item["suggested_action"],
                item["related_task_id"] or "",
                ",".join(item["related_knowledge_points"]),
            ]
        )
        current = merged.get(key)
        if current is None or item["priority"] > current["priority"]:
            merged[key] = item

    ranked = sorted(merged.values(), key=lambda item: (-item["priority"], item["title"]))
    return ranked[:limit]


def sync_learning_recommendations(
    db: Session,
    *,
    student_id: str,
    class_id: str,
    course_id: str,
    limit: int = 5,
) -> list[Recommendation]:
    """把算法生成的推荐同步到 recommendations 表，供任务完成后的闭环留痕。"""
    now = utc_now()
    candidates = build_learning_recommendation_candidates(
        db,
        student_id=student_id,
        class_id=class_id,
        course_id=course_id,
        now=now,
    )[:limit]
    active_ids: set[str] = set()
    synced: list[Recommendation] = []
    for candidate in candidates:
        rec_id = _recommendation_id(candidate, student_id, course_id)
        active_ids.add(rec_id)
        recommendation = db.get(Recommendation, rec_id)
        if recommendation is None:
            recommendation = Recommendation(
                id=rec_id,
                student_id=student_id,
                course_id=course_id,
                recommendation_type=candidate.recommendation_type,
                title=candidate.title,
                reason=candidate.reason,
                priority=candidate.priority,
                related_task_id=candidate.related_task_id,
                related_knowledge_points=_dumps_list(candidate.related_knowledge_points),
                suggested_action=candidate.suggested_action,
                status="ACTIVE",
                created_at=now,
            )
            db.add(recommendation)
        else:
            recommendation.recommendation_type = candidate.recommendation_type
            recommendation.title = candidate.title
            recommendation.reason = candidate.reason
            recommendation.priority = candidate.priority
            recommendation.related_task_id = candidate.related_task_id
            recommendation.related_knowledge_points = _dumps_list(candidate.related_knowledge_points)
            recommendation.suggested_action = candidate.suggested_action
            recommendation.status = "ACTIVE"
            recommendation.created_at = now
        synced.append(recommendation)

    stale = db.scalars(
        select(Recommendation).where(
            Recommendation.student_id == student_id,
            Recommendation.course_id == course_id,
            Recommendation.id.like(f"{ALGORITHM_RECOMMENDATION_PREFIX}%"),
            Recommendation.status == "ACTIVE",
        )
    ).all()
    for recommendation in stale:
        if recommendation.id not in active_ids:
            recommendation.status = "DISMISSED"
    return synced
