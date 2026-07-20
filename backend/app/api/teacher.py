from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, ensure_course_member
from backend.app.models import CapabilityEvidence, Course, Submission, User
from backend.app.services.submissions import iso

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher"])


@router.get("/courses/{course_id}/submissions")
def teacher_submissions(
    course_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
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
