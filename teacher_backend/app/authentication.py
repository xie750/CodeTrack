"""Verify the shared login before any legacy API reads an identity header."""
import os
from urllib.parse import quote

from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from backend.app.core.api_response import ApiError
from backend.app.core.database import SessionLocal as AuthSession
from backend.app.core.security import current_user
from .database import SessionLocal
from .models import User

LEGACY_TEACHERS = {"user_teacher_001": "teacher-01", "user_teacher_002": "teacher-02"}


def verified_identity(authorization: str) -> tuple[str, str]:
    with AuthSession() as db:
        account = current_user(authorization=authorization, x_demo_user_id=None, db=db)
        if account.role not in {"TEACHER", "STUDENT"}:
            raise ApiError(403, "AUTH_FORBIDDEN", "当前角色无权访问教学接口")
        # Only known teacher identities have an explicit legacy mapping. Never
        # map several different students to the same demonstration student.
        identity = LEGACY_TEACHERS.get(account.id, account.id)
        name, role = account.display_name, account.role.lower()
    with SessionLocal() as db:
        user = db.get(User, identity)
        if user is None:
            db.add(User(id=identity, name=name, role=role, department="人工智能学院"))
            db.commit()
        elif user.role != role:
            raise ApiError(403, "AUTH_FORBIDDEN", "账号角色不匹配")
    return identity, name


class VerifiedIdentityMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope.get("path", "").startswith("/api/") or scope.get("method") == "OPTIONS":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        authorization = headers.get(b"authorization", b"").decode("latin1")
        # Explicit compatibility switch for isolated fixtures; disabled by default.
        if not authorization and os.getenv("CODETRACK_TEACHER_ALLOW_DEMO_HEADER", "").lower() == "true":
            return await self.app(scope, receive, send)
        try:
            identity, name = await run_in_threadpool(verified_identity, authorization)
        except ApiError as exc:
            return await JSONResponse({"error": exc.detail}, status_code=exc.status_code)(scope, receive, send)
        trusted_headers = [(k, v) for k, v in scope.get("headers", []) if k.lower() not in {b"x-user-id", b"x-user-name"}]
        trusted_headers.extend([(b"x-user-id", identity.encode()), (b"x-user-name", quote(name).encode())])
        scope = {**scope, "headers": trusted_headers}
        await self.app(scope, receive, send)
