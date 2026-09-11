from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime, timedelta
import json
import secrets
import string
import uuid
from typing import Any
from urllib.parse import unquote

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session, selectinload

from backend.app.ai.errors import LLMError, LLMHTTPError, LLMNotConfigured, LLMTimeout
from backend.app.ai.llm_client import chat_json
from backend.app.core.config import get_settings

from .database import Base, SessionLocal, engine, get_db
from .models import (
    AuditLog,
    Chapter,
    ClassGroup,
    CourseDiscussion,
    Course,
    DiagnosisResult,
    DiagnosisReview,
    Enrollment,
    EvaluationResult,
    Grade,
    KnowledgePoint,
    Material,
    MaterialKnowledgeLink,
    Notification,
    Submission,
    Task,
    TeacherFeedback,
    TestCase,
    User,
)
from .schemas import (
    ChapterCreate,
    ChapterUpdate,
    ClassCreate,
    CourseCreate,
    CourseUpdate,
    FeedbackCreate,
    GradeUpsert,
    KnowledgePointCreate,
    LearningInterventionRequest,
    MaterialCreate,
    NotificationRead,
    QuestionInsightDiagnosisRequest,
    ReviewAction,
    StudentSubmissionCreate,
    TaskCreate,
    TaskPublish,
)
from .seed import seed_database
from .uploads import router as uploads_router
from .class_ops import router as class_ops_router
from .material_ops import router as material_ops_router
from .class_seed_patch import ensure_class_prototype_data, prototype_class_metrics
from .chapter_content_seed import ensure_chapter_content_seed
from .task_ai import router as task_ai_router
from .teacher_ai import router as teacher_ai_router
from .task_grade_seed import ensure_task_grade_fixture
from .material_folder_ops import router as material_folder_router
from .material_folder_seed import ensure_default_material_folders
from .graph_ops import router as graph_ops_router
from .discussion_ops import router as discussion_ops_router
from .teacher_graphs import router as teacher_graphs_router
from .frontend_persistence import router as frontend_persistence_router, ensure_frontend_persistence_seed


def uid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def envelope(data, **meta):
    response = {"data": data}
    if meta:
        response["meta"] = meta
    return response


def audit(db: Session, actor_id: str, action: str, resource_type: str, resource_id: str, detail: str = ""):
    db.add(AuditLog(actor_id=actor_id, action=action, resource_type=resource_type, resource_id=resource_id, detail=detail))


def ensure_class_filter_columns() -> None:
    """Add class filter fields to existing SQLite databases without replacing user data."""
    if engine.dialect.name != "sqlite":
        return
    columns = {item["name"] for item in inspect(engine).get_columns("class_groups")}
    with engine.begin() as connection:
        if "grade" not in columns:
            connection.execute(text("ALTER TABLE class_groups ADD COLUMN grade VARCHAR(40) NOT NULL DEFAULT '2024级'"))
        if "major" not in columns:
            connection.execute(text("ALTER TABLE class_groups ADD COLUMN major VARCHAR(120) NOT NULL DEFAULT '人工智能'"))


def ensure_grade_dimension_column() -> None:
    if engine.dialect.name != "sqlite":
        return
    if "grades" not in inspect(engine).get_table_names():
        return
    columns = {item["name"] for item in inspect(engine).get_columns("grades")}
    if "dimensions_json" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE grades ADD COLUMN dimensions_json TEXT NOT NULL DEFAULT ''"))


def ensure_chapter_content_columns() -> None:
    if engine.dialect.name != "sqlite" or "chapters" not in inspect(engine).get_table_names():
        return
    columns = {item["name"] for item in inspect(engine).get_columns("chapters")}
    with engine.begin() as connection:
        if "teaching_mode" not in columns:
            connection.execute(text("ALTER TABLE chapters ADD COLUMN teaching_mode VARCHAR(40) NOT NULL DEFAULT '理论讲授'"))
        if "status" not in columns:
            connection.execute(text("ALTER TABLE chapters ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft'"))


def ensure_teacher_graph_attachment_file_columns() -> None:
    if engine.dialect.name != "sqlite" or "teacher_graph_node_attachments" not in inspect(engine).get_table_names():
        return
    columns = {item["name"] for item in inspect(engine).get_columns("teacher_graph_node_attachments")}
    definitions = {
        "file_name": "VARCHAR(220) NOT NULL DEFAULT ''",
        "file_mime_type": "VARCHAR(120) NOT NULL DEFAULT ''",
        "file_size_bytes": "INTEGER NOT NULL DEFAULT 0",
        "file_url": "VARCHAR(500) NOT NULL DEFAULT ''",
        "stored_name": "VARCHAR(260) NOT NULL DEFAULT ''",
    }
    with engine.begin() as connection:
        for column, definition in definitions.items():
            if column not in columns:
                connection.execute(text(f"ALTER TABLE teacher_graph_node_attachments ADD COLUMN {column} {definition}"))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(engine)
    ensure_class_filter_columns()
    ensure_grade_dimension_column()
    ensure_chapter_content_columns()
    ensure_teacher_graph_attachment_file_columns()
    with SessionLocal() as db:
        seed_database(db)
        ensure_class_prototype_data(db)
        ensure_chapter_content_seed(db)
        ensure_task_grade_fixture(db)
        ensure_default_material_folders(db)
        ensure_frontend_persistence_seed(db)
    yield


app = FastAPI(
    title="CodeTrack Unified Teaching API",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(uploads_router)
app.include_router(class_ops_router)
app.include_router(material_ops_router)
app.include_router(task_ai_router)
app.include_router(teacher_ai_router)
app.include_router(material_folder_router)
app.include_router(graph_ops_router)
app.include_router(discussion_ops_router)
app.include_router(teacher_graphs_router, prefix="/api/v1")
app.include_router(teacher_graphs_router, prefix="/api")
app.include_router(frontend_persistence_router)

def current_teacher(
    x_user_id: str = Header(default="teacher-01"),
    x_user_name: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if user is None and x_user_name.strip():
        user = User(
            id=x_user_id,
            name=unquote(x_user_name.strip())[:80],
            role="teacher",
            department="人工智能学院",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要教师权限")
    return user


def current_student(
    x_user_id: str = Header(default="student-03"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要学生权限")
    return user


def owned_course(db: Session, teacher: User, course_id: str) -> Course:
    course = db.get(Course, course_id)
    if not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="课程不存在或无权访问")
    return course


def task_owner(db: Session, teacher: User, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    owned_course(db, teacher, task.course_id)
    return task


def serialize_course(db: Session, course: Course):
    class_count = db.scalar(select(func.count()).select_from(ClassGroup).where(ClassGroup.course_id == course.id)) or 0
    student_count = db.scalar(
        select(func.count(func.distinct(Enrollment.student_id)))
        .select_from(Enrollment)
        .join(ClassGroup)
        .where(ClassGroup.course_id == course.id)
    ) or 0
    task_count = db.scalar(select(func.count()).select_from(Task).where(Task.course_id == course.id)) or 0
    return {
        "id": course.id,
        "teacher_id": course.teacher_id,
        "name": course.name,
        "code": course.code,
        "term": course.term,
        "description": course.description,
        "status": course.status,
        "student_visible": course.student_visible,
        "progress": course.progress,
        "classes": class_count,
        "students": student_count,
        "task_count": task_count,
        "created_at": course.created_at.isoformat(),
        "updated_at": course.updated_at.isoformat(),
    }


def task_progress(db: Session, task: Task):
    total = 0
    if task.class_id:
        total = db.scalar(select(func.count()).select_from(Enrollment).where(Enrollment.class_id == task.class_id)) or 0
    submitted = db.scalar(
        select(func.count(func.distinct(Submission.student_id)))
        .select_from(Submission)
        .where(Submission.task_id == task.id)
    ) or 0
    return submitted, total, round(submitted * 100 / total) if total else 0


def serialize_task(db: Session, task: Task, include_hidden: bool = True):
    submitted, total, completion = task_progress(db, task)
    test_cases = [
        {
            "id": case.id,
            "name": case.name,
            "input_data": case.input_data if include_hidden or not case.hidden else None,
            "expected_output": case.expected_output if include_hidden or not case.hidden else None,
            "hidden": case.hidden,
            "weight": case.weight,
        }
        for case in task.test_cases
        if include_hidden or not case.hidden
    ]
    return {
        "id": task.id,
        "course_id": task.course_id,
        "class_id": task.class_id,
        "title": task.title,
        "type": task.type,
        "chapter": task.chapter_label,
        "description": task.description,
        "starter_code": task.starter_code,
        "status": task.status,
        "difficulty": task.difficulty,
        "total_score": task.total_score,
        "publish_at": task.publish_at.isoformat() if task.publish_at else None,
        "due_at": task.due_at.isoformat(),
        "allow_hints": task.allow_hints,
        "created_at": task.created_at.isoformat(),
        "submitted": submitted,
        "total": total,
        "completion": completion,
        "test_cases": test_cases,
    }


def serialize_submission(submission: Submission, include_hidden: bool = True):
    evaluation = submission.evaluation
    details = json.loads(evaluation.details_json) if evaluation else []
    if not include_hidden:
        hidden_names = {case.name for case in submission.task.test_cases if case.hidden}
        details = [item for item in details if item.get("name") not in hidden_names]
    diagnosis = submission.diagnosis
    review = diagnosis.review if diagnosis else None
    grade = submission.grade
    return {
        "id": submission.id,
        "task_id": submission.task_id,
        "student": {
            "id": submission.student.id,
            "name": submission.student.name,
            "number": submission.student.number,
        },
        "version": submission.version,
        "source_code": submission.source_code,
        "status": submission.status,
        "hint_level": submission.hint_level,
        "submitted_at": submission.submitted_at.isoformat(),
        "evaluation": None if not evaluation else {
            "passed_tests": evaluation.passed_tests,
            "total_tests": evaluation.total_tests,
            "runtime_ms": evaluation.runtime_ms,
            "compile_output": evaluation.compile_output,
            "score": evaluation.score,
            "details": details,
            "evaluated_at": evaluation.evaluated_at.isoformat(),
        },
        "diagnosis": None if not diagnosis else {
            "id": diagnosis.id,
            "type": diagnosis.type,
            "explanation": diagnosis.explanation,
            "confidence": diagnosis.confidence,
            "source": diagnosis.source,
            "fallback": diagnosis.fallback,
            "needs_teacher_review": diagnosis.needs_teacher_review,
            "review_status": review.status if review else None,
            "reviewed_explanation": review.reviewed_explanation if review else None,
        },
        "grade": None if not grade else {
            "id": grade.id,
            "score": grade.score,
            "status": grade.status,
            "comment": grade.comment,
            "dimensions": json.loads(grade.dimensions_json) if grade.dimensions_json else None,
            "published_at": grade.published_at.isoformat() if grade.published_at else None,
        },
        "feedback": [
            {
                "id": item.id,
                "content": item.content,
                "status": item.status,
                "student_visible": item.student_visible,
                "created_at": item.created_at.isoformat(),
            }
            for item in submission.feedback
        ],
    }


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "codetrack-api", "time": datetime.now().isoformat()}


@app.get("/api/v1/teacher/bootstrap")
def teacher_bootstrap(
    course_id: str = "course-ds",
    class_id: str = "class-se1",
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    courses = db.scalars(select(Course).where(Course.teacher_id == teacher.id).order_by(Course.created_at)).all()
    selected_course = next((item for item in courses if item.id == course_id), None) or (courses[0] if courses else None)
    course_id = selected_course.id if selected_course else ""
    class_groups = db.scalars(
        select(ClassGroup).join(Course).where(Course.teacher_id == teacher.id).order_by(ClassGroup.name)
    ).all()
    selected_class = next(
        (item for item in class_groups if item.id == class_id and item.course_id == course_id),
        next((item for item in class_groups if item.course_id == course_id), None),
    )
    class_id = selected_class.id if selected_class else ""
    notifications = db.scalars(
        select(Notification).where(Notification.user_id == teacher.id).order_by(Notification.created_at.desc())
    ).all()
    return envelope({
        "teacher": {"id": teacher.id, "name": teacher.name, "number": teacher.number, "email": teacher.email, "department": teacher.department},
        "courses": [serialize_course(db, course) for course in courses],
        "classes": [
            {
                "id": item.id,
                "course_id": item.course_id,
                "name": item.name,
                "grade": item.grade,
                "major": item.major,
                "schedule": item.schedule,
                "mentor": item.mentor,
                "join_code": item.join_code,
                "students": len(item.enrollments),
                "status": item.status,
            }
            for item in class_groups
        ],
        "selected_course_id": course_id,
        "selected_class_id": class_id,
        "notifications": [
            {
                "id": item.id,
                "type": item.type,
                "title": item.title,
                "content": item.content,
                "read": item.read,
                "created_at": item.created_at.isoformat(),
            }
            for item in notifications
        ],
    })


@app.get("/api/v1/teacher/dashboard")
def dashboard(
    course_id: str = "course-ds",
    class_id: str = "class-se1",
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    if not course_id:
        return envelope({
            "summary": {
                "students": 0,
                "active_tasks": 0,
                "completion_rate": 0,
                "overdue_students": 0,
                "pending_reviews": 0,
                "risk_students": 0,
            },
            "recent_tasks": [],
            "todos": [],
            "trend": [],
        })
    owned_course(db, teacher, course_id)
    students_count = db.scalar(select(func.count()).select_from(Enrollment).where(Enrollment.class_id == class_id)) or 0
    tasks = db.scalars(
        select(Task)
        .options(selectinload(Task.test_cases))
        .where(Task.course_id == course_id)
        .order_by(Task.created_at.desc())
    ).all()
    active_tasks = [item for item in tasks if item.status == "published"]
    completions = [task_progress(db, item)[2] for item in active_tasks]
    pending_reviews = db.scalar(
        select(func.count())
        .select_from(DiagnosisReview)
        .join(DiagnosisResult)
        .join(Submission)
        .join(Task)
        .where(Task.course_id == course_id, DiagnosisReview.status == "pending")
    ) or 0
    return envelope({
        "summary": {
            "students": students_count,
            "active_tasks": len(active_tasks),
            "completion_rate": round(sum(completions) / len(completions)) if completions else 0,
            "overdue_students": 5,
            "pending_reviews": pending_reviews,
            "risk_students": 4,
        },
        "recent_tasks": [serialize_task(db, task) for task in tasks[:3]],
        "todos": [
            {"id": "todo-grade", "type": "批改", "title": "批改链表节点删除任务", "detail": "还有提交待复核", "target": "grading"},
            {"id": "todo-risk", "type": "预警", "title": "核查高风险学生", "detail": "连续任务未完成", "target": "analytics"},
            {"id": "todo-ai", "type": "AI", "title": "处理低置信度诊断", "detail": f"{pending_reviews} 条等待审核", "target": "ai-review"},
        ],
        "trend": [
            {"day": "07/30", "completion": 48, "score": 72},
            {"day": "08/01", "completion": 56, "score": 75},
            {"day": "08/02", "completion": 61, "score": 74},
            {"day": "08/03", "completion": 67, "score": 79},
            {"day": "08/04", "completion": 73, "score": 81},
            {"day": "08/05", "completion": 82, "score": 84},
        ],
    })


@app.get("/api/v1/teacher/courses")
def list_courses(teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    courses = db.scalars(select(Course).where(Course.teacher_id == teacher.id).order_by(Course.created_at)).all()
    return envelope([serialize_course(db, course) for course in courses])


@app.post("/api/v1/teacher/courses", status_code=201)
def create_course(payload: CourseCreate, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    if db.scalar(select(Course).where(Course.code == payload.code)):
        raise HTTPException(status_code=409, detail="课程代码已存在")
    course = Course(
        id=uid("course"),
        teacher_id=teacher.id,
        name=payload.name,
        code=payload.code,
        term=payload.term,
        description=payload.description,
        status="preparing",
        student_visible=False,
    )
    db.add(course)
    db.flush()
    for index, title in enumerate(payload.chapter_titles, 1):
        db.add(Chapter(id=uid("chapter"), course_id=course.id, title=title, position=index))
    audit(db, teacher.id, "course.create", "course", course.id)
    db.commit()
    return envelope(serialize_course(db, course))


@app.patch("/api/v1/teacher/courses/{course_id}")
def update_course(course_id: str, payload: CourseUpdate, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    course = owned_course(db, teacher, course_id)
    changes = payload.model_dump(exclude_none=True)
    for key, value in changes.items():
        setattr(course, key, value)
    course.updated_at = datetime.now()
    audit(db, teacher.id, "course.update", "course", course.id, "|".join(changes.keys()))
    db.commit()
    return envelope(serialize_course(db, course))


@app.delete("/api/v1/teacher/courses/{course_id}")
def delete_course(course_id: str, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    course = owned_course(db, teacher, course_id)
    course_count = db.scalar(select(func.count()).select_from(Course).where(Course.teacher_id == teacher.id)) or 0
    if course_count <= 1:
        raise HTTPException(status_code=409, detail="至少需要保留一门课程")
    audit(db, teacher.id, "course.delete", "course", course.id, course.name)
    db.delete(course)
    db.commit()
    return envelope({"id": course_id, "deleted": True})


@app.get("/api/v1/teacher/classes")
def list_classes(
    course_id: str = Query(default="course-ds"),
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    owned_course(db, teacher, course_id)
    groups = db.scalars(
        select(ClassGroup)
        .options(selectinload(ClassGroup.enrollments).selectinload(Enrollment.student))
        .where(ClassGroup.course_id == course_id)
    ).all()
    return envelope([
        {
            "id": item.id,
            "course_id": item.course_id,
            "name": item.name,
            "grade": item.grade,
            "major": item.major,
            "schedule": item.schedule,
            "mentor": item.mentor,
            "join_code": item.join_code,
            "status": item.status,
            "students": len(item.enrollments),
            "completion": prototype_class_metrics(item.id, len(item.enrollments))["completion"],
            "active_rate": prototype_class_metrics(item.id, len(item.enrollments))["active_rate"],
            "risk_count": prototype_class_metrics(item.id, len(item.enrollments))["risk_count"],
            "capacity": prototype_class_metrics(item.id, len(item.enrollments))["capacity"],
        }
        for item in groups
    ])


@app.post("/api/v1/teacher/classes", status_code=201)
def create_class(payload: ClassCreate, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    owned_course(db, teacher, payload.course_id)
    alphabet = string.ascii_uppercase + string.digits
    join_code = "".join(secrets.choice(alphabet) for _ in range(8))
    item = ClassGroup(
        id=uid("class"),
        course_id=payload.course_id,
        name=payload.name,
        grade=payload.grade,
        major=payload.major,
        schedule=payload.schedule,
        mentor=payload.mentor or teacher.name,
        join_code=join_code,
        status=payload.status,
    )
    db.add(item)
    audit(db, teacher.id, "class.create", "class_group", item.id)
    db.commit()
    return envelope({"id": item.id, "name": item.name, "grade": item.grade, "major": item.major, "join_code": item.join_code, "status": item.status, "students": 0})


@app.get("/api/v1/teacher/classes/{class_id}/students")
def class_students(class_id: str, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    group = db.get(ClassGroup, class_id)
    if not group:
        raise HTTPException(status_code=404, detail="教学班不存在")
    owned_course(db, teacher, group.course_id)
    enrollments = db.scalars(
        select(Enrollment)
        .options(selectinload(Enrollment.student))
        .where(Enrollment.class_id == class_id)
    ).all()
    rows = []
    for index, item in enumerate(enrollments):
        submissions = db.scalars(select(Submission).where(Submission.student_id == item.student_id)).all()
        scores = [submission.grade.score if submission.grade else submission.evaluation.score for submission in submissions if submission.evaluation]
        rows.append({
            "id": item.student.id,
            "name": item.student.name,
            "number": item.student.number,
            "progress": [92, 78, 45, 86, 52, 96][index % 6],
            "score": round(sum(scores) / len(scores)) if scores else 0,
            "status": ["normal", "attention", "risk", "normal", "attention", "normal"][index % 6],
            "last_active": ["10 分钟前", "2 小时前", "3 天前", "35 分钟前", "1 天前", "5 分钟前"][index % 6],
            "submissions": len(submissions),
            "hint_level": max([submission.hint_level for submission in submissions], default=0),
        })
    return envelope(rows)


@app.get("/api/v1/teacher/classes/{class_id}/join-status")
def class_join_status(class_id: str, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    group = db.get(ClassGroup, class_id)
    if not group:
        raise HTTPException(status_code=404, detail="教学班不存在")
    owned_course(db, teacher, group.course_id)
    enrollments = db.scalars(
        select(Enrollment)
        .options(selectinload(Enrollment.student))
        .where(Enrollment.class_id == class_id)
        .order_by(Enrollment.joined_at.desc(), Enrollment.id.desc())
    ).all()
    methods = ["分享链接", "二维码", "班级邀请码", "批量导入"]
    rows = [
        {
            "id": item.student.id,
            "name": item.student.name,
            "number": item.student.number,
            "join_status": "joined",
            "join_method": methods[index % len(methods)],
            "joined_at": item.joined_at.isoformat(),
            "last_active": ["10 分钟前", "35 分钟前", "2 小时前", "昨天", "3 天前"][index % 5],
        }
        for index, item in enumerate(enrollments)
    ]
    joined = len(rows)
    capacity = prototype_class_metrics(group.id, joined)["capacity"]
    return envelope({
        "class_id": group.id,
        "class_name": group.name,
        "capacity": capacity,
        "summary": {
            "joined": joined,
            "pending": 0,
            "invited": 0,
            "available_slots": max(capacity - joined, 0),
        },
        "rows": rows,
    })


@app.post("/api/v1/classes/{join_code}/join")
def join_class(join_code: str, student: User = Depends(current_student), db: Session = Depends(get_db)):
    group = db.scalar(select(ClassGroup).where(ClassGroup.join_code == join_code))
    if not group:
        raise HTTPException(status_code=404, detail="邀请码无效")
    exists = db.scalar(select(Enrollment).where(Enrollment.class_id == group.id, Enrollment.student_id == student.id))
    if not exists:
        db.add(Enrollment(class_id=group.id, student_id=student.id))
        db.commit()
    return envelope({"class_id": group.id, "class_name": group.name, "joined": True})


@app.get("/api/v1/teacher/courses/{course_id}/chapters")
def list_chapters(course_id: str, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    owned_course(db, teacher, course_id)
    chapters = db.scalars(
        select(Chapter)
        .options(selectinload(Chapter.knowledge_points))
        .where(Chapter.course_id == course_id)
        .order_by(Chapter.position)
    ).all()
    return envelope([
        {
            "id": item.id,
            "title": item.title,
            "description": item.description,
            "position": item.position,
            "teaching_mode": item.teaching_mode,
            "status": item.status,
            "knowledge_points": [
                {
                    "id": kp.id,
                    "name": kp.name,
                    "description": kp.description,
                    "difficulty": kp.difficulty,
                    "mastery": kp.mastery,
                    "position_x": kp.position_x,
                    "position_y": kp.position_y,
                }
                for kp in item.knowledge_points
            ],
        }
        for item in chapters
    ])


@app.post("/api/v1/teacher/courses/{course_id}/chapters", status_code=201)
def create_chapter(course_id: str, payload: ChapterCreate, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    owned_course(db, teacher, course_id)
    position = (db.scalar(select(func.max(Chapter.position)).where(Chapter.course_id == course_id)) or 0) + 1
    chapter = Chapter(id=uid("chapter"), course_id=course_id, title=payload.title, description=payload.description, position=position, teaching_mode=payload.teaching_mode)
    db.add(chapter)
    audit(db, teacher.id, "chapter.create", "chapter", chapter.id)
    db.commit()
    return envelope({"id": chapter.id, "title": chapter.title, "position": chapter.position, "teaching_mode": chapter.teaching_mode, "status": chapter.status})


@app.patch("/api/v1/teacher/chapters/{chapter_id}")
def update_chapter(chapter_id: str, payload: ChapterUpdate, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    chapter = db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")
    owned_course(db, teacher, chapter.course_id)
    values = payload.model_dump(exclude_none=True)
    allowed_modes = {"理论讲授", "翻转课堂", "案例教学", "项目制教学", "实验实训", "混合式教学"}
    if "teaching_mode" in values and values["teaching_mode"] not in allowed_modes:
        raise HTTPException(status_code=422, detail="不支持的教学方式")
    for key, value in values.items():
        setattr(chapter, key, value)
    if values.get("status") == "published":
        materials = db.scalars(select(Material).where(Material.course_id == chapter.course_id)).all()
        for material in materials:
            if material.chapter_label == chapter.title and material.status == "ready":
                material.visibility = "students"
    if values.get("status") == "draft":
        materials = db.scalars(select(Material).where(Material.course_id == chapter.course_id)).all()
        for material in materials:
            if material.chapter_label == chapter.title and material.status == "ready":
                material.visibility = "teacher"
    audit(db, teacher.id, "chapter.update", "chapter", chapter.id, json.dumps(values, ensure_ascii=False))
    db.commit()
    db.refresh(chapter)
    return envelope({
        "id": chapter.id,
        "title": chapter.title,
        "description": chapter.description,
        "position": chapter.position,
        "teaching_mode": chapter.teaching_mode,
        "status": chapter.status,
    })


@app.get("/api/v1/student/courses/{course_id}/content")
def student_course_content(course_id: str, student: User = Depends(current_student), db: Session = Depends(get_db)):
    enrolled = db.scalar(
        select(func.count()).select_from(Enrollment).join(ClassGroup).where(
            Enrollment.student_id == student.id,
            ClassGroup.course_id == course_id,
        )
    ) or 0
    if not enrolled:
        raise HTTPException(status_code=403, detail="未加入该课程")
    chapters = db.scalars(
        select(Chapter)
        .options(selectinload(Chapter.knowledge_points))
        .where(Chapter.course_id == course_id, Chapter.status == "published")
        .order_by(Chapter.position)
    ).all()
    class_ids = db.scalars(select(Enrollment.class_id).where(Enrollment.student_id == student.id)).all()
    materials = db.scalars(select(Material).where(
        Material.course_id == course_id,
        Material.visibility == "students",
        Material.status == "ready",
    )).all()
    tasks = db.scalars(select(Task).where(
        Task.course_id == course_id,
        Task.class_id.in_(class_ids),
        Task.status == "published",
    )).all()
    return envelope([{
        "id": chapter.id,
        "title": chapter.title,
        "description": chapter.description,
        "position": chapter.position,
        "teaching_mode": chapter.teaching_mode,
        "status": "published",
        "knowledge_points": [{"id": point.id, "name": point.name, "description": point.description, "difficulty": point.difficulty} for point in chapter.knowledge_points],
        "materials": [{"id": item.id, "title": item.title, "type": item.type, "size": item.size, "content_url": item.content_url} for item in materials if item.chapter_label == chapter.title],
        "tasks": [{"id": item.id, "title": item.title, "type": item.type, "due_at": item.due_at.isoformat(), "difficulty": item.difficulty} for item in tasks if item.chapter_label == chapter.title],
    } for chapter in chapters])


@app.post("/api/v1/teacher/knowledge-points", status_code=201)
def create_knowledge_point(payload: KnowledgePointCreate, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    chapter = db.get(Chapter, payload.chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")
    owned_course(db, teacher, chapter.course_id)
    item = KnowledgePoint(id=uid("kp"), **payload.model_dump())
    db.add(item)
    audit(db, teacher.id, "knowledge.create", "knowledge_point", item.id)
    db.commit()
    return envelope({"id": item.id, **payload.model_dump()})


@app.get("/api/v1/teacher/materials")
def list_materials(course_id: str = "course-ds", teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    owned_course(db, teacher, course_id)
    items = db.scalars(
        select(Material)
        .where(
            Material.course_id == course_id,
            Material.status != "deleted",
            ~Material.status.startswith("folder_deleted|"),
        )
        .order_by(Material.updated_at.desc())
    ).all()
    links = db.execute(
        select(MaterialKnowledgeLink.material_id, KnowledgePoint.id, KnowledgePoint.name)
        .join(KnowledgePoint, KnowledgePoint.id == MaterialKnowledgeLink.knowledge_point_id)
        .where(MaterialKnowledgeLink.material_id.in_([item.id for item in items]))
    ).all() if items else []
    linked_by_material: dict[str, list[dict]] = {}
    for material_id, point_id, point_name in links:
        linked_by_material.setdefault(material_id, []).append({"id": point_id, "name": point_name})
    return envelope([
        {
            "id": item.id,
            "course_id": item.course_id,
            "title": item.title,
            "type": item.type,
            "chapter": item.chapter_label,
            "size": item.size,
            "visibility": item.visibility,
            "status": item.status,
            "citations": item.citations,
            "content_url": item.content_url,
            "updated_at": item.updated_at.isoformat(),
            "knowledge_points": linked_by_material.get(item.id, []),
        }
        for item in items
    ])


@app.post("/api/v1/teacher/materials", status_code=201)
def create_material(payload: MaterialCreate, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    owned_course(db, teacher, payload.course_id)
    item = Material(id=uid("material"), status="parsing", **payload.model_dump())
    db.add(item)
    audit(db, teacher.id, "material.create", "material", item.id)
    db.commit()
    return envelope({"id": item.id, "title": item.title, "status": item.status})


@app.get("/api/v1/teacher/tasks")
def list_tasks(course_id: str = "course-ds", teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    owned_course(db, teacher, course_id)
    tasks = db.scalars(
        select(Task)
        .options(selectinload(Task.test_cases))
        .where(Task.course_id == course_id)
        .order_by(Task.created_at.desc())
    ).all()
    return envelope([serialize_task(db, task) for task in tasks])


@app.post("/api/v1/teacher/tasks", status_code=201)
def create_task(payload: TaskCreate, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    owned_course(db, teacher, payload.course_id)
    task_data = payload.model_dump(exclude={"test_cases"})
    task = Task(id=uid("task"), status="draft", **task_data)
    db.add(task)
    db.flush()
    for case in payload.test_cases:
        db.add(TestCase(id=uid("case"), task_id=task.id, **case.model_dump()))
    audit(db, teacher.id, "task.create", "task", task.id)
    db.commit()
    db.refresh(task)
    return envelope(serialize_task(db, task))


@app.post("/api/v1/teacher/tasks/{task_id}/publish")
def publish_task(task_id: str, payload: TaskPublish, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    task = task_owner(db, teacher, task_id)
    if task.status == "closed":
        raise HTTPException(status_code=409, detail="已关闭任务不能重新发布")
    test_count = db.scalar(select(func.count()).select_from(TestCase).where(TestCase.task_id == task.id)) or 0
    knowledge_count = db.scalar(select(func.count()).select_from(KnowledgePoint).join(Chapter).where(Chapter.course_id == task.course_id)) or 0
    if test_count < 1:
        raise HTTPException(status_code=422, detail="至少需要一个测试用例")
    if knowledge_count < 1:
        raise HTTPException(status_code=422, detail="课程没有知识点，不能发布任务")
    task.class_id = payload.class_id
    task.publish_at = payload.publish_at or datetime.now().replace(microsecond=0)
    task.due_at = payload.due_at
    task.status = "published" if task.publish_at <= datetime.now() else "scheduled"
    audit(db, teacher.id, "task.publish", "task", task.id, task.status)
    db.commit()
    return envelope(serialize_task(db, task))


@app.get("/api/v1/student/tasks")
def student_tasks(student: User = Depends(current_student), db: Session = Depends(get_db)):
    class_ids = db.scalars(select(Enrollment.class_id).where(Enrollment.student_id == student.id)).all()
    tasks = db.scalars(
        select(Task)
        .options(selectinload(Task.test_cases))
        .where(Task.class_id.in_(class_ids), Task.status == "published")
        .order_by(Task.due_at)
    ).all()
    return envelope([serialize_task(db, task, include_hidden=False) for task in tasks])


def evaluate_submission(db: Session, task: Task, source_code: str):
    cases = list(task.test_cases)
    total = len(cases)
    quality = 0
    normalized = source_code.replace(" ", "")
    if "if(!head" in normalized:
        quality += 2
    if "index==0" in normalized:
        quality += 2
    if "delete" in source_code:
        quality += 1
    if "current->next" in normalized:
        quality += 1
    passed = min(total, max(1, quality))
    score = round(passed * 100 / total) if total else 0
    details = [{"name": case.name, "passed": index < passed, "hidden": case.hidden} for index, case in enumerate(cases)]
    return passed, total, score, details


@app.post("/api/v1/student/tasks/{task_id}/submissions", status_code=201)
def submit_task(task_id: str, payload: StudentSubmissionCreate, student: User = Depends(current_student), db: Session = Depends(get_db)):
    task = db.scalars(select(Task).options(selectinload(Task.test_cases)).where(Task.id == task_id)).first()
    if not task or task.status != "published":
        raise HTTPException(status_code=404, detail="任务不可提交")
    enrolled = db.scalar(select(Enrollment).where(Enrollment.class_id == task.class_id, Enrollment.student_id == student.id))
    if not enrolled:
        raise HTTPException(status_code=403, detail="不属于任务教学班")
    version = (db.scalar(select(func.max(Submission.version)).where(Submission.task_id == task.id, Submission.student_id == student.id)) or 0) + 1
    submission = Submission(id=uid("submission"), task_id=task.id, student_id=student.id, version=version, source_code=payload.source_code, hint_level=payload.hint_level)
    db.add(submission)
    db.flush()
    passed, total, score, details = evaluate_submission(db, task, payload.source_code)
    evaluation = EvaluationResult(id=uid("evaluation"), submission_id=submission.id, passed_tests=passed, total_tests=total, runtime_ms=35 + len(payload.source_code) % 35, score=score, details_json=json.dumps(details, ensure_ascii=False))
    confidence = 0.88 if passed == total else 0.62 if passed >= total / 2 else 0.48
    diagnosis = DiagnosisResult(
        id=uid("diagnosis"),
        submission_id=submission.id,
        type="代码质量建议" if passed == total else "逻辑错误诊断",
        explanation="实现通过全部测试，建议继续优化函数拆分。" if passed == total else "边界条件处理不完整，请检查头节点、尾节点和越界输入。",
        confidence=confidence,
        source="课程知识库 · 链表关键点图解讲义",
        fallback=confidence < 0.5,
        needs_teacher_review=confidence < 0.7,
    )
    db.add_all([evaluation, diagnosis])
    db.flush()
    if diagnosis.needs_teacher_review:
        course = db.get(Course, task.course_id)
        db.add(DiagnosisReview(id=uid("review"), diagnosis_id=diagnosis.id, teacher_id=course.teacher_id, status="pending"))
        db.add(Notification(id=uid("notice"), user_id=course.teacher_id, type="ai", title="AI 审核", content=f"{student.name} 的诊断需要教师审核"))
    db.commit()
    created = db.scalars(
        select(Submission)
        .options(
            selectinload(Submission.student),
            selectinload(Submission.task).selectinload(Task.test_cases),
            selectinload(Submission.evaluation),
            selectinload(Submission.diagnosis).selectinload(DiagnosisResult.review),
            selectinload(Submission.grade),
            selectinload(Submission.feedback),
        )
        .where(Submission.id == submission.id)
    ).first()
    return envelope(serialize_submission(created, include_hidden=False))


@app.get("/api/v1/teacher/submissions")
def list_submissions(
    task_id: str = "task-01",
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    task_owner(db, teacher, task_id)
    submissions = db.scalars(
        select(Submission)
        .options(
            selectinload(Submission.student),
            selectinload(Submission.task).selectinload(Task.test_cases),
            selectinload(Submission.evaluation),
            selectinload(Submission.grade),
            selectinload(Submission.diagnosis).selectinload(DiagnosisResult.review),
            selectinload(Submission.feedback),
        )
        .where(Submission.task_id == task_id)
        .order_by(Submission.submitted_at.desc())
    ).all()
    return envelope([serialize_submission(item) for item in submissions])


@app.get("/api/v1/teacher/submissions/{submission_id}")
def submission_detail(submission_id: str, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    submission = db.scalars(
        select(Submission)
        .options(
            selectinload(Submission.student),
            selectinload(Submission.task).selectinload(Task.test_cases),
            selectinload(Submission.evaluation),
            selectinload(Submission.grade),
            selectinload(Submission.diagnosis).selectinload(DiagnosisResult.review),
            selectinload(Submission.feedback),
        )
        .where(Submission.id == submission_id)
    ).first()
    if not submission:
        raise HTTPException(status_code=404, detail="提交不存在")
    task_owner(db, teacher, submission.task_id)
    return envelope(serialize_submission(submission))


@app.put("/api/v1/teacher/submissions/{submission_id}/grade")
def save_grade(submission_id: str, payload: GradeUpsert, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="提交不存在")
    if payload.dimensions:
        dimension_limits = {"autoTest": 40, "codeQuality": 30, "report": 20, "participation": 10}
        if set(payload.dimensions) != set(dimension_limits):
            raise HTTPException(status_code=422, detail="评分依据字段不完整")
        if any(value < 0 or value > dimension_limits[key] for key, value in payload.dimensions.items()):
            raise HTTPException(status_code=422, detail="评分依据超出允许范围")
        if sum(payload.dimensions.values()) != payload.score:
            raise HTTPException(status_code=422, detail="评分依据之和必须等于最终得分")
    task_owner(db, teacher, submission.task_id)
    grade = db.scalar(select(Grade).where(Grade.submission_id == submission_id))
    if not grade:
        grade = Grade(id=uid("grade"), submission_id=submission_id, teacher_id=teacher.id, score=payload.score, comment=payload.comment, dimensions_json=json.dumps(payload.dimensions, ensure_ascii=False) if payload.dimensions else "")
        db.add(grade)
    else:
        grade.score = payload.score
        grade.comment = payload.comment
        grade.dimensions_json = json.dumps(payload.dimensions, ensure_ascii=False) if payload.dimensions else ""
        grade.status = "graded"
    audit(db, teacher.id, "grade.save", "submission", submission_id)
    db.commit()
    return envelope({"id": grade.id, "score": grade.score, "status": grade.status, "comment": grade.comment, "dimensions": payload.dimensions})


@app.post("/api/v1/teacher/submissions/{submission_id}/grade/publish")
def publish_grade(submission_id: str, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="提交不存在")
    task_owner(db, teacher, submission.task_id)
    grade = db.scalar(select(Grade).where(Grade.submission_id == submission_id))
    if not grade:
        raise HTTPException(status_code=409, detail="请先保存成绩")
    grade.status = "grade_published"
    grade.published_at = datetime.now().replace(microsecond=0)
    db.add(Notification(id=uid("notice"), user_id=submission.student_id, type="grade", title="成绩已发布", content=f"任务成绩：{grade.score} 分"))
    audit(db, teacher.id, "grade.publish", "grade", grade.id)
    db.commit()
    return envelope({"id": grade.id, "status": grade.status, "published_at": grade.published_at.isoformat()})


@app.post("/api/v1/teacher/submissions/{submission_id}/feedback", status_code=201)
def create_feedback(submission_id: str, payload: FeedbackCreate, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    submission = db.get(Submission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="提交不存在")
    task_owner(db, teacher, submission.task_id)
    item = TeacherFeedback(id=uid("feedback"), submission_id=submission_id, teacher_id=teacher.id, content=payload.content, status="published" if payload.publish else "draft", student_visible=payload.publish)
    db.add(item)
    if payload.publish:
        db.add(Notification(id=uid("notice"), user_id=submission.student_id, type="feedback", title="教师反馈", content=payload.content))
    audit(db, teacher.id, "feedback.publish" if payload.publish else "feedback.save", "feedback", item.id)
    db.commit()
    return envelope({"id": item.id, "status": item.status, "student_visible": item.student_visible})


@app.get("/api/v1/teacher/ai-reviews")
def list_reviews(teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    reviews = db.scalars(
        select(DiagnosisReview)
        .options(
            selectinload(DiagnosisReview.diagnosis)
            .selectinload(DiagnosisResult.submission)
            .selectinload(Submission.student),
            selectinload(DiagnosisReview.diagnosis)
            .selectinload(DiagnosisResult.submission)
            .selectinload(Submission.task),
        )
        .where(DiagnosisReview.teacher_id == teacher.id)
        .order_by(DiagnosisReview.id.desc())
    ).all()
    return envelope([
        {
            "id": item.id,
            "diagnosis_id": item.diagnosis_id,
            "student": item.diagnosis.submission.student.name,
            "task": item.diagnosis.submission.task.title,
            "submission_id": item.diagnosis.submission_id,
            "type": item.diagnosis.type,
            "confidence": round(item.diagnosis.confidence * 100),
            "source": item.diagnosis.source,
            "fallback": item.diagnosis.fallback,
            "explanation": item.diagnosis.explanation,
            "status": item.status,
            "reviewed_explanation": item.reviewed_explanation,
            "created_at": item.diagnosis.created_at.isoformat(),
        }
        for item in reviews
    ])


@app.post("/api/v1/teacher/ai-reviews/{review_id}/action")
def review_action(review_id: str, payload: ReviewAction, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    review = db.get(DiagnosisReview, review_id)
    if not review or review.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="审核记录不存在")
    review.status = payload.status
    review.reviewed_explanation = payload.reviewed_explanation
    review.comment = payload.comment
    review.reviewed_at = datetime.now().replace(microsecond=0)
    audit(db, teacher.id, "diagnosis.review", "diagnosis_review", review.id, payload.status)
    db.commit()
    return envelope({"id": review.id, "status": review.status, "reviewed_at": review.reviewed_at.isoformat()})


@app.get("/api/v1/teacher/analytics/overview")
def analytics_overview(
    course_id: str = "course-ds",
    class_id: str = "class-se1",
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    owned_course(db, teacher, course_id)
    knowledge = db.scalars(
        select(KnowledgePoint).join(Chapter).where(Chapter.course_id == course_id)
    ).all()
    return envelope({
        "summary": {"completion_rate": 82, "average_score": 84, "overdue_rate": 8, "average_hint_level": 1.4, "risk_students": 4, "weak_points": 3},
        "score_distribution": [
            {"range": "90-100", "value": 18},
            {"range": "80-89", "value": 21},
            {"range": "70-79", "value": 12},
            {"range": "60-69", "value": 6},
            {"range": "60 以下", "value": 3},
        ],
        "knowledge": [{"id": item.id, "name": item.name, "mastery": item.mastery} for item in knowledge],
        "errors": [
            {"name": "边界条件遗漏", "value": 18},
            {"name": "空指针访问", "value": 13},
            {"name": "循环终止错误", "value": 11},
            {"name": "内存未释放", "value": 8},
        ],
        "class_id": class_id,
    })


@app.post("/api/v1/teacher/analytics/interventions", status_code=201)
def create_learning_intervention(
    payload: LearningInterventionRequest,
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    course = owned_course(db, teacher, payload.course_id)
    class_group = db.get(ClassGroup, payload.class_id)
    if not class_group or class_group.course_id != course.id:
        raise HTTPException(status_code=404, detail="教学班不存在或不属于当前课程")

    enrollments = db.scalars(
        select(Enrollment)
        .options(selectinload(Enrollment.student))
        .where(Enrollment.class_id == payload.class_id)
        .order_by(Enrollment.joined_at)
    ).all()
    if payload.student_id:
        enrollments = [item for item in enrollments if item.student_id == payload.student_id]
        if not enrollments:
            raise HTTPException(status_code=404, detail="学生不在当前教学班")
    if payload.action == "student_feedback" and not payload.student_id:
        raise HTTPException(status_code=422, detail="个体反馈必须指定学生")

    now = datetime.now().replace(microsecond=0)
    recipients = [item.student for item in enrollments]
    notification_ids: list[str] = []
    task_id: str | None = None
    discussion_id: str | None = None
    feedback_id: str | None = None

    if payload.action == "class_practice":
        task = Task(
            id=uid("task-intervention"),
            course_id=course.id,
            class_id=class_group.id,
            title=payload.title,
            type="programming",
            chapter_label=payload.knowledge_point or "学情干预",
            description=payload.content,
            starter_code="// 根据教师下发的专项练习要求完成代码。\n",
            status="published",
            difficulty="基础",
            due_at=now + timedelta(days=7),
            publish_at=now,
            allow_hints=True,
        )
        db.add(task)
        db.flush()
        for index, name in enumerate(["基础检查", "边界场景", "综合用例"], 1):
            db.add(TestCase(
                id=uid("case-intervention"),
                task_id=task.id,
                name=name,
                hidden=index == 3,
                weight=30 if index < 3 else 40,
            ))
        task_id = task.id
        notice_title = f"新的专项练习：{task.title}"
    elif payload.action == "discussion":
        discussion = CourseDiscussion(
            id=uid("discussion"),
            course_id=course.id,
            class_id=class_group.id,
            teacher_id=teacher.id,
            title=payload.title,
            content=payload.content,
            status="published",
            published_at=now,
        )
        db.add(discussion)
        discussion_id = discussion.id
        notice_title = f"新的课堂讨论：{discussion.title}"
    elif payload.action == "student_feedback":
        submission = db.scalars(
            select(Submission)
            .join(Task)
            .where(
                Task.course_id == course.id,
                Submission.student_id == payload.student_id,
            )
            .order_by(Submission.submitted_at.desc())
        ).first()
        if submission:
            feedback = TeacherFeedback(
                id=uid("feedback"),
                submission_id=submission.id,
                teacher_id=teacher.id,
                content=payload.content,
                status="published",
                student_visible=True,
            )
            db.add(feedback)
            feedback_id = feedback.id
        notice_title = payload.title
    else:
        notice_title = payload.title

    for student in recipients:
        notice = Notification(
            id=uid("notice"),
            user_id=student.id,
            type="intervention" if payload.action != "risk_reminder" else "risk",
            title=notice_title,
            content=payload.content,
        )
        db.add(notice)
        notification_ids.append(notice.id)

    audit(
        db,
        teacher.id,
        f"analytics.intervention.{payload.action}",
        "class_group",
        class_group.id,
        f"{payload.title}|recipients={len(recipients)}",
    )
    db.commit()
    return envelope({
        "action": payload.action,
        "course_id": course.id,
        "class_id": class_group.id,
        "student_id": payload.student_id,
        "recipients": len(recipients),
        "notification_ids": notification_ids,
        "task_id": task_id,
        "discussion_id": discussion_id,
        "feedback_id": feedback_id,
        "student_visible": bool(notification_ids or feedback_id or task_id or discussion_id),
        "created_at": now.isoformat(),
    })


def question_insight_seed(course: Course, class_group: ClassGroup | None, student_count: int):
    """Build a deterministic teacher-facing view of high-frequency AI questions.

    The teacher prototype does not yet persist student AI chat records in this
    backend. This payload keeps the contract close to the later real
    aggregation: question clusters, detailed question samples, quantitative
    rates, and an AI diagnosis summary that teachers can act on.
    """
    total_students = max(student_count, 1)
    scope_note = (
        f"{course.name} / {class_group.name if class_group else '全部授课班级'}。"
        "当前为原型聚合数据，后续接入学生端 AI_QUESTION_ASKED 事件后按真实提问计算。"
    )
    if course.id in {"course-ml", "course_arch_001"} or "机器学习" in course.name:
        clusters = [
            {
                "id": "q-ml-split",
                "topic": "数据集划分混淆",
                "representative_question": "训练集、验证集、测试集为什么不能混用？",
                "knowledge_points": ["模型评估", "数据集划分", "泛化能力"],
                "related_tasks": ["训练集、验证集、测试集划分练习"],
                "ask_count": 36,
                "student_count": min(total_students, 18),
                "repeat_followup_rate": 41,
                "unresolved_rate": 27,
                "low_confidence_rate": 12,
                "recent_growth_rate": 18,
                "severity": "HIGH",
                "related_errors": ["把验证集用于训练调参", "用测试集选择模型"],
                "sample_questions": [
                    {"id": "q-ml-001", "student_name": "王子轩", "question": "为什么验证集不能参与训练？", "intent": "概念解释", "asked_at": "2026-08-03 19:42", "followups": 3, "ai_confidence": 78, "resolved": False},
                    {"id": "q-ml-002", "student_name": "李思雨", "question": "测试集是不是也能用来调正则化参数？", "intent": "作业提示", "asked_at": "2026-08-04 21:10", "followups": 2, "ai_confidence": 81, "resolved": True},
                    {"id": "q-ml-003", "student_name": "周昊然", "question": "训练准确率高但验证准确率低说明什么？", "intent": "错因追问", "asked_at": "2026-08-05 09:18", "followups": 4, "ai_confidence": 69, "resolved": False},
                ],
            },
            {
                "id": "q-ml-regularization",
                "topic": "正则化作用理解不完整",
                "representative_question": "正则化为什么能缓解过拟合？",
                "knowledge_points": ["过拟合", "正则化", "损失函数"],
                "related_tasks": ["过拟合与正则化概念测验"],
                "ask_count": 29,
                "student_count": min(total_students, 15),
                "repeat_followup_rate": 34,
                "unresolved_rate": 22,
                "low_confidence_rate": 9,
                "recent_growth_rate": 11,
                "severity": "MEDIUM",
                "related_errors": ["只背结论，不能解释惩罚项", "混淆 L1 与 L2 的直观效果"],
                "sample_questions": [
                    {"id": "q-ml-004", "student_name": "赵明宇", "question": "正则化是不是就是减少特征数量？", "intent": "概念纠偏", "asked_at": "2026-08-04 15:24", "followups": 1, "ai_confidence": 84, "resolved": True},
                    {"id": "q-ml-005", "student_name": "陈佳怡", "question": "为什么损失函数后面加一项就能防止过拟合？", "intent": "概念解释", "asked_at": "2026-08-05 20:03", "followups": 2, "ai_confidence": 76, "resolved": False},
                ],
            },
        ]
    else:
        clusters = [
            {
                "id": "q-ds-head-node",
                "topic": "链表头节点删除处理",
                "representative_question": "删除头节点时为什么一定要返回新的 head？",
                "knowledge_points": ["链表", "边界处理", "指针更新"],
                "related_tasks": ["单链表指定位置节点删除"],
                "ask_count": 42,
                "student_count": min(total_students, 21),
                "repeat_followup_rate": 48,
                "unresolved_rate": 31,
                "low_confidence_rate": 14,
                "recent_growth_rate": 23,
                "severity": "HIGH",
                "related_errors": ["头节点返回值遗漏", "删除后仍返回旧 head", "空链表分支缺失"],
                "sample_questions": [
                    {"id": "q-ds-001", "student_name": "王子轩", "question": "删除第 0 个节点的时候，为什么原来的 head 不能继续返回？", "intent": "代码错误分析", "asked_at": "2026-08-03 20:16", "followups": 4, "ai_confidence": 74, "resolved": False},
                    {"id": "q-ds-002", "student_name": "周昊然", "question": "head = head->next 之后还需要 delete 原节点吗？", "intent": "作业提示", "asked_at": "2026-08-04 18:35", "followups": 2, "ai_confidence": 82, "resolved": True},
                    {"id": "q-ds-003", "student_name": "李思雨", "question": "空链表和删除头节点是不是可以写成同一个 if？", "intent": "边界条件", "asked_at": "2026-08-05 09:02", "followups": 3, "ai_confidence": 68, "resolved": False},
                ],
            },
            {
                "id": "q-ds-stack-empty",
                "topic": "栈空状态与 pop 条件",
                "representative_question": "栈为空时为什么不能直接 pop？",
                "knowledge_points": ["栈与队列", "边界条件", "括号匹配"],
                "related_tasks": ["栈实现括号匹配"],
                "ask_count": 27,
                "student_count": min(total_students, 14),
                "repeat_followup_rate": 32,
                "unresolved_rate": 18,
                "low_confidence_rate": 8,
                "recent_growth_rate": 9,
                "severity": "MEDIUM",
                "related_errors": ["右括号多出时未判断栈空", "循环结束后未检查剩余左括号"],
                "sample_questions": [
                    {"id": "q-ds-004", "student_name": "陈佳怡", "question": "遇到右括号时栈是空的，为什么直接错？", "intent": "概念解释", "asked_at": "2026-08-03 16:21", "followups": 1, "ai_confidence": 86, "resolved": True},
                    {"id": "q-ds-005", "student_name": "林若曦", "question": "最后栈不为空是不是也说明括号不匹配？", "intent": "练习追问", "asked_at": "2026-08-05 12:47", "followups": 2, "ai_confidence": 80, "resolved": True},
                ],
            },
            {
                "id": "q-ds-recursion",
                "topic": "递归出口不清晰",
                "representative_question": "二叉树递归遍历什么时候应该停止？",
                "knowledge_points": ["二叉树", "递归", "遍历"],
                "related_tasks": ["二叉树前序遍历"],
                "ask_count": 19,
                "student_count": min(total_students, 10),
                "repeat_followup_rate": 29,
                "unresolved_rate": 21,
                "low_confidence_rate": 6,
                "recent_growth_rate": 7,
                "severity": "WATCH",
                "related_errors": ["递归出口缺失", "左右子树顺序混淆"],
                "sample_questions": [
                    {"id": "q-ds-006", "student_name": "赵明宇", "question": "root == nullptr 的时候为什么要直接 return？", "intent": "概念解释", "asked_at": "2026-08-04 10:28", "followups": 1, "ai_confidence": 88, "resolved": True},
                    {"id": "q-ds-007", "student_name": "王子轩", "question": "前序遍历是不是每次都先访问根节点？", "intent": "概念确认", "asked_at": "2026-08-05 14:11", "followups": 2, "ai_confidence": 83, "resolved": True},
                ],
            },
        ]

    for cluster in clusters:
        cluster["coverage_rate"] = round(cluster["student_count"] * 100 / total_students)
        cluster["data_scope_note"] = scope_note
        cluster["diagnosis"] = {
            "summary": (
                f"“{cluster['topic']}”已经形成班级共性疑问，"
                f"{cluster['student_count']} 名学生累计提问 {cluster['ask_count']} 次，"
                f"重复追问率 {cluster['repeat_followup_rate']}%。"
            ),
            "teaching_suggestions": [
                f"下节课用 8-10 分钟集中讲解“{cluster['representative_question']}”。",
                f"把讲解绑定到 {cluster['knowledge_points'][0]} 的任务反馈，先讲错误现象再讲概念。",
                "补充一份短讲义或示例到课程知识库，降低后续 AI 低置信度回答比例。",
            ],
            "practice_suggestions": [
                f"生成 3 道围绕 {cluster['knowledge_points'][0]} 的诊断题。",
                "给提问学生推送一组分层练习，先做概念判断，再做代码或案例分析。",
            ],
            "evidence": [
                f"提问次数：{cluster['ask_count']}",
                f"覆盖学生：{cluster['student_count']} / {total_students}",
                f"未解决率：{cluster['unresolved_rate']}%",
                f"关联错因：{'、'.join(cluster['related_errors'][:2])}",
            ],
            "confidence": 86 if cluster["severity"] == "HIGH" else 78,
        }
    return clusters


def validate_question_insight_diagnosis(raw: dict[str, Any]) -> dict[str, Any]:
    def clean_text(value: Any, fallback: str = "") -> str:
        text = str(value or "").strip()
        return text or fallback

    def clean_list(value: Any, limit: int) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value[:limit] if str(item).strip()]

    try:
        confidence = float(raw.get("confidence", 0.75))
    except (TypeError, ValueError):
        confidence = 0.75
    confidence = max(0.0, min(1.0, confidence))

    summary = clean_text(raw.get("summary"))
    if not summary:
        raise ValueError("summary 不能为空")

    return {
        "title": clean_text(raw.get("title"), "高频疑问实时诊断"),
        "summary": summary,
        "teaching_suggestions": clean_list(raw.get("teaching_suggestions"), 6),
        "practice_suggestions": clean_list(raw.get("practice_suggestions"), 6),
        "evidence": clean_list(raw.get("evidence"), 8),
        "data_gaps": clean_list(raw.get("data_gaps"), 6),
        "confidence": confidence,
    }


def question_insight_model_messages(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "role": "system",
            "content": (
                "你是 CodeTrack 教师端的高频疑问诊断模型，服务人工智能专业课程教师。"
                "你必须只基于用户消息提供的数据生成诊断，不要编造不存在的学生、问题、次数、任务或知识点。"
                "如果数据源标记为 prototype，要在 data_gaps 中指出缺少真实学生 AI 提问日志。"
                "输出必须是 JSON 对象，字段为 title, summary, teaching_suggestions, practice_suggestions, evidence, data_gaps, confidence。"
                "confidence 是 0 到 1 的小数。"
            ),
        },
        {
            "role": "user",
            "content": json.dumps(payload, ensure_ascii=False),
        },
    ]


@app.get("/api/v1/teacher/analytics/question-insights")
def question_insights(
    course_id: str = "course-ds",
    class_id: str = "class-se1",
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    course = owned_course(db, teacher, course_id)
    class_group = db.get(ClassGroup, class_id) if class_id else None
    if class_id and (not class_group or class_group.course_id != course.id):
        raise HTTPException(status_code=404, detail="教学班不存在或不属于当前课程")
    student_count = (
        db.scalar(select(func.count()).select_from(Enrollment).where(Enrollment.class_id == class_id))
        if class_id
        else db.scalar(
            select(func.count(func.distinct(Enrollment.student_id)))
            .select_from(Enrollment)
            .join(ClassGroup)
            .where(ClassGroup.course_id == course.id)
        )
    ) or 0
    clusters = question_insight_seed(course, class_group, student_count)
    total_questions = sum(item["ask_count"] for item in clusters)
    unique_students = min(student_count, sum(item["student_count"] for item in clusters))
    unresolved_questions = round(
        sum(item["ask_count"] * item["unresolved_rate"] / 100 for item in clusters)
    )
    low_confidence_questions = round(
        sum(item["ask_count"] * item["low_confidence_rate"] / 100 for item in clusters)
    )
    return envelope({
        "scope": {
            "course_id": course.id,
            "course_name": course.name,
            "class_id": class_group.id if class_group else None,
            "class_name": class_group.name if class_group else "全部授课班级",
            "student_count": student_count,
        },
        "data_status": {
            "source": "prototype",
            "label": "原型聚合数据",
            "description": (
                "当前已接入教师端后端接口；本项目尚未持久化学生 AI 提问日志，"
                "高频疑问由后端规则化样例生成。后续接入学生端 AI_QUESTION_ASKED 事件后按真实提问统计。"
            ),
        },
        "summary": {
            "question_cluster_count": len(clusters),
            "total_questions": total_questions,
            "unique_students": unique_students,
            "avg_questions_per_student": round(total_questions / max(student_count, 1), 1),
            "unresolved_questions": unresolved_questions,
            "low_confidence_questions": low_confidence_questions,
            "top_coverage_rate": max((item["coverage_rate"] for item in clusters), default=0),
        },
        "clusters": clusters,
        "diagnosis_capability": {
            "mode": "REALTIME_MODEL",
            "label": "实时模型诊断",
            "description": "点击 AI 诊断后，后端会调用配置的真实模型实时生成建议。",
        },
    })


@app.post("/api/v1/teacher/analytics/question-insights/diagnose")
async def diagnose_question_insights(
    payload: QuestionInsightDiagnosisRequest,
    teacher: User = Depends(current_teacher),
    db: Session = Depends(get_db),
):
    course = owned_course(db, teacher, payload.course_id)
    class_group = db.get(ClassGroup, payload.class_id) if payload.class_id else None
    if payload.class_id and (not class_group or class_group.course_id != course.id):
        raise HTTPException(status_code=404, detail="教学班不存在或不属于当前课程")

    settings = get_settings()
    if not settings.model_api_key or not settings.model_name:
        raise HTTPException(status_code=503, detail="未配置真实模型：请设置 CODETRACK_MODEL_API_KEY 和 CODETRACK_MODEL_NAME 后重试")

    student_count = (
        db.scalar(select(func.count()).select_from(Enrollment).where(Enrollment.class_id == payload.class_id))
        if payload.class_id
        else db.scalar(
            select(func.count(func.distinct(Enrollment.student_id)))
            .select_from(Enrollment)
            .join(ClassGroup)
            .where(ClassGroup.course_id == course.id)
        )
    ) or 0
    clusters = question_insight_seed(course, class_group, student_count)
    selected_cluster = next((item for item in clusters if item["id"] == payload.cluster_id), None) if payload.cluster_id else None
    if payload.cluster_id and selected_cluster is None:
        raise HTTPException(status_code=404, detail="问题簇不存在")

    total_questions = sum(item["ask_count"] for item in clusters)
    unique_students = min(student_count, sum(item["student_count"] for item in clusters))
    unresolved_questions = round(sum(item["ask_count"] * item["unresolved_rate"] / 100 for item in clusters))
    low_confidence_questions = round(sum(item["ask_count"] * item["low_confidence_rate"] / 100 for item in clusters))
    model_payload = {
        "task": "请基于高频疑问统计和具体提问样本，实时生成给教师的诊断建议。",
        "scope": {
            "course_id": course.id,
            "course_name": course.name,
            "class_id": class_group.id if class_group else None,
            "class_name": class_group.name if class_group else "全部授课班级",
            "student_count": student_count,
        },
        "data_status": {
            "source": "prototype",
            "label": "原型聚合数据",
            "description": "当前项目尚未持久化学生 AI 提问日志，后续接入真实事件后可直接替换聚合来源。",
        },
        "summary": {
            "question_cluster_count": len(clusters),
            "total_questions": total_questions,
            "unique_students": unique_students,
            "avg_questions_per_student": round(total_questions / max(student_count, 1), 1),
            "unresolved_questions": unresolved_questions,
            "low_confidence_questions": low_confidence_questions,
            "top_coverage_rate": max((item["coverage_rate"] for item in clusters), default=0),
        },
        "selected_cluster": selected_cluster,
        "clusters": clusters,
        "output_requirements": [
            "summary 用 2-4 句话概括主要学情问题。",
            "teaching_suggestions 给教师下一节课可执行动作。",
            "practice_suggestions 给可生成的练习题方向。",
            "evidence 必须引用输入中的量化数据或具体问题。",
            "data_gaps 必须说明真实学生 AI 提问日志尚未接入时的限制。",
        ],
    }

    try:
        result = await chat_json(
            question_insight_model_messages(model_payload),
            model=settings.model_name,
            api_key=settings.model_api_key,
            base_url=settings.model_api_base_url,
            validator=validate_question_insight_diagnosis,
            timeout=45,
            retries=1,
            temperature=0.2,
            prompt_version="question-insight-diagnosis-v1",
            model_provider="OPENAI_COMPATIBLE",
        )
    except LLMNotConfigured as exc:
        raise HTTPException(status_code=503, detail="未配置真实模型：请设置 CODETRACK_MODEL_API_KEY 和 CODETRACK_MODEL_NAME 后重试") from exc
    except LLMTimeout as exc:
        raise HTTPException(status_code=504, detail="真实模型请求超时，请稍后重试") from exc
    except LLMHTTPError as exc:
        detail = exc.detail or str(exc)
        raise HTTPException(status_code=502, detail=f"真实模型调用失败：{detail}") from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=f"真实模型响应不可用：{exc.code}") from exc

    diagnosis = result.data
    return envelope({
        **diagnosis,
        "confidence": round(diagnosis["confidence"] * 100),
        "target": {
            "type": "cluster" if selected_cluster else "class",
            "cluster_id": selected_cluster["id"] if selected_cluster else None,
            "cluster_topic": selected_cluster["topic"] if selected_cluster else None,
        },
        "model": {
            "provider": result.model_provider,
            "name": result.model_name,
            "duration_ms": result.duration_ms,
            "token_prompt": result.token_prompt,
            "token_completion": result.token_completion,
        },
        "generated_at": datetime.now().replace(microsecond=0).isoformat(),
    })


@app.get("/api/v1/teacher/knowledge-graph")
def knowledge_graph(course_id: str = "course-ds", teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    owned_course(db, teacher, course_id)
    points = db.scalars(select(KnowledgePoint).join(Chapter).where(Chapter.course_id == course_id)).all()
    chapters = {item.id: item for item in db.scalars(select(Chapter).where(Chapter.course_id == course_id)).all()}
    active_materials = db.scalars(
        select(Material)
        .where(
            Material.course_id == course_id,
            Material.status != "deleted",
            ~Material.status.startswith("folder_deleted|"),
        )
        .order_by(Material.updated_at.desc())
    ).all()

    def graph_material(material: Material, relation: str) -> dict:
        return {
            "id": material.id,
            "title": material.title,
            "type": material.type,
            "chapter": material.chapter_label,
            "size": material.size,
            "content_url": material.content_url,
            "updated_at": material.updated_at.isoformat(),
            "relation": relation,
        }

    def match_key(value: str) -> str:
        return "".join(character.lower() for character in value if character.isalnum())

    links = db.execute(
        select(MaterialKnowledgeLink.knowledge_point_id, Material)
        .join(Material, Material.id == MaterialKnowledgeLink.material_id)
        .where(
            Material.course_id == course_id,
            Material.status != "deleted",
            ~Material.status.startswith("folder_deleted|"),
        )
        .order_by(Material.updated_at.desc())
    ).all()
    materials_by_point: dict[str, list[dict]] = {}
    for point_id, material in links:
        materials_by_point.setdefault(point_id, []).append(graph_material(material, "explicit"))

    for point in points:
        if materials_by_point.get(point.id):
            continue
        point_key = match_key(point.name)
        chapter_key = match_key(chapters.get(point.chapter_id).title if chapters.get(point.chapter_id) else "")
        matched = [
            material for material in active_materials
            if (point_key and point_key in match_key(f"{material.title}{material.chapter_label}"))
            or (chapter_key and (chapter_key in match_key(material.chapter_label) or match_key(material.chapter_label) in chapter_key))
        ]
        if matched:
            materials_by_point[point.id] = [graph_material(material, "chapter") for material in matched[:4]]
        elif active_materials:
            materials_by_point[point.id] = [graph_material(material, "recommended") for material in active_materials[:2]]
    nodes = [
        {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "difficulty": item.difficulty,
            "mastery": item.mastery,
            "x": item.position_x,
            "y": item.position_y,
            "materials": materials_by_point.get(item.id, []),
        }
        for item in points
    ]
    center = next((item for item in nodes if item["id"] == "kp-linked"), nodes[0] if nodes else None)
    edges = [] if not center else [{"source": center["id"], "target": item["id"], "type": "related"} for item in nodes if item["id"] != center["id"]]
    return envelope({"nodes": nodes, "edges": edges})


@app.patch("/api/v1/teacher/notifications/{notification_id}")
def mark_notification(notification_id: str, payload: NotificationRead, teacher: User = Depends(current_teacher), db: Session = Depends(get_db)):
    item = db.get(Notification, notification_id)
    if not item or item.user_id != teacher.id:
        raise HTTPException(status_code=404, detail="通知不存在")
    item.read = payload.read
    db.commit()
    return envelope({"id": item.id, "read": item.read})

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "dist"
if FRONTEND_DIST.exists():
    from fastapi.staticfiles import StaticFiles
    from starlette.exceptions import HTTPException as StarletteHTTPException

    class SPAStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope: dict[str, Any]):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                if (
                    exc.status_code == 404
                    and scope.get("method") in {"GET", "HEAD"}
                    and not path.startswith(("api/", "docs", "redoc", "openapi.json"))
                ):
                    return await super().get_response("index.html", scope)
                raise

    app.mount("/", SPAStaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


