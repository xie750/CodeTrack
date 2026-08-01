import json
from typing import Any

from sqlalchemy.orm import Session

from backend.app.models import AuditLog


SAFE_DETAIL_KEYS = {
    "task_id",
    "language",
    "version_no",
    "idempotency_reused",
    "compile_status",
    "passed_count",
    "failed_count",
    "diagnosis_type",
    "model_provider",
    "hint_level",
    "resource_profile",
    "failure_reason",
    # AI 运行可观测性。注意这是允许列表，不加进来的 key 会被静默丢弃 ——
    # 写了等于没写。
    "llm_error_code",
    "attempts",
    "agent_run_id",
    # 教师 AI 审核（§11 / §15.2「所有关键写操作必须记录审计日志」）
    "diagnosis_id",
    "review_action",
    "review_id",
    # 教师资料中心（§七 / §15.2）
    "resource_id",
    "resource_action",
    "source_type",
    "status",
    "target_course_id",
    "revision_id",
}


def safe_details(details: dict[str, Any] | None) -> str:
    if not details:
        return "{}"
    safe = {key: value for key, value in details.items() if key in SAFE_DETAIL_KEYS}
    return json.dumps(safe, ensure_ascii=False, sort_keys=True)


def record_audit(
    db: Session,
    event_type: str,
    request_id: str,
    status: str,
    user_id: str | None = None,
    submission_id: str | None = None,
    version_id: str | None = None,
    execution_id: str | None = None,
    error_code: str | None = None,
    duration_ms: int | None = None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(
        event_type=event_type,
        request_id=request_id,
        user_id=user_id,
        submission_id=submission_id,
        version_id=version_id,
        execution_id=execution_id,
        status=status,
        error_code=error_code,
        duration_ms=duration_ms,
        details=safe_details(details),
    )
    db.add(entry)
    return entry

