"""AI 审核队列与教师审核结论。

对应开发方案 §十一 AI 审核、§14.4 审核状态、§11.4 AI 边界规范。

三条硬规则在这里落地：

1. 原始 AI 输出不可覆盖。审核动作只往 `diagnosis_reviews` 追加行，`diagnoses`
   一列都不改，所以「AI 说了什么」和「教师认不认」永远是两份可分别读出的数据。
2. 低置信度结果必须进入审核队列（`QUEUE_CONFIDENCE_THRESHOLD`），不依赖模型自己
   把 `needs_teacher_review` 置真。
3. 审核不碰成绩、不碰画像。这个模块只读诊断、写审核记录。
"""

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import (
    Course,
    Diagnosis,
    DiagnosisReview,
    KnowledgeSource,
    Submission,
    SubmissionVersion,
    Task,
    User,
)
from backend.app.services.submissions import iso

# §11.4「低置信度结果必须进入审核队列」。和 create_gateway_diagnosis 里判
# LOW_CONFIDENCE 的阈值保持一致，改一处要同时改那边。
QUEUE_CONFIDENCE_THRESHOLD = 0.6

# 进入审核队列的诊断状态
QUEUE_DIAGNOSIS_STATUSES = {"LOW_CONFIDENCE", "REVIEW_REQUIRED"}

# §14.4 审核状态。PENDING 是「没有审核记录」这个事实的名字，不落库。
REVIEW_PENDING = "PENDING"
REVIEW_ACTIONS = ("ACCEPTED", "MODIFIED", "REJECTED")


def in_review_queue(diagnosis: Diagnosis) -> bool:
    return (
        diagnosis.needs_teacher_review
        or diagnosis.status in QUEUE_DIAGNOSIS_STATUSES
        or diagnosis.confidence < QUEUE_CONFIDENCE_THRESHOLD
    )


def queue_reasons(diagnosis: Diagnosis) -> list[str]:
    """这条诊断为什么在队列里。教师需要知道是谁把它送进来的。"""
    reasons = []
    if diagnosis.confidence < QUEUE_CONFIDENCE_THRESHOLD:
        reasons.append("LOW_CONFIDENCE")
    if diagnosis.status in QUEUE_DIAGNOSIS_STATUSES:
        reasons.append(f"DIAGNOSIS_STATUS_{diagnosis.status}")
    if diagnosis.needs_teacher_review:
        reasons.append("MODEL_REQUESTED_REVIEW")
    if not json.loads(diagnosis.knowledge_source_ids):
        reasons.append("NO_KNOWLEDGE_CITATION")
    if diagnosis.model_provider == "RULE_FALLBACK":
        reasons.append("RULE_FALLBACK")
    return reasons


def latest_reviews(db: Session, diagnosis_ids: list[str]) -> dict[str, DiagnosisReview]:
    """每条诊断的最新一条审核记录。历史记录保留，当前状态只看最新那条。"""
    if not diagnosis_ids:
        return {}
    rows = db.scalars(
        select(DiagnosisReview)
        .where(DiagnosisReview.diagnosis_id.in_(diagnosis_ids))
        .order_by(DiagnosisReview.created_at.asc(), DiagnosisReview.id.asc())
    ).all()
    # 按时间升序覆盖，最后留下的就是最新一条
    return {row.diagnosis_id: row for row in rows}


def review_status(review: DiagnosisReview | None) -> str:
    return review.action if review is not None else REVIEW_PENDING


def load_queue(
    db: Session,
    task_ids: set[str],
    student_ids: set[str],
) -> list[tuple[Diagnosis, SubmissionVersion, Submission]]:
    """教师范围内所有需要审核的诊断，按诊断生成时间倒序。

    范围由 `task_ids`（教师已发布的任务）和 `student_ids`（教师带的行政班在册学生）
    共同限定，缺一不可 —— 只用课程判断会把别的教师的班级学生也捞进来（§15.1）。
    """
    if not task_ids or not student_ids:
        return []
    rows = db.execute(
        select(Diagnosis, SubmissionVersion, Submission)
        .join(SubmissionVersion, Diagnosis.submission_version_id == SubmissionVersion.id)
        .join(Submission, SubmissionVersion.submission_id == Submission.id)
        .where(
            Submission.task_id.in_(list(task_ids)),
            Submission.student_id.in_(list(student_ids)),
        )
        .order_by(Diagnosis.created_at.desc(), Diagnosis.id.desc())
    ).all()
    return [(row[0], row[1], row[2]) for row in rows if in_review_queue(row[0])]


def _failed_results(version: SubmissionVersion) -> list:
    if version.execution is None:
        return []
    return [result for result in version.execution.test_results if result.status == "FAILED"]


def serialize_row(
    db: Session,
    diagnosis: Diagnosis,
    version: SubmissionVersion,
    submission: Submission,
    review: DiagnosisReview | None,
) -> dict:
    """审核列表一行。不含代码和测试明细，那些留给详情页。"""
    task = db.get(Task, submission.task_id)
    course = db.get(Course, task.course_id) if task else None
    student = db.get(User, submission.student_id)
    return {
        "diagnosis_id": diagnosis.id,
        "review_status": review_status(review),
        "reviewed_at": iso(review.created_at) if review else None,
        "submission_id": submission.id,
        "version_id": version.id,
        "version_no": version.version_no,
        "student_id": submission.student_id,
        "student_name": student.display_name if student else "",
        "task_id": submission.task_id,
        "task_title": task.title if task else "",
        "course_id": task.course_id if task else "",
        "course_name": course.name if course else "",
        "diagnosis_type": diagnosis.diagnosis_type,
        "diagnosis_status": diagnosis.status,
        "confidence": diagnosis.confidence,
        "explanation": diagnosis.explanation,
        "queue_reasons": queue_reasons(diagnosis),
        "citation_count": len(json.loads(diagnosis.knowledge_source_ids)),
        "failed_test_count": len(_failed_results(version)),
        "highest_hint_level": version.highest_hint_level,
        "model_provider": diagnosis.model_provider,
        "model_name": diagnosis.model_name,
        "created_at": iso(diagnosis.created_at),
    }


def serialize_review(review: DiagnosisReview, reviewer: User | None) -> dict:
    return {
        "review_id": review.id,
        "action": review.action,
        "revised_explanation": review.revised_explanation,
        "note": review.note,
        "reviewer_id": review.reviewer_id,
        "reviewer_name": reviewer.display_name if reviewer else "",
        "created_at": iso(review.created_at),
    }


def serialize_detail(
    db: Session,
    diagnosis: Diagnosis,
    version: SubmissionVersion,
    submission: Submission,
) -> dict:
    """审核详情。教师可见隐藏用例完整输入输出（§9.2），学生端接口不会走这里。"""
    row_reviews = db.scalars(
        select(DiagnosisReview)
        .where(DiagnosisReview.diagnosis_id == diagnosis.id)
        .order_by(DiagnosisReview.created_at.desc(), DiagnosisReview.id.desc())
    ).all()
    latest = row_reviews[0] if row_reviews else None
    base = serialize_row(db, diagnosis, version, submission, latest)

    execution = version.execution
    tests = [
        {
            "test_case_id": result.test_case_id,
            "name": result.test_case.name if result.test_case else result.test_case_id,
            "visibility": result.test_case.visibility if result.test_case else "HIDDEN",
            "status": result.status,
            "expected_output_summary": result.expected_output_summary,
            "actual_output": result.actual_output,
            "duration_ms": result.duration_ms,
            "error_message": result.error_message,
            "error_tag": result.error_tag,
        }
        for result in (execution.test_results if execution else [])
    ]

    knowledge_sources = []
    for source_id in json.loads(diagnosis.knowledge_source_ids):
        source = db.get(KnowledgeSource, source_id)
        if source is not None:
            knowledge_sources.append(
                {
                    "source_id": source.id,
                    "title": source.title,
                    "summary": source.summary,
                    "source_type": source.source_type,
                    "version": source.version,
                    "authority_level": source.authority_level,
                }
            )

    return {
        **base,
        "language": version.language,
        "source_code": version.source_code,
        "submitted_at": iso(version.created_at),
        "submission_status": submission.status,
        "execution": {
            "execution_id": execution.id,
            "status": execution.status,
            "compile_exit_code": execution.compile_exit_code,
            "compiler_stdout": execution.compiler_stdout,
            "compiler_stderr": execution.compiler_stderr,
            "finished_at": iso(execution.finished_at),
        }
        if execution
        else None,
        "tests": tests,
        "passed_test_count": len([item for item in tests if item["status"] == "PASSED"]),
        "prompt_version": diagnosis.prompt_version,
        "verified_evidence_ids": json.loads(diagnosis.verified_evidence_ids),
        "knowledge_sources": knowledge_sources,
        "hints": [
            {"level": hint.level, "content": hint.content, "viewed_at": iso(hint.viewed_at)}
            for hint in diagnosis.hints
        ],
        "reviews": [
            serialize_review(item, db.get(User, item.reviewer_id)) for item in row_reviews
        ],
    }


def queue_stats(rows: list[tuple[Diagnosis, SubmissionVersion, Submission]], reviews: dict) -> dict:
    """审核列表顶部卡片。统计的是整个队列，不受筛选器影响。"""
    statuses = [review_status(reviews.get(diagnosis.id)) for diagnosis, _, _ in rows]
    return {
        "total": len(rows),
        "pending": statuses.count(REVIEW_PENDING),
        "accepted": statuses.count("ACCEPTED"),
        "modified": statuses.count("MODIFIED"),
        "rejected": statuses.count("REJECTED"),
        "low_confidence": len(
            [1 for diagnosis, _, _ in rows if diagnosis.confidence < QUEUE_CONFIDENCE_THRESHOLD]
        ),
    }
