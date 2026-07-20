import time
from hashlib import sha256
from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.app.core.database import SessionLocal
from backend.app.models import CapabilityEvidence, CapabilityState, Course, Enrollment, KnowledgeSource, Task, User
from backend.app.main import app
from backend.app.services.seed import STANDARD_CORRECT_CODE, STANDARD_WRONG_CODE
from backend.app.services.sandbox_client import SandboxClientResult
import backend.app.services.model_gateway as model_gateway
import backend.app.services.submissions as submissions_service

def client() -> TestClient:
    return TestClient(app)


def ensure_student_enrolled(user_id: str, display_name: str) -> None:
    db = SessionLocal()
    try:
        db.merge(User(id=user_id, display_name=display_name, role="STUDENT", status="ACTIVE"))
        if (
            db.query(Enrollment)
            .filter(Enrollment.course_id == "course_ds_001", Enrollment.user_id == user_id)
            .one_or_none()
            is None
        ):
            db.add(Enrollment(course_id="course_ds_001", user_id=user_id, role="STUDENT"))
        db.commit()
    finally:
        db.close()


def wait_for_results(c: TestClient, version_id: str, timeout_seconds: int = 45):
    deadline = time.time() + timeout_seconds
    last = None
    while time.time() < deadline:
        last = c.get(f"/api/v1/submission-versions/{version_id}/results")
        assert last.status_code == 200
        data = last.json()["data"]
        if data["execution"]["status"] in {
            "SUCCEEDED",
            "COMPILE_ERROR",
            "RUNTIME_ERROR",
            "TIMEOUT",
            "RESOURCE_LIMIT",
            "SECURITY_REJECTED",
            "INFRASTRUCTURE_ERROR",
        }:
            return last
        time.sleep(0.5)
    raise AssertionError(f"execution did not finish: {last.json() if last is not None else 'no response'}")


def test_wrong_head_update_fails_head_case_and_keeps_hidden_details_masked():
    with client() as c:
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "wrong-head-001"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert response.status_code == 202
        payload = response.json()["data"]

        results = wait_for_results(c, payload["version_id"])
        assert results.status_code == 200
        data = results.json()["data"]
        by_id = {item["test_case_id"]: item for item in data["tests"]}
        assert by_id["tc_delete_middle"]["status"] == "PASSED"
        assert by_id["tc_delete_head"]["status"] == "FAILED"
        assert by_id["tc_delete_head"]["actual_output"] == "[1,2,3]"
        assert by_id["tc_delete_tail"]["visibility"] == "HIDDEN"
        assert by_id["tc_delete_tail"]["actual_output"] == "已通过"
        assert data["submission_status"] == "FEEDBACK_READY"
        assert data["diagnosis"]["status"] == "READY"
        assert data["diagnosis"]["needs_teacher_review"] is True

        diagnosis = c.get(f"/api/v1/submission-versions/{payload['version_id']}/diagnosis")
        assert diagnosis.status_code == 200
        diagnosis_data = diagnosis.json()["data"]
        assert diagnosis_data["diagnosis_type"] == "LINKED_LIST_HEAD_UPDATE_ERROR"
        assert "kb_head_node_delete" in diagnosis_data["knowledge_source_ids"]
        source_by_id = {source["source_id"]: source for source in diagnosis_data["knowledge_sources"]}
        assert source_by_id["kb_head_node_delete"]["title"]
        assert source_by_id["kb_head_node_delete"]["summary"]
        assert diagnosis_data["verified_evidence_ids"]
        assert diagnosis_data["model_provider"] == "RULE_FALLBACK"
        assert "return head->next" not in diagnosis_data["hint"]

        hint = c.post(
            f"/api/v1/diagnoses/{diagnosis_data['diagnosis_id']}/hints",
            json={"requested_level": 2},
        )
        assert hint.status_code == 200
        hint_data = hint.json()["data"]
        assert hint_data["level"] == 2
        assert "ListNode* deleteAt" not in hint_data["content"]

        repeated = c.post(
            f"/api/v1/diagnoses/{diagnosis_data['diagnosis_id']}/hints",
            json={"requested_level": 2},
        )
        assert repeated.status_code == 200
        assert repeated.json()["data"]["hint_id"] == hint_data["hint_id"]

        timeline = c.get(
            f"/api/v1/teacher/submissions/{payload['submission_id']}/timeline",
            headers={"X-Demo-User-Id": "user_teacher_001"},
        )
        assert timeline.status_code == 200
        event_types = {event["type"] for event in timeline.json()["data"]["events"]}
        assert "DIAGNOSIS_READY" in event_types
        assert "HINT_VIEWED" in event_types


def test_configured_model_gateway_result_is_used_when_schema_is_valid(monkeypatch):
    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            evidence_id = self.payload["tool_evidence"][0]["test_result_id"]
            return {
                "data": {
                    "diagnosis_type": "LINKED_LIST_HEAD_UPDATE_ERROR",
                    "confidence": 0.91,
                    "explanation": "模型网关根据头节点失败测试和课程资料判断链表起点没有正确变化。",
                    "verified_evidence_ids": [evidence_id],
                    "knowledge_source_ids": ["kb_head_node_delete"],
                    "hint": "请从删除第一个节点后的链表起点是否变化这个方向排查。",
                    "needs_teacher_review": False,
                    "model_provider": "TEST_GATEWAY",
                    "model_name": "test-model",
                }
            }

    def fake_post(url, json, timeout, trust_env):
        assert url == "http://model.test/diagnose"
        assert trust_env is False
        assert json["tool_evidence"]
        assert json["knowledge_sources"]
        return FakeResponse(json)

    monkeypatch.setattr(
        model_gateway,
        "get_settings",
        lambda: SimpleNamespace(model_gateway_url="http://model.test/diagnose", model_name="test-model"),
    )
    monkeypatch.setattr(model_gateway.httpx, "post", fake_post)

    with client() as c:
        ensure_student_enrolled("user_student_model_gateway", "模型网关学生")
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "model-gateway-001", "X-Demo-User-Id": "user_student_model_gateway"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert response.status_code == 202
        payload = response.json()["data"]
        wait_for_results(c, payload["version_id"])

        diagnosis = c.get(
            f"/api/v1/submission-versions/{payload['version_id']}/diagnosis",
            headers={"X-Demo-User-Id": "user_student_model_gateway"},
        )
        assert diagnosis.status_code == 200
        data = diagnosis.json()["data"]
        assert data["model_provider"] == "TEST_GATEWAY"
        assert data["model_name"] == "test-model"
        assert data["needs_teacher_review"] is False
        assert data["hint"] == "请从删除第一个节点后的链表起点是否变化这个方向排查。"


def test_low_confidence_model_gateway_requires_review_without_hint(monkeypatch):
    class FakeResponse:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            evidence_id = self.payload["tool_evidence"][0]["test_result_id"]
            return {
                "data": {
                    "diagnosis_type": "UNKNOWN_OR_LOW_CONFIDENCE",
                    "confidence": 0.42,
                    "explanation": "模型只能给出低置信度方向，需要教师复核。",
                    "verified_evidence_ids": [evidence_id],
                    "knowledge_source_ids": ["kb_boundary_test_reasoning"],
                    "hint": "请先根据失败测试复核边界分支，再决定修改方向。",
                    "model_provider": "TEST_GATEWAY",
                    "model_name": "test-model",
                }
            }

    def fake_post(url, json, timeout, trust_env):
        assert json["tool_evidence"]
        return FakeResponse(json)

    monkeypatch.setattr(
        model_gateway,
        "get_settings",
        lambda: SimpleNamespace(model_gateway_url="http://model.test/diagnose", model_name="test-model"),
    )
    monkeypatch.setattr(model_gateway.httpx, "post", fake_post)

    with client() as c:
        ensure_student_enrolled("user_student_model_low_confidence", "低置信模型学生")
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={
                "Idempotency-Key": "model-low-confidence-001",
                "X-Demo-User-Id": "user_student_model_low_confidence",
            },
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert response.status_code == 202
        payload = response.json()["data"]
        results = wait_for_results(c, payload["version_id"])
        result_data = results.json()["data"]
        assert result_data["submission_status"] == "REVIEW_REQUIRED"
        assert result_data["diagnosis"]["status"] == "LOW_CONFIDENCE"
        assert result_data["hint_access"]["available_levels"] == []

        diagnosis = c.get(
            f"/api/v1/submission-versions/{payload['version_id']}/diagnosis",
            headers={"X-Demo-User-Id": "user_student_model_low_confidence"},
        )
        data = diagnosis.json()["data"]
        assert data["status"] == "LOW_CONFIDENCE"
        assert data["needs_teacher_review"] is True
        assert data["confidence"] == 0.42

        hint = c.post(
            f"/api/v1/diagnoses/{data['diagnosis_id']}/hints",
            headers={"X-Demo-User-Id": "user_student_model_low_confidence"},
            json={"requested_level": 1},
        )
        assert hint.status_code == 409
        assert hint.json()["error"]["code"] == "HINT_DIAGNOSIS_NOT_READY"


def test_correct_code_passes_and_creates_capability_evidence():
    with client() as c:
        ensure_student_enrolled("user_student_correct_flow", "正确代码学生")
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "correct-flow-001", "X-Demo-User-Id": "user_student_correct_flow"},
            json={"language": "CPP", "source_code": STANDARD_CORRECT_CODE},
        )
        assert response.status_code == 202
        payload = response.json()["data"]

        results = wait_for_results(c, payload["version_id"])
        assert results.status_code == 200
        data = results.json()["data"]
        assert data["submission_status"] == "PASSED"
        assert all(item["status"] == "PASSED" for item in data["tests"])

        summary = c.get(
            f"/api/v1/submissions/{payload['submission_id']}/summary",
            headers={"X-Demo-User-Id": "user_student_correct_flow"},
        )
        assert summary.status_code == 200
        evidence = summary.json()["data"]["capability_evidence"]
        assert evidence["capability_code"] == "LINKED_LIST_BOUNDARY_HANDLING"
        assert evidence["strength"] in {"STRONG", "MODERATE", "WEAK"}
        assert summary.json()["data"]["total_duration_ms"] is not None
        assert summary.json()["data"]["total_duration_ms"] >= 0
        assert summary.json()["data"]["next_step_suggestion"]


def test_independent_first_pass_creates_strong_capability_evidence():
    with client() as c:
        db = SessionLocal()
        try:
            db.merge(User(id="user_student_independent", display_name="独立通过学生", role="STUDENT", status="ACTIVE"))
            if (
                db.query(Enrollment)
                .filter(Enrollment.course_id == "course_ds_001", Enrollment.user_id == "user_student_independent")
                .one_or_none()
                is None
            ):
                db.add(Enrollment(course_id="course_ds_001", user_id="user_student_independent", role="STUDENT"))
            db.commit()
        finally:
            db.close()

        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "independent-pass-001", "X-Demo-User-Id": "user_student_independent"},
            json={"language": "CPP", "source_code": STANDARD_CORRECT_CODE},
        )
        assert response.status_code == 202
        payload = response.json()["data"]
        wait_for_results(c, payload["version_id"])

        summary = c.get(
            f"/api/v1/submissions/{payload['submission_id']}/summary",
            headers={"X-Demo-User-Id": "user_student_independent"},
        )
        evidence = summary.json()["data"]["capability_evidence"]
        assert evidence["strength"] == "STRONG"
        assert evidence["evidence_type"] == "INDEPENDENT_PASS"
        assert "变体练习" in summary.json()["data"]["next_step_suggestion"]

    db = SessionLocal()
    try:
        state = (
            db.query(CapabilityState)
            .filter(
                CapabilityState.student_id == "user_student_independent",
                CapabilityState.capability_id == "cap_linked_list_boundary",
            )
            .one()
        )
        assert state.state == "MASTERED"
        assert "首次独立通过" in state.reason_summary
    finally:
        db.close()


def test_level_one_hint_then_pass_creates_moderate_capability_evidence():
    with client() as c:
        db = SessionLocal()
        try:
            db.merge(User(id="user_student_level1", display_name="一级提示学生", role="STUDENT", status="ACTIVE"))
            if (
                db.query(Enrollment)
                .filter(Enrollment.course_id == "course_ds_001", Enrollment.user_id == "user_student_level1")
                .one_or_none()
                is None
            ):
                db.add(Enrollment(course_id="course_ds_001", user_id="user_student_level1", role="STUDENT"))
            db.commit()
        finally:
            db.close()

        first = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "level1-wrong-001", "X-Demo-User-Id": "user_student_level1"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert first.status_code == 202
        first_payload = first.json()["data"]
        first_results = wait_for_results(c, first_payload["version_id"])
        assert first_results.json()["data"]["hint_access"]["highest_viewed_level"] == 1

        second = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "level1-correct-001", "X-Demo-User-Id": "user_student_level1"},
            json={"language": "CPP", "source_code": STANDARD_CORRECT_CODE},
        )
        assert second.status_code == 202
        second_payload = second.json()["data"]
        wait_for_results(c, second_payload["version_id"])

        summary = c.get(
            f"/api/v1/submissions/{second_payload['submission_id']}/summary",
            headers={"X-Demo-User-Id": "user_student_level1"},
        )
        evidence = summary.json()["data"]["capability_evidence"]
        assert evidence["strength"] == "MODERATE"
        assert evidence["evidence_type"] == "PASSED_AFTER_LEVEL_1_HINT"
        assert "独立复述" in summary.json()["data"]["next_step_suggestion"]

        teacher_list = c.get(
            "/api/v1/teacher/courses/course_ds_001/submissions",
            headers={"X-Demo-User-Id": "user_teacher_001"},
        )
        assert teacher_list.status_code == 200
        teacher_row = next(
            item for item in teacher_list.json()["data"] if item["submission_id"] == second_payload["submission_id"]
        )
        assert teacher_row["highest_hint_level"] == summary.json()["data"]["highest_hint_level"] == 1
        assert teacher_row["version_count"] == summary.json()["data"]["version_count"] == 2

        timeline = c.get(
            f"/api/v1/teacher/submissions/{second_payload['submission_id']}/timeline",
            headers={"X-Demo-User-Id": "user_teacher_001"},
        )
        assert timeline.status_code == 200
        event_types = {event["type"] for event in timeline.json()["data"]["events"]}
        assert {
            "VERSION_SUBMITTED",
            "EXECUTION_FINISHED",
            "TEST_RESULT",
            "DIAGNOSIS_READY",
            "HINT_VIEWED",
            "CAPABILITY_EVIDENCE_CREATED",
        }.issubset(event_types)


def test_repeated_boundary_failure_creates_negative_capability_evidence():
    with client() as c:
        ensure_student_enrolled("user_student_repeated_boundary", "重复边界失败学生")

        first = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "negative-boundary-001", "X-Demo-User-Id": "user_student_repeated_boundary"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert first.status_code == 202
        first_payload = first.json()["data"]
        wait_for_results(c, first_payload["version_id"])

        second = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "negative-boundary-002", "X-Demo-User-Id": "user_student_repeated_boundary"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert second.status_code == 202
        second_payload = second.json()["data"]
        wait_for_results(c, second_payload["version_id"])

        summary = c.get(
            f"/api/v1/submissions/{second_payload['submission_id']}/summary",
            headers={"X-Demo-User-Id": "user_student_repeated_boundary"},
        )
        assert summary.status_code == 200
        evidence = summary.json()["data"]["capability_evidence"]
        assert evidence["strength"] == "NEGATIVE"
        assert evidence["evidence_type"] == "REPEATED_BOUNDARY_FAILURE"
        assert "重复失败" in summary.json()["data"]["next_step_suggestion"]

        timeline = c.get(
            f"/api/v1/teacher/submissions/{second_payload['submission_id']}/timeline",
            headers={"X-Demo-User-Id": "user_teacher_001"},
        )
        assert timeline.status_code == 200
        event_types = {event["type"] for event in timeline.json()["data"]["events"]}
        assert "CAPABILITY_EVIDENCE_CREATED" in event_types

    db = SessionLocal()
    try:
        evidence = (
            db.query(CapabilityEvidence)
            .filter(
                CapabilityEvidence.student_id == "user_student_repeated_boundary",
                CapabilityEvidence.strength == "NEGATIVE",
            )
            .one()
        )
        assert "LINKED_LIST_HEAD_UPDATE_ERROR" in evidence.explanation
        state = (
            db.query(CapabilityState)
            .filter(
                CapabilityState.student_id == "user_student_repeated_boundary",
                CapabilityState.capability_id == "cap_linked_list_boundary",
            )
            .one()
        )
        assert state.state == "NEEDS_SUPPORT"
        assert "负向能力证据" in state.reason_summary
    finally:
        db.close()


def test_version_history_keeps_source_code_and_hash_immutable():
    with client() as c:
        db = SessionLocal()
        try:
            db.merge(User(id="user_student_history", display_name="版本历史学生", role="STUDENT", status="ACTIVE"))
            if (
                db.query(Enrollment)
                .filter(Enrollment.course_id == "course_ds_001", Enrollment.user_id == "user_student_history")
                .one_or_none()
                is None
            ):
                db.add(Enrollment(course_id="course_ds_001", user_id="user_student_history", role="STUDENT"))
            db.commit()
        finally:
            db.close()

        first = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "history-wrong-001", "X-Demo-User-Id": "user_student_history"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert first.status_code == 202
        first_payload = first.json()["data"]
        wait_for_results(c, first_payload["version_id"])

        second = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "history-correct-001", "X-Demo-User-Id": "user_student_history"},
            json={"language": "CPP", "source_code": STANDARD_CORRECT_CODE},
        )
        assert second.status_code == 202
        second_payload = second.json()["data"]
        wait_for_results(c, second_payload["version_id"])

        versions = c.get(
            f"/api/v1/submissions/{first_payload['submission_id']}/versions",
            headers={"X-Demo-User-Id": "user_student_history"},
        )
        assert versions.status_code == 200
        by_no = {item["version_no"]: item for item in versions.json()["data"]}
        assert by_no[1]["version_id"] == first_payload["version_id"]
        assert by_no[1]["source_code"] == STANDARD_WRONG_CODE
        assert by_no[1]["code_hash"] == sha256(STANDARD_WRONG_CODE.encode("utf-8")).hexdigest()
        assert by_no[2]["version_id"] == second_payload["version_id"]
        assert by_no[2]["source_code"] == STANDARD_CORRECT_CODE
        assert by_no[2]["code_hash"] == sha256(STANDARD_CORRECT_CODE.encode("utf-8")).hexdigest()
        assert by_no[1]["source_code"] != by_no[2]["source_code"]


def test_hint_level_rules_prevent_skipping_and_level_three_avoids_full_function():
    with client() as c:
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "hint-levels-001", "X-Demo-User-Id": "user_student_002"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert response.status_code == 202
        payload = response.json()["data"]
        wait_for_results(c, payload["version_id"])
        diagnosis = c.get(
            f"/api/v1/submission-versions/{payload['version_id']}/diagnosis",
            headers={"X-Demo-User-Id": "user_student_002"},
        ).json()["data"]

        skipped = c.post(
            f"/api/v1/diagnoses/{diagnosis['diagnosis_id']}/hints",
            headers={"X-Demo-User-Id": "user_student_002"},
            json={"requested_level": 3},
        )
        assert skipped.status_code == 409
        assert skipped.json()["error"]["code"] == "HINT_LEVEL_NOT_AVAILABLE"

        level2 = c.post(
            f"/api/v1/diagnoses/{diagnosis['diagnosis_id']}/hints",
            headers={"X-Demo-User-Id": "user_student_002"},
            json={"requested_level": 2},
        )
        assert level2.status_code == 200

        level3 = c.post(
            f"/api/v1/diagnoses/{diagnosis['diagnosis_id']}/hints",
            headers={"X-Demo-User-Id": "user_student_002"},
            json={"requested_level": 3},
        )
        assert level3.status_code == 200
        content = level3.json()["data"]["content"]
        assert "ListNode* deleteAt" not in content
        assert "return head->next" not in content


def test_empty_code_returns_documented_error_shape():
    with client() as c:
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "empty-001"},
            json={"language": "CPP", "source_code": "  "},
        )
        assert response.status_code == 400
        body = response.json()
        assert body["error"]["code"] == "SUBMISSION_CODE_EMPTY"
        assert "request_id" in body["meta"]


def test_language_and_code_size_validation_are_stable():
    with client() as c:
        unsupported = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "bad-language-001"},
            json={"language": "PYTHON", "source_code": "print('nope')"},
        )
        assert unsupported.status_code == 400
        assert unsupported.json()["error"]["code"] == "SUBMISSION_LANGUAGE_NOT_SUPPORTED"

        too_large = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "too-large-001"},
            json={"language": "CPP", "source_code": "x" * (20 * 1024 + 1)},
        )
        assert too_large.status_code == 400
        assert too_large.json()["error"]["code"] == "SUBMISSION_CODE_TOO_LARGE"


def test_compile_error_is_tool_fact_not_ai_result():
    with client() as c:
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "compile-error-001"},
            json={"language": "CPP", "source_code": "ListNode* deleteAt(ListNode* head, int position) { return head }"},
        )
        assert response.status_code == 202
        payload = response.json()["data"]
        results = wait_for_results(c, payload["version_id"])
        assert results.status_code == 200
        data = results.json()["data"]
        assert data["execution"]["status"] == "COMPILE_ERROR"
        assert data["submission_status"] == "FAILED"
        assert data["diagnosis"]["status"] == "NOT_STARTED"


def test_runtime_timeout_is_terminated_and_reported():
    timeout_code = """
ListNode* deleteAt(ListNode* head, int position) {
    volatile int marker = 0;
    while (true) {
        marker++;
    }
    return head;
}
"""
    with client() as c:
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "timeout-001"},
            json={"language": "CPP", "source_code": timeout_code},
        )
        assert response.status_code == 202
        payload = response.json()["data"]
        results = wait_for_results(c, payload["version_id"])
        assert results.status_code == 200
        data = results.json()["data"]
        assert data["execution"]["status"] == "TIMEOUT"
        assert data["submission_status"] == "FAILED"


def test_sandbox_service_failure_finishes_as_infrastructure_error(monkeypatch):
    def fake_sandbox_failure(*args, **kwargs):
        return SandboxClientResult(
            status="INFRASTRUCTURE_ERROR",
            compile_exit_code=None,
            compiler_stdout="",
            compiler_stderr="",
            tests=[],
            failure_reason="SANDBOX_SERVICE_UNAVAILABLE: ConnectError",
            resource_usage={"profile": "demo_cpp_v0_1"},
        )

    monkeypatch.setattr(submissions_service, "run_sandbox_execution", fake_sandbox_failure)

    with client() as c:
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "sandbox-down-001", "X-Demo-User-Id": "user_student_002"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert response.status_code == 202
        payload = response.json()["data"]
        results = wait_for_results(c, payload["version_id"])
        data = results.json()["data"]
        assert data["execution"]["status"] == "INFRASTRUCTURE_ERROR"
        assert data["execution"]["compiler_stderr"] == ""
        assert data["submission_status"] == "FAILED"
        assert data["diagnosis"]["status"] == "NOT_STARTED"


def test_rag_without_knowledge_sources_requires_review_without_hint():
    with client() as c:
        db = SessionLocal()
        sources = [
            {
                "id": source.id,
                "course_id": source.course_id,
                "title": source.title,
                "summary": source.summary,
                "source_type": source.source_type,
                "version": source.version,
                "authority_level": source.authority_level,
                "student_visible": source.student_visible,
            }
            for source in db.query(KnowledgeSource).all()
        ]
        try:
            db.query(KnowledgeSource).delete()
            db.commit()

            response = c.post(
                "/api/v1/tasks/task_linked_list_delete_001/submissions",
                headers={"Idempotency-Key": "rag-empty-001", "X-Demo-User-Id": "user_student_002"},
                json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
            )
            assert response.status_code == 202
            payload = response.json()["data"]
            results = wait_for_results(c, payload["version_id"])
            data = results.json()["data"]
            assert data["submission_status"] == "REVIEW_REQUIRED"
            assert data["diagnosis"]["status"] == "REVIEW_REQUIRED"
            assert data["hint_access"]["available_levels"] == []

            diagnosis = c.get(
                f"/api/v1/submission-versions/{payload['version_id']}/diagnosis",
                headers={"X-Demo-User-Id": "user_student_002"},
            )
            assert diagnosis.status_code == 200
            diagnosis_data = diagnosis.json()["data"]
            assert diagnosis_data["knowledge_source_ids"] == []
            assert diagnosis_data["needs_teacher_review"] is True

            hint = c.post(
                f"/api/v1/diagnoses/{diagnosis_data['diagnosis_id']}/hints",
                headers={"X-Demo-User-Id": "user_student_002"},
                json={"requested_level": 1},
            )
            assert hint.status_code == 409
            assert hint.json()["error"]["code"] == "HINT_DIAGNOSIS_NOT_READY"
        finally:
            for source in sources:
                db.merge(KnowledgeSource(**source))
            db.commit()
            db.close()


def test_security_rejection_forbidden_main_requires_review():
    unsafe_code = """
int main() { return 0; }
ListNode* deleteAt(ListNode* head, int position) {
    return head;
}
"""
    with client() as c:
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "security-001"},
            json={"language": "CPP", "source_code": unsafe_code},
        )
        assert response.status_code == 202
        payload = response.json()["data"]
        results = wait_for_results(c, payload["version_id"])
        assert results.status_code == 200
        data = results.json()["data"]
        assert data["execution"]["status"] == "SECURITY_REJECTED"
        assert data["submission_status"] == "REVIEW_REQUIRED"


def test_authentication_and_role_checks_are_enforced():
    with client() as c:
        missing_user = c.get("/api/v1/tasks", headers={"X-Demo-User-Id": "missing_user"})
        assert missing_user.status_code == 401
        teacher_submit = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "teacher-submit-001", "X-Demo-User-Id": "user_teacher_001"},
            json={"language": "CPP", "source_code": STANDARD_CORRECT_CODE},
        )
        assert teacher_submit.status_code == 403


def test_student_without_course_membership_is_forbidden():
    db = SessionLocal()
    try:
        db.merge(User(id="user_student_outside", display_name="旁听学生", role="STUDENT", status="ACTIVE"))
        db.commit()
    finally:
        db.close()

    with client() as c:
        task_detail = c.get(
            "/api/v1/tasks/task_linked_list_delete_001",
            headers={"X-Demo-User-Id": "user_student_outside"},
        )
        assert task_detail.status_code == 403
        assert task_detail.json()["error"]["code"] == "AUTH_FORBIDDEN"

        submit = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "outside-submit-001", "X-Demo-User-Id": "user_student_outside"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert submit.status_code == 403
        assert submit.json()["error"]["code"] == "AUTH_FORBIDDEN"


def test_task_list_filters_out_courses_without_membership():
    with client() as c:
        db = SessionLocal()
        try:
            db.merge(
                Course(
                    id="course_other_001",
                    name="其他课程",
                    description="不属于演示学生的课程",
                    term="2026-demo",
                    status="ACTIVE",
                    owner_teacher_id="user_teacher_001",
                )
            )
            db.merge(
                Task(
                    id="task_other_course_001",
                    course_id="course_other_001",
                    title="其他课程任务",
                    description="不应出现在当前学生任务列表中",
                    language="CPP",
                    interface_spec="ListNode* deleteAt(ListNode* head, int position);",
                    learning_objectives="[]",
                    capability_ids="[]",
                    status="OPEN",
                )
            )
            db.commit()

            response = c.get("/api/v1/tasks", headers={"X-Demo-User-Id": "user_student_001"})
            assert response.status_code == 200
            task_ids = {item["task_id"] for item in response.json()["data"]}
            assert "task_linked_list_delete_001" in task_ids
            assert "task_other_course_001" not in task_ids
        finally:
            task = db.get(Task, "task_other_course_001")
            if task:
                db.delete(task)
            course = db.get(Course, "course_other_001")
            if course:
                db.delete(course)
            db.commit()
            db.close()


def test_closed_task_rejects_submission_without_creating_version():
    with client() as c:
        db = SessionLocal()
        try:
            task = db.get(Task, "task_linked_list_delete_001")
            task.status = "CLOSED"
            db.commit()

            response = c.post(
                "/api/v1/tasks/task_linked_list_delete_001/submissions",
                headers={"Idempotency-Key": "closed-task-001", "X-Demo-User-Id": "user_student_002"},
                json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
            )
            assert response.status_code == 422
            assert response.json()["error"]["code"] == "TASK_NOT_OPEN"
        finally:
            task = db.get(Task, "task_linked_list_delete_001")
            if task:
                task.status = "OPEN"
            db.commit()
            db.close()


def test_idempotency_key_returns_same_version_and_execution():
    with client() as c:
        first = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "same-key-001"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        second = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "same-key-001"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert first.status_code == 202
        assert second.status_code == 202
        assert first.json()["data"]["version_id"] == second.json()["data"]["version_id"]
        assert first.json()["data"]["execution_id"] == second.json()["data"]["execution_id"]


def test_idempotency_key_does_not_create_extra_versions():
    with client() as c:
        ensure_student_enrolled("user_student_idempotent", "幂等学生")
        first = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "same-key-count-001", "X-Demo-User-Id": "user_student_idempotent"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        second = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "same-key-count-001", "X-Demo-User-Id": "user_student_idempotent"},
            json={"language": "CPP", "source_code": STANDARD_CORRECT_CODE},
        )
        assert first.status_code == 202
        assert second.status_code == 202
        first_payload = first.json()["data"]
        second_payload = second.json()["data"]
        assert first_payload["version_id"] == second_payload["version_id"]
        wait_for_results(c, first_payload["version_id"])

        versions = c.get(
            f"/api/v1/submissions/{first_payload['submission_id']}/versions",
            headers={"X-Demo-User-Id": "user_student_idempotent"},
        )
        assert versions.status_code == 200
        data = versions.json()["data"]
        assert len(data) == 1
        assert data[0]["version_no"] == 1
        assert data[0]["source_code"] == STANDARD_WRONG_CODE


def test_resubmission_generates_new_diagnosis_and_keeps_old_diagnosis():
    with client() as c:
        ensure_student_enrolled("user_student_rediagnosis", "重新诊断学生")
        first = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "rediag-wrong-001", "X-Demo-User-Id": "user_student_rediagnosis"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert first.status_code == 202
        first_payload = first.json()["data"]
        wait_for_results(c, first_payload["version_id"])
        first_diagnosis = c.get(
            f"/api/v1/submission-versions/{first_payload['version_id']}/diagnosis",
            headers={"X-Demo-User-Id": "user_student_rediagnosis"},
        )
        assert first_diagnosis.status_code == 200
        first_diagnosis_data = first_diagnosis.json()["data"]

        second = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "rediag-wrong-002", "X-Demo-User-Id": "user_student_rediagnosis"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert second.status_code == 202
        second_payload = second.json()["data"]
        assert second_payload["version_no"] == 2
        assert second_payload["version_id"] != first_payload["version_id"]
        wait_for_results(c, second_payload["version_id"])
        second_diagnosis = c.get(
            f"/api/v1/submission-versions/{second_payload['version_id']}/diagnosis",
            headers={"X-Demo-User-Id": "user_student_rediagnosis"},
        )
        assert second_diagnosis.status_code == 200
        second_diagnosis_data = second_diagnosis.json()["data"]
        assert second_diagnosis_data["diagnosis_id"] != first_diagnosis_data["diagnosis_id"]
        assert second_diagnosis_data["version_id"] == second_payload["version_id"]

        old_diagnosis_again = c.get(
            f"/api/v1/submission-versions/{first_payload['version_id']}/diagnosis",
            headers={"X-Demo-User-Id": "user_student_rediagnosis"},
        )
        assert old_diagnosis_again.status_code == 200
        assert old_diagnosis_again.json()["data"]["diagnosis_id"] == first_diagnosis_data["diagnosis_id"]
