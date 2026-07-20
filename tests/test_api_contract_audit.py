import json
import time

from fastapi.testclient import TestClient

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import AuditLog
from backend.app.services.seed import STANDARD_WRONG_CODE


def client() -> TestClient:
    return TestClient(app)


def wait_for_results(c: TestClient, version_id: str, timeout_seconds: int = 45):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        response = c.get(f"/api/v1/submission-versions/{version_id}/results")
        assert response.status_code == 200
        data = response.json()["data"]
        if data["execution"]["status"] in {
            "SUCCEEDED",
            "COMPILE_ERROR",
            "RUNTIME_ERROR",
            "TIMEOUT",
            "RESOURCE_LIMIT",
            "SECURITY_REJECTED",
            "INFRASTRUCTURE_ERROR",
        }:
            return response
        time.sleep(0.5)
    raise AssertionError("execution did not finish")


def test_openapi_contains_demo_contract_paths():
    with client() as c:
        response = c.get("/openapi.json")
        assert response.status_code == 200
        spec = response.json()
        paths = spec["paths"]
        required_paths = {
            "/health",
            "/ready",
            "/api/v1/tasks",
            "/api/v1/tasks/{task_id}",
            "/api/v1/tasks/{task_id}/submissions",
            "/api/v1/executions/{execution_id}",
            "/api/v1/submission-versions/{version_id}/results",
            "/api/v1/submission-versions/{version_id}/diagnosis",
            "/api/v1/diagnoses/{diagnosis_id}/hints",
            "/api/v1/submissions/{submission_id}/versions",
            "/api/v1/submissions/{submission_id}/summary",
            "/api/v1/teacher/courses/{course_id}/submissions",
            "/api/v1/teacher/submissions/{submission_id}/timeline",
        }
        assert required_paths.issubset(set(paths))

        ready_schema = paths["/ready"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
        assert ready_schema["$ref"] == "#/components/schemas/ReadyResponse"

        versions_schema = paths["/api/v1/submissions/{submission_id}/versions"]["get"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]
        assert versions_schema["$ref"] == "#/components/schemas/VersionHistoryResponse"
        item_schema = spec["components"]["schemas"]["VersionHistoryItemResponse"]
        assert {
            "version_id",
            "version_no",
            "language",
            "source_code",
            "code_hash",
            "created_at",
            "submission_status",
            "execution_status",
            "passed_count",
            "total_required_count",
            "highest_hint_level",
            "is_latest",
            "is_final",
        }.issubset(set(item_schema["properties"]))

        summary_schema = paths["/api/v1/submissions/{submission_id}/summary"]["get"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]
        assert summary_schema["$ref"] == "#/components/schemas/SubmissionSummaryResponse"
        summary_data_schema = spec["components"]["schemas"]["SubmissionSummaryDataResponse"]
        assert {
            "total_duration_ms",
            "next_step_suggestion",
            "test_comparison",
            "capability_evidence",
        }.issubset(set(summary_data_schema["properties"]))


def test_audit_logs_key_events_without_source_or_secret_details():
    with client() as c:
        response = c.post(
            "/api/v1/tasks/task_linked_list_delete_001/submissions",
            headers={"Idempotency-Key": "audit-001", "X-Demo-User-Id": "user_student_002"},
            json={"language": "CPP", "source_code": STANDARD_WRONG_CODE},
        )
        assert response.status_code == 202
        payload = response.json()["data"]
        wait_for_results(c, payload["version_id"])
        diagnosis = c.get(
            f"/api/v1/submission-versions/{payload['version_id']}/diagnosis",
            headers={"X-Demo-User-Id": "user_student_002"},
        )
        assert diagnosis.status_code == 200
        diagnosis_id = diagnosis.json()["data"]["diagnosis_id"]
        hint = c.post(
            f"/api/v1/diagnoses/{diagnosis_id}/hints",
            headers={"X-Demo-User-Id": "user_student_002"},
            json={"requested_level": 2},
        )
        assert hint.status_code == 200

    db = SessionLocal()
    try:
        logs = db.query(AuditLog).filter(AuditLog.submission_id == payload["submission_id"]).all()
        event_types = {log.event_type for log in logs}
        assert {
            "SUBMISSION_VERSION_CREATED",
            "EXECUTION_FINISHED",
            "DIAGNOSIS_CREATED",
            "HINT_VIEWED",
        }.issubset(event_types)
        for log in logs:
            serialized = json.dumps(
                {
                    "details": log.details,
                    "request_id": log.request_id,
                    "user_id": log.user_id,
                    "submission_id": log.submission_id,
                    "version_id": log.version_id,
                    "execution_id": log.execution_id,
                },
                ensure_ascii=False,
            )
            assert "ListNode* deleteAt" not in serialized
            assert "CODETRACK_DATABASE_URL" not in serialized
            assert "MODEL_GATEWAY" not in serialized
            assert "MODEL_API_KEY" not in serialized
    finally:
        db.close()


def test_health_and_ready_endpoints_report_runtime_dependencies():
    with client() as c:
        health = c.get("/health")
        assert health.status_code == 200
        assert health.json()["data"] == {"status": "ok"}

        ready = c.get("/ready")
        assert ready.status_code == 200
        body = ready.json()
        assert body["data"]["status"] == "ready"
        assert body["data"]["dependencies"]["database"] == "ok"
        assert "request_id" in body["meta"]
