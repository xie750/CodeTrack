from datetime import datetime, timezone

from fastapi.testclient import TestClient

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import AgentRun


ADMIN = {"X-Demo-User-Id": "user_admin_001"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}


def add_usage_run(
    *,
    run_id: str,
    student_id: str,
    course_id: str,
    workflow_type: str,
    status: str = "SUCCEEDED",
    token_prompt: int = 100,
    token_completion: int = 40,
):
    db = SessionLocal()
    try:
        existing = db.get(AgentRun, run_id)
        if existing:
            db.delete(existing)
            db.flush()
        db.add(
            AgentRun(
                id=run_id,
                student_id=student_id,
                course_id=course_id,
                workflow_type=workflow_type,
                status=status,
                input_json="{}",
                output_json='{"confidence":0.82,"source_used":true,"citation_count":2}' if status == "SUCCEEDED" else "{}",
                model_provider="TEST",
                model_name="test-admin-usage-model",
                prompt_version="test",
                attempts=1,
                token_prompt=token_prompt,
                token_completion=token_completion,
                started_at=datetime(2026, 9, 5, 9, 0, tzinfo=timezone.utc),
                finished_at=datetime(2026, 9, 5, 9, 0, 2, tzinfo=timezone.utc),
            )
        )
        db.commit()
    finally:
        db.close()


def test_admin_ai_usage_returns_backend_aggregates():
    with TestClient(app) as client:
        add_usage_run(
            run_id="run_test_admin_usage_ds",
            student_id="user_student_001",
            course_id="course_ds_001",
            workflow_type="student_ai_tutor_chat",
        )
        response = client.get(
            "/api/v1/admin/ai/usage",
            headers=ADMIN,
            params={"range": "30d", "model_name": "test-admin-usage-model"},
        )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["summary"]["total_calls"] == 1
    assert data["summary"]["unique_users"] == 1
    assert data["summary"]["total_tokens"] == 140
    assert data["summary"]["success_rate"] == 100.0
    assert data["summary"]["citation_rate"] == 100.0
    assert data["course_breakdown"][0]["course_name"] == "数据结构"
    assert data["feature_breakdown"][0]["label"] == "AI 导师问答"
    assert data["recent_logs"][0]["model_name"] == "test-admin-usage-model"


def test_admin_ai_usage_rejects_student_role():
    with TestClient(app) as client:
        response = client.get("/api/v1/admin/ai/usage", headers=STUDENT)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "AUTH_FORBIDDEN"


def test_admin_ai_usage_course_filter_limits_rows():
    with TestClient(app) as client:
        add_usage_run(
            run_id="run_test_admin_usage_ds_filter",
            student_id="user_student_001",
            course_id="course_ds_001",
            workflow_type="student_ai_tutor_chat",
        )
        add_usage_run(
            run_id="run_test_admin_usage_ml_filter",
            student_id="user_student_001",
            course_id="course_arch_001",
            workflow_type="student_ai_tutor_chat",
            token_prompt=220,
            token_completion=80,
        )
        response = client.get(
            "/api/v1/admin/ai/usage",
            headers=ADMIN,
            params={"range": "30d", "model_name": "test-admin-usage-model", "course_id": "course_arch_001"},
        )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["summary"]["total_calls"] == 1
    assert data["summary"]["total_tokens"] == 300
    assert [item["course_id"] for item in data["course_breakdown"]] == ["course_arch_001"]
