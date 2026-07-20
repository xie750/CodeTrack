import os

from fastapi import FastAPI

from sandbox.docker_runner import run_linked_list_tests_in_docker
from sandbox.runner import SandboxTestCase, run_linked_list_tests
from sandbox.schemas import SandboxRunRequest, SandboxRunResponse

app = FastAPI(title="CodeTrack Sandbox Service", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/v1/runs", response_model=SandboxRunResponse)
def run_code(payload: SandboxRunRequest) -> SandboxRunResponse:
    cases = [
        SandboxTestCase(
            test_case_id=case.test_case_id,
            name=case.name,
            visibility=case.visibility,
            input_values=case.input_values,
            position=case.position,
            expected_values=case.expected_values,
            expected_output_summary=case.expected_output_summary,
            hidden_failure_summary=case.hidden_failure_summary,
            error_tag=case.error_tag,
            sort_order=case.sort_order,
        )
        for case in payload.test_cases
    ]
    execution_mode = os.getenv("CODETRACK_SANDBOX_EXECUTION_MODE", "local").lower()
    if execution_mode == "docker":
        result = run_linked_list_tests_in_docker(
            payload.source_code,
            cases,
            timeout_seconds=payload.timeout_seconds,
        )
    else:
        result = run_linked_list_tests(
            payload.source_code,
            cases,
            timeout_seconds=payload.timeout_seconds,
        )
    return SandboxRunResponse(
        execution_status=result.status,
        compile_exit_code=result.compile_exit_code,
        compiler_stdout=result.compiler_stdout,
        compiler_stderr=result.compiler_stderr,
        tests=result.tests,
        failure_reason=result.failure_reason,
        resource_usage={"profile": payload.resource_profile, "execution_mode": execution_mode},
    )
