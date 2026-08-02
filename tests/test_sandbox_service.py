from fastapi.testclient import TestClient
import httpx
from pathlib import Path
import subprocess
from types import SimpleNamespace

import pytest

import backend.app.services.piston_client as piston_client
import backend.app.services.sandbox_client as sandbox_client
from backend.app.services.seed import STANDARD_WRONG_CODE
from backend.app.services.programming_specs import STDIO_CPP_SPEC
from backend.app.services.piston_client import PistonRunResult
from sandbox import runner
from sandbox.app import app
from sandbox.docker_runner import docker_run_command


def sandbox_payload() -> dict:
    return {
        "execution_id": "exe_contract_001",
        "language": "CPP",
        "source_code": STANDARD_WRONG_CODE,
        "timeout_seconds": 3,
        "resource_profile": "demo_cpp_v0_1",
        "test_cases": [
            {
                "test_case_id": "tc_delete_head",
                "name": "删除头节点",
                "visibility": "PUBLIC",
                "input_values": [1, 2, 3],
                "position": 0,
                "expected_values": [2, 3],
                "expected_output_summary": "[2,3]",
                "hidden_failure_summary": None,
                "error_tag": "LINKED_LIST_HEAD_UPDATE_ERROR",
                "sort_order": 1,
            }
        ],
    }


def test_sandbox_service_contract_returns_structured_result():
    client = TestClient(app)
    response = client.post("/api/v1/runs", json=sandbox_payload())
    assert response.status_code == 200
    data = response.json()
    if data["execution_status"] == "INFRASTRUCTURE_ERROR" and data.get("failure_reason") == "COMPILER_NOT_FOUND":
        pytest.skip("local g++ is not available in this environment")
    assert data["execution_status"] == "SUCCEEDED"
    assert data["compile_exit_code"] == 0
    assert data["tests"][0]["test_case_id"] == "tc_delete_head"
    assert data["tests"][0]["status"] == "FAILED"
    assert data["tests"][0]["actual_output"] == "[1,2,3]"
    assert data["resource_usage"]["profile"] == "demo_cpp_v0_1"


def test_sandbox_schema_accepts_language_field_for_adapter_contract():
    payload = sandbox_payload()
    payload["language"] = "PYTHON"
    client = TestClient(app)
    response = client.post("/api/v1/runs", json=payload)
    assert response.status_code != 422


def test_sandbox_client_maps_remote_service_failure_to_infrastructure_error(monkeypatch):
    def fake_post(*args, **kwargs):
        raise httpx.ConnectError("sandbox unavailable")

    test_case = SimpleNamespace(
        id="tc_delete_head",
        name="删除头节点",
        visibility="PUBLIC",
        input_data='{"values":[1,2,3],"position":0}',
        expected_output="[2,3]",
        expected_output_summary="[2,3]",
        hidden_failure_summary=None,
        error_tag="LINKED_LIST_HEAD_UPDATE_ERROR",
        sort_order=1,
    )
    monkeypatch.setattr(
        sandbox_client,
        "get_settings",
        lambda: SimpleNamespace(sandbox_service_url="http://sandbox.test"),
    )
    monkeypatch.setattr(sandbox_client.httpx, "post", fake_post)

    result = sandbox_client.run_sandbox_execution(
        execution_id="exe_down_001",
        language="CPP",
        source_code=STANDARD_WRONG_CODE,
        test_cases=[test_case],
        timeout_seconds=3,
    )

    assert result.status == "INFRASTRUCTURE_ERROR"
    assert result.tests == []
    assert result.compile_exit_code is None
    assert result.failure_reason.startswith("SANDBOX_SERVICE_UNAVAILABLE")


def test_sandbox_client_routes_supported_runner_profiles_to_piston(monkeypatch):
    test_case = SimpleNamespace(
        id="tc_two_sum_basic",
        name="basic complement",
        visibility="PUBLIC",
        input_data='{"nums":[2,7,11,15],"target":9}',
        expected_output="[0,1]",
        expected_output_summary="[0,1]",
        hidden_failure_summary=None,
        error_tag="TWO_SUM_BASIC_COMPLEMENT",
        sort_order=1,
    )
    task = SimpleNamespace(id="task_two_sum_001", interface_spec="twoSum(nums, target) -> indices")

    def fake_execute_with_piston(**kwargs):
        assert kwargs["base_url"] == "http://piston.test"
        assert kwargs["execution_id"] == "exe_piston_001"
        return PistonRunResult(
            status="SUCCEEDED",
            compile_exit_code=0,
            compiler_stdout="",
            compiler_stderr="",
            tests=[
                {
                    "test_case_id": "tc_two_sum_basic",
                    "name": "basic complement",
                    "visibility": "PUBLIC",
                    "status": "PASSED",
                    "expected_output_summary": "[0,1]",
                    "actual_output": "[0,1]",
                    "duration_ms": 1,
                    "error_tag": "TWO_SUM_BASIC_COMPLEMENT",
                    "sort_order": 1,
                    "error_message": "",
                }
            ],
            failure_reason=None,
            resource_usage={"profile": "leetcode_two_sum_v1", "piston_ms": 12},
        )

    monkeypatch.setattr(
        sandbox_client,
        "get_settings",
        lambda: SimpleNamespace(piston_base_url="http://piston.test", sandbox_service_url=None),
    )
    monkeypatch.setattr(sandbox_client, "execute_with_piston", fake_execute_with_piston)

    result = sandbox_client.run_sandbox_execution(
        execution_id="exe_piston_001",
        language="PYTHON",
        source_code="class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n",
        test_cases=[test_case],
        timeout_seconds=3,
        task=task,
    )

    assert result.status == "SUCCEEDED"
    assert result.tests[0]["status"] == "PASSED"
    assert result.resource_usage["piston_ms"] == 12


def test_piston_stdio_cpp_runner_maps_stdin_stdout_cases(monkeypatch):
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "compile": {"code": 0, "stdout": "", "stderr": ""},
                "run": {"code": 0, "stdout": "5\n", "stderr": ""},
            }

    def fake_post(url, *, json, timeout, trust_env):
        calls.append({"url": url, "json": json, "timeout": timeout, "trust_env": trust_env})
        return FakeResponse()

    test_case = SimpleNamespace(
        id="tc_stdio_sum",
        name="sum two integers",
        visibility="PUBLIC",
        input_data='{"stdin":"2 3\\n"}',
        expected_output='"5\\n"',
        expected_output_summary="5",
        hidden_failure_summary=None,
        error_tag="STDIO_OUTPUT_MISMATCH",
        sort_order=1,
    )
    monkeypatch.setattr(piston_client.httpx, "post", fake_post)

    result = piston_client.execute_with_piston(
        base_url="http://piston.test",
        execution_id="exe_stdio_001",
        language="CPP",
        spec=STDIO_CPP_SPEC,
        source_code="#include <iostream>\nint main(){ int a,b; std::cin>>a>>b; std::cout << a + b << '\\n'; }",
        test_cases=[test_case],
        timeout_seconds=3,
    )

    assert calls[0]["url"] == "http://piston.test/api/v2/execute"
    assert calls[0]["json"]["language"] == "c++"
    assert calls[0]["json"]["stdin"] == "2 3\n"
    assert calls[0]["json"]["files"][0]["name"] == "main.cpp"
    assert result.status == "SUCCEEDED"
    assert result.tests[0]["status"] == "PASSED"


def test_local_runner_truncates_large_compile_output(monkeypatch):
    def fake_run(*args, **kwargs):
        return subprocess.CompletedProcess(args[0], 1, stdout="O" * 9000, stderr="E" * 9000)

    monkeypatch.setattr(runner.subprocess, "run", fake_run)
    result = runner.run_linked_list_tests(
        "ListNode* deleteAt(ListNode* head, int position) { return head; }",
        [runner.SandboxTestCase(
            test_case_id="tc_delete_head",
            name="删除头节点",
            visibility="PUBLIC",
            input_values=[1, 2, 3],
            position=0,
            expected_values=[2, 3],
            expected_output_summary="[2,3]",
            hidden_failure_summary=None,
            error_tag="LINKED_LIST_HEAD_UPDATE_ERROR",
            sort_order=1,
        )],
        timeout_seconds=3,
    )

    assert result.status == "COMPILE_ERROR"
    assert len(result.compiler_stdout) == 4000
    assert len(result.compiler_stderr) == 4000


def test_docker_run_command_contains_required_isolation_flags():
    command = docker_run_command(Path("/tmp/codetrack_case"), "codetrack-sandbox-runner:0.1", 3)
    joined = " ".join(command)

    assert command[:3] == ["docker", "run", "--rm"]
    assert "--network none" in joined
    assert "--user 10001:10001" in joined
    assert "--read-only" in command
    assert "--cap-drop ALL" in joined
    assert "--security-opt no-new-privileges" in joined
    assert "--pids-limit 64" in joined
    assert "--memory 256m" in joined
    assert "--cpus 1.0" in joined
    assert "/tmp:rw,nosuid,nodev,size=64m" in joined
    assert "/workspace:ro" in joined
