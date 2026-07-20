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

