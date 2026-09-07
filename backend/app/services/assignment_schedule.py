from datetime import datetime, timezone

from backend.app.core.api_response import ApiError
from backend.app.models import TaskAssignment
from backend.app.models.entities import utc_now


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def assignment_start_at(assignment: TaskAssignment) -> datetime:
    return as_utc(getattr(assignment, "start_at", None) or assignment.published_at) or utc_now()


def assert_assignment_started(assignment: TaskAssignment) -> None:
    start_at = assignment_start_at(assignment)
    now = utc_now()
    if start_at > now:
        raise ApiError(
            403,
            "ASSIGNMENT_NOT_STARTED",
            f"任务将于 {start_at.isoformat().replace('+00:00', 'Z')} 开始，开始前不能保存或提交。",
        )


def assert_publish_time_range(start_at: datetime, deadline: datetime | None) -> None:
    end_at = as_utc(deadline)
    if end_at is not None and end_at <= as_utc(start_at):
        raise ApiError(422, "TASK_TIME_RANGE_INVALID", "截止时间必须晚于开始时间")
