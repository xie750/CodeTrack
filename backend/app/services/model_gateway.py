from dataclasses import dataclass
import json
from typing import Any

import httpx

from backend.app.core.config import get_settings
from backend.app.models import KnowledgeSource, SubmissionVersion, TestResult


ALLOWED_DIAGNOSIS_TYPES = {
    "LINKED_LIST_HEAD_UPDATE_ERROR",
    "BOUNDARY_CASE_MISSING",
    "COMPILE_ERROR_EXPLANATION",
    "UNKNOWN_OR_LOW_CONFIDENCE",
}

FORBIDDEN_HINT_FRAGMENTS = [
    "ListNode* deleteAt",
    "return head->next",
    "head = head->next",
    "prev->next = prev->next->next",
]


@dataclass(frozen=True)
class GatewayDiagnosis:
    diagnosis_type: str
    confidence: float
    explanation: str
    verified_evidence_ids: list[str]
    knowledge_source_ids: list[str]
    hint: str
    needs_teacher_review: bool
    model_provider: str
    model_name: str


def build_gateway_payload(
    version: SubmissionVersion,
    failed_results: list[TestResult],
    knowledge_sources: list[KnowledgeSource],
) -> dict[str, Any]:
    submission = version.submission
    task = submission.task
    return {
        "prompt_version": "diagnosis_v0.1",
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


def hint_leakage_errors(hint: str) -> list[str]:
    hits = [fragment for fragment in FORBIDDEN_HINT_FRAGMENTS if fragment in hint]
    if len(hint) > 300:
        hits.append("HINT_TOO_LONG")
    return hits


def validate_gateway_output(
    raw: dict[str, Any],
    allowed_evidence_ids: set[str],
    allowed_source_ids: set[str],
    fallback_model_name: str,
) -> GatewayDiagnosis:
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
    leakage = hint_leakage_errors(hint)
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
    version: SubmissionVersion,
    failed_results: list[TestResult],
    knowledge_sources: list[KnowledgeSource],
) -> GatewayDiagnosis | None:
    settings = get_settings()
    if not settings.model_gateway_url and not settings.model_api_key:
        return None

    payload = build_gateway_payload(version, failed_results, knowledge_sources)
    fallback_model_name = settings.model_name or "configured-model"
    try:
        if settings.model_gateway_url:
            response = httpx.post(
                settings.model_gateway_url,
                json=payload,
                timeout=20,
                trust_env=False,
            )
            response.raise_for_status()
            body = response.json()
            raw = body.get("data", body)
        else:
            base_url = settings.model_api_base_url.rstrip("/")
            response = httpx.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {settings.model_api_key}"},
                json=build_openai_chat_payload(payload, fallback_model_name),
                timeout=30,
                trust_env=False,
            )
            response.raise_for_status()
            raw = parse_openai_chat_response(response.json())
            raw.setdefault("model_provider", "OPENAI_COMPATIBLE")
            raw.setdefault("model_name", fallback_model_name)
        return validate_gateway_output(
            raw,
            allowed_evidence_ids={result.id for result in failed_results},
            allowed_source_ids={source.id for source in knowledge_sources},
            fallback_model_name=fallback_model_name,
        )
    except Exception:
        return None
