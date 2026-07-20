from pydantic import BaseModel, Field


class SandboxCase(BaseModel):
    test_case_id: str
    name: str
    visibility: str
    input_values: list[int]
    position: int
    expected_values: list[int]
    expected_output_summary: str
    hidden_failure_summary: str | None = None
    error_tag: str
    sort_order: int


class SandboxRunRequest(BaseModel):
    execution_id: str
    language: str = Field(pattern="^CPP$")
    source_code: str
    test_cases: list[SandboxCase]
    timeout_seconds: int = 3
    resource_profile: str = "demo_cpp_v0_1"


class SandboxRunResponse(BaseModel):
    execution_status: str
    compile_exit_code: int | None
    compiler_stdout: str
    compiler_stderr: str
    tests: list[dict]
    failure_reason: str | None = None
    resource_usage: dict = Field(default_factory=dict)

