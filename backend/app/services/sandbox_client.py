import json
from dataclasses import dataclass
from typing import Any

import httpx

from backend.app.core.config import get_settings
from backend.app.models import TestCase
from sandbox.runner import SandboxResult, case_from_record, run_linked_list_tests


@dataclass(frozen=True)
class SandboxClientResult:
    status: str
    compile_exit_code: int | None
    compiler_stdout: str
    compiler_stderr: str
    tests: list[dict[str, Any]]
    failure_reason: str | None
    resource_usage: dict[str, Any]


def serialize_case(record: TestCase) -> dict[str, Any]:
    input_data = json.loads(record.input_data)
    return {
        "test_case_id": record.id,
        "name": record.name,
        "visibility": record.visibility,
        "input_values": input_data["values"],
        "position": input_data["position"],
        "expected_values": json.loads(record.expected_output),
        "expected_output_summary": record.expected_output_summary,
        "hidden_failure_summary": record.hidden_failure_summary,
        "error_tag": record.error_tag,
        "sort_order": record.sort_order,
    }


def _from_runner_result(result: SandboxResult, resource_usage: dict[str, Any]) -> SandboxClientResult:
    return SandboxClientResult(
        status=result.status,
        compile_exit_code=result.compile_exit_code,
        compiler_stdout=result.compiler_stdout,
        compiler_stderr=result.compiler_stderr,
        tests=result.tests,
        failure_reason=result.failure_reason,
        resource_usage=resource_usage,
    )


def run_sandbox_execution(
    execution_id: str,
    language: str,
    source_code: str,
    test_cases: list[TestCase],
    timeout_seconds: int,
) -> SandboxClientResult:
    settings = get_settings()
    if settings.sandbox_service_url:
        try:
            response = httpx.post(
                f"{settings.sandbox_service_url.rstrip('/')}/api/v1/runs",
                json={
                    "execution_id": execution_id,
                    "language": language,
                    "source_code": source_code,
                    "test_cases": [serialize_case(case) for case in test_cases],
                    "timeout_seconds": timeout_seconds,
                    "resource_profile": "demo_cpp_v0_1",
                },
                timeout=max(20, timeout_seconds + 15),
                trust_env=False,
            )
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            return SandboxClientResult(
                status="INFRASTRUCTURE_ERROR",
                compile_exit_code=None,
                compiler_stdout="",
                compiler_stderr="",
                tests=[],
                failure_reason=f"SANDBOX_SERVICE_UNAVAILABLE: {type(exc).__name__}",
                resource_usage={"profile": "demo_cpp_v0_1", "sandbox_service_url": settings.sandbox_service_url},
            )
        return SandboxClientResult(
            status=data["execution_status"],
            compile_exit_code=data["compile_exit_code"],
            compiler_stdout=data["compiler_stdout"],
            compiler_stderr=data["compiler_stderr"],
            tests=data["tests"],
            failure_reason=data.get("failure_reason"),
            resource_usage=data.get("resource_usage", {}),
        )

    result = run_linked_list_tests(
        source_code,
        [case_from_record(case) for case in test_cases],
        timeout_seconds=timeout_seconds,
    )
    return _from_runner_result(result, {"profile": "local_dev_fallback"})
