from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


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
    language: Mapped[str] = mapped_column(String(20), nullable=False)
    interface_spec: Mapped[str] = mapped_column(Text, nullable=False)
    learning_objectives: Mapped[str] = mapped_column(Text, nullable=False)
    capability_ids: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)

    course: Mapped[Course] = relationship()
    test_cases: Mapped[list["TestCase"]] = relationship(order_by="TestCase.sort_order")


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


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    authority_level: Mapped[str] = mapped_column(String(20), nullable=False)
    student_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


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
