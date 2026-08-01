"""教师数据可见范围与共用读模型。

开发方案 §15.1：教师接口优先使用 `teaching_assignment_id`，不能只用 `course_id`
判断数据范围。这几个函数原来私有在 `api/teacher.py` 里，AI 审核队列和学情诊断
要用同一套范围口径和同一套进度推导，就提到这里，避免几个模块各写一份。
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.models import (
    StudentClassMembership,
    StudentTaskProgress,
    Submission,
    TaskAssignment,
    TeachingAssignment,
)

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


def derive_progress_status(
    progress: StudentTaskProgress | None, submission: Submission | None
) -> str:
    """取进度表与提交状态中更靠后的一个，两者都缺则视为未开始。"""
    candidates = ["NOT_STARTED"]
    if progress is not None:
        candidates.append(progress.status)
    if submission is not None:
        candidates.append(SUBMISSION_STATUS_TO_PROGRESS.get(submission.status, "SUBMITTED"))
    return max(candidates, key=lambda item: PROGRESS_STATUS_RANK.get(item, 0))


def teacher_assignments(
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


def class_student_ids(db: Session, class_ids: list[str]) -> set[str]:
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


def published_task_ids(db: Session, teaching_assignment_ids: list[str]) -> set[str]:
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


@dataclass(frozen=True)
class DiagnosisScope:
    """一次学情查询允许触达的范围。

    所有字段都是从教师的 `TeachingAssignment` 推导出来的，不是请求参数直接透传 ——
    这样 `class_id` / `student_id` 只要越界就在 `resolve_diagnosis_scope` 里被挡掉，
    下游聚合代码不需要再各自判一次权限。
    """

    assignments: list[TeachingAssignment]
    course_id: str
    class_ids: list[str]
    student_ids: set[str]
    task_assignments: list[TaskAssignment]

    @property
    def assignment_ids(self) -> list[str]:
        return [item.id for item in self.assignments]

    @property
    def task_ids(self) -> set[str]:
        return {item.task_id for item in self.task_assignments}


def resolve_diagnosis_scope(
    db: Session,
    teacher_id: str,
    course_id: str,
    class_id: str | None = None,
    student_id: str | None = None,
) -> DiagnosisScope:
    """把请求参数收窄到当前教师真实负责的教学安排。

    开发方案 §15.1「教师不能查看其他教师班级学生数据」在这里落地：
    - 教师在该课程没有生效教学安排 → 403
    - `class_id` 不属于这些教学安排 → 403
    - `student_id` 不在这些班级的在册名单里 → 403
    """
    assignments = teacher_assignments(db, teacher_id, course_id)
    if not assignments:
        raise ApiError(403, "AUTH_FORBIDDEN", "当前教师在该课程没有生效的教学安排")

    if class_id:
        assignments = [item for item in assignments if item.class_id == class_id]
        if not assignments:
            raise ApiError(403, "AUTH_FORBIDDEN", "无权访问该班级的学情数据")

    class_ids = sorted({item.class_id for item in assignments})
    student_ids = class_student_ids(db, class_ids)

    if student_id and student_id not in student_ids:
        raise ApiError(403, "AUTH_FORBIDDEN", "该学生不在当前教师负责的班级名单内")

    assignment_ids = [item.id for item in assignments]
    task_assignments = (
        list(
            db.scalars(
                select(TaskAssignment)
                .where(
                    TaskAssignment.teaching_assignment_id.in_(assignment_ids),
                    TaskAssignment.publish_status == "PUBLISHED",
                )
                .order_by(TaskAssignment.published_at.asc())
            ).all()
        )
        if assignment_ids
        else []
    )

    return DiagnosisScope(
        assignments=assignments,
        course_id=course_id,
        class_ids=class_ids,
        student_ids=student_ids,
        task_assignments=task_assignments,
    )
