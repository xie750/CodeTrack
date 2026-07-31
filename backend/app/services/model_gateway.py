"""代码诊断工作流的模型层：payload 构造 + 输出校验。

传输已经搬到 `backend/app/ai/llm_client.py`，本模块只保留诊断专属的部分
—— 也就是它一直以来真正的职责。改造前它兼任「通用模型入口」，
但 `ALLOWED_DIAGNOSIS_TYPES` / 禁词列表硬编码、`build_gateway_payload` 直接吃
`SubmissionVersion` ORM 对象、`validate_gateway_output` 只认诊断那六个字段，
第二个工作流一个都用不上。

失败不再是裸 `except Exception: return None`：每次调用都在 `agent_runs` 留一条
记录，失败带 `error_code`。学生侧行为不变（仍然降级到规则兜底），
但降级这件事从此可查。
"""

from typing import Any

import json

from sqlalchemy.orm import Session

from backend.app.ai import guardrails
from backend.app.ai.errors import LLMError
from backend.app.ai.llm_client import chat_json_sync, request_json_sync
from backend.app.ai.run_recorder import finish_run, new_run_id, record_step, start_run
from backend.app.ai.schemas import AgentRunContext, DiagnosisOutput
from backend.app.core.config import get_settings
from backend.app.models import KnowledgeSource, SubmissionVersion, TestResult
from backend.app.services.audit import record_audit


ALLOWED_DIAGNOSIS_TYPES = {
    "LINKED_LIST_HEAD_UPDATE_ERROR",
    "BOUNDARY_CASE_MISSING",
    "COMPILE_ERROR_EXPLANATION",
    "UNKNOWN_OR_LOW_CONFIDENCE",
}

# 保留原名，实体已移到 guardrails —— 禁词现在可按题目配置
# （`tasks.hint_forbidden_fragments`），这里只是默认值。
FORBIDDEN_HINT_FRAGMENTS = guardrails.DEFAULT_FORBIDDEN_HINT_FRAGMENTS

# 诊断输出结构现在住在 ai/schemas.py，这里保留别名不改调用方。
GatewayDiagnosis = DiagnosisOutput

WORKFLOW_TYPE = "code_diagnosis"
PROMPT_VERSION = "diagnosis_v0.1"


def build_gateway_payload(
    version: SubmissionVersion,
    failed_results: list[TestResult],
    knowledge_sources: list[KnowledgeSource],
) -> dict[str, Any]:
    submission = version.submission
    task = submission.task
    return {
        "prompt_version": PROMPT_VERSION,
        "task": {
            "task_id": task.id,
            "title": task.title,
            "language": task.language,
            "interface_spec": task.interface_spec,
            "learning_objectives": task.learning_objectives,
        },
        "submission": {
            "version_id": version.id,
            "version_no": version.version_no,
            "source_code": version.source_code,
            "highest_hint_level": version.highest_hint_level,
        },
        "tool_evidence": [
            {
                "test_result_id": result.id,
                "test_case_id": result.test_case_id,
                "status": result.status,
                "expected_output_summary": result.expected_output_summary,
                "actual_output": result.actual_output,
                "error_tag": result.error_tag,
            }
            for result in failed_results
        ],
        "knowledge_sources": [
            {
                "source_id": source.id,
                "title": source.title,
                "summary": source.summary,
                "source_type": source.source_type,
                "version": source.version,
                "authority_level": source.authority_level,
            }
            for source in knowledge_sources
        ],
        "output_schema": {
            "diagnosis_type": sorted(ALLOWED_DIAGNOSIS_TYPES),
            "confidence": "float in [0,1]",
            "verified_evidence_ids": "must be selected from tool_evidence.test_result_id",
            "knowledge_source_ids": "must be selected from knowledge_sources.source_id",
            "hint_level": 1,
            "hint": "level 1 hint without full repair code",
        },
    }


def build_model_system_prompt() -> str:
    return (
        "You are CodeTrack's controlled diagnosis engine. Use only the provided task, "
        "tool evidence, and knowledge sources. Return one JSON object matching the "
        "requested schema. Do not invent evidence IDs or source IDs. The level-1 hint "
        "must avoid complete repair code."
    )


def build_openai_chat_payload(payload: dict[str, Any], model_name: str) -> dict[str, Any]:
    return {
        "model": model_name,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": build_model_system_prompt()},
            {
                "role": "user",
                "content": (
                    "Diagnose this programming submission and return JSON only.\n\n"
                    + json.dumps(payload, ensure_ascii=False)
                ),
            },
        ],
    }


def parse_openai_chat_response(body: dict[str, Any]) -> dict[str, Any]:
    content = body["choices"][0]["message"]["content"]
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return json.loads(str(content))


def hint_leakage_errors(hint: str, forbidden_fragments: list[str] | None = None) -> list[str]:
    """保留原签名。实现委托给 `guardrails.hint_safety_check`（第 5、6 道护栏）。"""
    check = guardrails.hint_safety_check(hint, 1, forbidden_fragments=forbidden_fragments)
    return list(check["matched_fragments"])


def validate_gateway_output(
    raw: dict[str, Any],
    allowed_evidence_ids: set[str],
    allowed_source_ids: set[str],
    fallback_model_name: str,
    forbidden_fragments: list[str] | None = None,
) -> GatewayDiagnosis:
    """第 3 道护栏（Schema 校验）+ 白名单内的引用形状检查。

    来源的存在性 / 课程归属 / 学生可见性 / 版本有效性（§13.3）需要 db，
    在 `request_gateway_diagnosis` 里用 `guardrails.check_references` 补上。
    """
    required = [
        "diagnosis_type",
        "confidence",
        "explanation",
        "verified_evidence_ids",
        "knowledge_source_ids",
        "hint",
    ]
    missing = [field for field in required if field not in raw]
    if missing:
        raise ValueError(f"missing fields: {', '.join(missing)}")

    diagnosis_type = raw["diagnosis_type"]
    if diagnosis_type not in ALLOWED_DIAGNOSIS_TYPES:
        raise ValueError("invalid diagnosis_type")

    confidence = float(raw["confidence"])
    if confidence < 0 or confidence > 1:
        raise ValueError("confidence out of range")

    evidence_ids = list(raw["verified_evidence_ids"])
    source_ids = list(raw["knowledge_source_ids"])
    if not evidence_ids or any(item not in allowed_evidence_ids for item in evidence_ids):
        raise ValueError("invalid evidence reference")
    if not source_ids or any(item not in allowed_source_ids for item in source_ids):
        raise ValueError("invalid source reference")

    hint = str(raw["hint"])
    leakage = hint_leakage_errors(hint, forbidden_fragments)
    if leakage:
        raise ValueError(f"hint leakage: {', '.join(leakage)}")

    explanation = str(raw["explanation"]).strip()
    if not explanation:
        raise ValueError("empty explanation")

    return GatewayDiagnosis(
        diagnosis_type=diagnosis_type,
        confidence=confidence,
        explanation=explanation,
        verified_evidence_ids=evidence_ids,
        knowledge_source_ids=source_ids,
        hint=hint,
        needs_teacher_review=bool(raw.get("needs_teacher_review", confidence < 0.6)),
        model_provider=str(raw.get("model_provider", "MODEL_GATEWAY")),
        model_name=str(raw.get("model_name", fallback_model_name)),
    )


def request_gateway_diagnosis(
    db: Session,
    version: SubmissionVersion,
    failed_results: list[TestResult],
    knowledge_sources: list[KnowledgeSource],
) -> GatewayDiagnosis | None:
    """调模型出一份诊断。失败返回 `None` 让规则兜底接管，但会留下 `agent_runs` 记录。"""
    settings = get_settings()
    # 顺序有意为之：先判网关地址，未配置网关时才碰 model_api_key。
    if not settings.model_gateway_url and not settings.model_api_key:
        # 完全没配模型不是失败，是「本环境不用模型」，不写运行记录。
        return None

    payload = build_gateway_payload(version, failed_results, knowledge_sources)
    fallback_model_name = settings.model_name or "configured-model"
    submission = version.submission
    task = submission.task
    allowed_evidence_ids = {result.id for result in failed_results}
    allowed_source_ids = {source.id for source in knowledge_sources}
    forbidden_fragments = guardrails.resolve_forbidden_fragments(task)
    use_gateway = bool(settings.model_gateway_url)
    default_provider = "MODEL_GATEWAY" if use_gateway else "OPENAI_COMPATIBLE"

    context = AgentRunContext(
        run_id=new_run_id(),
        workflow_type=WORKFLOW_TYPE,
        student_id=submission.student_id,
        course_id=task.course_id,
    )
    run = start_run(
        db,
        context,
        input_payload={
            "version_id": version.id,
            "task_id": task.id,
            "failed_result_ids": sorted(allowed_evidence_ids),
            "knowledge_source_ids": sorted(allowed_source_ids),
        },
        model_provider=default_provider,
        model_name=fallback_model_name,
        prompt_version=PROMPT_VERSION,
    )

    def validator(raw: dict[str, Any]) -> GatewayDiagnosis:
        raw.setdefault("model_provider", default_provider)
        raw.setdefault("model_name", fallback_model_name)
        result = validate_gateway_output(
            raw,
            allowed_evidence_ids,
            allowed_source_ids,
            fallback_model_name,
            forbidden_fragments=forbidden_fragments,
        )
        # 第 4 道护栏（§13.3）：来源存在 / 属于本课程 / 学生可见 / 版本有效。
        reference = guardrails.check_references(
            db,
            source_ids=result.knowledge_source_ids,
            allowed_source_ids=allowed_source_ids,
            course_id=task.course_id,
        )
        if not reference["passed"]:
            raise ValueError(f"invalid source reference: {reference['rejected']}")
        return result

    try:
        if use_gateway:
            llm_result = request_json_sync(
                settings.model_gateway_url,
                payload=payload,
                validator=validator,
                timeout=20,
                prompt_version=PROMPT_VERSION,
                model_provider=default_provider,
                model_name=fallback_model_name,
            )
        else:
            chat_body = build_openai_chat_payload(payload, fallback_model_name)
            llm_result = chat_json_sync(
                chat_body["messages"],
                model=chat_body["model"],
                temperature=chat_body["temperature"],
                response_format=chat_body["response_format"],
                api_key=settings.model_api_key,
                base_url=settings.model_api_base_url,
                validator=validator,
                parse=parse_openai_chat_response,
                timeout=30,
                prompt_version=PROMPT_VERSION,
                model_provider=default_provider,
            )
    except LLMError as exc:
        finish_run(
            db,
            run,
            status="FAILED",
            error_code=exc.code,
            error_message=exc.detail or str(exc),
            attempts=getattr(exc, "attempts", 1),
        )
        record_audit(
            db,
            event_type="AI_RUN_FAILED",
            request_id=f"req_ai_{run.id}",
            user_id=submission.student_id,
            submission_id=submission.id,
            version_id=version.id,
            status="RULE_FALLBACK",
            error_code=exc.code,
            details={
                "llm_error_code": exc.code,
                "attempts": getattr(exc, "attempts", 1),
                "agent_run_id": run.id,
            },
        )
        return None

    result: GatewayDiagnosis = llm_result.data
    finish_run(
        db,
        run,
        status="SUCCEEDED",
        output={
            "diagnosis_type": result.diagnosis_type,
            "confidence": result.confidence,
            "knowledge_source_ids": result.knowledge_source_ids,
        },
        attempts=llm_result.attempts,
        model_provider=result.model_provider,
        model_name=result.model_name,
        token_prompt=llm_result.token_prompt,
        token_completion=llm_result.token_completion,
    )
    record_step(
        db,
        run,
        step_name="model_diagnosis",
        step_order=1,
        status="SUCCEEDED",
        input_summary={"version_id": version.id, "failed_count": len(failed_results)},
        output_summary={
            "diagnosis_type": result.diagnosis_type,
            "confidence": result.confidence,
        },
        started_at=llm_result.started_at,
        finished_at=llm_result.finished_at,
    )
    return result
