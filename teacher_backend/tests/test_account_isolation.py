import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.core.security import create_access_token
from backend.app.models import Base as AuthBase, User as AuthUser
from teacher_backend.app import authentication
from teacher_backend.app.main import app


@pytest.fixture
def identities(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    AuthBase.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(authentication, "AuthSession", factory)
    monkeypatch.setenv("CODETRACK_TEACHER_ALLOW_DEMO_HEADER", "false")
    headers = {}
    with factory() as db:
        for key, user_id, role in (
            ("owner", "user_teacher_001", "TEACHER"),
            ("other", "user_teacher_002", "TEACHER"),
            ("new", "registered_isolated_teacher", "TEACHER"),
            ("student", "registered_isolated_student", "STUDENT"),
        ):
            user = AuthUser(id=user_id, username=key, display_name=f"测试{key}", role=role, status="ACTIVE")
            db.add(user)
            db.flush()
            headers[key] = {"Authorization": f"Bearer {create_access_token(user)[0]}"}
        db.commit()
    yield headers
    engine.dispose()


def test_legacy_routes_require_signed_identity_and_ignore_spoofed_headers(identities):
    with TestClient(app) as client:
        for path in ("/api/v1/teacher/bootstrap", "/api/v1/teacher/courses", "/api/v1/teacher/materials"):
            assert client.get(path).status_code == 401
            assert client.get(path, headers={"X-User-Id": "teacher-01"}).status_code == 401
            assert client.get(path, headers={"Authorization": "Bearer broken", "X-User-Id": "teacher-01"}).status_code == 401
        spoofed = {**identities["new"], "X-User-Id": "teacher-01", "X-User-Name": "spoofed"}
        response = client.get("/api/v1/teacher/courses", headers=spoofed)
        assert response.status_code == 200, response.text
        assert response.json()["data"] == []
        assert client.get("/api/v1/teacher/courses", headers=identities["owner"]).json()["data"]
        assert client.get("/api/v1/teacher/courses", headers=identities["student"]).status_code == 403


def test_material_files_are_scoped_to_the_owner_and_enrolled_students(identities):
    from teacher_backend.app.database import SessionLocal
    from teacher_backend.app.models import Material
    from teacher_backend.app.uploads import UPLOAD_ROOT

    with TestClient(app) as client:
        response = client.post("/api/v1/teacher/materials/upload", headers=identities["owner"],
                               data={"course_id": "course-ds", "visibility": "students"},
                               files={"file": ("isolation.txt", b"private course material", "text/plain")})
        assert response.status_code == 201, response.text
        material = response.json()["data"]
        try:
            assert client.get(material["content_url"], headers=identities["owner"]).status_code == 200
            for key in ("other", "new", "student"):
                assert client.get(material["content_url"], headers=identities[key]).status_code == 404
            assert client.get(material["content_url"]).status_code == 401
        finally:
            with SessionLocal() as db:
                db.delete(db.get(Material, material["id"]))
                db.commit()
            (UPLOAD_ROOT / material["content_url"].rsplit("/", 1)[-1]).unlink(missing_ok=True)
