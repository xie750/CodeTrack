"""教师端学情诊断聚合接口（开发方案 §十）。

三个子页对应三组接口：
- 班级学情总览 → `/analytics/class`
- 个体诊断     → `/analytics/student`
- 预警中心     → `/alerts`

外加三个下拉选项接口，让前端不必写死班级、任务和学生编号（§15.2）。

原则（§10.1）：所有指标由后端确定性计算，AI 不参与，也不在这里生成任何解释性
文本。教师看到的每个数字都能下钻到具体任务或学生。
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import (
    AdministrativeClass,
    Capability,
    CapabilityEvidence,
    Diagnosis,
    HintRecord,
    LearnerErrorStat,
    LearnerEvent,
    LearnerKnowledgeState,
    LearnerProfileSnapshot,
    StudentClassMembership,
    StudentTaskProgress,
    Submission,
    SubmissionVersion,
    Task,
    User,
)
from backend.app.services.learner_profile import loads_list, serialize_learner_profile
from backend.app.services.learning_alerts import as_utc, compute_class_alerts
from backend.app.services.submissions import iso
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
    """知识点掌握热力图：行是学生，列是知识点。"""
    if not scope.student_ids:
        return {"points": [], "rows": [], "point_averages": []}

    states = list(
        db.scalars(
            select(LearnerKnowledgeState).where(
                LearnerKnowledgeState.student_id.in_(scope.student_ids),
                LearnerKnowledgeState.course_id == scope.course_id,
            )
        ).all()
    )
    if not states:
        return {"points": [], "rows": [], "point_averages": []}

    points = sorted({item.knowledge_point for item in states})
    names = {
        row.id: row.display_name
        for row in db.scalars(select(User).where(User.id.in_(scope.student_ids))).all()
    }
    by_student: dict[str, dict[str, LearnerKnowledgeState]] = {}
    for item in states:
        by_student.setdefault(item.student_id, {})[item.knowledge_point] = item

    rows = []
    for student_id in sorted(by_student):
        cells = []
        for point in points:
            state = by_student[student_id].get(point)
            cells.append(
                {
                    "knowledge_point": point,
                    # None 表示该学生这个知识点没有证据，热力图要画成空格而不是 0 分
                    "mastery_score": state.mastery_score if state else None,
                    "state": state.state if state else None,
                    "evidence_count": state.evidence_count if state else 0,
                }
            )
        rows.append(
            {
                "student_id": student_id,
                "student_name": names.get(student_id, ""),
                "cells": cells,
            }
        )

    averages = []
    for index, point in enumerate(points):
        scores = [
            row["cells"][index]["mastery_score"]
            for row in rows
            if row["cells"][index]["mastery_score"] is not None
        ]
        averages.append(
            {
                "knowledge_point": point,
                "avg_mastery": _mean(scores) if scores else None,
                "covered_students": len(scores),
            }
        )

    return {"points": points, "rows": rows, "point_averages": averages}


def _error_distribution(db: Session, scope: DiagnosisScope) -> list[dict]:
    """班级高频错误，按影响人数排序。"""
    if not scope.student_ids:
        return []
    rows = db.scalars(
        select(LearnerErrorStat).where(
            LearnerErrorStat.student_id.in_(scope.student_ids),
            LearnerErrorStat.course_id == scope.course_id,
        )
    ).all()

    merged: dict[str, dict] = {}
    for item in rows:
        bucket = merged.setdefault(
            item.error_type,
            {
                "error_type": item.error_type,
                "label": item.label,
                "student_count": 0,
                "total_count": 0,
                "severity": item.severity,
                "related_knowledge_points": [],
            },
        )
        bucket["student_count"] += 1
        bucket["total_count"] += item.count
        if item.severity == "HIGH":
            bucket["severity"] = "HIGH"
        for point in loads_list(item.related_knowledge_points):
            if point not in bucket["related_knowledge_points"]:
                bucket["related_knowledge_points"].append(point)

    data = list(merged.values())
    data.sort(key=lambda row: (-row["student_count"], -row["total_count"], row["error_type"]))
    return data


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
