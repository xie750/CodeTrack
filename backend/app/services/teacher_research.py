import json
from pathlib import Path
from urllib.parse import quote_plus

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings
from backend.app.models import (
    AdministrativeClass,
    Course,
    KnowledgeSource,
    PracticeProject,
    PracticeProjectEnrollment,
    PracticeProjectSubmission,
    StudentClassMembership,
    TeacherResearchActivity,
    TeacherResearchMaterial,
    TeacherResearchProject,
    User,
)
from backend.app.models.entities import utc_now
from backend.app.services.practice_projects import (
    PAPER_SEARCH_BASES,
    safe_file_name,
    safe_json_list,
    safe_json_object,
    serialize_submission,
)
from backend.app.services.submissions import iso, prefixed_id
from backend.app.services.teacher_scope import teacher_assignments


DEFAULT_MILESTONES = [
    {"title": "选题与边界", "status": "ACTIVE", "description": "明确研究问题、课程关联和学生协作范围。"},
    {"title": "前沿追踪", "status": "READY", "description": "沉淀论文、代码、数据集和 benchmark 入口。"},
    {"title": "实验与复现", "status": "READY", "description": "收集代码、Notebook、数据表和实验记录。"},
    {"title": "阶段审核", "status": "READY", "description": "审核学生提交并给出下一步修正建议。"},
    {"title": "成果入库", "status": "READY", "description": "把优秀产出转成课程资料、案例任务或知识库条目。"},
]

HARNESS_RULES = [
    "研究主题必须绑定人工智能专业课程或项目实践场景。",
    "前沿追踪必须保留权威来源链接，AI 结论不得脱离引用依据。",
    "阶段推进以资料、代码、实验记录和学生提交为证据。",
    "偏离项目目标时，优先回到当前阶段任务与验收标准。",
    "结项材料可沉淀到课程资料库，但不覆盖历史提交。",
]


def _json(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def _teacher_course_ids(db: Session, teacher_id: str) -> list[str]:
    ids: list[str] = []
    for assignment in teacher_assignments(db, teacher_id):
        if assignment.course_id not in ids:
            ids.append(assignment.course_id)
    return ids


def _ensure_course_scope(db: Session, teacher_id: str, course_id: str | None) -> None:
    if course_id and not teacher_assignments(db, teacher_id, course_id):
        raise ApiError(403, "AUTH_FORBIDDEN", "当前教师无权访问该课程科研项目。")


def _teacher_project_or_404(db: Session, teacher_id: str, project_id: str) -> TeacherResearchProject:
    project = db.get(TeacherResearchProject, project_id)
    if project is None or project.teacher_id != teacher_id:
        raise ApiError(404, "TEACHER_RESEARCH_PROJECT_NOT_FOUND", "教师科研项目不存在或无权访问。")
    return project


def _source_links(query: str) -> list[dict]:
    encoded = quote_plus(query.strip() or "artificial intelligence education research")
    return [
        {
            "platform": "arxiv",
            "label": "arXiv 论文检索",
            "description": "查看相关预印本、最新论文标题和摘要。",
            "url": PAPER_SEARCH_BASES["arxiv"].format(query=encoded),
        },
        {
            "platform": "semantic_scholar",
            "label": "Semantic Scholar",
            "description": "查看论文、作者、引用和相关研究脉络。",
            "url": PAPER_SEARCH_BASES["semantic_scholar"].format(query=encoded),
        },
        {
            "platform": "papers_with_code",
            "label": "Papers with Code",
            "description": "查看论文对应代码、任务、数据集和 benchmark。",
            "url": PAPER_SEARCH_BASES["papers_with_code"].format(query=encoded),
        },
        {
            "platform": "huggingface_papers",
            "label": "Hugging Face Papers",
            "description": "查看模型社区近期论文和实现讨论。",
            "url": PAPER_SEARCH_BASES["huggingface_papers"].format(query=encoded),
        },
    ]


def _frontier_topics(project: TeacherResearchProject, focus: str = "") -> list[dict]:
    query = focus.strip() or project.direction or project.title
    encoded = quote_plus(query)
    return [
        {
            "title": f"{query} 的近期论文脉络",
            "source": "arXiv / Semantic Scholar",
            "heat": 88,
            "summary": "优先追踪近三年论文、综述和引用链，筛出可用于学生项目实践的研究问题。",
            "source_url": PAPER_SEARCH_BASES["arxiv"].format(query=encoded),
        },
        {
            "title": f"{query} 的代码复现与 benchmark",
            "source": "Papers with Code / Hugging Face Papers",
            "heat": 81,
            "summary": "关注公开代码、模型卡、数据集说明和可复现实验，便于教师拆成阶段任务。",
            "source_url": PAPER_SEARCH_BASES["papers_with_code"].format(query=encoded),
        },
        {
            "title": "教学反哺与课程案例转化",
            "source": "课程资料库 + 学生阶段提交",
            "heat": 73,
            "summary": "把研究资料转为课程案例、任务说明和评价量规，形成学科垂直知识沉淀。",
            "source_url": PAPER_SEARCH_BASES["semantic_scholar"].format(query=quote_plus(f"{query} education case study")),
        },
    ]


def _harness_state(project: TeacherResearchProject, *, student_submissions: int = 0) -> dict:
    stored = safe_json_object(project.harness_state_json)
    next_actions = stored.get("next_actions") if isinstance(stored.get("next_actions"), list) else []
    if not next_actions:
        if project.status == "DRAFT":
            next_actions = ["补齐项目方向与阶段目标", "刷新前沿追踪", "发布给学生实践"]
        elif project.status == "PUBLISHED" and student_submissions == 0:
            next_actions = ["检查学生侧项目入口", "补充示例材料", "等待首个阶段提交"]
        elif student_submissions:
            next_actions = ["审核学生阶段成果", "选择优秀材料沉淀入库", "更新下一阶段任务"]
        else:
            next_actions = ["继续沉淀项目材料", "维护前沿来源", "准备阶段审核"]
    return {
        "stage": project.stage,
        "guardrails": HARNESS_RULES,
        "deviation_signal": stored.get("deviation_signal", "未发现偏离：项目目标、材料和阶段提交仍在同一研究轨道内。"),
        "pullback_action": stored.get("pullback_action", "若材料与当前课题无关，先回到阶段目标和验收标准，再决定是否另开项目。"),
        "next_actions": next_actions,
    }


def _serialize_material(material: TeacherResearchMaterial) -> dict:
    return {
        "id": material.id,
        "project_id": material.project_id,
        "material_type": material.material_type,
        "title": material.title,
        "description": material.description,
        "content": material.content,
        "file_name": material.file_name,
        "file_size": material.file_size,
        "mime_type": material.mime_type,
        "download_url": (
            f"/api/v1/teacher/research/projects/{material.project_id}/materials/{material.id}/download"
            if material.storage_path
            else None
        ),
        "external_url": material.external_url,
        "source": material.source,
        "status": material.status,
        "created_at": iso(material.created_at),
        "updated_at": iso(material.updated_at),
    }


def _serialize_activity(activity: TeacherResearchActivity) -> dict:
    return {
        "id": activity.id,
        "project_id": activity.project_id,
        "type": activity.activity_type,
        "text": activity.text,
        "created_at": iso(activity.created_at),
    }


def _submission_student_payload(db: Session, submission: PracticeProjectSubmission) -> dict:
    student = db.get(User, submission.student_id)
    return {
        **serialize_submission(submission),
        "student_id": submission.student_id,
        "student_name": student.display_name if student else submission.student_id,
    }


def _project_publish_scope(
    db: Session,
    teacher_id: str,
    project: TeacherResearchProject,
    *,
    class_ids: list[str] | None = None,
) -> dict:
    if not project.course_id:
        return {
            "basis": "发布对象需要先绑定课程，再由教师授课班级和班级在册学生推导。",
            "course_id": None,
            "course_name": "未绑定课程",
            "class_count": 0,
            "student_count": 0,
            "classes": [],
            "students": [],
        }

    assignments = teacher_assignments(db, teacher_id, project.course_id)
    allowed_class_ids = [item.class_id for item in assignments]
    if class_ids is not None:
        selected = [item for item in dict.fromkeys(class_ids) if item]
        if not selected:
            raise ApiError(422, "TEACHER_RESEARCH_CLASS_REQUIRED", "请至少选择一个要发布的班级。")
        invalid = [item for item in selected if item not in allowed_class_ids]
        if invalid:
            raise ApiError(403, "AUTH_FORBIDDEN", "发布班级超出当前教师授课范围。", {"class_ids": invalid})
        assignments = [item for item in assignments if item.class_id in selected]

    class_order: list[str] = []
    assignment_by_class = {}
    for assignment in assignments:
        if assignment.class_id not in class_order:
            class_order.append(assignment.class_id)
            assignment_by_class[assignment.class_id] = assignment

    memberships = (
        db.scalars(
            select(StudentClassMembership)
            .where(
                StudentClassMembership.class_id.in_(class_order),
                StudentClassMembership.status == "ACTIVE",
            )
            .order_by(StudentClassMembership.joined_at.asc())
        ).all()
        if class_order
        else []
    )
    student_ids = sorted({item.student_id for item in memberships})
    users = {
        user.id: user
        for user in (
            db.scalars(select(User).where(User.id.in_(student_ids)).order_by(User.display_name, User.id)).all()
            if student_ids
            else []
        )
    }

    students_by_class: dict[str, list[dict]] = {class_id: [] for class_id in class_order}
    for membership in memberships:
        student = users.get(membership.student_id)
        students_by_class.setdefault(membership.class_id, []).append(
            {
                "student_id": membership.student_id,
                "student_name": student.display_name if student else membership.student_id,
                "username": student.username if student else None,
                "class_id": membership.class_id,
            }
        )

    course = db.get(Course, project.course_id)
    class_rows = []
    for class_id in class_order:
        administrative_class = db.get(AdministrativeClass, class_id)
        assignment = assignment_by_class[class_id]
        students = students_by_class.get(class_id, [])
        class_rows.append(
            {
                "class_id": class_id,
                "class_name": administrative_class.name if administrative_class else class_id,
                "grade": administrative_class.grade if administrative_class else "",
                "major_name": administrative_class.major_name if administrative_class else "",
                "teaching_assignment_id": assignment.id,
                "term": assignment.term,
                "student_count": len(students),
                "students": students,
            }
        )

    unique_students: dict[str, dict] = {}
    for row in class_rows:
        for student in row["students"]:
            unique_students.setdefault(student["student_id"], student)

    return {
        "basis": "发布对象由绑定课程、当前教师的生效授课班级、班级在册有效学生共同确定；发布时只会给勾选班级生成学生端科研项目入口。",
        "course_id": project.course_id,
        "course_name": course.name if course else project.course_id,
        "class_count": len(class_rows),
        "student_count": len(unique_students),
        "classes": class_rows,
        "students": list(unique_students.values()),
    }


def _project_student_stats(db: Session, project: TeacherResearchProject) -> dict:
    if not project.student_project_id:
        return {"student_count": 0, "submission_count": 0, "pending_review_count": 0}
    enrollments = db.scalars(
        select(PracticeProjectEnrollment).where(PracticeProjectEnrollment.project_id == project.student_project_id)
    ).all()
    submissions = db.scalars(
        select(PracticeProjectSubmission).where(PracticeProjectSubmission.project_id == project.student_project_id)
    ).all()
    return {
        "student_count": len({item.student_id for item in enrollments}),
        "submission_count": len(submissions),
        "pending_review_count": len([item for item in submissions if item.status == "SUBMITTED"]),
    }


def _serialize_project(db: Session, project: TeacherResearchProject, *, include_detail: bool = False) -> dict:
    course = db.get(Course, project.course_id) if project.course_id else None
    material_count = db.scalar(
        select(func.count())
        .select_from(TeacherResearchMaterial)
        .where(TeacherResearchMaterial.project_id == project.id)
    ) or 0
    materials = db.scalars(
        select(TeacherResearchMaterial)
        .where(TeacherResearchMaterial.project_id == project.id)
        .order_by(TeacherResearchMaterial.created_at.desc())
        .limit(20 if include_detail else 3)
    ).all()
    activities = db.scalars(
        select(TeacherResearchActivity)
        .where(TeacherResearchActivity.project_id == project.id)
        .order_by(TeacherResearchActivity.created_at.desc())
        .limit(10 if include_detail else 3)
    ).all()
    stats = _project_student_stats(db, project)
    payload = {
        "id": project.id,
        "teacher_id": project.teacher_id,
        "course_id": project.course_id,
        "course_name": course.name if course else "未绑定课程",
        "student_project_id": project.student_project_id,
        "title": project.title,
        "direction": project.direction,
        "description": project.description,
        "stage": project.stage,
        "progress": project.progress,
        "status": project.status,
        "status_label": {
            "DRAFT": "草稿",
            "TRACKING": "前沿追踪",
            "PUBLISHED": "已发布给学生",
            "REVIEWING": "阶段审核",
            "ARCHIVED": "已归档",
        }.get(project.status, project.status),
        "tags": safe_json_list(project.tags_json),
        "milestones": safe_json_list(project.milestones_json),
        "frontier_topics": safe_json_list(project.frontier_topics_json),
        "external_sources": safe_json_list(project.external_sources_json),
        "harness": _harness_state(project, student_submissions=stats["submission_count"]),
        "publish_scope": _project_publish_scope(db, project.teacher_id, project),
        "stats": {
            **stats,
            "material_count": material_count,
        },
        "materials": [_serialize_material(item) for item in materials],
        "activities": [_serialize_activity(item) for item in activities],
        "created_at": iso(project.created_at),
        "updated_at": iso(project.updated_at),
    }
    if include_detail and project.student_project_id:
        submissions = db.scalars(
            select(PracticeProjectSubmission)
            .where(PracticeProjectSubmission.project_id == project.student_project_id)
            .order_by(PracticeProjectSubmission.submitted_at.desc())
            .limit(30)
        ).all()
        payload["student_submissions"] = [_submission_student_payload(db, item) for item in submissions]
    else:
        payload["student_submissions"] = []
    return payload


def ensure_demo_teacher_research(db: Session, teacher: User) -> None:
    exists = db.scalar(select(TeacherResearchProject.id).where(TeacherResearchProject.teacher_id == teacher.id).limit(1))
    if exists:
        return
    course_ids = _teacher_course_ids(db, teacher.id)
    course_id = "course_arch_001" if "course_arch_001" in course_ids else (course_ids[0] if course_ids else None)
    now = utc_now()
    project = TeacherResearchProject(
        id=f"teacher_research_demo_{teacher.id}",
        teacher_id=teacher.id,
        course_id=course_id,
        title="人工智能专业图像分类科研训练 Harness",
        direction="计算机视觉 + 模型评估 + 教学案例转化",
        description="围绕公开图像分类任务组织前沿追踪、代码复现、学生阶段提交和课程案例沉淀。",
        stage="前沿追踪与任务拆解",
        progress=36,
        status="TRACKING",
        tags_json=_json(["人工智能专业", "前沿追踪", "代码复现", "学生协作"]),
        milestones_json=_json(DEFAULT_MILESTONES),
        frontier_topics_json=_json(_frontier_topics_dummy("计算机视觉 图像分类 教学案例")),
        external_sources_json=_json(_source_links("计算机视觉 图像分类 教学案例")),
        harness_state_json=_json(
            {
                "next_actions": ["确认学生实践范围", "上传基线实验代码", "发布给学生形成阶段提交入口"],
            }
        ),
        created_at=now,
        updated_at=now,
    )
    db.add(project)
    db.add(
        TeacherResearchActivity(
            id=prefixed_id("teacher_research_activity"),
            project_id=project.id,
            teacher_id=teacher.id,
            activity_type="seed",
            text="系统生成教师科研 Harness 示例项目，可继续发布给学生实践。",
            created_at=now,
        )
    )


def _frontier_topics_dummy(query: str) -> list[dict]:
    encoded = quote_plus(query)
    return [
        {
            "title": "轻量视觉模型与课堂可复现实验",
            "source": "arXiv / Papers with Code",
            "heat": 86,
            "summary": "适合把模型结构、训练策略和评价指标拆成学生阶段任务。",
            "source_url": PAPER_SEARCH_BASES["arxiv"].format(query=encoded),
        },
        {
            "title": "错误分析与模型可解释性",
            "source": "Semantic Scholar",
            "heat": 78,
            "summary": "教师可用混淆矩阵、失败样本和指标解释约束学生结论不跑偏。",
            "source_url": PAPER_SEARCH_BASES["semantic_scholar"].format(query=encoded),
        },
    ]


def list_teacher_research_projects(db: Session, teacher: User) -> dict:
    ensure_demo_teacher_research(db, teacher)
    db.flush()
    course_ids = _teacher_course_ids(db, teacher.id)
    projects = db.scalars(
        select(TeacherResearchProject)
        .where(TeacherResearchProject.teacher_id == teacher.id)
        .order_by(TeacherResearchProject.updated_at.desc())
    ).all()
    return {
        "projects": [_serialize_project(db, item) for item in projects],
        "courses": [
            {"id": course.id, "name": course.name}
            for course in db.scalars(select(Course).where(Course.id.in_(course_ids))).all()
        ] if course_ids else [],
        "harness_rules": HARNESS_RULES,
        "summary": {
            "project_count": len(projects),
            "published_count": len([item for item in projects if item.status == "PUBLISHED"]),
            "tracking_count": len([item for item in projects if item.status in {"DRAFT", "TRACKING"}]),
        },
    }


def get_teacher_research_project(db: Session, teacher: User, project_id: str) -> dict:
    ensure_demo_teacher_research(db, teacher)
    project = _teacher_project_or_404(db, teacher.id, project_id)
    return _serialize_project(db, project, include_detail=True)


def create_teacher_research_project(
    db: Session,
    teacher: User,
    *,
    title: str,
    direction: str,
    description: str,
    course_id: str | None,
    tags: list[str],
) -> dict:
    normalized_title = title.strip()
    if not normalized_title:
        raise ApiError(422, "TEACHER_RESEARCH_TITLE_EMPTY", "科研项目标题不能为空。")
    _ensure_course_scope(db, teacher.id, course_id)
    now = utc_now()
    query = direction.strip() or normalized_title
    project = TeacherResearchProject(
        id=prefixed_id("teacher_research"),
        teacher_id=teacher.id,
        course_id=course_id,
        title=normalized_title,
        direction=query,
        description=description.strip(),
        stage="选题与计划",
        progress=12,
        status="DRAFT",
        tags_json=_json([item.strip() for item in tags if item.strip()][:8]),
        milestones_json=_json(DEFAULT_MILESTONES),
        frontier_topics_json=_json(_frontier_topics_dummy(query)),
        external_sources_json=_json(_source_links(query)),
        harness_state_json=_json({"next_actions": ["刷新前沿追踪", "上传项目材料", "发布给学生实践"]}),
        created_at=now,
        updated_at=now,
    )
    db.add(project)
    db.add(
        TeacherResearchActivity(
            id=prefixed_id("teacher_research_activity"),
            project_id=project.id,
            teacher_id=teacher.id,
            activity_type="create",
            text=f"创建科研 Harness 项目「{project.title}」。",
            created_at=now,
        )
    )
    db.flush()
    return _serialize_project(db, project, include_detail=True)


def refresh_frontier(db: Session, teacher: User, project_id: str, focus: str) -> dict:
    project = _teacher_project_or_404(db, teacher.id, project_id)
    focus_text = focus.strip()[:120]
    query = focus_text or project.direction or project.title
    topics = _frontier_topics(project, focus_text)
    project.frontier_topics_json = _json(topics)
    project.external_sources_json = _json(_source_links(query))
    project.status = "TRACKING" if project.status == "DRAFT" else project.status
    project.progress = max(project.progress, 28)
    project.updated_at = utc_now()
    activity = TeacherResearchActivity(
        id=prefixed_id("teacher_research_activity"),
        project_id=project.id,
        teacher_id=teacher.id,
        activity_type="frontier",
        text=f"刷新前沿追踪：{query}",
        created_at=project.updated_at,
    )
    db.add(activity)
    db.flush()
    return {"project": _serialize_project(db, project, include_detail=True), "activity": _serialize_activity(activity)}


def create_material(
    db: Session,
    teacher: User,
    project_id: str,
    *,
    material_type: str,
    title: str,
    description: str,
    content: str,
    external_url: str,
) -> dict:
    project = _teacher_project_or_404(db, teacher.id, project_id)
    normalized_title = title.strip()
    if not normalized_title:
        raise ApiError(422, "TEACHER_RESEARCH_MATERIAL_TITLE_EMPTY", "材料标题不能为空。")
    if not (description.strip() or content.strip() or external_url.strip()):
        raise ApiError(422, "TEACHER_RESEARCH_MATERIAL_EMPTY", "请至少填写材料说明、正文或外部链接。")
    now = utc_now()
    material = TeacherResearchMaterial(
        id=prefixed_id("teacher_research_material"),
        project_id=project.id,
        teacher_id=teacher.id,
        material_type=(material_type.strip().upper() or "NOTE")[:40],
        title=normalized_title,
        description=description.strip(),
        content=content.strip(),
        external_url=external_url.strip(),
        source="teacher_note",
        status="READY",
        created_at=now,
        updated_at=now,
    )
    db.add(material)
    project.progress = min(100, max(project.progress, project.progress + 3))
    project.updated_at = now
    activity = TeacherResearchActivity(
        id=prefixed_id("teacher_research_activity"),
        project_id=project.id,
        teacher_id=teacher.id,
        activity_type="material",
        text=f"沉淀科研材料「{material.title}」。",
        created_at=now,
    )
    db.add(activity)
    db.flush()
    return {
        "material": _serialize_material(material),
        "activity": _serialize_activity(activity),
        "project": _serialize_project(db, project, include_detail=True),
    }


def upload_material_file(
    db: Session,
    teacher: User,
    project_id: str,
    *,
    material_type: str,
    title: str,
    description: str,
    content: bytes,
    file_name: str | None,
    mime_type: str | None,
) -> dict:
    project = _teacher_project_or_404(db, teacher.id, project_id)
    if not content:
        raise ApiError(422, "TEACHER_RESEARCH_FILE_EMPTY", "上传文件为空。")
    settings = get_settings()
    limit = settings.resource_max_upload_mb * 1024 * 1024
    if len(content) > limit:
        raise ApiError(413, "TEACHER_RESEARCH_FILE_TOO_LARGE", f"上传文件超过 {settings.resource_max_upload_mb} MB 上限。")
    safe_name = safe_file_name(file_name)
    material_id = prefixed_id("teacher_research_material")
    suffix = Path(safe_name).suffix[:16]
    target_dir = Path(settings.resource_storage_dir) / "teacher-research" / teacher.id / project.id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{material_id}{suffix}"
    target.write_bytes(content)
    now = utc_now()
    material = TeacherResearchMaterial(
        id=material_id,
        project_id=project.id,
        teacher_id=teacher.id,
        material_type=(material_type.strip().upper() or "CODE_FILE")[:40],
        title=title.strip() or safe_name,
        description=description.strip(),
        content="",
        file_name=safe_name,
        file_size=len(content),
        mime_type=mime_type,
        storage_path=str(target),
        external_url="",
        source="teacher_file_upload",
        status="READY",
        created_at=now,
        updated_at=now,
    )
    db.add(material)
    project.progress = min(100, max(project.progress, project.progress + 4))
    project.updated_at = now
    activity = TeacherResearchActivity(
        id=prefixed_id("teacher_research_activity"),
        project_id=project.id,
        teacher_id=teacher.id,
        activity_type="file",
        text=f"上传科研文件「{material.file_name}」。",
        created_at=now,
    )
    db.add(activity)
    db.flush()
    return {
        "material": _serialize_material(material),
        "activity": _serialize_activity(activity),
        "project": _serialize_project(db, project, include_detail=True),
    }


def material_file(db: Session, teacher: User, project_id: str, material_id: str) -> TeacherResearchMaterial:
    project = _teacher_project_or_404(db, teacher.id, project_id)
    material = db.get(TeacherResearchMaterial, material_id)
    if material is None or material.project_id != project.id or material.teacher_id != teacher.id or not material.storage_path:
        raise ApiError(404, "TEACHER_RESEARCH_FILE_NOT_FOUND", "科研材料文件不存在或不可访问。")
    if not Path(material.storage_path).exists():
        raise ApiError(404, "TEACHER_RESEARCH_FILE_MISSING", "科研材料文件尚未落盘或已被移除。")
    return material


def publish_to_students(db: Session, teacher: User, project_id: str, class_ids: list[str] | None = None) -> dict:
    project = _teacher_project_or_404(db, teacher.id, project_id)
    if not project.course_id:
        raise ApiError(422, "TEACHER_RESEARCH_COURSE_REQUIRED", "发布给学生前必须绑定课程。")
    scope = _project_publish_scope(db, teacher.id, project, class_ids=class_ids)
    assignments = teacher_assignments(db, teacher.id, project.course_id)
    selected_class_ids = [item["class_id"] for item in scope["classes"]]
    if class_ids is not None:
        assignments = [item for item in assignments if item.class_id in selected_class_ids]
    if not assignments:
        raise ApiError(403, "AUTH_FORBIDDEN", "当前教师无权发布该课程科研项目。")
    memberships = db.scalars(
        select(StudentClassMembership)
        .where(StudentClassMembership.class_id.in_(selected_class_ids), StudentClassMembership.status == "ACTIVE")
        .order_by(StudentClassMembership.joined_at.asc())
    ).all()
    if not memberships:
        raise ApiError(422, "TEACHER_RESEARCH_NO_STUDENTS", "当前课程暂无可发布学生。")
    if project.student_project_id:
        student_project = db.get(PracticeProject, project.student_project_id)
    else:
        student_project = None
    if student_project is None:
        student_project = PracticeProject(
            id=prefixed_id("teacher_practice_project"),
            course_id=project.course_id,
            title=project.title,
            description=project.description or "教师发布的科研项目实践。",
            long_description=f"{project.description}\n\n教师 Harness 轨道：{project.stage}",
            project_type="TEACHER_RESEARCH_PRACTICE",
            difficulty="MEDIUM",
            direction=project.direction,
            period_label="教师设定",
            current_stage=project.stage,
            total_stage_count=max(5, len(safe_json_list(project.milestones_json))),
            accent="blue",
            tags_json=project.tags_json,
            member_names_json=_json(["教师", "AI", "学生小组"]),
            capability_points_json=_json(["论文阅读", "代码复现", "实验记录", "阶段汇报", "成果沉淀"]),
            path_steps_json=_json(
                [
                    {"title": "教师发布", "description": "教师确定研究轨道和阶段目标"},
                    {"title": "前沿追踪", "description": "学生查看权威论文、代码和数据集入口"},
                    {"title": "材料提交", "description": "学生上传代码、Notebook、报告或外部链接"},
                    {"title": "教师审核", "description": "教师给出确认、修订或退回意见"},
                    {"title": "成果沉淀", "description": "优秀成果进入课程资料或案例库"},
                ]
            ),
            task_sections_json=_json(
                [
                    {"title": "教师科研轨道", "description": project.description, "icon": "workflow"},
                    {"title": "当前阶段任务", "description": f"围绕「{project.stage}」提交可复查材料。", "icon": "file-check"},
                    {"title": "前沿来源", "description": "查看教师维护的论文、代码、数据集和 benchmark 入口。", "action": "查看前沿追踪", "icon": "database"},
                ]
            ),
            submission_requirements_json=_json(["代码/Notebook/实验文件", "文献阅读记录", "阶段报告", "下一步计划"]),
            acceptance_criteria_json=_json(["材料可下载或可跳转", "结论有来源依据", "代码或数据说明清晰", "未偏离教师设定研究轨道"]),
            mentor_tips_json=_json(_harness_state(project)["next_actions"]),
            resources_json=_json(
                [
                    {"title": item["label"], "meta": item["description"], "source_url": item["url"]}
                    for item in safe_json_list(project.external_sources_json)
                ]
            ),
            status="ACTIVE",
            sort_order=20,
        )
        db.add(student_project)
        db.flush()
        project.student_project_id = student_project.id
    created = 0
    seen: set[str] = set()
    for membership in memberships:
        key = (student_project.id, membership.student_id)
        if key in seen:
            continue
        seen.add(key)
        enrollment = db.scalar(
            select(PracticeProjectEnrollment).where(
                PracticeProjectEnrollment.project_id == student_project.id,
                PracticeProjectEnrollment.student_id == membership.student_id,
            )
        )
        if enrollment is None:
            db.add(
                PracticeProjectEnrollment(
                    project_id=student_project.id,
                    student_id=membership.student_id,
                    class_id=membership.class_id,
                    status="NOT_STARTED",
                    progress=8,
                    completed_stage_count=0,
                    experiment_record_count=0,
                    submission_count=0,
                    weekly_hours=0,
                    last_activity_summary=f"教师发布科研项目「{project.title}」",
                )
            )
            created += 1
    now = utc_now()
    project.status = "PUBLISHED"
    project.progress = max(project.progress, 45)
    project.updated_at = now
    activity = TeacherResearchActivity(
        id=prefixed_id("teacher_research_activity"),
        project_id=project.id,
        teacher_id=teacher.id,
        activity_type="publish",
        text=f"发布给 {created or len(seen)} 名学生，学生端已生成科研项目实践入口。",
        created_at=now,
    )
    db.add(activity)
    db.flush()
    return {
        "project": _serialize_project(db, project, include_detail=True),
        "student_project_id": student_project.id,
        "created_enrollments": created,
        "activity": _serialize_activity(activity),
    }


def review_submission(
    db: Session,
    teacher: User,
    project_id: str,
    submission_id: str,
    *,
    status: str,
    comment: str,
) -> dict:
    project = _teacher_project_or_404(db, teacher.id, project_id)
    if not project.student_project_id:
        raise ApiError(404, "TEACHER_RESEARCH_STUDENT_PROJECT_NOT_FOUND", "该科研项目尚未发布给学生。")
    submission = db.get(PracticeProjectSubmission, submission_id)
    if submission is None or submission.project_id != project.student_project_id:
        raise ApiError(404, "TEACHER_RESEARCH_SUBMISSION_NOT_FOUND", "学生阶段提交不存在或不属于该项目。")
    normalized_status = status.strip().upper()
    if normalized_status not in {"APPROVED", "NEEDS_REVISION", "COMPLETED"}:
        raise ApiError(422, "TEACHER_RESEARCH_REVIEW_STATUS_INVALID", "审核状态只能是 APPROVED / NEEDS_REVISION / COMPLETED。")
    submission.status = normalized_status
    submission.review_comment = comment.strip() or (
        "阶段成果已确认，可继续推进。" if normalized_status != "NEEDS_REVISION" else "请按教师意见修订后重新提交。"
    )
    now = utc_now()
    project.status = "REVIEWING" if normalized_status == "NEEDS_REVISION" else project.status
    project.progress = min(100, max(project.progress, project.progress + 5))
    project.updated_at = now
    activity = TeacherResearchActivity(
        id=prefixed_id("teacher_research_activity"),
        project_id=project.id,
        teacher_id=teacher.id,
        activity_type="review",
        text=f"审核学生阶段成果「{submission.title}」：{normalized_status}。",
        created_at=now,
    )
    db.add(activity)
    db.flush()
    return {"submission": _submission_student_payload(db, submission), "project": _serialize_project(db, project, include_detail=True)}


def archive_to_course_resource(db: Session, teacher: User, project_id: str) -> dict:
    project = _teacher_project_or_404(db, teacher.id, project_id)
    if not project.course_id:
        raise ApiError(422, "TEACHER_RESEARCH_COURSE_REQUIRED", "归档到课程资料库前必须绑定课程。")
    _ensure_course_scope(db, teacher.id, project.course_id)
    materials = db.scalars(
        select(TeacherResearchMaterial).where(TeacherResearchMaterial.project_id == project.id).order_by(TeacherResearchMaterial.created_at.desc())
    ).all()
    summary_lines = [
        f"科研项目：{project.title}",
        f"研究方向：{project.direction}",
        f"当前阶段：{project.stage}",
        "Harness 约束：",
        *[f"- {item}" for item in HARNESS_RULES],
        "沉淀材料：",
        *[f"- {item.title}：{item.description or item.file_name or item.external_url}" for item in materials[:12]],
    ]
    source = KnowledgeSource(
        id=prefixed_id("research_resource"),
        course_id=project.course_id,
        title=f"{project.title} · 科研项目沉淀",
        summary=project.description,
        source_type="TEACHER_NOTE",
        version="v1.0",
        authority_level="MEDIUM",
        student_visible=True,
        chapter="科研项目实践",
        knowledge_points=_json(safe_json_list(project.tags_json) or [project.direction]),
        content="\n".join(summary_lines),
        status="ACTIVE",
        ai_retrievable=True,
        share_scope="COURSE",
        created_by=teacher.id,
    )
    db.add(source)
    now = utc_now()
    project.status = "ARCHIVED"
    project.progress = 100
    project.updated_at = now
    db.add(
        TeacherResearchActivity(
            id=prefixed_id("teacher_research_activity"),
            project_id=project.id,
            teacher_id=teacher.id,
            activity_type="archive",
            text=f"归档为课程资料「{source.title}」。",
            created_at=now,
        )
    )
    db.flush()
    return {"resource_id": source.id, "project": _serialize_project(db, project, include_detail=True)}
