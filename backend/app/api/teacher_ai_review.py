"""教师端 AI 审核接口。对应开发方案 §十一 AI 审核。

单独一个模块而不是塞进 `api/teacher.py`：审核是唯一会写数据的教师接口，边界规范
（§11.4）也最密集，放在一起便于核对。路由前缀仍在 `/api/v1/teacher` 下。

刻意没有实现的：`POST /ai-reviews/{id}/regenerate`（重新生成）。重跑模型要复用
学生侧的诊断生成链路并处理「同一版本只能有一条诊断」的唯一索引，属于独立一步，
前端对应按钮显示为未接入，而不是给一个假成功。
"""

from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok, request_id
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import Diagnosis, DiagnosisReview, Submission, SubmissionVersion, User
from backend.app.services import ai_review
from backend.app.services.audit import record_audit
from backend.app.services.teacher_scope import (
    class_student_ids,
    published_task_ids,
    teacher_assignments,
)

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-ai-review"])

MAX_PAGE_SIZE = 100


class ReviewPayload(BaseModel):
    """接受 / 修改后接受 / 驳回共用的请求体。"""

    # 仅 MODIFIED 需要：教师修订后的最终解释
    revised_explanation: str = Field(default="", max_length=4000)
    note: str = Field(default="", max_length=1000)


def _teacher_scope(
    db: Session, teacher_id: str, teaching_assignment_id: str | None
) -> tuple[set[str], set[str]]:
    """(可见任务集合, 可见学生集合)。两者同时为空表示这位教师没有可审核的数据。"""
    assignments = teacher_assignments(db, teacher_id)
    if teaching_assignment_id:
        assignments = [item for item in assignments if item.id == teaching_assignment_id]
        if not assignments:
            raise ApiError(
                404, "TEACHING_ASSIGNMENT_NOT_FOUND", "教学安排不存在或不属于当前教师"
            )
    task_ids = published_task_ids(db, [item.id for item in assignments])
    student_ids = class_student_ids(db, [item.class_id for item in assignments])
    return task_ids, student_ids


def _authorized_diagnosis(
    db: Session, diagnosis_id: str, user: User
) -> tuple[Diagnosis, SubmissionVersion, Submission]:
    """取诊断并校验它落在当前教师的教学范围内。

    找不到和无权访问都返回 404 而不是 403：否则教师能靠状态码探测其他班级存在哪些
    诊断 ID。
    """
    diagnosis = db.get(Diagnosis, diagnosis_id)
    if diagnosis is None:
        raise ApiError(404, "DIAGNOSIS_NOT_FOUND", "诊断不存在")
    version = db.get(SubmissionVersion, diagnosis.submission_version_id)
    submission = db.get(Submission, version.submission_id) if version else None
    if version is None or submission is None:
        raise ApiError(404, "SUBMISSION_NOT_FOUND", "诊断对应的提交不存在")

    task_ids, student_ids = _teacher_scope(db, user.id, None)
    if submission.task_id not in task_ids or submission.student_id not in student_ids:
        raise ApiError(404, "DIAGNOSIS_NOT_FOUND", "诊断不存在或不在当前教师的教学范围内")
    return diagnosis, version, submission


@router.get("/ai-reviews")
def list_ai_reviews(
    review_status: str | None = Query(default=None, description="PENDING/ACCEPTED/MODIFIED/REJECTED"),
    confidence_max: float | None = Query(default=None, ge=0, le=1),
    diagnosis_type: str | None = Query(default=None),
    student: str | None = Query(default=None, description="按学生姓名或学号模糊匹配"),
    teaching_assignment_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """审核队列（§11.2 A）。

    筛选和分页在应用层做：审核状态是「最新一条 review 的 action」这个派生值，
    顶部统计卡片又要覆盖整个队列而不是当前页，都需要先把队列取全。队列规模受
    「教师带的班级 × 已发布任务」限制，不是全表扫描。
    """
    require_role(user, "TEACHER")
    task_ids, student_ids = _teacher_scope(db, user.id, teaching_assignment_id)
    rows = ai_review.load_queue(db, task_ids, student_ids)
    reviews = ai_review.latest_reviews(db, [diagnosis.id for diagnosis, _, _ in rows])
    stats = ai_review.queue_stats(rows, reviews)

    items = [
        ai_review.serialize_row(db, diagnosis, version, submission, reviews.get(diagnosis.id))
        for diagnosis, version, submission in rows
    ]
    if review_status:
        items = [item for item in items if item["review_status"] == review_status]
    if confidence_max is not None:
        items = [item for item in items if item["confidence"] <= confidence_max]
    if diagnosis_type:
        items = [item for item in items if item["diagnosis_type"] == diagnosis_type]
    if student:
        keyword = student.strip().lower()
        items = [
            item
            for item in items
            if keyword in item["student_name"].lower() or keyword in item["student_id"].lower()
        ]

    total = len(items)
    start = (page - 1) * page_size
    return ok(
        {
            "stats": stats,
            "diagnosis_types": sorted({item["diagnosis_type"] for item in items}),
            "items": items[start : start + page_size],
        },
        meta={"page": page, "page_size": page_size, "total": total},
    )


@router.get("/ai-reviews/{diagnosis_id}")
def get_ai_review(
    diagnosis_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """审核详情（§11.2 B）。教师可见隐藏用例完整输入输出和模型信息。"""
    require_role(user, "TEACHER")
    diagnosis, version, submission = _authorized_diagnosis(db, diagnosis_id, user)
    return ok(ai_review.serialize_detail(db, diagnosis, version, submission))


def _record_review(
    db: Session,
    user: User,
    diagnosis_id: str,
    action: str,
    payload: ReviewPayload,
) -> dict:
    diagnosis, version, submission = _authorized_diagnosis(db, diagnosis_id, user)
    revised = payload.revised_explanation.strip()
    if action == "MODIFIED" and not revised:
        raise ApiError(
            422, "REVIEW_REVISION_REQUIRED", "修改后接受必须填写教师修订后的解释"
        )
    if action != "MODIFIED":
        # 接受和驳回不产生修订正文，避免前端残留的草稿被存成生效内容
        revised = ""

    rid = request_id()
    review = DiagnosisReview(
        id=f"dgrev_{uuid4().hex[:12]}",
        diagnosis_id=diagnosis.id,
        reviewer_id=user.id,
        action=action,
        revised_explanation=revised,
        note=payload.note.strip(),
    )
    db.add(review)
    # 注意：这里不动 diagnosis 的任何字段。§11.4「原始 AI 输出不能覆盖，
    # 教师审核单独保存」，包括 needs_teacher_review 也保持模型当时写下的值。
    record_audit(
        db,
        event_type="AI_DIAGNOSIS_REVIEWED",
        request_id=rid,
        user_id=user.id,
        submission_id=submission.id,
        version_id=version.id,
        status=action,
        details={
            "diagnosis_id": diagnosis.id,
            "diagnosis_type": diagnosis.diagnosis_type,
            "review_action": action,
            "review_id": review.id,
        },
    )
    db.commit()
    db.refresh(diagnosis)
    return ok(ai_review.serialize_detail(db, diagnosis, version, submission), rid=rid)


@router.post("/ai-reviews/{diagnosis_id}/accept")
def accept_ai_review(
    diagnosis_id: str,
    payload: ReviewPayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """接受原始诊断。学生端据此显示「教师已确认」。"""
    require_role(user, "TEACHER")
    return _record_review(db, user, diagnosis_id, "ACCEPTED", payload)


@router.post("/ai-reviews/{diagnosis_id}/modify")
def modify_ai_review(
    diagnosis_id: str,
    payload: ReviewPayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """修改后接受。学生端显示「教师已修改」，展示教师修订正文而非原始解释。"""
    require_role(user, "TEACHER")
    return _record_review(db, user, diagnosis_id, "MODIFIED", payload)


@router.post("/ai-reviews/{diagnosis_id}/reject")
def reject_ai_review(
    diagnosis_id: str,
    payload: ReviewPayload,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """驳回错误诊断。原始诊断仍在库里，只是不再作为教师确认过的结论。"""
    require_role(user, "TEACHER")
    return _record_review(db, user, diagnosis_id, "REJECTED", payload)
