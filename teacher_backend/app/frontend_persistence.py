from __future__ import annotations

from datetime import datetime
import hashlib
import hmac
import json
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .database import get_db
from .models import (
    AnnouncementRead,
    AuditLog,
    Course,
    CourseAnnouncement,
    CourseDraft,
    TeacherCredential,
    TeacherPreference,
    User,
)
from .schemas import CourseDraftUpsert, TeacherLogin, TeacherPreferenceUpdate


router = APIRouter(prefix="/api/v1", tags=["frontend-persistence"])
PBKDF2_ITERATIONS = 120_000


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PBKDF2_ITERATIONS,
    ).hex()


def set_teacher_password(db: Session, user_id: str, password: str) -> None:
    salt = secrets.token_hex(16)
    credential = db.get(TeacherCredential, user_id)
    if credential is None:
        credential = TeacherCredential(user_id=user_id, password_salt=salt, password_hash="")
        db.add(credential)
    credential.password_salt = salt
    credential.password_hash = _hash_password(password, salt)
    credential.updated_at = datetime.now().replace(microsecond=0)


def _serialize_teacher(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "number": user.number or "",
        "email": user.email or "",
        "department": user.department or "",
    }


def _current_teacher(
    x_user_id: str = Header(default="teacher-01"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要教师权限")
    return user


def _owned_course(db: Session, teacher: User, course_id: str) -> Course:
    course = db.get(Course, course_id)
    if not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="课程不存在或无权访问")
    return course


def _envelope(data):
    return {"data": data}


@router.get("/teacher/auth/accounts")
def teacher_accounts(db: Session = Depends(get_db)):
    rows = db.scalars(select(User).where(User.role == "teacher").order_by(User.number, User.id)).all()
    return _envelope([_serialize_teacher(item) for item in rows])


@router.post("/teacher/auth/login")
def teacher_login(payload: TeacherLogin, db: Session = Depends(get_db)):
    username = payload.username.strip()
    user = db.scalar(
        select(User).where(
            User.role == "teacher",
            or_(User.name == username, User.number == username),
        )
    )
    credential = db.get(TeacherCredential, user.id) if user else None
    valid = bool(
        user
        and credential
        and hmac.compare_digest(
            credential.password_hash,
            _hash_password(payload.password, credential.password_salt),
        )
    )
    if not valid:
        raise HTTPException(status_code=401, detail="用户名或密码错误，请重新输入")
    db.add(AuditLog(
        actor_id=user.id,
        action="teacher_login",
        resource_type="session",
        resource_id=user.id,
        detail="教师端数据库账号验证成功",
    ))
    db.commit()
    return _envelope(_serialize_teacher(user))


@router.get("/teacher/course-draft")
def get_course_draft(teacher: User = Depends(_current_teacher), db: Session = Depends(get_db)):
    draft = db.scalar(select(CourseDraft).where(CourseDraft.teacher_id == teacher.id))
    if not draft:
        return _envelope(None)
    try:
        payload = json.loads(draft.payload_json)
    except json.JSONDecodeError:
        payload = {}
    payload["savedAt"] = draft.saved_at.isoformat()
    return _envelope(payload)


@router.put("/teacher/course-draft")
def save_course_draft(payload: CourseDraftUpsert, teacher: User = Depends(_current_teacher), db: Session = Depends(get_db)):
    draft = db.scalar(select(CourseDraft).where(CourseDraft.teacher_id == teacher.id))
    if draft is None:
        draft = CourseDraft(teacher_id=teacher.id, payload_json="{}")
        db.add(draft)
    draft.payload_json = json.dumps(payload.payload, ensure_ascii=False)
    draft.saved_at = datetime.now().replace(microsecond=0)
    db.add(AuditLog(actor_id=teacher.id, action="save_course_draft", resource_type="course_draft", resource_id=teacher.id))
    db.commit()
    db.refresh(draft)
    response = dict(payload.payload)
    response["savedAt"] = draft.saved_at.isoformat()
    return _envelope(response)


@router.delete("/teacher/course-draft")
def delete_course_draft(teacher: User = Depends(_current_teacher), db: Session = Depends(get_db)):
    draft = db.scalar(select(CourseDraft).where(CourseDraft.teacher_id == teacher.id))
    if draft:
        db.delete(draft)
    db.add(AuditLog(actor_id=teacher.id, action="delete_course_draft", resource_type="course_draft", resource_id=teacher.id))
    db.commit()
    return _envelope({"deleted": True})


@router.get("/teacher/courses/{course_id}/announcements")
def list_announcements(course_id: str, teacher: User = Depends(_current_teacher), db: Session = Depends(get_db)):
    _owned_course(db, teacher, course_id)
    reads = set(db.scalars(select(AnnouncementRead.announcement_id).where(AnnouncementRead.user_id == teacher.id)).all())
    rows = db.scalars(
        select(CourseAnnouncement)
        .where(CourseAnnouncement.course_id == course_id)
        .order_by(CourseAnnouncement.pinned.desc(), CourseAnnouncement.published_at.desc())
    ).all()
    authors = {item.author_id: db.get(User, item.author_id) for item in rows}
    result = []
    for item in rows:
        try:
            content = json.loads(item.content_json)
        except json.JSONDecodeError:
            content = [item.content_json]
        result.append({
            "id": item.id,
            "title": item.title,
            "summary": item.summary,
            "content": content,
            "date": item.published_at.strftime("%m-%d"),
            "published_at": item.published_at.isoformat(sep=" ", timespec="minutes"),
            "author": authors[item.author_id].name if authors.get(item.author_id) else "教师",
            "audience": item.audience,
            "pinned": item.pinned,
            "read": item.id in reads,
        })
    return _envelope(result)


@router.patch("/teacher/announcements/{announcement_id}/read")
def read_announcement(announcement_id: str, teacher: User = Depends(_current_teacher), db: Session = Depends(get_db)):
    announcement = db.get(CourseAnnouncement, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="课程公告不存在")
    _owned_course(db, teacher, announcement.course_id)
    existing = db.scalar(select(AnnouncementRead).where(
        AnnouncementRead.announcement_id == announcement_id,
        AnnouncementRead.user_id == teacher.id,
    ))
    if existing is None:
        db.add(AnnouncementRead(announcement_id=announcement_id, user_id=teacher.id))
        db.commit()
    return _envelope({"id": announcement_id, "read": True})


@router.get("/teacher/preferences")
def get_preferences(teacher: User = Depends(_current_teacher), db: Session = Depends(get_db)):
    item = db.get(TeacherPreference, teacher.id)
    if item is None:
        item = TeacherPreference(teacher_id=teacher.id)
        db.add(item)
        db.commit()
        db.refresh(item)
    return _envelope({
        "notifications_enabled": item.notifications_enabled,
        "ai_assistant_enabled": item.ai_assistant_enabled,
        "email_digest": item.email_digest,
        "updated_at": item.updated_at.isoformat(),
    })


@router.put("/teacher/preferences")
def update_preferences(payload: TeacherPreferenceUpdate, teacher: User = Depends(_current_teacher), db: Session = Depends(get_db)):
    item = db.get(TeacherPreference, teacher.id)
    if item is None:
        item = TeacherPreference(teacher_id=teacher.id)
        db.add(item)
    item.notifications_enabled = payload.notifications_enabled
    item.ai_assistant_enabled = payload.ai_assistant_enabled
    item.email_digest = payload.email_digest
    item.updated_at = datetime.now().replace(microsecond=0)
    db.add(AuditLog(actor_id=teacher.id, action="update_preferences", resource_type="teacher_preferences", resource_id=teacher.id))
    db.commit()
    return _envelope({
        "notifications_enabled": item.notifications_enabled,
        "ai_assistant_enabled": item.ai_assistant_enabled,
        "email_digest": item.email_digest,
        "updated_at": item.updated_at.isoformat(),
    })


def ensure_frontend_persistence_seed(db: Session) -> None:
    if db.get(User, "teacher-02") is None:
        db.add(User(
            id="teacher-02",
            name="林老师",
            role="teacher",
            number="T2024002",
            email="lin.teacher@university.edu.cn",
            department="软件学院",
        ))
        db.flush()

    supplemental_courses = [
        ("course-py", "Python 数据分析", "CST3105", "使用 Python 进行数据清洗、分析与可视化。", "active", 55),
        ("course-ml", "机器学习导论", "CST3208", "监督学习、无监督学习与深度学习基础。", "active", 38),
        ("course-os", "操作系统原理", "CST2075", "进程管理、内存管理与文件系统。", "preparing", 10),
    ]
    for course_id, name, code, description, course_status, progress in supplemental_courses:
        if db.get(Course, course_id) is None:
            db.add(Course(
                id=course_id,
                teacher_id="teacher-02",
                name=name,
                code=code,
                term="2024-2025 学年春季" if course_id != "course-os" else "2024-2025 学年秋季",
                description=description,
                status=course_status,
                student_visible=course_status == "active",
                progress=progress,
            ))
    db.flush()

    teachers = db.scalars(select(User).where(User.role == "teacher")).all()
    for teacher in teachers:
        if db.get(TeacherCredential, teacher.id) is None:
            set_teacher_password(db, teacher.id, "123456")
        if db.get(TeacherPreference, teacher.id) is None:
            db.add(TeacherPreference(teacher_id=teacher.id))

    if db.get(Course, "course-ds") and db.get(CourseAnnouncement, "announcement-tree-materials") is None:
        author_id = "teacher-01"
        rows = [
            ("announcement-tree-materials", "第6周 树与二叉树章节资料已更新", "已上传课堂PPT、历年真题与拓展阅读，请同学们及时查看。", ["第6周“树与二叉树”章节的配套教学资料已经更新，包含课堂PPT、知识点讲义、历年真题和拓展阅读。", "请同学们在下次课前完成二叉树遍历部分的预习，并重点阅读递归实现示例。", "资料已放入课程工作空间的“教学材料”模块，如有下载或阅读问题，请在课堂讨论区反馈。"], "全部授课班级", True, datetime(2026, 5, 28, 9, 30)),
            ("announcement-assignment-reminder", "第33次作业《线性表4组》提交截止提醒", "截止时间：2026-05-31 23:59，请按时提交。", ["第33次作业《线性表4组》将于 2026年5月31日 23:59 截止提交，请尚未完成的同学合理安排时间。", "提交前请确认代码能够通过公开测试用例，并在报告中简要说明时间复杂度。"], "软件工程 1 班、软件工程 2 班", False, datetime(2026, 5, 27, 16, 10)),
            ("announcement-week-seven", "下周课程安排预告", "第7周围绕存储结构、最短路径初步算法展开。", ["第7周课程将进入图的存储结构与最短路径算法，课堂内容包括邻接矩阵、邻接表以及 Dijkstra 算法的基本思路。", "建议提前复习队列和优先队列的基本操作。"], "全部授课班级", False, datetime(2026, 5, 26, 14, 20)),
            ("announcement-lab-room", "本周实验课教室临时调整", "周四实验课调整至信息楼 A305，请相互转告。", ["因原实验室设备维护，本周四第5-6节实验课临时调整至信息楼 A305，授课时间不变。", "请提前十分钟到达并按照班级座位表入座。下周起恢复原实验室上课。"], "计算机科学 1 班", False, datetime(2026, 5, 24, 18, 45)),
            ("announcement-office-hours", "期中答疑时间安排", "本周三、周五开放线下答疑，也可在课堂讨论区留言。", ["期中阶段集中答疑安排在本周三 16:00-17:30 和周五 14:00-15:30，地点为信息楼 B218。", "需要重点讲解具体题目的同学，可以提前在课堂讨论区留言并附上题号。"], "全部授课班级", False, datetime(2026, 5, 22, 10, 0)),
        ]
        db.add_all([
            CourseAnnouncement(
                id=row[0], course_id="course-ds", author_id=author_id, title=row[1], summary=row[2],
                content_json=json.dumps(row[3], ensure_ascii=False), audience=row[4], pinned=row[5], published_at=row[6],
            )
            for row in rows
        ])
    db.commit()


