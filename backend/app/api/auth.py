from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import create_access_token, current_user, verify_password
from backend.app.models import User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


def user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
    }


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    username = payload.username.strip()
    if not username or not payload.password:
        raise ApiError(400, "AUTH_LOGIN_REQUIRED", "请输入账号和密码")
    user = db.scalar(select(User).where(User.username == username))
    if user is None or user.status != "ACTIVE" or not verify_password(payload.password, user.password_hash):
        raise ApiError(401, "AUTH_LOGIN_FAILED", "账号或密码不正确")

    user.last_login_at = datetime.now(timezone.utc)
    access_token, expires_in = create_access_token(user)
    db.commit()
    return ok(
        {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": expires_in,
            "user": user_payload(user),
        }
    )


@router.get("/me")
def me(user: User = Depends(current_user)):
    return ok(user_payload(user))


@router.post("/logout")
def logout():
    return ok({"logged_out": True})

