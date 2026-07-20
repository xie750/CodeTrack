from fastapi.testclient import TestClient
import httpx
from pathlib import Path
import subprocess
from types import SimpleNamespace

import backend.app.services.sandbox_client as sandbox_client
from backend.app.services.seed import STANDARD_WRONG_CODE
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
    assert data["execution_status"] == "SUCCEEDED"
    assert data["compile_exit_code"] == 0
    assert data["tests"][0]["test_case_id"] == "tc_delete_head"
    assert data["tests"][0]["status"] == "FAILED"
    assert data["tests"][0]["actual_output"] == "[1,2,3]"
    assert data["resource_usage"]["profile"] == "demo_cpp_v0_1"


def test_sandbox_schema_rejects_non_cpp_language():
    payload = sandbox_payload()
    payload["language"] = "PYTHON"
    client = TestClient(app)
    response = client.post("/api/v1/runs", json=payload)
    assert response.status_code == 422


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
