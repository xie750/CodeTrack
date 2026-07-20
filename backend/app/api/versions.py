from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok, request_id
from backend.app.core.database import get_db
from backend.app.core.security import current_user, ensure_course_member
from backend.app.models import Capability, CapabilityEvidence, Diagnosis, ExecutionRun, Submission, SubmissionVersion, User
from backend.app.services.audit import record_audit
from backend.app.services.diagnosis import create_or_get_hint, serialize_diagnosis, serialize_hint
from backend.app.services.submissions import duration_ms_between, iso

router = APIRouter(prefix="/api/v1", tags=["submission-versions"])


class HintRequest(BaseModel):
    requested_level: int


class ResponseMeta(BaseModel):
    request_id: str


class VersionHistoryItemResponse(BaseModel):
    version_id: str
    version_no: int
    language: str
    source_code: str
    code_hash: str
    created_at: str | None
    submission_status: str
    execution_status: str
    passed_count: int
    total_required_count: int
    highest_hint_level: int
    is_latest: bool
    is_final: bool


class VersionHistoryResponse(BaseModel):
    data: list[VersionHistoryItemResponse]
    meta: ResponseMeta


class TestComparisonResponse(BaseModel):
    test_case_id: str
    name: str
    first_status: str
    final_status: str


class CapabilityEvidenceSummaryResponse(BaseModel):
    evidence_id: str
    capability_code: str
    strength: str
    evidence_type: str
    explanation: str


class SubmissionSummaryDataResponse(BaseModel):
    submission_id: str
    task_id: str
    final_status: str
    version_count: int
    highest_hint_level: int
    started_at: str | None
    passed_at: str | None
    total_duration_ms: int | None
    next_step_suggestion: str
    test_comparison: list[TestComparisonResponse]
    capability_evidence: CapabilityEvidenceSummaryResponse | None


class SubmissionSummaryResponse(BaseModel):
    data: SubmissionSummaryDataResponse
    meta: ResponseMeta


def next_step_for(evidence: CapabilityEvidence | None) -> str:
    if evidence is None:
        return "继续根据系统验证结果修改代码，重新提交后生成能力证据。"
    if evidence.strength == "STRONG":
        return "建议尝试链表尾节点和非法位置的变体练习，巩固边界处理能力。"
    if evidence.strength == "MODERATE":
        return "建议独立复述头节点删除时返回值变化的原因，并完成一个相似链表边界题。"
    if evidence.strength == "WEAK":
        return "建议回看链表删除基本规则，再用公开测试逐步验证每个边界分支。"
    if evidence.strength == "NEGATIVE":
        return "建议先集中复盘重复失败的边界场景，按头节点、尾节点、空链表逐项写出预期变化后再提交。"
    return "建议在不查看参考答案的情况下重新完成相似任务，以形成更强证据。"


def authorized_version(db: Session, version_id: str, user: User) -> tuple[SubmissionVersion, Submission, ExecutionRun | None]:
    version = db.get(SubmissionVersion, version_id)
    if version is None:
        raise ApiError(404, "SUBMISSION_VERSION_NOT_FOUND", "提交版本不存在")
    submission = db.get(Submission, version.submission_id)
    if submission is None:
        raise ApiError(404, "SUBMISSION_NOT_FOUND", "提交不存在")
    ensure_course_member(db, submission.task.course_id, user.id)
    execution = db.scalar(select(ExecutionRun).where(ExecutionRun.submission_version_id == version.id))
    return version, submission, execution


@router.get("/submission-versions/{version_id}/results")
def get_version_results(
    version_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    version, submission, execution = authorized_version(db, version_id, user)
    if execution is None:
        raise ApiError(404, "EXECUTION_NOT_FOUND", "执行记录不存在")
    tests = [
        {
            "test_case_id": result.test_case_id,
            "name": result.test_case.name,
            "visibility": result.test_case.visibility,
            "status": result.status,
            "expected_output_summary": result.expected_output_summary,
            "actual_output": result.actual_output,
            "duration_ms": result.duration_ms,
            "error_tag": result.error_tag,
        }
        for result in execution.test_results
    ]
    diagnosis = version.diagnosis
    available_levels: list[int] = []
    if diagnosis and diagnosis.status == "READY":
        viewed_levels = {hint.level for hint in diagnosis.hints}
        available_levels = [1]
        if 1 in viewed_levels:
            available_levels.append(2)
        if 2 in viewed_levels:
            available_levels.append(3)
    return ok(
        {
            "submission_id": submission.id,
            "version_id": version.id,
            "version_no": version.version_no,
            "submission_status": submission.status,
            "execution": {
                "execution_id": execution.id,
                "status": execution.status,
                "compile_exit_code": execution.compile_exit_code,
                "compiler_stdout": execution.compiler_stdout,
                "compiler_stderr": execution.compiler_stderr,
                "started_at": iso(execution.started_at),
                "finished_at": iso(execution.finished_at),
            },
            "tests": tests,
            "diagnosis": {
                "status": diagnosis.status if diagnosis else "NOT_STARTED",
                "diagnosis_id": diagnosis.id if diagnosis else None,
                "needs_teacher_review": diagnosis.needs_teacher_review if diagnosis else False,
            },
            "hint_access": {
                "highest_viewed_level": version.highest_hint_level,
                "available_levels": available_levels,
                "reference_answer_viewed": version.viewed_reference_answer,
            },
        }
    )


@router.get("/submission-versions/{version_id}/diagnosis")
def get_diagnosis(
    version_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    version, _, _ = authorized_version(db, version_id, user)
    if version.diagnosis is None:
        raise ApiError(404, "DIAGNOSIS_NOT_READY", "诊断尚未就绪，当前仅返回工具验证结果")
    return ok(serialize_diagnosis(version.diagnosis))


@router.post("/diagnoses/{diagnosis_id}/hints")
def request_hint(
    diagnosis_id: str,
    payload: HintRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    rid = request_id()
    diagnosis = db.get(Diagnosis, diagnosis_id)
    if diagnosis is None:
        raise ApiError(404, "DIAGNOSIS_NOT_FOUND", "诊断不存在")
    version = diagnosis.version
    submission = version.submission
    ensure_course_member(db, submission.task.course_id, user.id, role="STUDENT")
    hint = create_or_get_hint(
        db,
        diagnosis=diagnosis,
        level=payload.requested_level,
        student_requested=payload.requested_level > 1,
        request_reason="学生主动申请" if payload.requested_level > 1 else "AUTO_LEVEL_1",
    )
    record_audit(
        db,
        event_type="HINT_VIEWED",
        request_id=rid,
        user_id=user.id,
        submission_id=submission.id,
        version_id=version.id,
        execution_id=version.execution.id if version.execution else None,
        status="VIEWED",
        details={"hint_level": hint.level, "diagnosis_type": diagnosis.diagnosis_type},
    )
    db.commit()
    db.refresh(hint)
    return ok(serialize_hint(hint), rid=rid)


@router.get("/submissions/{submission_id}/versions", response_model=VersionHistoryResponse)
def get_versions(
    submission_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise ApiError(404, "SUBMISSION_NOT_FOUND", "提交不存在")
    ensure_course_member(db, submission.task.course_id, user.id)
    latest_no = submission.latest_version_no
    data = []
    for version in submission.versions:
        execution = version.execution
        passed = len([result for result in execution.test_results if result.status == "PASSED"]) if execution else 0
        total = len(execution.test_results) if execution else 5
        data.append(
            {
                "version_id": version.id,
                "version_no": version.version_no,
                "language": version.language,
                "source_code": version.source_code,
                "code_hash": version.code_hash,
                "created_at": iso(version.created_at),
                "submission_status": submission.status if version.version_no == latest_no else "EXECUTION_FINISHED",
                "execution_status": execution.status if execution else "PENDING",
                "passed_count": passed,
                "total_required_count": total,
                "highest_hint_level": version.highest_hint_level,
                "is_latest": version.version_no == latest_no,
                "is_final": version.version_no == latest_no and submission.status == "PASSED",
            }
        )
    return ok(data)


@router.get("/submissions/{submission_id}/summary", response_model=SubmissionSummaryResponse)
def get_summary(
    submission_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise ApiError(404, "SUBMISSION_NOT_FOUND", "提交不存在")
    ensure_course_member(db, submission.task.course_id, user.id)
    if not submission.versions:
        raise ApiError(404, "SUBMISSION_VERSION_NOT_FOUND", "提交版本不存在")
    first = submission.versions[0]
    final = submission.versions[-1]
    evidence = db.scalar(
        select(CapabilityEvidence).where(CapabilityEvidence.submission_version_id == final.id)
    )
    capability = db.get(Capability, evidence.capability_id) if evidence else None
    comparison = []
    first_results = {result.test_case_id: result for result in first.execution.test_results} if first.execution else {}
    final_results = {result.test_case_id: result for result in final.execution.test_results} if final.execution else {}
    for test_case_id, first_result in first_results.items():
        final_result = final_results.get(test_case_id)
        if final_result and first_result.status != final_result.status:
            comparison.append(
                {
                    "test_case_id": test_case_id,
                    "name": test_case_id,
                    "first_status": first_result.status,
                    "final_status": final_result.status,
                }
            )
    return ok(
        {
            "submission_id": submission.id,
            "task_id": submission.task_id,
            "final_status": submission.status,
            "version_count": len(submission.versions),
            "highest_hint_level": max(version.highest_hint_level for version in submission.versions),
            "started_at": iso(submission.first_submitted_at),
            "passed_at": iso(submission.passed_at),
            "total_duration_ms": duration_ms_between(submission.first_submitted_at, submission.passed_at),
            "next_step_suggestion": next_step_for(evidence),
            "test_comparison": comparison,
            "capability_evidence": {
                "evidence_id": evidence.id,
                "capability_code": capability.code if capability else "LINKED_LIST_BOUNDARY_HANDLING",
                "strength": evidence.strength,
                "evidence_type": evidence.evidence_type,
                "explanation": evidence.explanation,
            }
            if evidence
            else None,
        }
    )
