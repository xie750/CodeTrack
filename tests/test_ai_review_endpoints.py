"""教师 AI 审核接口。对应开发方案 §十一 AI 审核、§14.4 审核状态、§11.4 AI 边界规范。

这里钉住的核心不变量是「教师审核不覆盖原始 AI 输出」：审核前后 `diagnoses` 行
必须逐字节相同，教师结论只体现为 `diagnosis_reviews` 里新增的一行。
"""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import (
    Diagnosis,
    DiagnosisReview,
    ExecutionRun,
    Submission,
    SubmissionVersion,
)

# 别名：pytest 会尝试收集名字以 Test 开头的类，ORM 实体带 __init__ 收集不了会告警
from backend.app.models import TestCase as ToolTestCase
from backend.app.models import TestResult as ToolTestResult

TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
OTHER_TEACHER = {"X-Demo-User-Id": "user_teacher_002"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}

# 用 boundary_review 这个任务而不是 task_linked_list_delete_001：后者被
# test_demo_flow 真实提交过，同一个 codetrack_test.db 上会撞 (student_id, task_id)
# 唯一约束。
TASK_ID = "task_linked_list_boundary_review_001"
STUDENT_ID = "user_student_001"
SUBMISSION_ID = "sub_ai_review_fixture"
VERSION_ID = "ver_ai_review_fixture"
EXECUTION_ID = "exec_ai_review_fixture"
DIAGNOSIS_ID = "diag_ai_review_fixture"
PUBLIC_CASE_ID = "tc_boundary_review_delete_head"
HIDDEN_CASE_ID = "tc_ai_review_fixture_hidden"

SOURCE_CODE = "Node* deleteNode(Node* head, int position) { return head; }"


@pytest.fixture()
def low_confidence_diagnosis():
    """一条低置信度、规则兜底的诊断，就是审核队列的典型入队对象。

    种子数据不含任何提交（学生要真跑一次沙箱才有），所以这里直接建最小链路：
    TestCase -> Submission -> SubmissionVersion -> ExecutionRun -> TestResult -> Diagnosis。
    隐藏用例自己建一条，用来验证教师侧能看到隐藏用例的完整实际输出。
    """
    with TestClient(app):  # 触发 lifespan，保证种子数据和表结构就绪
        pass
    db = SessionLocal()
    try:
        _cleanup(db)
        now = datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc)
        db.merge(
            ToolTestCase(
                id=HIDDEN_CASE_ID,
                task_id=TASK_ID,
                name="隐藏边界用例",
                visibility="HIDDEN",
                input_data='{"values": [1, 2, 3], "position": 0}',
                expected_output="[2, 3]",
                expected_output_summary="删除头节点后应返回新的链表起点",
                hidden_failure_summary="头节点删除结果不正确",
                error_tag="LINKED_LIST_HEAD_UPDATE_ERROR",
                capability_id="cap_linked_list_boundary",
                required=True,
                sort_order=9,
            )
        )
        db.add(
            Submission(
                id=SUBMISSION_ID,
                student_id=STUDENT_ID,
                task_id=TASK_ID,
                status="REVIEW_REQUIRED",
                latest_version_no=1,
                first_submitted_at=now,
                last_submitted_at=now,
            )
        )
        db.add(
            SubmissionVersion(
                id=VERSION_ID,
                submission_id=SUBMISSION_ID,
                version_no=1,
                language="CPP",
                source_code=SOURCE_CODE,
                code_hash="hash_ai_review_fixture",
                highest_hint_level=1,
                created_at=now,
            )
        )
        db.add(
            ExecutionRun(
                id=EXECUTION_ID,
                submission_version_id=VERSION_ID,
                status="SUCCEEDED",
                compile_exit_code=0,
                started_at=now,
                finished_at=now,
            )
        )
        db.add(
            ToolTestResult(
                id="tr_ai_review_fixture_public",
                execution_run_id=EXECUTION_ID,
                test_case_id=PUBLIC_CASE_ID,
                status="PASSED",
                actual_output="[1, 3]",
                expected_output_summary="[1,3]",
                duration_ms=8,
                error_tag="NORMAL_DELETE",
                sort_order=0,
            )
        )
        db.add(
            ToolTestResult(
                id="tr_ai_review_fixture_hidden",
                execution_run_id=EXECUTION_ID,
                test_case_id=HIDDEN_CASE_ID,
                status="FAILED",
                actual_output="[1, 2, 3]",
                expected_output_summary="删除头节点后应返回新的链表起点",
                duration_ms=12,
                error_message="返回值仍指向旧头节点",
                error_tag="LINKED_LIST_HEAD_UPDATE_ERROR",
                sort_order=1,
            )
        )
        db.add(
            Diagnosis(
                id=DIAGNOSIS_ID,
                submission_version_id=VERSION_ID,
                status="LOW_CONFIDENCE",
                diagnosis_type="UNKNOWN_OR_LOW_CONFIDENCE",
                confidence=0.35,
                explanation="当前失败证据不足以形成高置信错因，需要教师复核。",
                verified_evidence_ids='["tr_ai_review_fixture_hidden"]',
                knowledge_source_ids='["kb_boundary_test_reasoning"]',
                needs_teacher_review=True,
                model_provider="RULE_FALLBACK",
                model_name="template-diagnosis-v0.1",
                prompt_version="fallback_prompt_v0.1",
                created_at=now,
            )
        )
        db.commit()
    finally:
        db.close()

    yield DIAGNOSIS_ID

    db = SessionLocal()
    try:
        _cleanup(db)
        db.commit()
    finally:
        db.close()


def _cleanup(db) -> None:
    db.query(DiagnosisReview).filter(DiagnosisReview.diagnosis_id == DIAGNOSIS_ID).delete()
    db.query(Diagnosis).filter(Diagnosis.id == DIAGNOSIS_ID).delete()
    db.query(ToolTestResult).filter(ToolTestResult.execution_run_id == EXECUTION_ID).delete()
    db.query(ExecutionRun).filter(ExecutionRun.id == EXECUTION_ID).delete()
    db.query(SubmissionVersion).filter(SubmissionVersion.id == VERSION_ID).delete()
    db.query(Submission).filter(Submission.id == SUBMISSION_ID).delete()
    db.query(ToolTestCase).filter(ToolTestCase.id == HIDDEN_CASE_ID).delete()


def test_low_confidence_diagnosis_enters_queue_as_pending(low_confidence_diagnosis):
    with TestClient(app) as c:
        response = c.get("/api/v1/teacher/ai-reviews", headers=TEACHER)
        assert response.status_code == 200
        data = response.json()["data"]

        row = next(item for item in data["items"] if item["diagnosis_id"] == DIAGNOSIS_ID)
        assert row["review_status"] == "PENDING"
        assert row["student_name"]
        assert row["task_title"]
        assert row["confidence"] == 0.35
        assert row["failed_test_count"] == 1
        # 入队原因要能说清是谁把它送进来的
        assert "LOW_CONFIDENCE" in row["queue_reasons"]
        assert "RULE_FALLBACK" in row["queue_reasons"]

        assert data["stats"]["pending"] >= 1
        assert data["stats"]["low_confidence"] >= 1
        assert data["stats"]["total"] >= 1


def test_queue_filters_narrow_the_list(low_confidence_diagnosis):
    with TestClient(app) as c:
        by_status = c.get("/api/v1/teacher/ai-reviews?review_status=ACCEPTED", headers=TEACHER)
        assert DIAGNOSIS_ID not in [item["diagnosis_id"] for item in by_status.json()["data"]["items"]]

        by_confidence = c.get("/api/v1/teacher/ai-reviews?confidence_max=0.2", headers=TEACHER)
        assert DIAGNOSIS_ID not in [
            item["diagnosis_id"] for item in by_confidence.json()["data"]["items"]
        ]

        by_student = c.get("/api/v1/teacher/ai-reviews?student=user_student_001", headers=TEACHER)
        assert DIAGNOSIS_ID in [item["diagnosis_id"] for item in by_student.json()["data"]["items"]]

        by_missing_student = c.get("/api/v1/teacher/ai-reviews?student=zzz", headers=TEACHER)
        assert by_missing_student.json()["data"]["items"] == []
        # 顶部统计卡片统计整个队列，不跟着筛选器缩小
        assert by_missing_student.json()["data"]["stats"]["total"] >= 1


def test_detail_exposes_hidden_tests_and_model_metadata(low_confidence_diagnosis):
    with TestClient(app) as c:
        response = c.get(f"/api/v1/teacher/ai-reviews/{DIAGNOSIS_ID}", headers=TEACHER)
        assert response.status_code == 200
        data = response.json()["data"]

        assert data["source_code"] == SOURCE_CODE
        assert data["prompt_version"] == "fallback_prompt_v0.1"
        assert data["model_provider"] == "RULE_FALLBACK"
        assert data["reviews"] == []
        assert data["passed_test_count"] == 1
        # 教师侧可见隐藏用例的完整实际输出（§9.2）
        failed = next(item for item in data["tests"] if item["status"] == "FAILED")
        assert failed["visibility"] == "HIDDEN"
        assert failed["actual_output"] == "[1, 2, 3]"
        assert failed["error_message"] == "返回值仍指向旧头节点"
        assert [source["source_id"] for source in data["knowledge_sources"]] == [
            "kb_boundary_test_reasoning"
        ]


def test_accept_does_not_touch_original_diagnosis(low_confidence_diagnosis):
    with TestClient(app) as c:
        before = _diagnosis_snapshot()
        response = c.post(
            f"/api/v1/teacher/ai-reviews/{DIAGNOSIS_ID}/accept",
            headers=TEACHER,
            json={"note": "结论方向正确"},
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["review_status"] == "ACCEPTED"
        assert len(data["reviews"]) == 1
        assert data["reviews"][0]["note"] == "结论方向正确"

        # §11.4 原始 AI 输出不能覆盖，包括 needs_teacher_review 也保持原值
        assert _diagnosis_snapshot() == before


def test_modify_requires_revision_and_keeps_original_explanation(low_confidence_diagnosis):
    with TestClient(app) as c:
        rejected = c.post(
            f"/api/v1/teacher/ai-reviews/{DIAGNOSIS_ID}/modify",
            headers=TEACHER,
            json={"revised_explanation": "   ", "note": "空修订"},
        )
        assert rejected.status_code == 422
        assert rejected.json()["error"]["code"] == "REVIEW_REVISION_REQUIRED"

        response = c.post(
            f"/api/v1/teacher/ai-reviews/{DIAGNOSIS_ID}/modify",
            headers=TEACHER,
            json={"revised_explanation": "删除头节点后必须返回新的头指针。", "note": "补充定位"},
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["review_status"] == "MODIFIED"
        assert data["reviews"][0]["revised_explanation"] == "删除头节点后必须返回新的头指针。"
        # 原始解释仍然读得到，没有被修订正文顶掉
        assert data["explanation"] == "当前失败证据不足以形成高置信错因，需要教师复核。"


def test_review_history_is_append_only(low_confidence_diagnosis):
    with TestClient(app) as c:
        c.post(f"/api/v1/teacher/ai-reviews/{DIAGNOSIS_ID}/reject", headers=TEACHER, json={"note": "先驳回"})
        c.post(f"/api/v1/teacher/ai-reviews/{DIAGNOSIS_ID}/accept", headers=TEACHER, json={"note": "复核后接受"})

        data = c.get(f"/api/v1/teacher/ai-reviews/{DIAGNOSIS_ID}", headers=TEACHER).json()["data"]
        # 当前状态取最新一条，历史那条驳回仍然在
        assert data["review_status"] == "ACCEPTED"
        assert [item["action"] for item in data["reviews"]] == ["ACCEPTED", "REJECTED"]

        # 接受动作不写修订正文，避免前端草稿被存成生效内容
        assert data["reviews"][0]["revised_explanation"] == ""


def test_review_endpoints_enforce_role_and_teaching_scope(low_confidence_diagnosis):
    with TestClient(app) as c:
        assert c.get("/api/v1/teacher/ai-reviews", headers=STUDENT).status_code == 403
        assert c.get("/api/v1/teacher/ai-reviews").status_code == 401
        assert c.get("/api/v1/teacher/ai-reviews/nope", headers=TEACHER).status_code == 404

        # 另一位教师带的是别的课程，既不该在列表里看到，也不该能直接读详情或审核
        other_list = c.get("/api/v1/teacher/ai-reviews", headers=OTHER_TEACHER).json()["data"]
        assert DIAGNOSIS_ID not in [item["diagnosis_id"] for item in other_list["items"]]
        assert (
            c.get(f"/api/v1/teacher/ai-reviews/{DIAGNOSIS_ID}", headers=OTHER_TEACHER).status_code == 404
        )
        assert (
            c.post(
                f"/api/v1/teacher/ai-reviews/{DIAGNOSIS_ID}/accept",
                headers=OTHER_TEACHER,
                json={},
            ).status_code
            == 404
        )

        assert (
            c.get(
                "/api/v1/teacher/ai-reviews?teaching_assignment_id=ta_se1_network_001",
                headers=TEACHER,
            ).status_code
            == 404
        )


def _diagnosis_snapshot() -> tuple:
    db = SessionLocal()
    try:
        row = db.get(Diagnosis, DIAGNOSIS_ID)
        return (
            row.status,
            row.diagnosis_type,
            row.confidence,
            row.explanation,
            row.needs_teacher_review,
            row.knowledge_source_ids,
            row.verified_evidence_ids,
            row.model_provider,
            row.model_name,
            row.prompt_version,
        )
    finally:
        db.close()
