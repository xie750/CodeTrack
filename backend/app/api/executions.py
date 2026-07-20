from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, ensure_course_member
from backend.app.models import ExecutionRun, Submission, SubmissionVersion, User
from backend.app.services.submissions import iso

router = APIRouter(prefix="/api/v1/executions", tags=["executions"])


@router.get("/{execution_id}")
def get_execution(
    execution_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    execution = db.get(ExecutionRun, execution_id)
    if execution is None:
        raise ApiError(404, "EXECUTION_NOT_FOUND", "执行记录不存在")
    version = db.get(SubmissionVersion, execution.submission_version_id)
    submission = db.get(Submission, version.submission_id) if version else None
    if submission is None:
        raise ApiError(404, "SUBMISSION_NOT_FOUND", "提交不存在")
    ensure_course_member(db, submission.task.course_id, user.id)

    total = len(execution.test_results)
    passed = len([result for result in execution.test_results if result.status == "PASSED"])
    terminal = execution.status in {
        "SUCCEEDED",
        "COMPILE_ERROR",
        "RUNTIME_ERROR",
        "TIMEOUT",
        "RESOURCE_LIMIT",
        "SECURITY_REJECTED",
        "INFRASTRUCTURE_ERROR",
    }
    return ok(
        {
            "execution_id": execution.id,
            "version_id": execution.submission_version_id,
            "status": execution.status,
            "compile_status": "SUCCEEDED" if execution.compile_exit_code == 0 else "FAILED",
            "test_progress": {"completed": total, "total": 5 if total == 0 else total},
            "passed_count": passed if terminal else None,
            "failed_count": (total - passed) if terminal else None,
            "started_at": iso(execution.started_at),
            "finished_at": iso(execution.finished_at),
            "result_url": f"/api/v1/submission-versions/{execution.submission_version_id}/results"
            if terminal
            else None,
        }
    )

