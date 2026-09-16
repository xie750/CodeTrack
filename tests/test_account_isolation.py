from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.core.config import get_settings
from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import Enrollment, ExecutionRun, Submission, SubmissionVersion, TaskAssignment, TeachingAssignment
from backend.app.services.account_scope import repair_registration_scope


def register(client, role="STUDENT"):
    response = client.post("/api/v1/auth/register", json={
        "username": f"isolation_{uuid4().hex[:8]}", "password": "codetrack123",
        "display_name": "隔离测试", "role": role,
    })
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    return data["user"]["id"], {"Authorization": f"Bearer {data['access_token']}"}


def test_new_account_cannot_read_or_submit_demo_class_tasks_until_joined():
    with TestClient(app) as client:
        _, first = register(client)
        _, second = register(client)
        for headers in (first, second):
            assert client.get("/api/v1/tasks", headers=headers).json()["data"] == []
            assert client.get("/api/v1/student/tasks", headers=headers).json()["data"] == []
            for path in (
                "/api/v1/tasks/task_linked_list_delete_001",
                "/api/v1/tasks/task_linked_list_delete_001?assignment_id=assign_se1_ds_linked_list_001",
                "/api/v1/student/assignments/assign_bootstrap_ds_profile_001/workspace",
                "/api/v1/student/courses/course_ds_001/knowledge-graph",
            ):
                assert client.get(path, headers=headers).status_code == 404, path
            denied = client.post("/api/v1/tasks/task_linked_list_delete_001/submissions", headers=headers,
                                 json={"language": "CPP", "source_code": "private"})
            assert denied.status_code == 404
            assert client.get("/api/v1/student/profile", headers=headers).json()["data"]["profile_status"] == "EMPTY"
            assert client.get("/api/v1/student/self-study/daily-recommendation", headers=headers).status_code == 200

        joined = client.post("/api/v1/student/course-offerings/join", headers=first,
                             json={"teaching_assignment_id": "ta_se1_ds_001"})
        assert joined.status_code == 201
        assert [c["course_id"] for c in joined.json()["data"]["learning_context"]["courses"]] == ["course_ds_001"]
        assert client.get("/api/v1/tasks/task_linked_list_delete_001", headers=first).status_code == 200
        assert client.get("/api/v1/tasks/task_linked_list_delete_001", headers=second).status_code == 404
        assert client.get("/api/v1/student/learning-context", headers=second).json()["data"]["courses"] == []


def test_legacy_registration_repair_is_idempotent_and_preserves_explicit_join():
    with TestClient(app) as client:
        user_id, headers = register(client)
        with SessionLocal() as db:
            rows = list(db.scalars(select(Enrollment).where(Enrollment.user_id == user_id)))
            for row in rows:
                row.origin = "LEGACY"
                row.teaching_assignment_id = db.scalar(select(TeachingAssignment.id).where(
                    TeachingAssignment.class_id == "class_se_001", TeachingAssignment.course_id == row.course_id,
                ))
            db.commit()
            repair_registration_scope(db)
            assert all(row.teaching_assignment_id is None and row.origin == "PERSONAL" for row in rows)
        assert client.get("/api/v1/student/learning-context", headers=headers).json()["data"]["courses"] == []
        client.post("/api/v1/student/course-offerings/join", headers=headers,
                    json={"teaching_assignment_id": "ta_se1_ds_001"})
        with SessionLocal() as db:
            repair_registration_scope(db)
            repair_registration_scope(db)
        assert len(client.get("/api/v1/student/learning-context", headers=headers).json()["data"]["courses"]) == 1


def test_private_records_reject_guessed_ids_and_spoofed_identity_headers():
    with TestClient(app) as client:
        owner, first = register(client)
        _, second = register(client)
        second = {**second, "X-Demo-User-Id": owner, "X-User-Id": owner}
        task = client.post("/api/v1/student/daily-tasks", headers=first,
                           json={"title": "甲的私有任务", "task_date": "2026-10-01"}).json()["data"]
        assert client.patch(f"/api/v1/student/daily-tasks/{task['id']}", headers=second, json={"completed": True}).status_code == 404
        assert client.delete(f"/api/v1/student/daily-tasks/{task['id']}", headers=second).status_code == 404
        kb = client.post("/api/v1/knowledge-bases", headers=first, json={"name": "甲的知识库"}).json()["data"]
        assert client.get(f"/api/v1/knowledge-bases/{kb['id']}/documents", headers=second).status_code in {403, 404}
        session = client.post("/api/v1/student/ai-chat/sessions", headers=first, json={"first_message": "甲的秘密"}).json()["data"]
        assert client.get(f"/api/v1/student/ai-chat/sessions/{session['id']}", headers=second).status_code == 404
        assert client.delete(f"/api/v1/student/ai-chat/sessions/{session['id']}", headers=second).status_code == 404


def test_same_course_different_teacher_cannot_read_submission_details():
    with TestClient(app) as client:
        student_id, student = register(client)
        _, stranger = register(client)
        client.post("/api/v1/student/course-offerings/join", headers=student,
                    json={"teaching_assignment_id": "ta_se1_ds_001"})
        suffix = uuid4().hex[:8]
        sid, vid, eid = f"sub_iso_{suffix}", f"ver_iso_{suffix}", f"exe_iso_{suffix}"
        tid, aid = f"ta_iso_{suffix}", f"assign_iso_{suffix}"
        with SessionLocal() as db:
            db.add(TeachingAssignment(id=tid, class_id="class_cs_001", course_id="course_ds_001",
                                      teacher_id="user_teacher_002", term=f"isolation-{suffix}", status="ACTIVE"))
            db.flush()
            db.add(TaskAssignment(id=aid, task_id="task_linked_list_delete_001", teaching_assignment_id=tid,
                                 published_by="user_teacher_002", publish_status="PUBLISHED", assignment_mode="PRACTICE"))
            db.add(Submission(id=sid, student_id=student_id, task_id="task_linked_list_delete_001", status="QUEUED"))
            db.flush()
            db.add(SubmissionVersion(id=vid, submission_id=sid, version_no=1, language="CPP", source_code="secret", code_hash="x" * 64))
            db.flush()
            db.add(ExecutionRun(id=eid, submission_version_id=vid, status="QUEUED"))
            db.commit()
        try:
            # Both teachers teach data structures, but only Wang teaches this offering.
            allowed = {"X-Demo-User-Id": "user_teacher_001"}
            other = {"X-Demo-User-Id": "user_teacher_002"}
            for path in (f"/api/v1/submissions/{sid}/versions", f"/api/v1/submission-versions/{vid}/results",
                         f"/api/v1/executions/{eid}", f"/api/v1/teacher/submissions/{sid}/timeline"):
                assert client.get(path, headers=allowed).status_code == 200, path
                assert client.get(path, headers=other).status_code in {403, 404}, path
                assert client.get(path, headers=stranger).status_code in {403, 404}, path
            listing = client.get("/api/v1/teacher/courses/course_ds_001/submissions", headers=other)
            assert sid not in {r["submission_id"] for r in listing.json()["data"]}
        finally:
            with SessionLocal() as db:
                db.delete(db.get(ExecutionRun, eid))
                db.flush()
                db.delete(db.get(SubmissionVersion, vid))
                db.flush()
                db.delete(db.get(Submission, sid))
                db.delete(db.get(TaskAssignment, aid))
                db.flush()
                db.delete(db.get(TeachingAssignment, tid))
                db.commit()


def test_demo_identity_headers_are_disabled_outside_explicit_test_mode(monkeypatch):
    monkeypatch.setenv("CODETRACK_AUTH_ALLOW_DEMO_HEADER", "false")
    get_settings.cache_clear()
    try:
        with TestClient(app) as client:
            assert client.get("/api/v1/student/learning-context", headers={"X-Demo-User-Id": "user_student_001"}).status_code == 401
    finally:
        get_settings.cache_clear()
