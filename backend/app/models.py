from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def now() -> datetime:
    return datetime.now().replace(microsecond=0)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20), index=True)
    number: Mapped[str | None] = mapped_column(String(40), unique=True)
    email: Mapped[str | None] = mapped_column(String(160))
    department: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class TeacherCredential(Base):
    __tablename__ = "teacher_credentials"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    password_salt: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(128))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class TeacherPreference(Base):
    __tablename__ = "teacher_preferences"

    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    ai_assistant_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    email_digest: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class CourseDraft(Base):
    __tablename__ = "course_drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    saved_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    code: Mapped[str] = mapped_column(String(40), unique=True)
    term: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="preparing")
    student_visible: Mapped[bool] = mapped_column(Boolean, default=False)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    classes: Mapped[list[ClassGroup]] = relationship(back_populates="course", cascade="all, delete-orphan")
    chapters: Mapped[list[Chapter]] = relationship(back_populates="course", cascade="all, delete-orphan", order_by="Chapter.position")
    tasks: Mapped[list[Task]] = relationship(back_populates="course", cascade="all, delete-orphan")
    materials: Mapped[list[Material]] = relationship(back_populates="course", cascade="all, delete-orphan")


class CourseAnnouncement(Base):
    __tablename__ = "course_announcements"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    content_json: Mapped[str] = mapped_column(Text, default="[]")
    audience: Mapped[str] = mapped_column(String(200), default="全部授课班级")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    announcement_id: Mapped[str] = mapped_column(ForeignKey("course_announcements.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    read_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class ClassGroup(Base):
    __tablename__ = "class_groups"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    grade: Mapped[str] = mapped_column(String(40), default="2024级")
    major: Mapped[str] = mapped_column(String(120), default="软件工程")
    schedule: Mapped[str] = mapped_column(String(120), default="")
    mentor: Mapped[str] = mapped_column(String(80), default="")
    join_code: Mapped[str] = mapped_column(String(20), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    course: Mapped[Course] = relationship(back_populates="classes")
    enrollments: Mapped[list[Enrollment]] = relationship(back_populates="class_group", cascade="all, delete-orphan")


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("class_id", "student_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("class_groups.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    class_group: Mapped[ClassGroup] = relationship(back_populates="enrollments")
    student: Mapped[User] = relationship()


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(Integer)
    teaching_mode: Mapped[str] = mapped_column(String(40), default="理论讲授")
    status: Mapped[str] = mapped_column(String(20), default="draft")

    course: Mapped[Course] = relationship(back_populates="chapters")
    knowledge_points: Mapped[list[KnowledgePoint]] = relationship(back_populates="chapter", cascade="all, delete-orphan")


class KnowledgePoint(Base):
    __tablename__ = "knowledge_points"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    difficulty: Mapped[str] = mapped_column(String(20), default="基础")
    mastery: Mapped[int] = mapped_column(Integer, default=0)
    position_x: Mapped[int] = mapped_column(Integer, default=50)
    position_y: Mapped[int] = mapped_column(Integer, default=50)

    chapter: Mapped[Chapter] = relationship(back_populates="knowledge_points")


class TeacherKnowledgeGraph(Base):
    __tablename__ = "teacher_knowledge_graphs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    target_classes: Mapped[str] = mapped_column(Text, default="[]")
    source_files: Mapped[str] = mapped_column(Text, default="[]")
    source_summary: Mapped[str] = mapped_column(Text, default="")
    nodes_json: Mapped[str] = mapped_column(Text, default="[]")
    edges_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(30))
    chapter_label: Mapped[str] = mapped_column(String(120))
    size: Mapped[str] = mapped_column(String(30), default="")
    visibility: Mapped[str] = mapped_column(String(20), default="teacher")
    status: Mapped[str] = mapped_column(String(20), default="ready")
    citations: Mapped[int] = mapped_column(Integer, default=0)
    content_url: Mapped[str | None] = mapped_column(String(300))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    course: Mapped[Course] = relationship(back_populates="materials")


class MaterialKnowledgeLink(Base):
    __tablename__ = "material_knowledge_links"
    __table_args__ = (UniqueConstraint("material_id", "knowledge_point_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    material_id: Mapped[str] = mapped_column(ForeignKey("materials.id", ondelete="CASCADE"), index=True)
    knowledge_point_id: Mapped[str] = mapped_column(ForeignKey("knowledge_points.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class CourseDiscussion(Base):
    __tablename__ = "course_discussions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("class_groups.id", ondelete="CASCADE"), index=True)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)


class DiscussionReply(Base):
    __tablename__ = "discussion_replies"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    discussion_id: Mapped[str] = mapped_column(ForeignKey("course_discussions.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    class_id: Mapped[str | None] = mapped_column(ForeignKey("class_groups.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(30))
    chapter_label: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    starter_code: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    difficulty: Mapped[str] = mapped_column(String(20), default="基础")
    total_score: Mapped[int] = mapped_column(Integer, default=100)
    publish_at: Mapped[datetime | None] = mapped_column(DateTime)
    due_at: Mapped[datetime] = mapped_column(DateTime)
    allow_hints: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    course: Mapped[Course] = relationship(back_populates="tasks")
    test_cases: Mapped[list[TestCase]] = relationship(back_populates="task", cascade="all, delete-orphan")
    submissions: Mapped[list[Submission]] = relationship(back_populates="task", cascade="all, delete-orphan")


class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    input_data: Mapped[str] = mapped_column(Text, default="")
    expected_output: Mapped[str] = mapped_column(Text, default="")
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    weight: Mapped[int] = mapped_column(Integer, default=10)

    task: Mapped[Task] = relationship(back_populates="test_cases")


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    source_code: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    hint_level: Mapped[int] = mapped_column(Integer, default=0)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    task: Mapped[Task] = relationship(back_populates="submissions")
    student: Mapped[User] = relationship()
    evaluation: Mapped[EvaluationResult | None] = relationship(back_populates="submission", cascade="all, delete-orphan", uselist=False)
    grade: Mapped[Grade | None] = relationship(back_populates="submission", cascade="all, delete-orphan", uselist=False)
    diagnosis: Mapped[DiagnosisResult | None] = relationship(back_populates="submission", cascade="all, delete-orphan", uselist=False)
    feedback: Mapped[list[TeacherFeedback]] = relationship(back_populates="submission", cascade="all, delete-orphan")


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), unique=True)
    passed_tests: Mapped[int] = mapped_column(Integer)
    total_tests: Mapped[int] = mapped_column(Integer)
    runtime_ms: Mapped[int] = mapped_column(Integer)
    compile_output: Mapped[str] = mapped_column(Text, default="")
    score: Mapped[int] = mapped_column(Integer)
    details_json: Mapped[str] = mapped_column(Text, default="[]")
    evaluated_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    submission: Mapped[Submission] = relationship(back_populates="evaluation")


class Grade(Base):
    __tablename__ = "grades"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), unique=True)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    score: Mapped[int] = mapped_column(Integer)
    dimensions_json: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="graded")
    comment: Mapped[str] = mapped_column(Text, default="")
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    submission: Mapped[Submission] = relationship(back_populates="grade")


class DiagnosisResult(Base):
    __tablename__ = "diagnosis_results"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), unique=True)
    type: Mapped[str] = mapped_column(String(80))
    explanation: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(240))
    fallback: Mapped[bool] = mapped_column(Boolean, default=False)
    needs_teacher_review: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    submission: Mapped[Submission] = relationship(back_populates="diagnosis")
    review: Mapped[DiagnosisReview | None] = relationship(back_populates="diagnosis", cascade="all, delete-orphan", uselist=False)


class DiagnosisReview(Base):
    __tablename__ = "diagnosis_reviews"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    diagnosis_id: Mapped[str] = mapped_column(ForeignKey("diagnosis_results.id"), unique=True)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    reviewed_explanation: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str] = mapped_column(Text, default="")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)

    diagnosis: Mapped[DiagnosisResult] = relationship(back_populates="review")


class TeacherFeedback(Base):
    __tablename__ = "teacher_feedback"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), index=True)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    student_visible: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    submission: Mapped[Submission] = relationship(back_populates="feedback")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(160))
    content: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(80))
    resource_type: Mapped[str] = mapped_column(String(60))
    resource_id: Mapped[str] = mapped_column(String(60))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
