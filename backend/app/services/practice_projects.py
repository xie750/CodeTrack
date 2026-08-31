import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.models import (
    Course,
    Enrollment,
    PracticeProject,
    PracticeProjectActivity,
    PracticeProjectEnrollment,
    PracticeProjectSubmission,
    User,
)
from backend.app.models.entities import utc_now
from backend.app.services.submissions import iso, prefixed_id


DEFAULT_PATH_STEPS = [
    {"title": "课程积累", "description": "先完成课程任务，沉淀知识点、错因和提示使用记录"},
    {"title": "画像判断", "description": "系统根据学习画像判断是否进入需要项目实战的能力瓶颈"},
    {"title": "轻量试做", "description": "从小项目开始，聚焦一个真实业务问题和少量能力点"},
    {"title": "过程留痕", "description": "记录资料、实验、提交和反馈，形成可复盘过程"},
    {"title": "成果审核", "description": "提交代码、报告或截图，由平台生成反馈和能力证据"},
    {"title": "能力进阶", "description": "通过首个项目后，再推荐更综合的企业能力场景"},
]


def safe_json_list(raw: str | None) -> list:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return value if isinstance(value, list) else []


def safe_json_object(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def status_label(status: str) -> str:
    return {
        "NOT_STARTED": "待开始",
        "IN_PROGRESS": "进行中",
        "SUBMITTED": "待审核",
        "APPROVED": "已通过",
        "NEEDS_REVISION": "待修正",
        "COMPLETED": "已完成",
    }.get(status, status)


def serialize_project_summary(
    project: PracticeProject,
    enrollment: PracticeProjectEnrollment | None,
    course: Course | None,
) -> dict:
    progress = enrollment.progress if enrollment else 0
    status = enrollment.status if enrollment else "NOT_STARTED"
    return {
        "id": project.id,
        "course_id": project.course_id,
        "course_name": course.name if course else "",
        "title": project.title,
        "status": status,
        "status_label": status_label(status),
        "description": project.description,
        "long_description": project.long_description,
        "progress": progress,
        "accent": project.accent,
        "tags": safe_json_list(project.tags_json),
        "members": safe_json_list(project.member_names_json),
        "period": project.period_label,
        "stage": project.current_stage,
        "direction": project.direction,
        "capability_points": safe_json_list(project.capability_points_json),
        "last_activity_summary": enrollment.last_activity_summary if enrollment else "",
        "weekly_hours": enrollment.weekly_hours if enrollment else 0,
    }


def serialize_activity(activity: PracticeProjectActivity) -> dict:
    return {
        "id": activity.id,
        "project_id": activity.project_id,
        "type": activity.activity_type,
        "text": activity.text,
        "time": activity.time_label,
        "created_at": iso(activity.created_at),
    }


def serialize_submission(submission: PracticeProjectSubmission) -> dict:
    return {
        "id": submission.id,
        "project_id": submission.project_id,
        "title": submission.title,
        "description": submission.description,
        "status": submission.status,
        "status_label": status_label(submission.status),
        "review_comment": submission.review_comment,
        "content": safe_json_object(submission.content_json),
        "submitted_at": iso(submission.submitted_at),
        "created_at": iso(submission.created_at),
    }


def project_scope_query(student_id: str, class_id: str):
    return (
        select(PracticeProject, PracticeProjectEnrollment, Course)
        .join(Course, PracticeProject.course_id == Course.id)
        .join(
            PracticeProjectEnrollment,
            (PracticeProjectEnrollment.project_id == PracticeProject.id)
            & (PracticeProjectEnrollment.student_id == student_id)
            & (PracticeProjectEnrollment.class_id == class_id),
        )
        .join(
            Enrollment,
            (Enrollment.course_id == PracticeProject.course_id)
            & (Enrollment.user_id == student_id)
            & (Enrollment.role == "STUDENT"),
        )
        .where(PracticeProject.status == "ACTIVE")
        .order_by(PracticeProject.sort_order.asc(), PracticeProject.id.asc())
    )


def starter_project_query(student_id: str):
    return (
        select(PracticeProject, Course)
        .join(Course, PracticeProject.course_id == Course.id)
        .join(
            Enrollment,
            (Enrollment.course_id == PracticeProject.course_id)
            & (Enrollment.user_id == student_id)
            & (Enrollment.role == "STUDENT"),
        )
        .outerjoin(
            PracticeProjectEnrollment,
            (PracticeProjectEnrollment.project_id == PracticeProject.id)
            & (PracticeProjectEnrollment.student_id == student_id),
        )
        .where(
            PracticeProject.status == "ACTIVE",
            PracticeProjectEnrollment.id.is_(None),
        )
        .order_by(PracticeProject.sort_order.asc(), PracticeProject.id.asc())
    )


def home_readiness(projects: list[dict]) -> dict:
    if projects:
        return {
            "status": "ACTIVE",
            "title": "项目实战进行中",
            "description": "你已经进入项目实战阶段，可以继续推进当前项目并沉淀能力证据。",
            "primary_action_label": "继续项目",
            "secondary_action_label": "查看项目路径",
        }
    return {
        "status": "PREPARING",
        "title": "项目实战尚未开启",
        "description": "当课程任务和学习画像显示你进入能力瓶颈时，系统会引导你从第一个轻量项目开始试做。",
        "primary_action_label": "尝试第一个轻量项目",
        "secondary_action_label": "先完成课程任务",
    }


def list_practice_projects(db: Session, student_id: str, class_id: str) -> dict:
    rows = db.execute(project_scope_query(student_id, class_id)).all()
    projects = [serialize_project_summary(project, enrollment, course) for project, enrollment, course in rows]
    active_projects = [project for project in projects if project["status"] == "IN_PROGRESS"]
    completed_projects = [project for project in projects if project["status"] in {"COMPLETED", "APPROVED"}]
    weekly_hours = round(sum(float(project.get("weekly_hours") or 0) for project in projects), 1)
    project_ids = [project["id"] for project in projects]
    activities = (
        db.scalars(
            select(PracticeProjectActivity)
            .where(
                PracticeProjectActivity.student_id == student_id,
                PracticeProjectActivity.project_id.in_(project_ids),
            )
            .order_by(PracticeProjectActivity.created_at.desc())
            .limit(6)
        ).all()
        if project_ids
        else []
    )
    recommended_project_id = active_projects[0]["id"] if active_projects else (projects[0]["id"] if projects else None)
    return {
        "projects": projects,
        "recommended_project_id": recommended_project_id,
        "stats": {
            "project_count": len(projects),
            "in_progress_count": len(active_projects),
            "completed_count": len(completed_projects),
            "weekly_hours": weekly_hours,
            "project_delta": 1,
            "completed_delta": 1,
            "weekly_hours_delta": 2.3,
        },
        "activities": [serialize_activity(activity) for activity in activities],
        "path_steps": (
            safe_json_list(rows[0][0].path_steps_json)
            if rows
            else DEFAULT_PATH_STEPS
        ),
        "readiness": home_readiness(projects),
        "proof_items": [
            {"title": "真实输入", "description": "用数据、日志、业务指标模拟企业任务。", "icon": "database"},
            {"title": "过程留痕", "description": "记录提交、调试、提示使用和阶段成果。", "icon": "folder"},
            {"title": "成果可交", "description": "沉淀代码、报告、测试和可复用文档。", "icon": "file-check"},
            {"title": "AI 辅导", "description": "提供分层提示，不替学生直接完成项目。", "icon": "bot"},
        ],
    }


def start_first_practice_project(db: Session, student: User, class_id: str) -> dict:
    existing = db.execute(project_scope_query(student.id, class_id)).first()
    if existing is not None:
        project, _, _ = existing
        return {
            "started": False,
            "detail": get_practice_project_detail(db, project.id, student.id, class_id),
        }

    row = db.execute(starter_project_query(student.id)).first()
    if row is None:
        raise ApiError(404, "PRACTICE_STARTER_NOT_AVAILABLE", "当前还没有适合你的项目模板，请先完成课程任务后再回来尝试。")

    project, _ = row
    now = utc_now()
    enrollment = PracticeProjectEnrollment(
        project_id=project.id,
        student_id=student.id,
        class_id=class_id,
        status="IN_PROGRESS",
        progress=1,
        completed_stage_count=0,
        experiment_record_count=0,
        submission_count=0,
        weekly_hours=0,
        last_activity_summary="开启第一个项目尝试",
        joined_at=now,
        updated_at=now,
    )
    db.add(enrollment)
    activity = PracticeProjectActivity(
        id=prefixed_id("practice_activity"),
        project_id=project.id,
        student_id=student.id,
        activity_type="join",
        text=f"开启第一个项目「{project.title}」尝试",
        time_label="刚刚",
        created_at=now,
    )
    db.add(activity)
    db.flush()
    return {
        "started": True,
        "detail": get_practice_project_detail(db, project.id, student.id, class_id),
    }


def get_practice_project_detail(db: Session, project_id: str, student_id: str, class_id: str) -> dict:
    row = db.execute(
        project_scope_query(student_id, class_id).where(PracticeProject.id == project_id)
    ).first()
    if row is None:
        raise ApiError(404, "PRACTICE_PROJECT_NOT_FOUND", "项目实训不存在或当前学生无权访问。")
    project, enrollment, course = row
    summary = serialize_project_summary(project, enrollment, course)
    submissions = db.scalars(
        select(PracticeProjectSubmission)
        .where(
            PracticeProjectSubmission.project_id == project.id,
            PracticeProjectSubmission.student_id == student_id,
        )
        .order_by(PracticeProjectSubmission.submitted_at.desc())
        .limit(8)
    ).all()
    activities = db.scalars(
        select(PracticeProjectActivity)
        .where(
            PracticeProjectActivity.project_id == project.id,
            PracticeProjectActivity.student_id == student_id,
        )
        .order_by(PracticeProjectActivity.created_at.desc())
        .limit(8)
    ).all()
    return {
        "project": summary,
        "metrics": {
            "completed_stage_count": enrollment.completed_stage_count if enrollment else 0,
            "total_stage_count": project.total_stage_count,
            "experiment_record_count": enrollment.experiment_record_count if enrollment else 0,
            "submission_count": enrollment.submission_count if enrollment else 0,
        },
        "task_sections": safe_json_list(project.task_sections_json),
        "submission_requirements": safe_json_list(project.submission_requirements_json),
        "acceptance_criteria": safe_json_list(project.acceptance_criteria_json),
        "mentor_tips": safe_json_list(project.mentor_tips_json),
        "resources": safe_json_list(project.resources_json),
        "submissions": [serialize_submission(submission) for submission in submissions],
        "activities": [serialize_activity(activity) for activity in activities],
    }


def create_practice_submission(
    db: Session,
    project_id: str,
    student: User,
    class_id: str,
    title: str,
    description: str,
    materials: list[str],
) -> dict:
    row = db.execute(
        project_scope_query(student.id, class_id).where(PracticeProject.id == project_id)
    ).first()
    if row is None:
        raise ApiError(404, "PRACTICE_PROJECT_NOT_FOUND", "项目实训不存在或当前学生无权访问。")
    project, enrollment, _ = row
    now = utc_now()
    submission = PracticeProjectSubmission(
        id=prefixed_id("practice_submit"),
        project_id=project.id,
        student_id=student.id,
        title=title.strip() or f"{project.current_stage} 阶段成果",
        description=description.strip() or f"提交内容：{project.current_stage} 阶段材料。",
        status="SUBMITTED",
        review_comment="已进入阶段成果审核队列，平台将结合实验记录和验收标准生成反馈。",
        content_json=json.dumps({"materials": materials}, ensure_ascii=False),
        submitted_at=now,
        created_at=now,
    )
    db.add(submission)
    enrollment.status = "SUBMITTED"
    enrollment.submission_count += 1
    enrollment.experiment_record_count += 1 if materials else 0
    enrollment.last_activity_summary = f"提交了 {submission.title}"
    enrollment.updated_at = now
    activity = PracticeProjectActivity(
        id=prefixed_id("practice_activity"),
        project_id=project.id,
        student_id=student.id,
        activity_type="submit",
        text=f"你提交了 {submission.title}",
        time_label="刚刚",
        created_at=now,
    )
    db.add(activity)
    db.flush()
    return {
        "submission": serialize_submission(submission),
        "detail": get_practice_project_detail(db, project.id, student.id, class_id),
    }
