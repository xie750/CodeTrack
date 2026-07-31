from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, ensure_course_member, require_role
from backend.app.models import (
    AdministrativeClass,
    CapabilityEvidence,
    Course,
    Enrollment,
    StudentClassMembership,
    StudentTaskProgress,
    Submission,
    Task,
    TaskAssignment,
    TeachingAssignment,
    User,
)
from backend.app.services.submissions import iso

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher"])

# 学生任务进度状态中，代表“至少提交过一次”的集合
SUBMITTED_PROGRESS_STATUSES = {"SUBMITTED", "NEEDS_REVISION", "COMPLETED"}

# 编码类任务不写 StudentTaskProgress（只有题目流程维护它），
# 所以监控状态要能从 Submission.status 回退推导，否则已交的学生会被算成未开始，
# 或停在进度表写死的 IN_PROGRESS 上。
SUBMISSION_STATUS_TO_PROGRESS = {
    "PASSED": "COMPLETED",
    "REVIEW_REQUIRED": "NEEDS_REVISION",
    "FEEDBACK_READY": "SUBMITTED",
    "FAILED": "SUBMITTED",
    "QUEUED": "SUBMITTED",
    "RUNNING": "SUBMITTED",
}

# 进度先后顺序，用于在进度表与提交状态之间取更靠后的那个
PROGRESS_STATUS_RANK = {
    "NOT_STARTED": 0,
    "IN_PROGRESS": 1,
    "SUBMITTED": 2,
    "NEEDS_REVISION": 3,
    "COMPLETED": 4,
}


def _derive_progress_status(
    progress: StudentTaskProgress | None, submission: Submission | None
) -> str:
    """取进度表与提交状态中更靠后的一个，两者都缺则视为未开始。"""
    candidates = ["NOT_STARTED"]
    if progress is not None:
        candidates.append(progress.status)
    if submission is not None:
        candidates.append(SUBMISSION_STATUS_TO_PROGRESS.get(submission.status, "SUBMITTED"))
    return max(candidates, key=lambda item: PROGRESS_STATUS_RANK.get(item, 0))


def _teacher_assignments(
    db: Session, teacher_id: str, course_id: str | None = None
) -> list[TeachingAssignment]:
    """当前教师生效中的教学安排，可按课程过滤。"""
    query = select(TeachingAssignment).where(
        TeachingAssignment.teacher_id == teacher_id,
        TeachingAssignment.status == "ACTIVE",
    )
    if course_id:
        query = query.where(TeachingAssignment.course_id == course_id)
    return list(db.scalars(query.order_by(TeachingAssignment.created_at.asc())).all())


def _class_student_ids(db: Session, class_ids: list[str]) -> set[str]:
    """行政班在册学生，跨班去重。"""
    if not class_ids:
        return set()
    return set(
        db.scalars(
            select(StudentClassMembership.student_id).where(
                StudentClassMembership.class_id.in_(class_ids),
                StudentClassMembership.status == "ACTIVE",
            )
        ).all()
    )


def _published_task_ids(db: Session, teaching_assignment_ids: list[str]) -> set[str]:
    if not teaching_assignment_ids:
        return set()
    return set(
        db.scalars(
            select(TaskAssignment.task_id).where(
                TaskAssignment.teaching_assignment_id.in_(teaching_assignment_ids),
                TaskAssignment.publish_status == "PUBLISHED",
            )
        ).all()
    )


def _course_payload(
    db: Session, course: Course, assignments: list[TeachingAssignment]
) -> dict:
    """课程卡片数据，学生数与任务数按当前教师的教学安排统计。"""
    return {
        "course_id": course.id,
        "title": course.name,
        "description": course.description,
        "teacher_id": course.owner_teacher_id,
        "semester": course.term,
        "status": course.status,
        "student_count": len(_class_student_ids(db, [item.class_id for item in assignments])),
        "task_count": len(_published_task_ids(db, [item.id for item in assignments])),
        "created_at": iso(min((item.created_at for item in assignments), default=None)),
    }


def _group_by_course(assignments: list[TeachingAssignment]) -> dict[str, list[TeachingAssignment]]:
    grouped: dict[str, list[TeachingAssignment]] = {}
    for assignment in assignments:
        grouped.setdefault(assignment.course_id, []).append(assignment)
    return grouped


@router.get("/courses")
def teacher_courses(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """当前教师可访问的课程列表（按课程聚合）。"""
    require_role(user, "TEACHER")
    enrolled_course_ids = set(
        db.scalars(
            select(Enrollment.course_id).where(
                Enrollment.user_id == user.id,
                Enrollment.role == "TEACHER",
            )
        ).all()
    )
    grouped = _group_by_course(_teacher_assignments(db, user.id))

    data = []
    for course_id in sorted(enrolled_course_ids | set(grouped)):
        course = db.get(Course, course_id)
        if course is None:
            continue
        data.append(_course_payload(db, course, grouped.get(course_id, [])))
    return ok(data, meta={"total": len(data)})


@router.get("/teaching-assignments")
def teacher_teaching_assignments(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """当前教师的教学安排，一个班级一门课一行。"""
    require_role(user, "TEACHER")
    data = []
    for assignment in _teacher_assignments(db, user.id):
        course = db.get(Course, assignment.course_id)
        if course is None:
            continue
        administrative_class = db.get(AdministrativeClass, assignment.class_id)
        data.append(
            {
                "teaching_assignment_id": assignment.id,
                "class_id": assignment.class_id,
                "class_name": administrative_class.name if administrative_class else "",
                "course_id": assignment.course_id,
                "title": course.name,
                "description": course.description,
                "teacher_id": assignment.teacher_id,
                "semester": assignment.term,
                "status": course.status,
                "student_count": len(_class_student_ids(db, [assignment.class_id])),
                "task_count": len(_published_task_ids(db, [assignment.id])),
                "created_at": iso(assignment.created_at),
            }
        )
    return ok(data, meta={"total": len(data)})


@router.get("/courses/{course_id}")
def teacher_course_detail(
    course_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    course = db.get(Course, course_id)
    if course is None:
        raise ApiError(404, "COURSE_NOT_FOUND", "课程不存在")
    ensure_course_member(db, course_id, user.id, role="TEACHER")
    return ok(_course_payload(db, course, _teacher_assignments(db, user.id, course_id)))


@router.get("/courses/{course_id}/submissions")
def teacher_submissions(
    course_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    course = db.get(Course, course_id)
    if course is None:
        raise ApiError(404, "COURSE_NOT_FOUND", "课程不存在")
    ensure_course_member(db, course_id, user.id, role="TEACHER")

    submissions = (
        db.query(Submission)
        .join(Submission.task)
        .filter(Submission.task.has(course_id=course_id))
        .order_by(Submission.last_submitted_at.desc())
        .all()
    )
    data = []
    for submission in submissions:
        latest = submission.versions[-1] if submission.versions else None
        failed_tags = []
        if latest and latest.execution:
            failed_tags = [
                result.error_tag
                for result in latest.execution.test_results
                if result.status == "FAILED"
            ]
        diagnosis_type = latest.diagnosis.diagnosis_type if latest and latest.diagnosis else None
        data.append(
            {
                "submission_id": submission.id,
                "task_id": submission.task_id,
                "task_title": submission.task.title,
                "student_id": submission.student_id,
                "student_name": submission.student.display_name,
                "status": submission.status,
                "version_count": len(submission.versions),
                "latest_version_id": latest.id if latest else None,
                "highest_hint_level": max((version.highest_hint_level for version in submission.versions), default=0),
                "latest_diagnosis_type": diagnosis_type or (failed_tags[0] if failed_tags else None),
                "passed_at": iso(submission.passed_at),
            }
        )
    return ok(data, meta={"page": 1, "page_size": 50, "total": len(data)})


@router.get("/submissions/{submission_id}/timeline")
def teacher_timeline(
    submission_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise ApiError(404, "SUBMISSION_NOT_FOUND", "提交不存在")
    ensure_course_member(db, submission.task.course_id, user.id, role="TEACHER")

    events = []
    for version in submission.versions:
        events.append(
            {
                "event_id": f"evt_version_{version.id}",
                "type": "VERSION_SUBMITTED",
                "version_id": version.id,
                "occurred_at": iso(version.created_at),
                "summary": f"学生提交第 {version.version_no} 版代码",
            }
        )
        if version.execution:
            passed = len([result for result in version.execution.test_results if result.status == "PASSED"])
            total = len(version.execution.test_results)
            failed_head = any(
                result.status == "FAILED" and result.error_tag == "LINKED_LIST_HEAD_UPDATE_ERROR"
                for result in version.execution.test_results
            )
            suffix = "，删除头节点失败" if failed_head else ""
            events.append(
                {
                    "event_id": f"evt_execution_{version.execution.id}",
                    "type": "EXECUTION_FINISHED",
                    "version_id": version.id,
                    "execution_id": version.execution.id,
                    "occurred_at": iso(version.execution.finished_at),
                    "summary": f"执行结束，状态 {version.execution.status}",
                }
            )
            events.append(
                {
                    "event_id": f"evt_test_{version.execution.id}",
                    "type": "TEST_RESULT",
                    "version_id": version.id,
                    "execution_id": version.execution.id,
                    "occurred_at": iso(version.execution.finished_at),
                    "summary": f"通过 {passed}/{total} 个必要测试{suffix}",
                }
            )
        if version.diagnosis:
            events.append(
                {
                    "event_id": f"evt_diagnosis_{version.diagnosis.id}",
                    "type": "DIAGNOSIS_READY",
                    "version_id": version.id,
                    "occurred_at": iso(version.diagnosis.created_at),
                    "summary": f"诊断类型 {version.diagnosis.diagnosis_type}，置信度 {version.diagnosis.confidence:.2f}",
                }
            )
            for hint in version.diagnosis.hints:
                events.append(
                    {
                        "event_id": f"evt_hint_{hint.id}",
                        "type": "HINT_VIEWED",
                        "version_id": version.id,
                        "occurred_at": iso(hint.viewed_at),
                        "summary": f"查看第 {hint.level} 级提示",
                    }
                )
    version_ids = [version.id for version in submission.versions]
    evidences = db.scalars(
        select(CapabilityEvidence).where(
            CapabilityEvidence.student_id == submission.student_id,
            CapabilityEvidence.submission_version_id.in_(version_ids),
        )
    ).all()
    for evidence in evidences:
        events.append(
            {
                "event_id": f"evt_evidence_{evidence.id}",
                "type": "CAPABILITY_EVIDENCE_CREATED",
                "version_id": evidence.submission_version_id,
                "occurred_at": iso(evidence.created_at),
                "summary": evidence.explanation,
            }
        )
    events.sort(key=lambda item: item["occurred_at"] or "")
    return ok(
        {
            "submission_id": submission.id,
            "student_id": submission.student_id,
            "student_name": submission.student.display_name,
            "task_id": submission.task_id,
            "task_title": submission.task.title,
            "events": events,
        }
    )


@router.get("/tasks/{task_id}/monitor")
def teacher_task_monitor(
    task_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """单个任务的班级完成情况，逐个在册学生给出一行。"""
    require_role(user, "TEACHER")
    task = db.get(Task, task_id)
    if task is None:
        raise ApiError(404, "TASK_NOT_FOUND", "任务不存在")
    ensure_course_member(db, task.course_id, user.id, role="TEACHER")
    course = db.get(Course, task.course_id)

    assignments = _teacher_assignments(db, user.id, task.course_id)
    assignments_by_id = {item.id: item for item in assignments}
    task_assignments = (
        list(
            db.scalars(
                select(TaskAssignment).where(
                    TaskAssignment.task_id == task_id,
                    TaskAssignment.teaching_assignment_id.in_(list(assignments_by_id)),
                    TaskAssignment.publish_status == "PUBLISHED",
                )
            ).all()
        )
        if assignments_by_id
        else []
    )

    class_ids = [
        assignments_by_id[item.teaching_assignment_id].class_id
        for item in task_assignments
        if item.teaching_assignment_id in assignments_by_id
    ]
    student_ids = _class_student_ids(db, class_ids)
    assignment_ids = [item.id for item in task_assignments]

    progress_by_student = {
        row.student_id: row
        for row in (
            db.scalars(
                select(StudentTaskProgress).where(
                    StudentTaskProgress.assignment_id.in_(assignment_ids)
                )
            ).all()
            if assignment_ids
            else []
        )
    }
    submission_by_student = {
        row.student_id: row
        for row in (
            db.scalars(
                select(Submission).where(
                    Submission.task_id == task_id,
                    Submission.student_id.in_(list(student_ids)),
                )
            ).all()
            if student_ids
            else []
        )
    }

    submissions = []
    for student_id in sorted(student_ids):
        student = db.get(User, student_id)
        progress = progress_by_student.get(student_id)
        submission = submission_by_student.get(student_id)
        latest = submission.versions[-1] if submission and submission.versions else None
        diagnosis_type = latest.diagnosis.diagnosis_type if latest and latest.diagnosis else None
        submissions.append(
            {
                "submission_id": submission.id if submission else None,
                "student_id": student_id,
                "student_name": student.display_name if student else "",
                "status": _derive_progress_status(progress, submission),
                "submission_status": submission.status if submission else None,
                "version_count": len(submission.versions) if submission else 0,
                "highest_hint_level": progress.highest_hint_level if progress else 0,
                "latest_diagnosis_type": diagnosis_type,
                "passed_at": iso(submission.passed_at) if submission else None,
                "last_submitted_at": iso(progress.last_submitted_at) if progress else None,
            }
        )

    statuses = [row["status"] for row in submissions]
    return ok(
        {
            "task_id": task.id,
            "task_title": task.title,
            "course_id": task.course_id,
            "course_name": course.name if course else "",
            "total_students": len(submissions),
            "submitted_count": len([item for item in statuses if item in SUBMITTED_PROGRESS_STATUSES]),
            "in_progress_count": len([item for item in statuses if item == "IN_PROGRESS"]),
            "not_started_count": len([item for item in statuses if item == "NOT_STARTED"]),
            "passed_count": len([row for row in submissions if row["passed_at"]]),
            "submissions": submissions,
        }
    )


@router.get("/dashboard")
def teacher_dashboard(
    teaching_assignment_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """教学首页聚合：课程、统计卡片和最近提交。"""
    require_role(user, "TEACHER")
    assignments = _teacher_assignments(db, user.id)
    if teaching_assignment_id:
        assignments = [item for item in assignments if item.id == teaching_assignment_id]
        if not assignments:
            raise ApiError(404, "TEACHING_ASSIGNMENT_NOT_FOUND", "教学安排不存在或不属于当前教师")

    grouped = _group_by_course(assignments)
    courses = []
    for course_id in sorted(grouped):
        course = db.get(Course, course_id)
        if course is not None:
            courses.append(_course_payload(db, course, grouped[course_id]))

    student_ids = _class_student_ids(db, [item.class_id for item in assignments])
    task_ids = _published_task_ids(db, [item.id for item in assignments])

    rows = (
        list(
            db.scalars(
                select(Submission)
                .where(
                    Submission.task_id.in_(list(task_ids)),
                    Submission.student_id.in_(list(student_ids)),
                )
                .order_by(Submission.last_submitted_at.desc())
            ).all()
        )
        if task_ids and student_ids
        else []
    )

    recent_submissions = []
    for submission in rows[:10]:
        latest = submission.versions[-1] if submission.versions else None
        diagnosis_type = latest.diagnosis.diagnosis_type if latest and latest.diagnosis else None
        recent_submissions.append(
            {
                "submission_id": submission.id,
                "task_id": submission.task_id,
                "task_title": submission.task.title,
                "course_id": submission.task.course_id,
                "course_name": submission.task.course.name if submission.task.course else "",
                "student_id": submission.student_id,
                "student_name": submission.student.display_name,
                "status": submission.status,
                "version_count": len(submission.versions),
                "highest_hint_level": max(
                    (version.highest_hint_level for version in submission.versions), default=0
                ),
                "latest_diagnosis_type": diagnosis_type,
                "passed_at": iso(submission.passed_at),
                "last_submitted_at": iso(submission.last_submitted_at),
            }
        )

    return ok(
        {
            "teacher": {"id": user.id, "name": user.display_name},
            "stats": {
                "course_count": len(courses),
                "student_count": len(student_ids),
                "task_count": len(task_ids),
                "pending_review_count": len([row for row in rows if row.status == "REVIEW_REQUIRED"]),
                "graded_count": len([row for row in rows if row.status == "PASSED"]),
            },
            "courses": courses,
            "recent_submissions": recent_submissions,
        }
    )
