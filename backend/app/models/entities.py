from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import UserDefinedType


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Vector1024(UserDefinedType):
    """pgvector column in PostgreSQL, plain text in SQLite tests."""

    cache_ok = True

    def get_col_spec(self, **_: object) -> str:
        return "VECTOR(1024)"


@compiles(Vector1024, "sqlite")
def _compile_vector_sqlite(_: Vector1024, __, **___: object) -> str:
    return "TEXT"


@compiles(Vector1024, "postgresql")
def _compile_vector_postgresql(_: Vector1024, __, **___: object) -> str:
    return "VECTOR(1024)"


class TsVector(UserDefinedType):
    cache_ok = True

    def get_col_spec(self, **_: object) -> str:
        return "TSVECTOR"


@compiles(TsVector, "sqlite")
def _compile_tsvector_sqlite(_: TsVector, __, **___: object) -> str:
    return "TEXT"


@compiles(TsVector, "postgresql")
def _compile_tsvector_postgresql(_: TsVector, __, **___: object) -> str:
    return "TSVECTOR"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str | None] = mapped_column(String(80), unique=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(220))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    term: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    owner_teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("course_id", "user_id", name="uq_enrollment_course_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)


class AdministrativeClass(Base):
    __tablename__ = "classes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    grade: Mapped[str] = mapped_column(String(20), nullable=False)
    major_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class StudentClassMembership(Base):
    __tablename__ = "student_class_memberships"
    __table_args__ = (
        UniqueConstraint("class_id", "student_id", name="uq_student_class_membership"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id"), nullable=False)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    administrative_class: Mapped[AdministrativeClass] = relationship()
    student: Mapped[User] = relationship()


class Capability(Base):
    __tablename__ = "capabilities"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    workspace_type: Mapped[str] = mapped_column(String(30), nullable=False, default="CODING")
    language: Mapped[str] = mapped_column(String(20), nullable=False)
    interface_spec: Mapped[str] = mapped_column(Text, nullable=False)
    learning_objectives: Mapped[str] = mapped_column(Text, nullable=False)
    hint_forbidden_fragments: Mapped[str | None] = mapped_column(Text)
    capability_ids: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)

    course: Mapped[Course] = relationship()
    test_cases: Mapped[list["TestCase"]] = relationship(order_by="TestCase.sort_order")
    questions: Mapped[list["Question"]] = relationship(order_by="Question.sort_order")


class TeachingAssignment(Base):
    __tablename__ = "teaching_assignments"
    __table_args__ = (
        UniqueConstraint(
            "class_id",
            "course_id",
            "teacher_id",
            "term",
            name="uq_teaching_assignment_class_course_teacher_term",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id"), nullable=False)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    term: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    administrative_class: Mapped[AdministrativeClass] = relationship()
    course: Mapped[Course] = relationship()
    teacher: Mapped[User] = relationship()


class TaskAssignment(Base):
    __tablename__ = "task_assignments"
    __table_args__ = (
        UniqueConstraint("task_id", "teaching_assignment_id", name="uq_task_assignment_task_teaching"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    teaching_assignment_id: Mapped[str] = mapped_column(ForeignKey("teaching_assignments.id"), nullable=False)
    published_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    publish_status: Mapped[str] = mapped_column(String(20), nullable=False, default="PUBLISHED")
    assignment_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="PRACTICE")
    allow_hint_level_3: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    task: Mapped[Task] = relationship()
    teaching_assignment: Mapped[TeachingAssignment] = relationship()
    publisher: Mapped[User] = relationship()


class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False)
    input_data: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output_summary: Mapped[str] = mapped_column(Text, nullable=False)
    hidden_failure_summary: Mapped[str | None] = mapped_column(Text)
    error_tag: Mapped[str] = mapped_column(String(80), nullable=False)
    capability_id: Mapped[str] = mapped_column(ForeignKey("capabilities.id"), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    question_type: Mapped[str] = mapped_column(String(30), nullable=False)
    stem: Mapped[str] = mapped_column(Text, nullable=False)
    analysis: Mapped[str] = mapped_column(Text, nullable=False, default="")
    knowledge_points: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="BASIC")
    score: Mapped[float] = mapped_column(Float, nullable=False, default=10)
    error_type: Mapped[str | None] = mapped_column(String(80))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    task: Mapped[Task] = relationship(back_populates="questions")
    options: Mapped[list["QuestionOption"]] = relationship(order_by="QuestionOption.sort_order")


class QuestionOption(Base):
    __tablename__ = "question_options"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(8), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class QuestionAttempt(Base):
    __tablename__ = "question_attempts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("task_assignments.id"), nullable=False)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="DRAFT")
    answers_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    score: Mapped[float | None] = mapped_column(Float)
    max_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    result_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class QuestionAnswer(Base):
    __tablename__ = "question_answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_question_answer_attempt_question"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("question_attempts.id"), nullable=False)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"), nullable=False)
    selected_option_ids: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class KnowledgeSource(Base):
    """课程知识源，即教师端「资料中心」维护的资料（开发方案 §七）。

    三个开关互相独立，不要合并：
    - `status`      资料本身是否在用（ACTIVE / DISABLED / PARSE_PENDING / PARSE_FAILED）
    - `student_visible` 学生能否直接查看
    - `ai_retrievable`  是否参与 AI 检索

    `chapter` 存字符串、`knowledge_points` 存 JSON 列表，是因为 §六 6.2 课程大纲还
    没开发，没有章节表可以外键。等章节—知识点建模落地再迁成外键。
    """

    __tablename__ = "knowledge_sources"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    authority_level: Mapped[str] = mapped_column(String(20), nullable=False)
    student_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    chapter: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    # JSON 字符串数组，写法对齐 Question.knowledge_points
    knowledge_points: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    # 文本资料正文，AI 检索真正读的内容；上传文件在第一版为空（§7.4 不做切片）
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    ai_retrievable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    share_scope: Mapped[str] = mapped_column(String(20), nullable=False, default="COURSE")

    file_name: Mapped[str | None] = mapped_column(String(255))
    file_size: Mapped[int | None] = mapped_column(Integer)
    mime_type: Mapped[str | None] = mapped_column(String(120))
    storage_path: Mapped[str | None] = mapped_column(String(500))

    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class KnowledgeSourceRevision(Base):
    """资料历史版本，只追加（§7.2 C 版本记录 / §15.2 历史不得物理覆盖）。

    做法与 `DiagnosisReview` 一致：编辑资料时先把改动前的内容抄一行进来，
    再更新主表。旧行永不改写、永不删除，所以「引用了 v0.1 的历史诊断」始终能
    还原当时读到的正文。
    """

    __tablename__ = "knowledge_source_revisions"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("knowledge_sources.id"), nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    editor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    change_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class RagKnowledgeBase(Base):
    __tablename__ = "knowledge_bases"
    __table_args__ = (
        Index("ix_knowledge_bases_owner", "owner_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    embedding_provider: Mapped[str] = mapped_column(String(64), nullable=False, default="bge-m3")
    embedding_model: Mapped[str] = mapped_column(String(255), nullable=False, default="BAAI/bge-m3")
    embedding_dim: Mapped[int] = mapped_column(Integer, nullable=False, default=1024)
    chunk_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="parent_child")
    retrieval_config: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    owner: Mapped[User] = relationship()


class RagDocument(Base):
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("knowledge_base_id", "sha256", name="uq_documents_kb_sha256"),
        Index("idx_documents_kb_status", "knowledge_base_id", "status"),
        Index("ix_documents_owner", "owner_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    knowledge_base_id: Mapped[str] = mapped_column(ForeignKey("knowledge_bases.id"), nullable=False)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(128))
    extension: Mapped[str | None] = mapped_column(String(32))
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    file_profile: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    active_version_id: Mapped[str | None] = mapped_column(String(64))
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_stage: Mapped[str | None] = mapped_column(String(32))
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    knowledge_base: Mapped[RagKnowledgeBase] = relationship()
    owner: Mapped[User] = relationship()


class RagDocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "version_no", name="uq_document_version_no"),
        Index("ix_document_versions_document", "document_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    parser_name: Mapped[str | None] = mapped_column(String(64))
    parser_version: Mapped[str | None] = mapped_column(String(64))
    chunk_config: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    content_profile: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    cleaning_strategy: Mapped[str] = mapped_column(String(64), nullable=False, default="generic_clean")
    chunking_strategy: Mapped[str] = mapped_column(String(64), nullable=False, default="section_recursive")
    embedding_model: Mapped[str] = mapped_column(String(255), nullable=False)
    embedding_dim: Mapped[int] = mapped_column(Integer, nullable=False, default=1024)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    document: Mapped[RagDocument] = relationship()


class RagDocumentElement(Base):
    __tablename__ = "document_elements"
    __table_args__ = (
        UniqueConstraint("document_version_id", "seq_no", name="uq_document_element_version_seq"),
        Index("ix_document_elements_version", "document_version_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id"), nullable=False)
    seq_no: Mapped[int] = mapped_column(Integer, nullable=False)
    element_type: Mapped[str] = mapped_column(String(32), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    page_no: Mapped[int | None] = mapped_column(Integer)
    slide_no: Mapped[int | None] = mapped_column(Integer)
    heading_level: Mapped[int | None] = mapped_column(Integer)
    heading_path: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    metadata_json: Mapped[str] = mapped_column("metadata", Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    version: Mapped[RagDocumentVersion] = relationship()


class RagChunk(Base):
    __tablename__ = "chunks"
    __table_args__ = (
        Index("idx_chunks_kb", "knowledge_base_id"),
        Index("idx_chunks_document", "document_id"),
        Index("idx_chunks_version", "document_version_id"),
        Index("ix_chunks_parent", "parent_chunk_id"),
        UniqueConstraint("document_version_id", "chunk_type", "chunk_index", name="uq_chunks_version_type_index"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    knowledge_base_id: Mapped[str] = mapped_column(ForeignKey("knowledge_bases.id"), nullable=False)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False)
    document_version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id"), nullable=False)
    parent_chunk_id: Mapped[str | None] = mapped_column(String(64))
    chunk_type: Mapped[str] = mapped_column(String(16), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    heading: Mapped[str | None] = mapped_column(Text)
    heading_path: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    page_start: Mapped[int | None] = mapped_column(Integer)
    page_end: Mapped[int | None] = mapped_column(Integer)
    slide_start: Mapped[int | None] = mapped_column(Integer)
    slide_end: Mapped[int | None] = mapped_column(Integer)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False, default="text")
    char_count: Mapped[int] = mapped_column(Integer, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer)
    embedding: Mapped[str | None] = mapped_column(Vector1024)
    search_vector: Mapped[str | None] = mapped_column(TsVector)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_json: Mapped[str] = mapped_column("metadata", Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    document: Mapped[RagDocument] = relationship()
    version: Mapped[RagDocumentVersion] = relationship()
    knowledge_base: Mapped[RagKnowledgeBase] = relationship()


class RagIngestJob(Base):
    __tablename__ = "ingest_jobs"
    __table_args__ = (
        Index("ix_ingest_jobs_document", "document_id"),
        Index("ix_ingest_jobs_version", "document_version_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False)
    document_version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id"), nullable=False)
    celery_task_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    current_stage: Mapped[str] = mapped_column(String(32), nullable=False)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_payload: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    document: Mapped[RagDocument] = relationship()
    version: Mapped[RagDocumentVersion] = relationship()


class CourseChapter(Base):
    """课程章节（开发方案 §六 6.2 课程大纲）。

    第一版只做「章节 — 知识点」两层，不做知识图谱，所以这里没有 parent_id。
    `sort_order` 是教师拖拽排序的落点，删除章节前要求它名下没有生效知识点。
    """

    __tablename__ = "course_chapters"
    __table_args__ = (UniqueConstraint("course_id", "title", name="uq_course_chapter_title"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")

    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    knowledge_points: Mapped[list["CourseKnowledgePoint"]] = relationship(
        order_by="CourseKnowledgePoint.sort_order"
    )


class CourseKnowledgePoint(Base):
    """章节下的知识点（开发方案 §六 6.2）。

    `course_id` 冗余存一份，并且 (course_id, name) 唯一 —— 这是软关联的前提。
    历史数据里知识点一直是**名称**而不是外键（`knowledge_sources.knowledge_points`、
    `questions.knowledge_points` 是 JSON 名称数组，`learner_knowledge_states` 的唯一键
    就是 (student_id, course_id, knowledge_point)），所以名称在课程内必须唯一，
    否则按名字回查资料／题目／画像会歧义。

    同理，被引用的知识点**不允许改名**：软关联靠名字，改了名历史引用会静默变成孤儿。
    这条在 `api/teacher_courses.py` 的 PATCH 里挡。本轮不把那些自由文本列迁成外键。
    """

    __tablename__ = "course_knowledge_points"
    __table_args__ = (
        UniqueConstraint("course_id", "name", name="uq_course_knowledge_point_name"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("course_chapters.id"), nullable=False)
    # 长度对齐 learner_knowledge_states.knowledge_point，两边存的是同一个名字
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # §6.2 知识点标签：类型 + 难度
    point_type: Mapped[str] = mapped_column(String(20), nullable=False, default="CONCEPT")
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="BASIC")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")

    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class StudentKnowledgeGraph(Base):
    """教师发布给某个教学安排的课程知识图谱，学生端只读。

    同一门课程在不同班级可以有不同图谱，所以唯一边界放在 teaching_assignment_id。
    """

    __tablename__ = "student_knowledge_graphs"
    __table_args__ = (
        UniqueConstraint("teaching_assignment_id", name="uq_student_knowledge_graph_teaching_assignment"),
        Index("ix_student_knowledge_graph_scope", "class_id", "course_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    teaching_assignment_id: Mapped[str] = mapped_column(ForeignKey("teaching_assignments.id"), nullable=False)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id"), nullable=False)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="published")
    target_classes: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    source_files: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    source_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    nodes_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    edges_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    teaching_assignment: Mapped[TeachingAssignment] = relationship()
    administrative_class: Mapped[AdministrativeClass] = relationship()
    course: Mapped[Course] = relationship()
    teacher: Mapped[User] = relationship()


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("student_id", "task_id", name="uq_submission_student_task"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    latest_version_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    first_submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    passed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    student: Mapped[User] = relationship()
    task: Mapped[Task] = relationship()
    versions: Mapped[list["SubmissionVersion"]] = relationship(order_by="SubmissionVersion.version_no")


class Grade(Base):
    """教师对一次学生提交的评分记录。"""

    __tablename__ = "grades"
    __table_args__ = (UniqueConstraint("submission_id", name="uq_grade_submission"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    dimensions_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    submission: Mapped[Submission] = relationship()
    teacher: Mapped[User] = relationship()


class TeacherFeedback(Base):
    """教师发给学生的任务反馈。"""

    __tablename__ = "teacher_feedback"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    teacher_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    student_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    submission: Mapped[Submission] = relationship()
    teacher: Mapped[User] = relationship()


class StudentTaskProgress(Base):
    __tablename__ = "student_task_progress"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_student_task_progress_assignment_student"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("task_assignments.id"), nullable=False)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="NOT_STARTED")
    latest_submission_id: Mapped[str | None] = mapped_column(ForeignKey("submissions.id"))
    latest_version_id: Mapped[str | None] = mapped_column(ForeignKey("submission_versions.id"))
    passed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_required_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    highest_hint_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score: Mapped[float | None] = mapped_column(Float)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    assignment: Mapped[TaskAssignment] = relationship()
    student: Mapped[User] = relationship()


class SubmissionVersion(Base):
    __tablename__ = "submission_versions"
    __table_args__ = (UniqueConstraint("submission_id", "version_no", name="uq_submission_version_no"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    language: Mapped[str] = mapped_column(String(20), nullable=False)
    source_code: Mapped[str] = mapped_column(Text, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    viewed_reference_answer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    highest_hint_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    submission: Mapped[Submission] = relationship(back_populates="versions")
    execution: Mapped["ExecutionRun"] = relationship(back_populates="version", uselist=False)
    diagnosis: Mapped["Diagnosis"] = relationship(back_populates="version", uselist=False)


class ExecutionRun(Base):
    __tablename__ = "execution_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    submission_version_id: Mapped[str] = mapped_column(ForeignKey("submission_versions.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    compile_exit_code: Mapped[int | None] = mapped_column(Integer)
    compiler_stdout: Mapped[str] = mapped_column(Text, nullable=False, default="")
    compiler_stderr: Mapped[str] = mapped_column(Text, nullable=False, default="")
    resource_usage: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_reason: Mapped[str | None] = mapped_column(String(200))
    idempotency_key: Mapped[str | None] = mapped_column(String(160))

    version: Mapped[SubmissionVersion] = relationship(back_populates="execution")
    test_results: Mapped[list["TestResult"]] = relationship(order_by="TestResult.sort_order")


class TestResult(Base):
    __tablename__ = "test_results"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    execution_run_id: Mapped[str] = mapped_column(ForeignKey("execution_runs.id"), nullable=False)
    test_case_id: Mapped[str] = mapped_column(ForeignKey("test_cases.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    actual_output: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output_summary: Mapped[str] = mapped_column(Text, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    error_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    error_tag: Mapped[str] = mapped_column(String(80), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    test_case: Mapped[TestCase] = relationship()


class Diagnosis(Base):
    __tablename__ = "diagnoses"
    # 一个版本最多一份诊断 —— create_diagnosis_for_version 和上面
    # SubmissionVersion.diagnosis 这个标量 relationship 都早就假设了一对一，
    # 但数据库层一直没有约束。用唯一索引而非 UniqueConstraint：SQLite 加约束
    # 要 batch 模式重建表，加索引原生支持。
    __table_args__ = (
        Index("uq_diagnoses_submission_version_id", "submission_version_id", unique=True),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    submission_version_id: Mapped[str] = mapped_column(ForeignKey("submission_versions.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    diagnosis_type: Mapped[str] = mapped_column(String(80), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    verified_evidence_ids: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    knowledge_source_ids: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    needs_teacher_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    model_provider: Mapped[str] = mapped_column(String(60), nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    version: Mapped[SubmissionVersion] = relationship(back_populates="diagnosis")
    hints: Mapped[list["HintRecord"]] = relationship(order_by="HintRecord.level")


class HintRecord(Base):
    __tablename__ = "hint_records"
    __table_args__ = (UniqueConstraint("diagnosis_id", "level", name="uq_hint_diagnosis_level"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    diagnosis_id: Mapped[str] = mapped_column(ForeignKey("diagnoses.id"), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="VIEWED")
    leakage_check: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    student_requested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    request_reason: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    diagnosis: Mapped[Diagnosis] = relationship(back_populates="hints")


class DiagnosisReview(Base):
    """教师对一条 AI 诊断的审核结论。

    开发方案 §11.4 要求「原始 AI 输出不能覆盖，教师审核单独保存」，所以这里是一张
    只追加的记录表：`diagnoses` 行永不被审核流程改写，某条诊断的当前审核状态取它
    最新一条 review 的 action，没有 review 就是 PENDING（§14.4）。

    同一条诊断允许多行：教师改主意（先驳回又接受）要留痕，不能就地改旧结论。
    """

    __tablename__ = "diagnosis_reviews"
    __table_args__ = (Index("ix_diagnosis_reviews_diagnosis_id", "diagnosis_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    diagnosis_id: Mapped[str] = mapped_column(ForeignKey("diagnoses.id"), nullable=False)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    # ACCEPTED / MODIFIED / REJECTED，见 §14.4；PENDING 是「没有记录」而不是一行数据
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    # 仅 MODIFIED 有值：教师修订后的最终解释，学生端显示为「教师已修改」
    revised_explanation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    diagnosis: Mapped[Diagnosis] = relationship()
    reviewer: Mapped[User] = relationship()


class CapabilityEvidence(Base):
    __tablename__ = "capability_evidence"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    capability_id: Mapped[str] = mapped_column(ForeignKey("capabilities.id"), nullable=False)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    submission_version_id: Mapped[str] = mapped_column(ForeignKey("submission_versions.id"), nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(60), nullable=False)
    strength: Mapped[str] = mapped_column(String(20), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    teacher_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class CapabilityState(Base):
    __tablename__ = "capability_states"
    __table_args__ = (UniqueConstraint("student_id", "capability_id", name="uq_capability_state_student_capability"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    capability_id: Mapped[str] = mapped_column(ForeignKey("capabilities.id"), nullable=False)
    state: Mapped[str] = mapped_column(String(30), nullable=False)
    reason_summary: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class LearnerEvent(Base):
    __tablename__ = "learner_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id"), nullable=False)
    teaching_assignment_id: Mapped[str | None] = mapped_column(ForeignKey("teaching_assignments.id"))
    assignment_id: Mapped[str | None] = mapped_column(ForeignKey("task_assignments.id"))
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id"))
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    knowledge_points: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    error_type: Mapped[str | None] = mapped_column(String(80))
    payload: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class LearnerProfileSnapshot(Base):
    __tablename__ = "learner_profile_snapshots"
    __table_args__ = (
        UniqueConstraint("student_id", "course_id", name="uq_learner_profile_student_course"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id"), nullable=False)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    overall_progress: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    hint_dependency_level: Mapped[str] = mapped_column(String(20), nullable=False, default="LOW")
    compile_error_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    logic_error_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    recent_task_completion: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    recommendation_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class LearnerKnowledgeState(Base):
    __tablename__ = "learner_knowledge_states"
    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "course_id",
            "knowledge_point",
            name="uq_learner_knowledge_student_course_point",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    knowledge_point: Mapped[str] = mapped_column(String(100), nullable=False)
    mastery_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="STABLE")
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_evidence: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class LearnerErrorStat(Base):
    __tablename__ = "learner_error_stats"
    __table_args__ = (
        UniqueConstraint("student_id", "course_id", "error_type", name="uq_learner_error_student_course_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    error_type: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="LOW")
    related_knowledge_points: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    recommendation_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    related_task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id"))
    related_knowledge_points: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    suggested_action: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    request_id: Mapped[str] = mapped_column(String(80), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(64))
    submission_id: Mapped[str | None] = mapped_column(String(64))
    version_id: Mapped[str | None] = mapped_column(String(64))
    execution_id: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(80))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AgentRun(Base):
    """一次 AI 工作流运行。字段以内置版 §14.1 为基准。

    §14.1 之外补了四个：`error_code`（`error_message` 是自由文本、不可聚合，
    要对上 `ai/errors.py` 的分类才能统计失败率）、`attempts`、
    `token_prompt` / `token_completion`（调 prompt 和算成本的必需项）。
    """

    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id"))
    workflow_type: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="RUNNING")
    input_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    output_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    model_provider: Mapped[str | None] = mapped_column(String(60))
    model_name: Mapped[str | None] = mapped_column(String(100))
    prompt_version: Mapped[str | None] = mapped_column(String(40))
    error_code: Mapped[str | None] = mapped_column(String(60))
    error_message: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    token_prompt: Mapped[int | None] = mapped_column(Integer)
    token_completion: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    steps: Mapped[list["AgentStep"]] = relationship(order_by="AgentStep.step_order")


class AgentStep(Base):
    """运行内的单个步骤。字段直接采用内置版 §14.1。

    用 `*_summary` 而非全量 payload 是文档的选择，和 §5.3
    「不直接把所有历史代码全部塞入 Prompt」一致。
    """

    __tablename__ = "agent_steps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), nullable=False)
    step_name: Mapped[str] = mapped_column(String(80), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="SUCCEEDED")
    input_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    output_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    run: Mapped[AgentRun] = relationship(back_populates="steps")


class AiTutorSession(Base):
    __tablename__ = "ai_tutor_sessions"
    __table_args__ = (
        Index("ix_ai_tutor_sessions_student_updated", "student_id", "updated_at"),
        Index("ix_ai_tutor_sessions_student_course", "student_id", "course_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id"))
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    messages: Mapped[list["AiTutorMessage"]] = relationship(
        back_populates="session",
        order_by="AiTutorMessage.created_at",
    )


class AiTutorMessage(Base):
    __tablename__ = "ai_tutor_messages"
    __table_args__ = (
        Index("ix_ai_tutor_messages_session_created", "session_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("ai_tutor_sessions.id"), nullable=False)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id"))
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="SUCCEEDED")
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    session: Mapped[AiTutorSession] = relationship(back_populates="messages")


class StudentGeneratedResource(Base):
    __tablename__ = "student_generated_resources"
    __table_args__ = (
        Index("ix_student_generated_resources_student_saved", "student_id", "saved_to_resource_center", "updated_at"),
        Index("ix_student_generated_resources_student_course", "student_id", "course_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id"), nullable=False)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id"))
    session_id: Mapped[str | None] = mapped_column(ForeignKey("ai_tutor_sessions.id"))
    resource_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    knowledge_point: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="READY")
    render_payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    citations_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    file_path: Mapped[str | None] = mapped_column(Text)
    file_format: Mapped[str] = mapped_column(String(20), nullable=False, default="PPTX")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.72)
    saved_to_resource_center: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class StudentResourceFolder(Base):
    __tablename__ = "student_resource_folders"
    __table_args__ = (
        UniqueConstraint("student_id", "name", name="uq_student_resource_folder_name"),
        Index("ix_student_resource_folders_student_status", "student_id", "status", "sort_order"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    student: Mapped[User] = relationship()


class PracticeProject(Base):
    __tablename__ = "practice_projects"
    __table_args__ = (
        Index("ix_practice_projects_course_status", "course_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    long_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    project_type: Mapped[str] = mapped_column(String(40), nullable=False, default="RESEARCH_PRACTICE")
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="MEDIUM")
    direction: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    period_label: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    current_stage: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    total_stage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    accent: Mapped[str] = mapped_column(String(20), nullable=False, default="blue")
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    member_names_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    capability_points_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    path_steps_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    task_sections_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    submission_requirements_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    acceptance_criteria_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    mentor_tips_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    resources_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    course: Mapped[Course] = relationship()


class PracticeProjectEnrollment(Base):
    __tablename__ = "practice_project_enrollments"
    __table_args__ = (
        UniqueConstraint("project_id", "student_id", name="uq_practice_project_student"),
        Index("ix_practice_project_enrollments_student_status", "student_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("practice_projects.id"), nullable=False)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    class_id: Mapped[str] = mapped_column(ForeignKey("classes.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="IN_PROGRESS")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_stage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    experiment_record_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    submission_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    weekly_hours: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    last_activity_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    project: Mapped[PracticeProject] = relationship()
    student: Mapped[User] = relationship()
    administrative_class: Mapped[AdministrativeClass] = relationship()


class PracticeProjectSubmission(Base):
    __tablename__ = "practice_project_submissions"
    __table_args__ = (
        Index("ix_practice_project_submissions_project_student", "project_id", "student_id", "submitted_at"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("practice_projects.id"), nullable=False)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="SUBMITTED")
    review_comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    content_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    project: Mapped[PracticeProject] = relationship()
    student: Mapped[User] = relationship()


class PracticeProjectActivity(Base):
    __tablename__ = "practice_project_activities"
    __table_args__ = (
        Index("ix_practice_project_activities_student_created", "student_id", "created_at"),
        Index("ix_practice_project_activities_project_student", "project_id", "student_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("practice_projects.id"))
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    activity_type: Mapped[str] = mapped_column(String(40), nullable=False, default="PROJECT_UPDATED")
    text: Mapped[str] = mapped_column(Text, nullable=False)
    time_label: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    project: Mapped[PracticeProject | None] = relationship()
    student: Mapped[User] = relationship()


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (
        UniqueConstraint("user_id", "task_id", "idempotency_key", name="uq_idempotency_user_task_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    version_id: Mapped[str] = mapped_column(ForeignKey("submission_versions.id"), nullable=False)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_runs.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
