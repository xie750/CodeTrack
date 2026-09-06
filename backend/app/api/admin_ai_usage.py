"""管理员端 AI 使用分析接口。

本接口把 AgentRun 聚合成管理员可读的使用规模、深度、成本和质量口径。
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user
from backend.app.models import AgentRun, AdministrativeClass, Course, Enrollment, StudentClassMembership, User


router = APIRouter(prefix="/api/v1/admin/ai", tags=["admin-ai-usage"])

FEATURE_LABELS = {
    "student_ai_tutor_chat": "AI 导师问答",
    "student_resource_generation": "学习资料生成",
    "student_ppt_generation": "PPT 大纲生成",
    "code_diagnosis": "代码诊断",
    "code_diagnosis_coach": "带引用 AI 诊断",
    "rag_document_ingest": "知识库处理",
}


def require_admin(user: User) -> None:
    if user.role not in {"ADMIN", "SUPER_ADMIN"}:
        raise ApiError(403, "AUTH_FORBIDDEN", "当前角色无权访问管理员 AI 使用分析")


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    try:
        if len(text) == 10:
            return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise ApiError(400, "INVALID_DATE_RANGE", "时间筛选格式无效，请使用 YYYY-MM-DD 或 ISO 时间") from exc


def default_range(range_key: str) -> tuple[datetime | None, datetime]:
    now = datetime.now(timezone.utc)
    if range_key == "7d":
        return now - timedelta(days=7), now
    if range_key == "semester":
        return now - timedelta(days=120), now
    if range_key == "all":
        return None, now
    return now - timedelta(days=30), now


def safe_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def total_tokens(run: AgentRun) -> int:
    return (run.token_prompt or 0) + (run.token_completion or 0)


def latency_ms(run: AgentRun) -> int | None:
    if not run.started_at or not run.finished_at:
        return None
    return max(0, round((run.finished_at - run.started_at).total_seconds() * 1000))


def pct(numerator: int | float, denominator: int | float) -> float:
    if not denominator:
        return 0.0
    return round(float(numerator) / float(denominator) * 100, 1)


def p95(values: list[int]) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round((len(ordered) - 1) * 0.95)))
    return ordered[index]


def bucket_for(value: datetime, range_key: str) -> str:
    if range_key == "7d" or range_key == "30d":
        return value.strftime("%m/%d")
    if range_key == "semester":
        year, week, _ = value.isocalendar()
        return f"{year}-W{week:02d}"
    return value.strftime("%Y-%m")


def feature_label(workflow_type: str) -> str:
    return FEATURE_LABELS.get(workflow_type, workflow_type)


@router.get("/usage")
def ai_usage(
    range: str = Query(default="30d", pattern="^(7d|30d|semester|all)$"),
    date_from: str | None = None,
    date_to: str | None = None,
    course_id: str | None = None,
    class_id: str | None = None,
    role: str | None = Query(default=None, pattern="^(STUDENT|TEACHER|SYSTEM)$"),
    workflow_type: str | None = None,
    model_name: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_admin(user)

    default_from, default_to = default_range(range)
    start = parse_dt(date_from) or default_from
    end = parse_dt(date_to) or default_to
    if start and end and start > end:
        raise ApiError(400, "INVALID_DATE_RANGE", "开始时间不能晚于结束时间")

    users = {item.id: item for item in db.scalars(select(User)).all()}
    courses = {item.id: item for item in db.scalars(select(Course)).all()}
    classes = {item.id: item for item in db.scalars(select(AdministrativeClass)).all()}
    active_memberships = {
        item.student_id: item
        for item in db.scalars(
            select(StudentClassMembership).where(StudentClassMembership.status == "ACTIVE")
        ).all()
    }

    query = select(AgentRun).order_by(AgentRun.started_at.desc())
    if start:
        query = query.where(AgentRun.started_at >= start)
    if end:
        query = query.where(AgentRun.started_at <= end)
    if course_id:
        query = query.where(AgentRun.course_id == course_id)
    if workflow_type:
        query = query.where(AgentRun.workflow_type == workflow_type)
    if model_name:
        query = query.where(AgentRun.model_name == model_name)

    rows = list(db.scalars(query).all())

    def run_role(run: AgentRun) -> str:
        if not run.student_id:
            return "SYSTEM"
        return users.get(run.student_id).role if users.get(run.student_id) else "SYSTEM"

    def run_class_id(run: AgentRun) -> str | None:
        return active_memberships.get(run.student_id or "") and active_memberships[run.student_id].class_id

    if role:
        rows = [item for item in rows if run_role(item) == role]
    if class_id:
        rows = [item for item in rows if run_class_id(item) == class_id]

    active_users = [
        item
        for item in users.values()
        if item.status == "ACTIVE" and item.role in {"STUDENT", "TEACHER"}
    ]
    if role and role != "SYSTEM":
        active_users = [item for item in active_users if item.role == role]
    if class_id:
        member_ids = {item.student_id for item in active_memberships.values() if item.class_id == class_id}
        active_users = [item for item in active_users if item.id in member_ids]
    if course_id:
        enrolled = {
            item.user_id
            for item in db.scalars(select(Enrollment).where(Enrollment.course_id == course_id)).all()
        }
        active_users = [item for item in active_users if item.id in enrolled]

    unique_user_ids = {item.student_id for item in rows if item.student_id}
    succeeded = [item for item in rows if item.status == "SUCCEEDED"]
    failed = [item for item in rows if item.status != "SUCCEEDED"]
    token_sum = sum(total_tokens(item) for item in rows)
    latency_values = [value for value in (latency_ms(item) for item in rows) if value is not None]

    outputs = [safe_json(item.output_json) for item in rows]
    source_used_count = sum(1 for item in outputs if item.get("source_used") is True or int(item.get("citation_count") or 0) > 0)
    confidence_values = [float(item["confidence"]) for item in outputs if isinstance(item.get("confidence"), (int, float))]
    low_confidence_count = sum(1 for value in confidence_values if value < 0.5)
    effective_count = sum(
        1
        for run, output in zip(rows, outputs, strict=False)
        if run.status == "SUCCEEDED"
        and (
            output.get("source_used") is True
            or int(output.get("citation_count") or 0) > 0
            or float(output.get("confidence") or 0) >= 0.7
        )
    )

    trend_map: dict[str, dict[str, Any]] = defaultdict(lambda: {"bucket": "", "calls": 0, "users": set(), "tokens": 0, "success": 0})
    course_map: dict[str, dict[str, Any]] = {}
    feature_map: dict[str, dict[str, Any]] = {}
    model_map: dict[str, dict[str, Any]] = {}
    role_map: dict[str, dict[str, Any]] = {}

    for run in rows:
        bucket = bucket_for(run.started_at, range)
        trend = trend_map[bucket]
        trend["bucket"] = bucket
        trend["calls"] += 1
        trend["tokens"] += total_tokens(run)
        if run.student_id:
            trend["users"].add(run.student_id)
        if run.status == "SUCCEEDED":
            trend["success"] += 1

        course_key = run.course_id or "unknown"
        course = courses.get(course_key)
        course_item = course_map.setdefault(
            course_key,
            {"course_id": course_key, "course_name": course.name if course else "未绑定课程", "calls": 0, "users": set(), "tokens": 0, "success": 0},
        )
        course_item["calls"] += 1
        course_item["tokens"] += total_tokens(run)
        if run.student_id:
            course_item["users"].add(run.student_id)
        if run.status == "SUCCEEDED":
            course_item["success"] += 1

        feature_item = feature_map.setdefault(
            run.workflow_type,
            {"workflow_type": run.workflow_type, "label": feature_label(run.workflow_type), "calls": 0, "tokens": 0, "success": 0, "effective": 0},
        )
        feature_item["calls"] += 1
        feature_item["tokens"] += total_tokens(run)
        if run.status == "SUCCEEDED":
            feature_item["success"] += 1
        output = safe_json(run.output_json)
        if run.status == "SUCCEEDED" and (output.get("source_used") is True or int(output.get("citation_count") or 0) > 0 or float(output.get("confidence") or 0) >= 0.7):
            feature_item["effective"] += 1

        model_key = run.model_name or "未记录模型"
        model_item = model_map.setdefault(
            model_key,
            {"model_name": model_key, "provider": run.model_provider or "未记录", "calls": 0, "tokens": 0, "success": 0, "latencies": []},
        )
        model_item["calls"] += 1
        model_item["tokens"] += total_tokens(run)
        if run.status == "SUCCEEDED":
            model_item["success"] += 1
        current_latency = latency_ms(run)
        if current_latency is not None:
            model_item["latencies"].append(current_latency)

        role_key = run_role(run)
        role_item = role_map.setdefault(role_key, {"role": role_key, "label": {"STUDENT": "学生", "TEACHER": "教师", "SYSTEM": "系统"}.get(role_key, role_key), "calls": 0, "users": set()})
        role_item["calls"] += 1
        if run.student_id:
            role_item["users"].add(run.student_id)

    course_active_counts: dict[str, int] = defaultdict(int)
    for enrollment in db.scalars(select(Enrollment)).all():
        if users.get(enrollment.user_id) and users[enrollment.user_id].status == "ACTIVE":
            course_active_counts[enrollment.course_id] += 1

    trends = [
        {
            "bucket": item["bucket"],
            "calls": item["calls"],
            "users": len(item["users"]),
            "tokens": item["tokens"],
            "success_rate": pct(item["success"], item["calls"]),
        }
        for _, item in sorted(trend_map.items())
    ]
    course_breakdown = [
        {
            **{key: value for key, value in item.items() if key != "users"},
            "users": len(item["users"]),
            "success_rate": pct(item["success"], item["calls"]),
            "usage_rate": pct(len(item["users"]), course_active_counts.get(item["course_id"], 0)),
        }
        for item in sorted(course_map.values(), key=lambda x: x["calls"], reverse=True)
    ]
    feature_breakdown = [
        {
            **item,
            "success_rate": pct(item["success"], item["calls"]),
            "effective_rate": pct(item["effective"], item["success"]),
        }
        for item in sorted(feature_map.values(), key=lambda x: x["calls"], reverse=True)
    ]
    model_breakdown = [
        {
            "model_name": item["model_name"],
            "provider": item["provider"],
            "calls": item["calls"],
            "tokens": item["tokens"],
            "success_rate": pct(item["success"], item["calls"]),
            "avg_latency_ms": round(sum(item["latencies"]) / len(item["latencies"])) if item["latencies"] else None,
        }
        for item in sorted(model_map.values(), key=lambda x: x["calls"], reverse=True)
    ]
    role_breakdown = [
        {**{key: value for key, value in item.items() if key != "users"}, "users": len(item["users"])}
        for item in sorted(role_map.values(), key=lambda x: x["calls"], reverse=True)
    ]

    recent_logs = []
    for run in rows[:20]:
        actor = users.get(run.student_id or "")
        current_class_id = run_class_id(run)
        recent_logs.append(
            {
                "id": run.id,
                "time": iso(run.started_at),
                "user_id": run.student_id,
                "user_name": actor.display_name if actor else "系统",
                "role": run_role(run),
                "course_id": run.course_id,
                "course_name": courses.get(run.course_id or "").name if courses.get(run.course_id or "") else "未绑定课程",
                "class_id": current_class_id,
                "class_name": classes.get(current_class_id or "").name if classes.get(current_class_id or "") else "",
                "workflow_type": run.workflow_type,
                "feature": feature_label(run.workflow_type),
                "model_provider": run.model_provider,
                "model_name": run.model_name,
                "status": run.status,
                "latency_ms": latency_ms(run),
                "tokens": total_tokens(run),
                "error_code": run.error_code,
            }
        )

    busiest_course = course_breakdown[0]["course_name"] if course_breakdown else "暂无课程数据"
    weakest_feature = next((item for item in feature_breakdown if item["success_rate"] < 95), None)
    insights = [
        f"{busiest_course}是当前 AI 调用最集中的课程，建议优先观察其任务诊断与自学资料生成质量。",
        f"引用支撑占比为 {pct(source_used_count, len(rows))}%，可作为课程知识库覆盖度的运营指标。",
    ]
    if weakest_feature:
        insights.append(f"{weakest_feature['label']}成功率低于 95%，建议结合最近调用明细排查模型或上下文输入。")

    return ok(
        {
            "filters": {
                "range": range,
                "date_from": iso(start),
                "date_to": iso(end),
                "course_id": course_id,
                "class_id": class_id,
                "role": role,
                "workflow_type": workflow_type,
                "model_name": model_name,
            },
            "summary": {
                "ai_usage_rate": pct(len(unique_user_ids), len(active_users)),
                "total_calls": len(rows),
                "unique_users": len(unique_user_ids),
                "active_users": len(active_users),
                "total_tokens": token_sum,
                "success_rate": pct(len(succeeded), len(rows)),
                "failure_rate": pct(len(failed), len(rows)),
                "avg_latency_ms": round(sum(latency_values) / len(latency_values)) if latency_values else None,
                "p95_latency_ms": p95(latency_values),
                "effective_rate": pct(effective_count, len(succeeded)),
                "citation_rate": pct(source_used_count, len(rows)),
                "low_confidence_rate": pct(low_confidence_count, len(confidence_values)),
            },
            "trends": trends,
            "course_breakdown": course_breakdown,
            "feature_breakdown": feature_breakdown,
            "model_breakdown": model_breakdown,
            "role_breakdown": role_breakdown,
            "recent_logs": recent_logs,
            "insights": insights,
        }
    )
