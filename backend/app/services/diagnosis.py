import json
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from backend.app.core.api_response import ApiError
from backend.app.models import Diagnosis, HintRecord, KnowledgeSource, Submission, SubmissionVersion, TestResult
from backend.app.models.entities import utc_now
from backend.app.services.audit import record_audit
from backend.app.services.model_gateway import GatewayDiagnosis, request_gateway_diagnosis


ALLOWED_DIAGNOSIS_TYPES = {
    "LINKED_LIST_HEAD_UPDATE_ERROR",
    "BOUNDARY_CASE_MISSING",
    "COMPILE_ERROR_EXPLANATION",
    "UNKNOWN_OR_LOW_CONFIDENCE",
}

SOURCE_BY_ERROR_TAG = {
    "LINKED_LIST_HEAD_UPDATE_ERROR": ["kb_head_node_delete", "kb_boundary_test_reasoning"],
    "EMPTY_LIST_GUARD": ["kb_empty_list_guard", "kb_boundary_test_reasoning"],
    "TAIL_DELETE": ["kb_linked_list_delete_basic", "kb_boundary_test_reasoning"],
    "INVALID_POSITION": ["kb_empty_list_guard", "kb_boundary_test_reasoning"],
}


def prefixed_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _json(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def _loads(value: str):
    return json.loads(value)


def leakage_check(content: str, level: int) -> dict:
    forbidden_fragments = [
        "ListNode* deleteAt",
        "return head->next",
        "head = head->next",
        "prev->next = prev->next->next",
    ]
    hits = [fragment for fragment in forbidden_fragments if fragment in content]
    return {
        "passed": not hits and len(content) <= 300,
        "matched_fragments": hits,
        "level": level,
        "rule_version": "hint_leakage_v0.1",
    }


def ensure_hint_safe(content: str, level: int) -> dict:
    result = leakage_check(content, level)
    if not result["passed"]:
        raise ApiError(422, "HINT_GENERATION_FAILED", "提示未通过答案泄露检查", result)
    return result


def level_content(diagnosis_type: str, level: int) -> str:
    if diagnosis_type == "LINKED_LIST_HEAD_UPDATE_ERROR":
        if level == 1:
            return "当前失败集中在删除第一个节点。请检查删除后，代表链表起点的返回值是否仍指向旧节点。"
        if level == 2:
            return "请重点查看处理 position 为 0 的分支。删除首节点没有前驱节点，链表起点需要跟随被删除节点之后的位置变化。"
        return "可以按三步排查：先单独处理空链表和非法位置，再单独处理删除首节点，最后再处理有前驱节点的普通删除。"
    if diagnosis_type == "BOUNDARY_CASE_MISSING":
        if level == 1:
            return "当前失败来自边界场景。请对照公开测试，检查空链表、尾节点或非法位置是否被单独处理。"
        if level == 2:
            return "链表删除不只需要覆盖中间节点，还需要确认循环停止位置和返回值在边界输入下仍然正确。"
        return "建议逐类列出分支：空链表或非法位置、删除首节点、删除中间或尾节点、位置超过长度。"
    return "当前工具证据不足以给出高置信诊断，请优先查看编译和测试输出，并在修改后重新提交验证。"


def primary_diagnosis_type(failed_results: list[TestResult]) -> str:
    tags = [result.error_tag for result in failed_results]
    if "LINKED_LIST_HEAD_UPDATE_ERROR" in tags:
        return "LINKED_LIST_HEAD_UPDATE_ERROR"
    if any(tag in tags for tag in {"EMPTY_LIST_GUARD", "TAIL_DELETE", "INVALID_POSITION"}):
        return "BOUNDARY_CASE_MISSING"
    return "UNKNOWN_OR_LOW_CONFIDENCE"


def create_diagnosis_for_version(db: Session, version: SubmissionVersion) -> Diagnosis | None:
    existing = db.scalar(select(Diagnosis).where(Diagnosis.submission_version_id == version.id))
    if existing is not None:
        return existing
    if version.execution is None or version.execution.status != "SUCCEEDED":
        return None

    failed_results = [result for result in version.execution.test_results if result.status == "FAILED"]
    if not failed_results:
        return None

    diagnosis_type = primary_diagnosis_type(failed_results)
    if diagnosis_type not in ALLOWED_DIAGNOSIS_TYPES:
        diagnosis_type = "UNKNOWN_OR_LOW_CONFIDENCE"

    source_ids: list[str] = []
    for result in failed_results:
        for source_id in SOURCE_BY_ERROR_TAG.get(result.error_tag, []):
            if source_id not in source_ids and db.get(KnowledgeSource, source_id):
                source_ids.append(source_id)
    if not source_ids:
        source_ids = ["kb_boundary_test_reasoning"] if db.get(KnowledgeSource, "kb_boundary_test_reasoning") else []

    evidence_ids = [result.id for result in failed_results]
    knowledge_sources = [source for source_id in source_ids if (source := db.get(KnowledgeSource, source_id))]
    gateway_result = request_gateway_diagnosis(version, failed_results, knowledge_sources)
    if gateway_result is not None:
        diagnosis = create_gateway_diagnosis(db, version, gateway_result)
        if diagnosis.status == "READY":
            create_or_get_hint(
                db,
                diagnosis,
                1,
                student_requested=False,
                request_reason="MODEL_LEVEL_1",
                content_override=gateway_result.hint,
            )
        return diagnosis

    if diagnosis_type == "LINKED_LIST_HEAD_UPDATE_ERROR":
        explanation = "当前版本在删除第一个节点时仍返回旧的链表起点，导致结果保留原首节点。"
        confidence = 0.82
    elif diagnosis_type == "BOUNDARY_CASE_MISSING":
        explanation = "当前版本在链表边界测试中失败，需要复核空链表、尾节点或非法位置等分支。"
        confidence = 0.66
    else:
        explanation = "当前失败证据不足以形成高置信错因，需要教师复核。"
        confidence = 0.35

    diagnosis = Diagnosis(
        id=prefixed_id("diag"),
        submission_version_id=version.id,
        status="READY" if source_ids else "REVIEW_REQUIRED",
        diagnosis_type=diagnosis_type,
        confidence=confidence,
        explanation=explanation,
        verified_evidence_ids=_json(evidence_ids),
        knowledge_source_ids=_json(source_ids),
        needs_teacher_review=True,
        model_provider="RULE_FALLBACK",
        model_name="template-diagnosis-v0.1",
        prompt_version="fallback_prompt_v0.1",
    )
    db.add(diagnosis)
    db.flush()
    record_diagnosis_audit(db, version, diagnosis)
    if diagnosis.status == "READY":
        create_or_get_hint(db, diagnosis, 1, student_requested=False, request_reason="AUTO_LEVEL_1")
    return diagnosis


def create_gateway_diagnosis(
    db: Session,
    version: SubmissionVersion,
    gateway_result: GatewayDiagnosis,
) -> Diagnosis:
    if gateway_result.confidence < 0.6:
        status = "LOW_CONFIDENCE"
    elif gateway_result.needs_teacher_review:
        status = "REVIEW_REQUIRED"
    else:
        status = "READY"
    diagnosis = Diagnosis(
        id=prefixed_id("diag"),
        submission_version_id=version.id,
        status=status,
        diagnosis_type=gateway_result.diagnosis_type,
        confidence=gateway_result.confidence,
        explanation=gateway_result.explanation,
        verified_evidence_ids=_json(gateway_result.verified_evidence_ids),
        knowledge_source_ids=_json(gateway_result.knowledge_source_ids),
        needs_teacher_review=gateway_result.needs_teacher_review,
        model_provider=gateway_result.model_provider,
        model_name=gateway_result.model_name,
        prompt_version="diagnosis_v0.1",
    )
    db.add(diagnosis)
    db.flush()
    record_diagnosis_audit(db, version, diagnosis)
    return diagnosis


def record_diagnosis_audit(db: Session, version: SubmissionVersion, diagnosis: Diagnosis) -> None:
    submission = version.submission
    record_audit(
        db,
        event_type="DIAGNOSIS_CREATED",
        request_id=f"req_diag_{diagnosis.id}",
        user_id=submission.student_id,
        submission_id=submission.id,
        version_id=version.id,
        execution_id=version.execution.id if version.execution else None,
        status=diagnosis.status,
        details={
            "diagnosis_type": diagnosis.diagnosis_type,
            "model_provider": diagnosis.model_provider,
        },
    )


def create_or_get_hint(
    db: Session,
    diagnosis: Diagnosis,
    level: int,
    student_requested: bool,
    request_reason: str,
    content_override: str | None = None,
) -> HintRecord:
    if level not in {1, 2, 3}:
        raise ApiError(400, "HINT_LEVEL_NOT_AVAILABLE", "仅支持 1 到 3 级提示")
    if diagnosis.status != "READY":
        raise ApiError(409, "HINT_DIAGNOSIS_NOT_READY", "诊断未就绪，无法生成提示")

    existing = db.scalar(
        select(HintRecord).where(HintRecord.diagnosis_id == diagnosis.id, HintRecord.level == level)
    )
    if existing is not None:
        return existing

    if level == 2 and not db.scalar(
        select(HintRecord).where(HintRecord.diagnosis_id == diagnosis.id, HintRecord.level == 1)
    ):
        raise ApiError(409, "HINT_LEVEL_NOT_AVAILABLE", "需要先查看一级提示")
    if level == 3 and not db.scalar(
        select(HintRecord).where(HintRecord.diagnosis_id == diagnosis.id, HintRecord.level == 2)
    ):
        raise ApiError(409, "HINT_LEVEL_NOT_AVAILABLE", "需要先查看二级提示")

    content = content_override or level_content(diagnosis.diagnosis_type, level)
    check = ensure_hint_safe(content, level)
    hint = HintRecord(
        id=prefixed_id("hint"),
        diagnosis_id=diagnosis.id,
        level=level,
        content=content,
        leakage_check=_json(check),
        student_requested=student_requested,
        request_reason=request_reason,
        generated_at=utc_now(),
        viewed_at=utc_now(),
    )
    db.add(hint)
    db.flush()

    version = diagnosis.version
    if version.highest_hint_level < level:
        version.highest_hint_level = level
    return hint


def serialize_diagnosis(diagnosis: Diagnosis) -> dict:
    hint = diagnosis.hints[0] if diagnosis.hints else None
    source_ids = _loads(diagnosis.knowledge_source_ids)
    session = object_session(diagnosis)
    sources = []
    if session is not None:
        for source_id in source_ids:
            source = session.get(KnowledgeSource, source_id)
            if source is not None:
                sources.append(
                    {
                        "source_id": source.id,
                        "title": source.title,
                        "summary": source.summary,
                        "source_type": source.source_type,
                        "version": source.version,
                        "authority_level": source.authority_level,
                    }
                )
    return {
        "diagnosis_id": diagnosis.id,
        "version_id": diagnosis.submission_version_id,
        "status": diagnosis.status,
        "diagnosis_type": diagnosis.diagnosis_type,
        "confidence": diagnosis.confidence,
        "explanation": diagnosis.explanation,
        "verified_evidence_ids": _loads(diagnosis.verified_evidence_ids),
        "knowledge_source_ids": source_ids,
        "knowledge_sources": sources,
        "needs_teacher_review": diagnosis.needs_teacher_review,
        "hint_level": hint.level if hint else None,
        "hint": hint.content if hint else None,
        "model_provider": diagnosis.model_provider,
        "model_name": diagnosis.model_name,
    }


def serialize_hint(hint: HintRecord) -> dict:
    return {
        "hint_id": hint.id,
        "diagnosis_id": hint.diagnosis_id,
        "level": hint.level,
        "content": hint.content,
        "unlocked": True,
        "unlock_reason": hint.request_reason,
        "generated_at": hint.generated_at.isoformat(),
        "viewed_at": hint.viewed_at.isoformat(),
    }
