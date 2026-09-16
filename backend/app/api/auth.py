import re
from datetime import date, datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import create_access_token, current_user, hash_password, verify_password
from backend.app.models import (
    Course,
    Enrollment,
    StudentDailyTask,
    StudentResourceFolder,
    User,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

from backend.app.services.account_scope import PERSONAL_LEARNING_CLASS_ID, PERSONAL_COURSE_IDS

DEFAULT_PERSONAL_CLASS_ID = PERSONAL_LEARNING_CLASS_ID
DEFAULT_REGISTER_TERM = "2026-demo"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,32}$")
SUPPORTED_REGISTER_ROLES = {"STUDENT", "TEACHER"}


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=2, max_length=40)
    role: str = Field(default="STUDENT", max_length=20)


def user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
    }


def _normalize_username(username: str) -> str:
    value = username.strip().lower()
    if not USERNAME_RE.fullmatch(value):
        raise ApiError(400, "AUTH_REGISTER_USERNAME_INVALID", "账号只能使用 3-32 位英文字母、数字或下划线")
    return value


def _normalize_display_name(display_name: str) -> str:
    value = " ".join(display_name.strip().split())
    if not value:
        raise ApiError(400, "AUTH_REGISTER_DISPLAY_NAME_REQUIRED", "请输入姓名")
    return value


def _normalize_register_role(role: str) -> str:
    value = role.strip().upper()
    if value not in SUPPORTED_REGISTER_ROLES:
        raise ApiError(400, "AUTH_REGISTER_ROLE_INVALID", "当前仅开放学生和教师账号注册")
    return value


def _validate_register_password(password: str, username: str) -> str:
    if password != password.strip() or any(char.isspace() for char in password):
        raise ApiError(400, "AUTH_REGISTER_PASSWORD_WEAK", "密码不能包含空格或换行")
    if len(password) < 8 or len(password) > 32:
        raise ApiError(400, "AUTH_REGISTER_PASSWORD_WEAK", "密码需为 8-32 位")
    has_letter = bool(re.search(r"[A-Za-z]", password))
    has_digit = bool(re.search(r"\d", password))
    if not has_letter or not has_digit:
        raise ApiError(400, "AUTH_REGISTER_PASSWORD_WEAK", "密码需至少包含字母和数字")
    if username and username.lower() in password.lower():
        raise ApiError(400, "AUTH_REGISTER_PASSWORD_WEAK", "密码不能包含账号")
    return password


def _ensure_enrollment(
    db: Session,
    *,
    course_id: str,
    user_id: str,
    role: str,
    teaching_assignment_id: str | None = None,
) -> None:
    enrollment = db.scalar(
        select(Enrollment).where(
            Enrollment.course_id == course_id,
            Enrollment.user_id == user_id,
        )
    )
    if enrollment is None:
        db.add(
            Enrollment(
                course_id=course_id,
                user_id=user_id,
                role=role,
                teaching_assignment_id=teaching_assignment_id,
                origin="PERSONAL" if role == "STUDENT" else "ASSIGNED",
            )
        )
        return
    enrollment.role = role
    if teaching_assignment_id:
        enrollment.teaching_assignment_id = teaching_assignment_id


def _ensure_student_resource_folders(db: Session, *, student_id: str) -> None:
    for index, name in enumerate(["学习笔记", "知识卡片", "错题总结", "PPT 大纲"], start=1):
        exists = db.scalar(
            select(StudentResourceFolder).where(
                StudentResourceFolder.student_id == student_id,
                StudentResourceFolder.name == name,
            )
        )
        if exists is None:
            db.add(
                StudentResourceFolder(
                    id=f"folder_{student_id}_{index}",
                    student_id=student_id,
                    name=name,
                    sort_order=index,
                    status="ACTIVE",
                )
            )


def _ensure_student_daily_task(db: Session, *, student_id: str) -> None:
    task_id = f"daily_{student_id}_first_task"
    if db.get(StudentDailyTask, task_id) is None:
        db.add(
            StudentDailyTask(
                id=task_id,
                student_id=student_id,
                task_date=date.today().isoformat(),
                title="完成一次自主学习或科研实践记录，生成第一条学习画像证据",
                completed=False,
                sort_order=1,
            )
        )


def _initialize_student_business_flow(db: Session, user: User) -> dict:
    courses = list(
        db.scalars(select(Course).where(Course.status == "ACTIVE", Course.id.in_(PERSONAL_COURSE_IDS)).order_by(Course.id.asc())).all()
    )
    personal_courses: list[dict] = []
    for course in courses:
        teaching_assignment_id = None
        _ensure_enrollment(
            db,
            course_id=course.id,
            user_id=user.id,
            role="STUDENT",
            teaching_assignment_id=teaching_assignment_id,
        )
        personal_courses.append(
            {
                "course_id": course.id,
                "course_name": course.name,
                "teaching_assignment_id": teaching_assignment_id,
            }
        )

    _ensure_student_resource_folders(db, student_id=user.id)
    _ensure_student_daily_task(db, student_id=user.id)
    return {
        "state": "NO_CLASS",
        "class_id": None,
        "personal_class_context_id": DEFAULT_PERSONAL_CLASS_ID,
        "personal_courses": personal_courses,
        "practice_project_count": 0,
    }


def _initialize_teacher_business_flow(db: Session, user: User) -> dict:
    return {
        "term": DEFAULT_REGISTER_TERM,
        "courses": [],
    }


def _auth_success_payload(user: User) -> dict:
    access_token, expires_in = create_access_token(user)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": user_payload(user),
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
    db.commit()
    return ok(_auth_success_payload(user))


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    username = _normalize_username(payload.username)
    display_name = _normalize_display_name(payload.display_name)
    role = _normalize_register_role(payload.role)
    password = _validate_register_password(payload.password, username)

    existing = db.scalar(select(User).where(func.lower(User.username) == username))
    if existing is not None:
        raise ApiError(409, "AUTH_REGISTER_USERNAME_EXISTS", "该账号已存在，请换一个账号或直接登录")

    user = User(
        id=f"user_{role.lower()}_{uuid4().hex[:12]}",
        username=username,
        display_name=display_name,
        role=role,
        password_hash=hash_password(password),
        status="ACTIVE",
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()

    business_context = (
        _initialize_student_business_flow(db, user)
        if role == "STUDENT"
        else _initialize_teacher_business_flow(db, user)
    )
    db.commit()
    return ok({**_auth_success_payload(user), "business_context": business_context})


@router.get("/me")
def me(user: User = Depends(current_user)):
    return ok(user_payload(user))


@router.post("/logout")
def logout():
    return ok({"logged_out": True})

