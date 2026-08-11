from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_db
from .models import (
    AuditLog, ClassGroup, Course, CourseDiscussion, DiscussionReply,
    Enrollment, Notification, User,
)


router = APIRouter(prefix="/api/v1")


def uid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class DiscussionCreate(BaseModel):
    course_id: str
    class_id: str
    title: str = Field(min_length=1, max_length=160)
    content: str = Field(min_length=1, max_length=5000)
    publish: bool = False


class DiscussionReplyCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


def current_teacher(x_user_id: str = Header(default="teacher-01"), db: Session = Depends(get_db)) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=403, detail="需要教师权限")
    return user


def current_student(x_user_id: str = Header(default="student-03"), db: Session = Depends(get_db)) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "student":
        raise HTTPException(status_code=403, detail="需要学生权限")
    return user


def teacher_discussion(db: Session, teacher: User, discussion_id: str) -> CourseDiscussion:
    item = db.get(CourseDiscussion, discussion_id)
    course = db.get(Course, item.course_id) if item else None
    if not item or not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="讨论不存在")
    return item


def serialize_discussion(db: Session, item: CourseDiscussion, include_replies: bool = True) -> dict:
    group = db.get(ClassGroup, item.class_id)
    reply_rows = db.execute(
        select(DiscussionReply, User)
        .join(User, User.id == DiscussionReply.student_id)
        .where(DiscussionReply.discussion_id == item.id)
        .order_by(DiscussionReply.created_at.asc())
    ).all() if include_replies else []
    participant_count = db.scalar(
        select(func.count(func.distinct(DiscussionReply.student_id)))
        .where(DiscussionReply.discussion_id == item.id)
    ) or 0
    return {
        "id": item.id,
        "course_id": item.course_id,
        "class_id": item.class_id,
        "class_name": group.name if group else "",
        "title": item.title,
        "content": item.content,
        "status": item.status,
        "participant_count": participant_count,
        "reply_count": len(reply_rows) if include_replies else db.scalar(
            select(func.count()).select_from(DiscussionReply).where(DiscussionReply.discussion_id == item.id)
        ) or 0,
        "created_at": item.created_at.isoformat(),
        "published_at": item.published_at.isoformat() if item.published_at else None,
        "replies": [
            {
                "id": reply.id,
                "student_id": student.id,
                "student_name": student.name,
                "content": reply.content,
                "created_at": reply.created_at.isoformat(),
            }
            for reply, student in reply_rows
        ],
    }


def publish_to_students(db: Session, teacher: User, item: CourseDiscussion) -> None:
    if item.status == "published":
        return
    item.status = "published"
    item.published_at = datetime.now().replace(microsecond=0)
    student_ids = db.scalars(select(Enrollment.student_id).where(Enrollment.class_id == item.class_id)).all()
    for student_id in student_ids:
        db.add(Notification(
            id=uid("notice"), user_id=student_id, type="discussion",
            title=f"课堂讨论：{item.title}", content=item.content[:240],
        ))
    db.add(AuditLog(
        actor_id=teacher.id, action="discussion.publish",
        resource_type="discussion", resource_id=item.id, detail=item.title,
    ))


@router.get("/teacher/discussions")
def list_teacher_discussions(
    course_id: str, class_id: str | None = None,
    teacher: User = Depends(current_teacher), db: Session = Depends(get_db),
):
    course = db.get(Course, course_id)
    if not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="课程不存在")
    query = select(CourseDiscussion).where(CourseDiscussion.course_id == course_id)
    if class_id:
        query = query.where(CourseDiscussion.class_id == class_id)
    items = db.scalars(query.order_by(CourseDiscussion.created_at.desc())).all()
    return {"data": [serialize_discussion(db, item) for item in items]}


@router.post("/teacher/discussions", status_code=201)
def create_discussion(
    payload: DiscussionCreate, teacher: User = Depends(current_teacher), db: Session = Depends(get_db),
):
    course = db.get(Course, payload.course_id)
    group = db.get(ClassGroup, payload.class_id)
    if not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="课程不存在")
    if not group or group.course_id != course.id:
        raise HTTPException(status_code=422, detail="班级不属于当前课程")
    item = CourseDiscussion(
        id=uid("discussion"), course_id=course.id, class_id=group.id, teacher_id=teacher.id,
        title=payload.title.strip(), content=payload.content.strip(), status="draft",
    )
    db.add(item)
    db.flush()
    if payload.publish:
        publish_to_students(db, teacher, item)
    else:
        db.add(AuditLog(
            actor_id=teacher.id, action="discussion.draft.save",
            resource_type="discussion", resource_id=item.id, detail=item.title,
        ))
    db.commit()
    return {"data": serialize_discussion(db, item)}


@router.post("/teacher/discussions/{discussion_id}/publish")
def publish_discussion(
    discussion_id: str, teacher: User = Depends(current_teacher), db: Session = Depends(get_db),
):
    item = teacher_discussion(db, teacher, discussion_id)
    publish_to_students(db, teacher, item)
    db.commit()
    return {"data": serialize_discussion(db, item)}


@router.post("/teacher/discussions/{discussion_id}/end")
def end_discussion(
    discussion_id: str, teacher: User = Depends(current_teacher), db: Session = Depends(get_db),
):
    item = teacher_discussion(db, teacher, discussion_id)
    if item.status != "published":
        raise HTTPException(status_code=409, detail="只有正在进行的讨论可以结束")
    item.status = "ended"
    db.add(AuditLog(
        actor_id=teacher.id, action="discussion.end",
        resource_type="discussion", resource_id=item.id, detail=item.title,
    ))
    db.commit()
    return {"data": serialize_discussion(db, item)}


@router.get("/student/discussions")
def list_student_discussions(
    student: User = Depends(current_student), db: Session = Depends(get_db),
):
    class_ids = db.scalars(select(Enrollment.class_id).where(Enrollment.student_id == student.id)).all()
    items = db.scalars(
        select(CourseDiscussion)
        .where(CourseDiscussion.class_id.in_(class_ids), CourseDiscussion.status == "published")
        .order_by(CourseDiscussion.published_at.desc())
    ).all()
    return {"data": [serialize_discussion(db, item) for item in items]}


@router.post("/student/discussions/{discussion_id}/replies", status_code=201)
def reply_discussion(
    discussion_id: str, payload: DiscussionReplyCreate,
    student: User = Depends(current_student), db: Session = Depends(get_db),
):
    item = db.get(CourseDiscussion, discussion_id)
    if not item or item.status != "published":
        raise HTTPException(status_code=404, detail="讨论不存在或尚未发布")
    enrolled = db.scalar(select(Enrollment).where(
        Enrollment.class_id == item.class_id, Enrollment.student_id == student.id,
    ))
    if not enrolled:
        raise HTTPException(status_code=403, detail="不属于该讨论班级")
    reply = DiscussionReply(
        id=uid("reply"), discussion_id=item.id, student_id=student.id, content=payload.content.strip(),
    )
    db.add(reply)
    db.add(Notification(
        id=uid("notice"), user_id=item.teacher_id, type="discussion",
        title=f"{student.name} 参与了课堂讨论", content=payload.content[:240],
    ))
    db.add(AuditLog(
        actor_id=student.id, action="discussion.reply",
        resource_type="discussion", resource_id=item.id, detail=reply.content[:240],
    ))
    db.commit()
    return {"data": serialize_discussion(db, item)}
