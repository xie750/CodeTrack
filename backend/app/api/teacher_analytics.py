"""教师端学情诊断聚合接口（开发方案 §十）。

三个子页对应三组接口：
- 班级学情总览 → `/analytics/class`
- 个体诊断     → `/analytics/student`
- 预警中心     → `/alerts`

外加三个下拉选项接口，让前端不必写死班级、任务和学生编号（§15.2）。

原则（§10.1）：所有指标由后端确定性计算，AI 不参与，也不在这里生成任何解释性
文本。教师看到的每个数字都能下钻到具体任务或学生。
"""

import json
from datetime import timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import (
    AdministrativeClass,
    Capability,
    CapabilityEvidence,
    Diagnosis,
    HintRecord,
    LearnerEvent,
    LearnerProfileSnapshot,
    Question,
    QuestionOption,
    StudentClassMembership,
    StudentTaskProgress,
    Submission,
    SubmissionVersion,
    Task,
    TaskAssignment,
    TeacherFeedback,
    TeachingAssignment,
    User,
)
from backend.app.services.learner_profile import loads_list, serialize_learner_profile
from backend.app.services.learner_stats import (
    class_error_distribution,
    class_knowledge_matrix,
)
from backend.app.services.learning_alerts import as_utc, compute_class_alerts
from backend.app.services.submissions import iso
from backend.app.models.entities import utc_now
from backend.app.services.teacher_scope import (
    DiagnosisScope,
    derive_progress_status,
    resolve_diagnosis_scope,
)

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-analytics"])


def _scope(
    db: Session,
    teacher_id: str,
    course_id: str,
    class_id: str | None = None,
    student_id: str | None = None,
) -> DiagnosisScope:
    return resolve_diagnosis_scope(db, teacher_id, course_id, class_id, student_id)


def _round(value: float, digits: int = 1) -> float:
    return round(value, digits)


def _mean(values: list[float]) -> float:
    return _round(sum(values) / len(values)) if values else 0.0


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _json_dump(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def _json_load(raw: str | None, fallback):
    if not raw:
        return fallback
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return fallback
    return value


class LearningInterventionRequest(BaseModel):
    course_id: str
    class_id: str
    action: str = Field(pattern="^(class_practice|class_reminder|student_feedback|risk_reminder|discussion)$")
    title: str = Field(min_length=1, max_length=160)
    content: str = Field(min_length=1, max_length=3000)
    knowledge_point: str | None = Field(default=None, max_length=120)
    student_id: str | None = None


# ---------------------------------------------------------------- 选项接口


@router.get("/diagnosis/options/classes")
def diagnosis_class_options(
    course_id: str = Query(..., description="课程 ID"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """当前教师在该课程负责的教学班。"""
    require_role(user, "TEACHER")
    scope = _scope(db, user.id, course_id)

    rows = db.scalars(
        select(AdministrativeClass).where(AdministrativeClass.id.in_(scope.class_ids))
    ).all()
    by_id = {row.id: row for row in rows}

    data = []
    for assignment in scope.assignments:
        administrative_class = by_id.get(assignment.class_id)
        if administrative_class is None:
            continue
        members = db.scalars(
            select(StudentClassMembership.student_id).where(
                StudentClassMembership.class_id == assignment.class_id,
                StudentClassMembership.status == "ACTIVE",
            )
        ).all()
        data.append(
            {
                "class_id": administrative_class.id,
                "class_name": administrative_class.name,
                "teaching_assignment_id": assignment.id,
                "term": assignment.term,
                "student_count": len(members),
            }
        )
    return ok(data, meta={"total": len(data)})


@router.get("/diagnosis/options/students")
def diagnosis_student_options(
    course_id: str = Query(..., description="课程 ID"),
    class_id: str | None = Query(None, description="不传则返回该课程下全部班级的学生"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    scope = _scope(db, user.id, course_id, class_id)
    if not scope.student_ids:
        return ok([], meta={"total": 0})

    memberships = {
        row.student_id: row.class_id
        for row in db.scalars(
            select(StudentClassMembership).where(
                StudentClassMembership.class_id.in_(scope.class_ids),
                StudentClassMembership.status == "ACTIVE",
            )
        ).all()
    }
    class_names = {
        row.id: row.name
        for row in db.scalars(
            select(AdministrativeClass).where(AdministrativeClass.id.in_(scope.class_ids))
        ).all()
    }
    # 有画像的学生前端要能标出来，避免教师点开空页面才发现没数据
    with_profile = set(
        db.scalars(
            select(LearnerProfileSnapshot.student_id).where(
                LearnerProfileSnapshot.student_id.in_(scope.student_ids),
                LearnerProfileSnapshot.course_id == course_id,
            )
        ).all()
    )

    data = []
    for row in db.scalars(
        select(User).where(User.id.in_(scope.student_ids)).order_by(User.id.asc())
    ).all():
        student_class_id = memberships.get(row.id, "")
        data.append(
            {
                "student_id": row.id,
                "student_name": row.display_name,
                "class_id": student_class_id,
                "class_name": class_names.get(student_class_id, ""),
                "has_profile": row.id in with_profile,
            }
        )
    return ok(data, meta={"total": len(data)})


@router.get("/diagnosis/options/tasks")
def diagnosis_task_options(
    course_id: str = Query(..., description="课程 ID"),
    class_id: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """当前范围内已发布的任务，按发布时间升序。"""
    require_role(user, "TEACHER")
    scope = _scope(db, user.id, course_id, class_id)
    if not scope.task_assignments:
        return ok([], meta={"total": 0})

    titles = {
        row.id: row
        for row in db.scalars(select(Task).where(Task.id.in_(scope.task_ids))).all()
    }
    data = []
    seen = set()
    for item in scope.task_assignments:
        if item.task_id in seen:
            continue
        seen.add(item.task_id)
        task = titles.get(item.task_id)
        if task is None:
            continue
        data.append(
            {
                "task_id": task.id,
                "task_title": task.title,
                "workspace_type": task.workspace_type,
                "assignment_mode": item.assignment_mode,
                "published_at": iso(item.published_at),
                "deadline": iso(item.deadline),
            }
        )
    return ok(data, meta={"total": len(data)})


# ---------------------------------------------------------------- 班级学情


def _class_roster(db: Session, scope: DiagnosisScope) -> tuple[dict, list[LearnerProfileSnapshot]]:
    """名册与画像覆盖情况。

    §11.7 要求「真实零值和无数据明确区分」：没有画像的学生不能算进均值，
    否则一个班只要有人没做过任务，班级掌握度就被拉低成假象。
    """
    profiles = (
        list(
            db.scalars(
                select(LearnerProfileSnapshot).where(
                    LearnerProfileSnapshot.student_id.in_(scope.student_ids),
                    LearnerProfileSnapshot.course_id == scope.course_id,
                )
            ).all()
        )
        if scope.student_ids
        else []
    )
    total = len(scope.student_ids)
    return (
        {
            "total": total,
            "with_profile": len(profiles),
            "without_profile": total - len(profiles),
        },
        profiles,
    )


def _class_ability(profiles: list[LearnerProfileSnapshot]) -> dict:
    dependency = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    for item in profiles:
        if item.hint_dependency_level in dependency:
            dependency[item.hint_dependency_level] += 1
    return {
        "overall_progress": _mean([item.overall_progress for item in profiles]),
        "task_completion": _mean([item.recent_task_completion * 100 for item in profiles]),
        "compile_error_rate": _mean([item.compile_error_rate * 100 for item in profiles]),
        "logic_error_rate": _mean([item.logic_error_rate * 100 for item in profiles]),
        "hint_dependency": dependency,
    }


def _score_trend(db: Session, scope: DiagnosisScope, task_id: str | None) -> list[dict]:
    """每个已发布任务的平均分、提交率和通过率，按发布时间升序。"""
    if not scope.task_assignments or not scope.student_ids:
        return []

    task_assignments = [
        item for item in scope.task_assignments if not task_id or item.task_id == task_id
    ]
    if not task_assignments:
        return []

    titles = {
        row.id: row.title
        for row in db.scalars(
            select(Task).where(Task.id.in_({item.task_id for item in task_assignments}))
        ).all()
    }
    assignment_ids = [item.id for item in task_assignments]
    progress_by_key = {
        (row.assignment_id, row.student_id): row
        for row in db.scalars(
            select(StudentTaskProgress).where(
                StudentTaskProgress.assignment_id.in_(assignment_ids),
                StudentTaskProgress.student_id.in_(scope.student_ids),
            )
        ).all()
    }
    submission_by_key = {
        (row.task_id, row.student_id): row
        for row in db.scalars(
            select(Submission).where(
                Submission.task_id.in_({item.task_id for item in task_assignments}),
                Submission.student_id.in_(scope.student_ids),
            )
        ).all()
    }

    # 同一个任务可能发给多个班，按 task_id 合并统计
    merged: dict[str, dict] = {}
    for item in task_assignments:
        bucket = merged.setdefault(
            item.task_id,
            {
                "task_id": item.task_id,
                "task_title": titles.get(item.task_id, item.task_id),
                "published_at": iso(item.published_at),
                "deadline": iso(item.deadline),
                "scores": [],
                "submitted": 0,
                "passed": 0,
                "covered": 0,
            },
        )
        for student_id in scope.student_ids:
            progress = progress_by_key.get((item.id, student_id))
            submission = submission_by_key.get((item.task_id, student_id))
            status = derive_progress_status(progress, submission)
            bucket["covered"] += 1
            if status in {"SUBMITTED", "NEEDS_REVISION", "COMPLETED"}:
                bucket["submitted"] += 1
            if status == "COMPLETED":
                bucket["passed"] += 1
            if progress is not None and progress.score is not None:
                bucket["scores"].append(progress.score)

    trend = []
    for bucket in merged.values():
        covered = bucket["covered"] or 1
        trend.append(
            {
                "task_id": bucket["task_id"],
                "task_title": bucket["task_title"],
                "published_at": bucket["published_at"],
                "deadline": bucket["deadline"],
                # 没有任何评分记录时给 None 而不是 0，前端据此显示「暂无成绩」
                "avg_score": _mean(bucket["scores"]) if bucket["scores"] else None,
                "scored_count": len(bucket["scores"]),
                "submit_rate": _round(bucket["submitted"] * 100 / covered),
                "pass_rate": _round(bucket["passed"] * 100 / covered),
            }
        )
    trend.sort(key=lambda row: (row["published_at"] or "", row["task_id"]))
    return trend


def _knowledge_matrix(db: Session, scope: DiagnosisScope) -> dict:
    """知识点掌握热力图。实现在 `services/learner_stats`，与教学首页摘要同口径。"""
    return class_knowledge_matrix(db, scope)


def _error_distribution(db: Session, scope: DiagnosisScope) -> list[dict]:
    """班级高频错误。实现在 `services/learner_stats`，与教学首页摘要同口径。"""
    return class_error_distribution(db, scope)


def _hint_distribution(db: Session, scope: DiagnosisScope) -> dict:
    """提示等级分布，按学生用到过的最高等级归档。"""
    counts = {"none": 0, "level_1": 0, "level_2": 0, "level_3": 0}
    if not scope.student_ids:
        return counts

    highest: dict[str, int] = {student_id: 0 for student_id in scope.student_ids}

    submissions = (
        list(
            db.scalars(
                select(Submission).where(
                    Submission.task_id.in_(scope.task_ids),
                    Submission.student_id.in_(scope.student_ids),
                )
            ).all()
        )
        if scope.task_ids
        else []
    )
    if submissions:
        owner = {row.id: row.student_id for row in submissions}
        for version in db.scalars(
            select(SubmissionVersion).where(
                SubmissionVersion.submission_id.in_(list(owner))
            )
        ).all():
            student_id = owner.get(version.submission_id)
            if student_id and version.highest_hint_level > highest.get(student_id, 0):
                highest[student_id] = version.highest_hint_level

    # 客观题流程不产生提交版本，进度表上单独记了最高提示等级
    if scope.task_assignments:
        for row in db.scalars(
            select(StudentTaskProgress).where(
                StudentTaskProgress.assignment_id.in_(
                    [item.id for item in scope.task_assignments]
                ),
                StudentTaskProgress.student_id.in_(scope.student_ids),
            )
        ).all():
            if row.highest_hint_level > highest.get(row.student_id, 0):
                highest[row.student_id] = row.highest_hint_level

    for level in highest.values():
        if level >= 3:
            counts["level_3"] += 1
        elif level == 2:
            counts["level_2"] += 1
        elif level == 1:
            counts["level_1"] += 1
        else:
            counts["none"] += 1
    return counts


@router.get("/analytics/class")
def class_analytics(
    course_id: str = Query(..., description="课程 ID"),
    class_id: str | None = Query(None, description="不传则聚合该课程下当前教师的全部班级"),
    task_id: str | None = Query(None, description="只收窄成绩趋势，不影响名册口径"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """班级学情总览（§10.1）。所有指标由后端计算，AI 不参与。"""
    require_role(user, "TEACHER")
    scope = _scope(db, user.id, course_id, class_id)

    roster, profiles = _class_roster(db, scope)
    class_names = {
        row.id: row.name
        for row in db.scalars(
            select(AdministrativeClass).where(AdministrativeClass.id.in_(scope.class_ids))
        ).all()
    }

    return ok(
        {
            "course_id": course_id,
            "classes": [
                {"class_id": item, "class_name": class_names.get(item, "")}
                for item in scope.class_ids
            ],
            "roster": roster,
            "ability": _class_ability(profiles),
            "score_trend": _score_trend(db, scope, task_id),
            "knowledge": _knowledge_matrix(db, scope),
            "errors": _error_distribution(db, scope),
            "hint_levels": _hint_distribution(db, scope),
        }
    )


# ---------------------------------------------------------------- 个体诊断


def _capability_evidence(db: Session, student_id: str, task_ids: set[str]) -> list[dict]:
    """能力证据。教师可见，学生端不给（§10.2）。"""
    if not task_ids:
        return []
    rows = db.scalars(
        select(CapabilityEvidence)
        .where(
            CapabilityEvidence.student_id == student_id,
            CapabilityEvidence.task_id.in_(task_ids),
        )
        .order_by(CapabilityEvidence.created_at.desc())
    ).all()
    if not rows:
        return []
    capabilities = {
        row.id: row
        for row in db.scalars(
            select(Capability).where(
                Capability.id.in_({item.capability_id for item in rows})
            )
        ).all()
    }
    tasks = {
        row.id: row.title
        for row in db.scalars(
            select(Task).where(Task.id.in_({item.task_id for item in rows}))
        ).all()
    }
    return [
        {
            "evidence_id": item.id,
            "capability_id": item.capability_id,
            "capability_name": (
                capabilities[item.capability_id].name
                if item.capability_id in capabilities
                else item.capability_id
            ),
            "task_id": item.task_id,
            "task_title": tasks.get(item.task_id, item.task_id),
            "evidence_type": item.evidence_type,
            "strength": item.strength,
            "explanation": item.explanation,
            "teacher_confirmed": item.teacher_confirmed,
            "created_at": iso(item.created_at),
        }
        for item in rows
    ]


def _hint_usage(db: Session, student_id: str, task_ids: set[str]) -> list[dict]:
    """提示使用明细。教师能看到学生是否主动索取提示，学生端看不到这层。"""
    if not task_ids:
        return []
    submissions = list(
        db.scalars(
            select(Submission).where(
                Submission.student_id == student_id,
                Submission.task_id.in_(task_ids),
            )
        ).all()
    )
    if not submissions:
        return []

    task_of_submission = {row.id: row.task_id for row in submissions}
    tasks = {
        row.id: row.title
        for row in db.scalars(
            select(Task).where(Task.id.in_({row.task_id for row in submissions}))
        ).all()
    }
    versions = list(
        db.scalars(
            select(SubmissionVersion).where(
                SubmissionVersion.submission_id.in_(list(task_of_submission))
            )
        ).all()
    )
    if not versions:
        return []

    version_by_id = {row.id: row for row in versions}
    diagnoses = list(
        db.scalars(
            select(Diagnosis).where(
                Diagnosis.submission_version_id.in_(list(version_by_id))
            )
        ).all()
    )
    if not diagnoses:
        return []

    diagnosis_by_id = {row.id: row for row in diagnoses}
    hints = db.scalars(
        select(HintRecord)
        .where(HintRecord.diagnosis_id.in_(list(diagnosis_by_id)))
        .order_by(HintRecord.viewed_at.asc())
    ).all()

    data = []
    for hint in hints:
        diagnosis = diagnosis_by_id.get(hint.diagnosis_id)
        version = version_by_id.get(diagnosis.submission_version_id) if diagnosis else None
        task_id = task_of_submission.get(version.submission_id) if version else None
        data.append(
            {
                "hint_id": hint.id,
                "level": hint.level,
                "status": hint.status,
                "student_requested": hint.student_requested,
                "request_reason": hint.request_reason,
                "task_id": task_id,
                "task_title": tasks.get(task_id, "") if task_id else "",
                "version_no": version.version_no if version else None,
                "viewed_at": iso(hint.viewed_at),
            }
        )
    return data


def _behavior_timeline(db: Session, student_id: str, course_id: str) -> list[dict]:
    rows = db.scalars(
        select(LearnerEvent)
        .where(
            LearnerEvent.student_id == student_id,
            LearnerEvent.course_id == course_id,
        )
        .order_by(LearnerEvent.created_at.desc())
    ).all()
    return [
        {
            "event_id": item.id,
            "event_type": item.event_type,
            "task_id": item.task_id,
            "error_type": item.error_type,
            "knowledge_points": loads_list(item.knowledge_points),
            "created_at": iso(item.created_at),
        }
        for item in rows
    ]


def _task_history(db: Session, scope: DiagnosisScope, student_id: str) -> list[dict]:
    if not scope.task_assignments:
        return []
    titles = {
        row.id: row.title
        for row in db.scalars(select(Task).where(Task.id.in_(scope.task_ids))).all()
    }
    progress_by_assignment = {
        row.assignment_id: row
        for row in db.scalars(
            select(StudentTaskProgress).where(
                StudentTaskProgress.assignment_id.in_(
                    [item.id for item in scope.task_assignments]
                ),
                StudentTaskProgress.student_id == student_id,
            )
        ).all()
    }
    submission_by_task = {
        row.task_id: row
        for row in db.scalars(
            select(Submission).where(
                Submission.task_id.in_(scope.task_ids),
                Submission.student_id == student_id,
            )
        ).all()
    }

    data = []
    seen = set()
    for item in scope.task_assignments:
        if item.task_id in seen:
            continue
        seen.add(item.task_id)
        progress = progress_by_assignment.get(item.id)
        submission = submission_by_task.get(item.task_id)
        deadline = as_utc(item.deadline)
        data.append(
            {
                "task_id": item.task_id,
                "task_title": titles.get(item.task_id, item.task_id),
                "status": derive_progress_status(progress, submission),
                "score": progress.score if progress else None,
                "highest_hint_level": progress.highest_hint_level if progress else 0,
                "version_count": submission.latest_version_no if submission else 0,
                "passed_at": iso(submission.passed_at) if submission else None,
                "last_submitted_at": iso(submission.last_submitted_at) if submission else None,
                "published_at": iso(item.published_at),
                "deadline": iso(deadline),
            }
        )
    data.sort(key=lambda row: (row["published_at"] or "", row["task_id"]))
    return data


@router.get("/analytics/student")
def student_analytics(
    course_id: str = Query(..., description="课程 ID"),
    student_id: str = Query(..., description="学生 ID"),
    class_id: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """个体诊断（§10.2）。

    画像六件套与学生端 `/api/v1/student/profile` 走同一个序列化函数，保证口径一致；
    教师额外拿到能力证据、提示明细、行为轨迹和任务历史。
    """
    require_role(user, "TEACHER")
    scope = _scope(db, user.id, course_id, class_id, student_id)

    profile = serialize_learner_profile(db, student_id, course_id)
    student = db.get(User, student_id)

    if profile is None:
        # 学生在名册里但还没有画像：返回 200 + has_profile=false，让前端区分
        # 「无数据」和「真实零值」，而不是弹一个 404 让教师以为权限出错。
        return ok(
            {
                "has_profile": False,
                "student": {
                    "id": student_id,
                    "name": student.display_name if student else "",
                },
                "course_id": course_id,
                "capability_evidence": [],
                "hint_usage": [],
                "behavior_timeline": _behavior_timeline(db, student_id, course_id),
                "task_history": _task_history(db, scope, student_id),
            }
        )

    return ok(
        {
            "has_profile": True,
            **profile,
            "capability_evidence": _capability_evidence(db, student_id, scope.task_ids),
            "hint_usage": _hint_usage(db, student_id, scope.task_ids),
            "behavior_timeline": _behavior_timeline(db, student_id, course_id),
            "task_history": _task_history(db, scope, student_id),
        }
    )


# ---------------------------------------------------------------- 预警中心


@router.get("/alerts")
def class_alerts(
    course_id: str = Query(..., description="课程 ID"),
    class_id: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """预警中心（§10.3）。规则实时计算，只读，不做抄袭认定。"""
    require_role(user, "TEACHER")
    scope = _scope(db, user.id, course_id, class_id)
    return ok(compute_class_alerts(db, scope))


@router.post("/analytics/interventions", status_code=201)
def create_learning_intervention(
    payload: LearningInterventionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """把教师端学情干预落成学生端可见动作。

    班级练习会创建并发布真实任务；提醒、个体反馈、风险跟进和讨论会写入
    `LearnerEvent`，由学生端“教师跟进”区域读取。
    """
    require_role(user, "TEACHER")
    scope = _scope(db, user.id, payload.course_id, payload.class_id, payload.student_id)
    teaching = next((item for item in scope.assignments if item.class_id == payload.class_id), None)
    if teaching is None:
        raise ApiError(403, "AUTH_FORBIDDEN", "无权向该班级发起干预")

    recipients = [payload.student_id] if payload.student_id else sorted(scope.student_ids)
    recipients = [student_id for student_id in recipients if student_id in scope.student_ids]
    if not recipients:
        raise ApiError(422, "INTERVENTION_EMPTY_RECIPIENTS", "当前干预没有可触达的学生")
    if payload.action == "student_feedback" and not payload.student_id:
        raise ApiError(422, "INTERVENTION_STUDENT_REQUIRED", "个体反馈需要指定学生")

    now = utc_now()
    knowledge_points = [payload.knowledge_point or payload.title]
    task_id: str | None = None
    assignment_id: str | None = None
    feedback_id: str | None = None
    discussion_id: str | None = None

    if payload.action == "class_practice":
        capability_id = "cap_linked_list_boundary"
        task = Task(
            id=_new_id("task_intervention"),
            course_id=payload.course_id,
            title=payload.title.strip(),
            description=payload.content.strip(),
            workspace_type="QUESTION_SET",
            language="CPP",
            interface_spec="Concept practice generated from learning intervention.",
            learning_objectives=_json_dump(knowledge_points),
            capability_ids=_json_dump([capability_id]),
            status="OPEN",
        )
        db.add(task)
        db.flush()
        question = Question(
            id=_new_id("question_intervention"),
            task_id=task.id,
            question_type="SINGLE_CHOICE",
            stem=f"{payload.content.strip()}\n\n本次专项练习首先要确认的关键点是什么？",
            analysis=f"本题用于检查学生是否理解 {payload.knowledge_point or payload.title} 的核心薄弱点。",
            knowledge_points=_json_dump(knowledge_points),
            difficulty="BASIC",
            score=100,
            error_type="TEACHER_INTERVENTION_PRACTICE",
            sort_order=1,
        )
        db.add(question)
        db.flush()
        db.add_all(
            [
                QuestionOption(
                    id=_new_id("option"),
                    question_id=question.id,
                    label="A",
                    content=f"先复盘 {payload.knowledge_point or '本知识点'} 的概念、边界和典型错误",
                    is_correct=True,
                    sort_order=1,
                ),
                QuestionOption(
                    id=_new_id("option"),
                    question_id=question.id,
                    label="B",
                    content="只看最终答案，不检查推理过程",
                    is_correct=False,
                    sort_order=2,
                ),
            ]
        )
        assignment = TaskAssignment(
            id=_new_id("assign_intervention"),
            task_id=task.id,
            teaching_assignment_id=teaching.id,
            published_by=user.id,
            publish_status="PUBLISHED",
            assignment_mode="QUIZ",
            allow_hint_level_3=False,
            published_at=now,
            start_at=now,
            deadline=now + timedelta(days=7),
        )
        db.add(assignment)
        db.flush()
        for student_id in recipients:
            db.add(
                StudentTaskProgress(
                    assignment_id=assignment.id,
                    student_id=student_id,
                    status="NOT_STARTED",
                    total_required_count=1,
                    updated_at=now,
                )
            )
        task_id = task.id
        assignment_id = assignment.id

    if payload.action == "student_feedback" and payload.student_id:
        latest_submission = db.scalar(
            select(Submission)
            .where(
                Submission.student_id == payload.student_id,
                Submission.task_id.in_(scope.task_ids),
            )
            .order_by(Submission.last_submitted_at.desc())
        )
        if latest_submission is not None:
            feedback = TeacherFeedback(
                id=_new_id("feedback_intervention"),
                submission_id=latest_submission.id,
                teacher_id=user.id,
                content=payload.content.strip(),
                status="PUBLISHED",
                student_visible=True,
                published_at=now,
                updated_at=now,
            )
            db.add(feedback)
            db.flush()
            feedback_id = feedback.id

    if payload.action == "discussion":
        discussion_id = _new_id("discussion_intervention")

    event_type_by_action = {
        "class_practice": "teacher_intervention_practice",
        "class_reminder": "teacher_intervention_reminder",
        "student_feedback": "teacher_intervention_feedback",
        "risk_reminder": "teacher_intervention_risk",
        "discussion": "teacher_intervention_discussion",
    }
    for student_id in recipients:
        db.add(
            LearnerEvent(
                id=_new_id("evt_intervention"),
                student_id=student_id,
                course_id=payload.course_id,
                class_id=payload.class_id,
                teaching_assignment_id=teaching.id,
                assignment_id=assignment_id,
                task_id=task_id,
                event_type=event_type_by_action[payload.action],
                knowledge_points=_json_dump(knowledge_points),
                error_type=None,
                payload=_json_dump(
                    {
                        "source": "teacher_learning_analytics",
                        "action": payload.action,
                        "title": payload.title.strip(),
                        "content": payload.content.strip(),
                        "teacher_id": user.id,
                        "knowledge_point": payload.knowledge_point,
                        "task_id": task_id,
                        "assignment_id": assignment_id,
                        "feedback_id": feedback_id,
                        "discussion_id": discussion_id,
                    }
                ),
                created_at=now,
            )
        )

    db.commit()
    return ok(
        {
            "action": payload.action,
            "course_id": payload.course_id,
            "class_id": payload.class_id,
            "student_id": payload.student_id,
            "recipients": len(recipients),
            "recipient_ids": recipients,
            "recipient_count": len(recipients),
            "notification_ids": [],
            "task_id": task_id,
            "assignment_id": assignment_id,
            "feedback_id": feedback_id,
            "discussion_id": discussion_id,
            "student_visible": True,
            "created_at": iso(now),
        }
    )
