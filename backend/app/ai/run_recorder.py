"""AgentRun / AgentStep 落库。

约定与 `services/audit.py` 一致：**只 `db.add`，不 `commit`**。
运行记录跟着业务事务一起提交，不额外占写锁（SQLite 单写者）。

`run_id` 由 `new_run_id()` 在调用 `start_run` 之前生成，这样失败路径上
也能把它放进 `ApiError.details` 和审计日志（内置版 §17.5「保留 run_id 便于排查」）。
"""

import json
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from backend.app.ai.schemas import AgentRunContext
from backend.app.models import AgentRun, AgentStep
from backend.app.models.entities import utc_now


SUMMARY_MAX_LENGTH = 2000


def new_run_id() -> str:
    return f"run_{uuid4().hex[:12]}"


def new_step_id() -> str:
    return f"step_{uuid4().hex[:12]}"


def _json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return json.dumps({"unserializable": str(type(value))}, ensure_ascii=False)


def _summary(value: Any) -> str:
    text = value if isinstance(value, str) else _json(value)
    if len(text) <= SUMMARY_MAX_LENGTH:
        return text
    return f"{text[:SUMMARY_MAX_LENGTH]}…[truncated]"


def start_run(
    db: Session,
    context: AgentRunContext,
    *,
    input_payload: Any = None,
    model_provider: str | None = None,
    model_name: str | None = None,
    prompt_version: str | None = None,
    started_at: datetime | None = None,
) -> AgentRun:
    run = AgentRun(
        id=context.run_id,
        student_id=context.student_id,
        course_id=context.course_id,
        workflow_type=context.workflow_type,
        status="RUNNING",
        input_json=_summary(input_payload) if input_payload is not None else "{}",
        model_provider=model_provider,
        model_name=model_name,
        prompt_version=prompt_version,
        attempts=0,
        started_at=started_at or utc_now(),
    )
    db.add(run)
    return run


def finish_run(
    db: Session,
    run: AgentRun,
    *,
    status: str = "SUCCEEDED",
    output: Any = None,
    attempts: int | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    model_provider: str | None = None,
    model_name: str | None = None,
    prompt_version: str | None = None,
    token_prompt: int | None = None,
    token_completion: int | None = None,
    finished_at: datetime | None = None,
) -> AgentRun:
    run.status = status
    if output is not None:
        run.output_json = _summary(output)
    if attempts is not None:
        run.attempts = attempts
    if error_code is not None:
        run.error_code = error_code
    if error_message is not None:
        run.error_message = _summary(error_message)
    if model_provider is not None:
        run.model_provider = model_provider
    if model_name is not None:
        run.model_name = model_name
    if prompt_version is not None:
        run.prompt_version = prompt_version
    if token_prompt is not None:
        run.token_prompt = token_prompt
    if token_completion is not None:
        run.token_completion = token_completion
    run.finished_at = finished_at or utc_now()
    return run


def record_step(
    db: Session,
    run: AgentRun,
    *,
    step_name: str,
    step_order: int = 0,
    status: str = "SUCCEEDED",
    input_summary: Any = "",
    output_summary: Any = "",
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
) -> AgentStep:
    step = AgentStep(
        id=new_step_id(),
        run_id=run.id,
        step_name=step_name,
        step_order=step_order,
        status=status,
        input_summary=_summary(input_summary),
        output_summary=_summary(output_summary),
        started_at=started_at or utc_now(),
        finished_at=finished_at or utc_now(),
    )
    db.add(step)
    return step
