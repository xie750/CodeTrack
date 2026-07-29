import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.models import Enrollment, User


PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 120_000
JWT_ALGORITHM = "HS256"


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PASSWORD_ITERATIONS)
    return f"{PASSWORD_ALGORITHM}${PASSWORD_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        algorithm, iterations, salt, expected = password_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != PASSWORD_ALGORITHM:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations)).hex()
    return hmac.compare_digest(digest, expected)


def create_access_token(user: User) -> tuple[str, int]:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.auth_access_token_minutes)
    payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}
    signing_input = ".".join(
        [
            _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8")),
            _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
        ]
    )
    signature = hmac.new(settings.auth_secret_key.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(signature)}", settings.auth_access_token_minutes * 60


def decode_access_token(token: str) -> dict:
    try:
        header_part, payload_part, signature_part = token.split(".")
    except ValueError as exc:
        raise ApiError(401, "AUTH_TOKEN_INVALID", "登录凭证格式无效") from exc

    settings = get_settings()
    signing_input = f"{header_part}.{payload_part}"
    expected_signature = hmac.new(
        settings.auth_secret_key.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    try:
        actual_signature = _b64url_decode(signature_part)
    except ValueError as exc:
        raise ApiError(401, "AUTH_TOKEN_INVALID", "登录凭证格式无效") from exc
    if not hmac.compare_digest(actual_signature, expected_signature):
        raise ApiError(401, "AUTH_TOKEN_INVALID", "登录凭证签名无效")

    try:
        header = json.loads(_b64url_decode(header_part))
        payload = json.loads(_b64url_decode(payload_part))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ApiError(401, "AUTH_TOKEN_INVALID", "登录凭证内容无效") from exc
    if header.get("alg") != JWT_ALGORITHM:
        raise ApiError(401, "AUTH_TOKEN_INVALID", "登录凭证算法无效")
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ApiError(401, "AUTH_TOKEN_EXPIRED", "登录凭证已过期，请重新登录")
    return payload


def current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_demo_user_id: str | None = Header(default=None, alias="X-Demo-User-Id"),
    db: Session = Depends(get_db),
) -> User:
    user_id: str | None = None
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise ApiError(401, "AUTH_TOKEN_INVALID", "请使用 Bearer token 登录凭证")
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    elif x_demo_user_id and get_settings().auth_allow_demo_header:
        user_id = x_demo_user_id
    if not user_id:
        raise ApiError(401, "AUTH_UNAUTHORIZED", "请先登录")
    user = db.get(User, user_id)
    if user is None or user.status != "ACTIVE":
        raise ApiError(401, "AUTH_UNAUTHORIZED", "未登录或账号不可用")
    return user


def require_role(user: User, role: str) -> None:
    if user.role != role:
        raise ApiError(403, "AUTH_FORBIDDEN", "当前角色无权访问该资源")


def ensure_course_member(db: Session, course_id: str, user_id: str, role: str | None = None) -> None:
    query = select(Enrollment).where(
        Enrollment.course_id == course_id,
        Enrollment.user_id == user_id,
    )
    if role:
        query = query.where(Enrollment.role == role)
    membership = db.scalar(query)
    if membership is None:
        raise ApiError(403, "AUTH_FORBIDDEN", "无权访问该课程资源")

