from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime
import json
import secrets
import string
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session, selectinload

from .database import Base, SessionLocal, engine, get_db
from .models import (
    AuditLog,
    Chapter,
    ClassGroup,
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
    MaterialCreate,
    NotificationRead,
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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(engine)
    ensure_class_filter_columns()
    ensure_grade_dimension_column()
    ensure_chapter_content_columns()
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
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
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
    if selected_course is None:
        raise HTTPException(status_code=404, detail="当前教师还没有课程")
    course_id = selected_course.id
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
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


