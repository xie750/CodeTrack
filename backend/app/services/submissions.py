import hashlib
import json
from datetime import timezone
from uuid import uuid4

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.models import (
    CapabilityState,
    CapabilityEvidence,
    ExecutionRun,
    IdempotencyRecord,
    Submission,
    SubmissionVersion,
    Task,
    TestCase,
    TestResult,
)
from backend.app.models.entities import utc_now
from backend.app.services.audit import record_audit
from backend.app.services.diagnosis import create_diagnosis_for_version
from backend.app.services.sandbox_client import run_sandbox_execution


def prefixed_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def code_hash(source_code: str) -> str:
    return hashlib.sha256(source_code.encode("utf-8")).hexdigest()


def one_or_404(db: Session, model, key: str, code: str, message: str):
    entity = db.get(model, key)
    if entity is None:
        raise ApiError(404, code, message)
    return entity


def latest_execution_query(version_id: str) -> Select:
    return select(ExecutionRun).where(ExecutionRun.submission_version_id == version_id)


def duration_ms_between(started_at, finished_at) -> int | None:
    if not started_at or not finished_at:
        return None
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    if finished_at.tzinfo is None:
        finished_at = finished_at.replace(tzinfo=timezone.utc)
    return max(0, int((finished_at - started_at).total_seconds() * 1000))


def create_submission_version(
    db: Session,
    task_id: str,
    student_id: str,
    language: str,
    source_code: str,
    idempotency_key: str | None,
) -> tuple[Submission, SubmissionVersion, ExecutionRun, bool]:
    task = one_or_404(db, Task, task_id, "TASK_NOT_FOUND", "任务不存在")
    if task.status != "OPEN":
        raise ApiError(422, "TASK_NOT_OPEN", "任务未开放")
    if language != "CPP":
        raise ApiError(400, "SUBMISSION_LANGUAGE_NOT_SUPPORTED", "当前任务仅支持 CPP")
    if source_code.strip() == "":
        raise ApiError(400, "SUBMISSION_CODE_EMPTY", "代码不能为空")
    if len(source_code.encode("utf-8")) > 20 * 1024:
        raise ApiError(400, "SUBMISSION_CODE_TOO_LARGE", "代码不能超过 20KB")

    if idempotency_key:
        record = db.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.user_id == student_id,
                IdempotencyRecord.task_id == task_id,
                IdempotencyRecord.idempotency_key == idempotency_key,
            )
        )
        if record is not None:
            submission = db.get(Submission, record.submission_id)
            version = db.get(SubmissionVersion, record.version_id)
            execution = db.get(ExecutionRun, record.execution_id)
            if submission and version and execution:
                return submission, version, execution, False

    submission = db.scalar(
        select(Submission).where(Submission.student_id == student_id, Submission.task_id == task_id)
    )
    now = utc_now()
    if submission is None:
        submission = Submission(
            id=prefixed_id("sub"),
            student_id=student_id,
            task_id=task_id,
            status="QUEUED",
            latest_version_no=0,
            first_submitted_at=now,
            last_submitted_at=now,
        )
        db.add(submission)
        db.flush()

    next_version_no = submission.latest_version_no + 1
    version = SubmissionVersion(
        id=prefixed_id("ver"),
        submission_id=submission.id,
        version_no=next_version_no,
        language=language,
        source_code=source_code,
        code_hash=code_hash(source_code),
        created_at=now,
    )
    db.add(version)
    db.flush()

    execution = ExecutionRun(
        id=prefixed_id("exe"),
        submission_version_id=version.id,
        status="PENDING",
        idempotency_key=idempotency_key,
    )
    db.add(execution)
    submission.latest_version_no = next_version_no
    submission.last_submitted_at = now
    submission.status = "QUEUED"

    if idempotency_key:
        db.add(
            IdempotencyRecord(
                user_id=student_id,
                task_id=task_id,
                idempotency_key=idempotency_key,
                submission_id=submission.id,
                version_id=version.id,
                execution_id=execution.id,
            )
        )

    db.commit()
    db.refresh(submission)
    db.refresh(version)
    db.refresh(execution)
    return submission, version, execution, True


def run_execution(db: Session, execution_id: str, timeout_seconds: int, audit_request_id: str | None = None) -> ExecutionRun:
    execution = one_or_404(db, ExecutionRun, execution_id, "EXECUTION_NOT_FOUND", "执行记录不存在")
    version = one_or_404(
        db,
        SubmissionVersion,
        execution.submission_version_id,
        "SUBMISSION_VERSION_NOT_FOUND",
        "提交版本不存在",
    )
    submission = one_or_404(db, Submission, version.submission_id, "SUBMISSION_NOT_FOUND", "提交不存在")
    task = one_or_404(db, Task, submission.task_id, "TASK_NOT_FOUND", "任务不存在")
    test_cases = (
        db.query(TestCase)
        .filter(TestCase.task_id == task.id)
        .order_by(TestCase.sort_order.asc())
        .all()
    )

    execution.status = "COMPILING"
    execution.started_at = utc_now()
    submission.status = "RUNNING"
    db.commit()

    sandbox_result = run_sandbox_execution(
        execution_id=execution.id,
        language=version.language,
        source_code=version.source_code,
        test_cases=test_cases,
        timeout_seconds=timeout_seconds,
    )

    execution.status = sandbox_result.status
    execution.compile_exit_code = sandbox_result.compile_exit_code
    execution.compiler_stdout = sandbox_result.compiler_stdout
    execution.compiler_stderr = sandbox_result.compiler_stderr
    execution.resource_usage = json.dumps(sandbox_result.resource_usage, ensure_ascii=False)
    execution.failure_reason = sandbox_result.failure_reason
    execution.finished_at = utc_now()

    for result in sandbox_result.tests:
        db.add(
            TestResult(
                id=f"tr_{result['test_case_id']}_{uuid4().hex[:8]}",
                execution_run_id=execution.id,
                test_case_id=result["test_case_id"],
                status=result["status"],
                actual_output=result["actual_output"],
                expected_output_summary=result["expected_output_summary"],
                duration_ms=result["duration_ms"],
                error_message=result["error_message"],
                error_tag=result["error_tag"],
                sort_order=result["sort_order"],
            )
        )
    db.flush()
    db.expire(execution, ["test_results"])

    if sandbox_result.status == "SUCCEEDED":
        required_total = len([case for case in test_cases if case.required])
        passed_required = sum(1 for result in sandbox_result.tests if result["status"] == "PASSED")
        if passed_required == required_total:
            submission.status = "PASSED"
            submission.passed_at = execution.finished_at
            create_capability_evidence(db, submission, version)
        else:
            diagnosis = create_diagnosis_for_version(db, version)
            create_negative_capability_evidence(db, submission, version, execution)
            submission.status = "FEEDBACK_READY" if diagnosis and diagnosis.status == "READY" else "REVIEW_REQUIRED"
    elif sandbox_result.status == "SECURITY_REJECTED":
        submission.status = "REVIEW_REQUIRED"
    else:
        submission.status = "FAILED"

    passed_count = sum(1 for result in sandbox_result.tests if result["status"] == "PASSED")
    failed_count = sum(1 for result in sandbox_result.tests if result["status"] == "FAILED")
    duration_ms = duration_ms_between(execution.started_at, execution.finished_at)
    record_audit(
        db,
        event_type="EXECUTION_FINISHED",
        request_id=audit_request_id or f"req_bg_{execution.id}",
        user_id=submission.student_id,
        submission_id=submission.id,
        version_id=version.id,
        execution_id=execution.id,
        status=execution.status,
        duration_ms=duration_ms,
        details={
            "compile_status": "SUCCEEDED" if execution.compile_exit_code == 0 else "FAILED",
            "passed_count": passed_count,
            "failed_count": failed_count,
            "resource_profile": "demo_cpp_v0_1",
            "failure_reason": execution.failure_reason,
        },
    )
    db.commit()
    db.refresh(execution)
    return execution


def create_capability_evidence(db: Session, submission: Submission, version: SubmissionVersion) -> None:
    existing = db.scalar(
        select(CapabilityEvidence).where(CapabilityEvidence.submission_version_id == version.id)
    )
    if existing is not None:
        return

    highest_hint = max((item.highest_hint_level for item in submission.versions), default=0)
    viewed_reference = any(item.viewed_reference_answer for item in submission.versions)
    if viewed_reference:
        strength = "NEUTRAL"
        evidence_type = "PASSED_AFTER_REFERENCE_ANSWER"
        explanation = "学生查看参考答案后完成任务，形成中性完成证据，不作为强掌握证据。"
        state = "OBSERVING"
    elif highest_hint == 0 and version.version_no == 1:
        strength = "STRONG"
        evidence_type = "INDEPENDENT_PASS"
        explanation = "学生首次独立通过全部必要测试，形成链表边界处理强正向证据。"
        state = "MASTERED"
    elif highest_hint <= 1:
        strength = "MODERATE"
        evidence_type = "PASSED_AFTER_LEVEL_1_HINT"
        explanation = "学生在一级提示或少量尝试后修复并通过全部必要测试，形成链表边界处理中等正向证据。"
        state = "EMERGING"
    else:
        strength = "WEAK"
        evidence_type = "PASSED_AFTER_HIGH_LEVEL_HINT"
        explanation = "学生在较高层级提示后通过全部必要测试，形成链表边界处理弱正向证据。"
        state = "OBSERVING"
    db.add(
        CapabilityEvidence(
            id=prefixed_id("evi"),
            student_id=submission.student_id,
            capability_id="cap_linked_list_boundary",
            task_id=submission.task_id,
            submission_version_id=version.id,
            evidence_type=evidence_type,
            strength=strength,
            explanation=explanation,
        )
    )
    update_capability_state(db, submission.student_id, "cap_linked_list_boundary", state, explanation)


def create_negative_capability_evidence(
    db: Session,
    submission: Submission,
    version: SubmissionVersion,
    execution: ExecutionRun,
) -> None:
    existing = db.scalar(
        select(CapabilityEvidence).where(CapabilityEvidence.submission_version_id == version.id)
    )
    if existing is not None:
        return

    current_failures = db.execute(
        select(TestResult.error_tag, TestCase.capability_id)
        .join(TestCase, TestResult.test_case_id == TestCase.id)
        .where(
            TestResult.execution_run_id == execution.id,
            TestResult.status == "FAILED",
            TestCase.required.is_(True),
        )
    ).all()
    repeated = []
    for error_tag, capability_id in current_failures:
        previous_count = (
            db.scalar(
                select(func.count(TestResult.id))
                .join(ExecutionRun, TestResult.execution_run_id == ExecutionRun.id)
                .join(SubmissionVersion, ExecutionRun.submission_version_id == SubmissionVersion.id)
                .join(Submission, SubmissionVersion.submission_id == Submission.id)
                .join(TestCase, TestResult.test_case_id == TestCase.id)
                .where(
                    Submission.student_id == submission.student_id,
                    SubmissionVersion.id != version.id,
                    TestResult.status == "FAILED",
                    TestResult.error_tag == error_tag,
                    TestCase.capability_id == capability_id,
                )
            )
            or 0
        )
        if previous_count > 0:
            repeated.append((error_tag, capability_id))

    if not repeated:
        return

    capability_id = repeated[0][1]
    repeated_tags = sorted({error_tag for error_tag, _ in repeated})
    tag_summary = "、".join(repeated_tags)
    explanation = f"同类链表边界错误在多个提交版本中重复出现（{tag_summary}），形成需要支持的负向能力证据。"
    db.add(
        CapabilityEvidence(
            id=prefixed_id("evi"),
            student_id=submission.student_id,
            capability_id=capability_id,
            task_id=submission.task_id,
            submission_version_id=version.id,
            evidence_type="REPEATED_BOUNDARY_FAILURE",
            strength="NEGATIVE",
            explanation=explanation,
        )
    )
    update_capability_state(db, submission.student_id, capability_id, "NEEDS_SUPPORT", explanation)


def update_capability_state(
    db: Session,
    student_id: str,
    capability_id: str,
    state: str,
    reason_summary: str,
) -> None:
    existing = db.scalar(
        select(CapabilityState).where(
            CapabilityState.student_id == student_id,
            CapabilityState.capability_id == capability_id,
        )
    )
    if existing is None:
        db.add(
            CapabilityState(
                student_id=student_id,
                capability_id=capability_id,
                state=state,
                reason_summary=reason_summary,
                updated_at=utc_now(),
            )
        )
    else:
        existing.state = state
        existing.reason_summary = reason_summary
        existing.updated_at = utc_now()


def counts_for_version(db: Session, version_id: str) -> tuple[int, int]:
    execution = db.scalar(latest_execution_query(version_id))
    if execution is None:
        return 0, 5
    total = db.scalar(select(func.count(TestResult.id)).where(TestResult.execution_run_id == execution.id)) or 0
    passed = (
        db.scalar(
            select(func.count(TestResult.id)).where(
                TestResult.execution_run_id == execution.id,
                TestResult.status == "PASSED",
            )
        )
        or 0
    )
    return passed, total


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if dt else None
