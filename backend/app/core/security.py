from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings
from backend.app.core.database import get_db
from backend.app.models import Enrollment, User


def current_user(
    x_demo_user_id: str | None = Header(default=None, alias="X-Demo-User-Id"),
    db: Session = Depends(get_db),
) -> User:
    user_id = x_demo_user_id or get_settings().demo_user_id
    user = db.get(User, user_id)
    if user is None or user.status != "ACTIVE":
        raise ApiError(401, "AUTH_UNAUTHORIZED", "未登录或账号不可用")
    return user


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

