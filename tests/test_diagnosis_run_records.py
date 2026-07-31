"""`request_gateway_diagnosis` 的运行记录行为 —— 本步存在的理由。

改造前模型失败是裸 `except Exception: return None`：学生侧降级到规则兜底，
数据里没有任何痕迹。这里钉住的就是「学生侧行为不变，但降级这件事可查」。

计划里的端到端验证（真实模型 + uvicorn）需要 Docker 沙箱和真实 API Key，
这个文件是在没有二者的环境下能跑的等价断言。
"""

import httpx
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from types import SimpleNamespace

from backend.app.ai import llm_client
from backend.app.models import (
    AgentRun,
    AgentStep,
    AuditLog,
    Base,
    Course,
    ExecutionRun,
    KnowledgeSource,
    Submission,
    SubmissionVersion,
    Task,
    TestResult as ToolTestResult,
    User,
)
from backend.app.services import model_gateway


TASK_ID = "task_demo"
COURSE_ID = "course_ds_001"
STUDENT_ID = "user_student_run_record"


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, future=True)()
    session.add_all(
        [
            User(id=STUDENT_ID, display_name="记录学生", role="STUDENT"),
            User(id="user_teacher_001", display_name="老师", role="TEACHER"),
            Course(
                id=COURSE_ID,
                name="数据结构",
                description="",
                status="ACTIVE",
                owner_teacher_id="user_teacher_001",
            ),
            Task(
                id=TASK_ID,
                course_id=COURSE_ID,
                title="删除链表节点",
                description="",
                language="CPP",
                interface_spec="ListNode* deleteAt(ListNode* head, int position)",
                learning_objectives="链表边界处理",
                capability_ids="[]",
                status="OPEN",
            ),
            KnowledgeSource(
                id="kb_head_node_delete",
                course_id=COURSE_ID,
                title="首节点删除",
                summary="删除首节点后起点会变化。",
                source_type="COURSEWARE",
                version="v1.0",
                authority_level="HIGH",
                student_visible=True,
            ),
            KnowledgeSource(
                id="kb_other_course",
                course_id="course_other_002",
                title="别的课程资料",
                summary="不属于本课程。",
                source_type="COURSEWARE",
                version="v1.0",
                authority_level="HIGH",
                student_visible=True,
            ),
            Submission(id="sub_1", student_id=STUDENT_ID, task_id=TASK_ID, status="RUNNING", latest_version_no=1),
            SubmissionVersion(
                id="ver_1",
                submission_id="sub_1",
                version_no=1,
                language="CPP",
                source_code="int main(){}",
                code_hash="hash",
            ),
            ExecutionRun(id="exe_1", submission_version_id="ver_1", status="SUCCEEDED"),
            ToolTestResult(
                id="tr_001",
                execution_run_id="exe_1",
                test_case_id="tc_001",
                status="FAILED",
                actual_output="1 2 3",
                expected_output_summary="2 3",
                duration_ms=4,
                error_tag="LINKED_LIST_HEAD_UPDATE_ERROR",
            ),
        ]
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def flushed(db):
    """run_recorder 只 db.add 不 commit（沿用 audit.py 约定），
    session 是 autoflush=False，所以断言前要显式 flush。"""
    db.flush()
    return db


def call(db):
    version = db.get(SubmissionVersion, "ver_1")
    failed = [db.get(ToolTestResult, "tr_001")]
    sources = [db.get(KnowledgeSource, "kb_head_node_delete")]
    return model_gateway.request_gateway_diagnosis(db, version, failed, sources)


def use_gateway_settings(monkeypatch):
    monkeypatch.setattr(
        model_gateway,
        "get_settings",
        lambda: SimpleNamespace(
            model_gateway_url="http://model.test/diagnose",
            model_name="test-model",
            model_api_key=None,
        ),
    )


def gateway_data(**overrides) -> dict:
    data = {
        "diagnosis_type": "LINKED_LIST_HEAD_UPDATE_ERROR",
        "confidence": 0.88,
        "explanation": "删除首节点后返回值仍指向旧节点。",
        "verified_evidence_ids": ["tr_001"],
        "knowledge_source_ids": ["kb_head_node_delete"],
        "hint": "请检查删除首节点后链表起点是否变化。",
        "needs_teacher_review": False,
        "model_provider": "TEST_GATEWAY",
        "model_name": "test-model",
    }
    data.update(overrides)
    return data


def test_unconfigured_model_writes_no_run_record(monkeypatch, db):
    monkeypatch.setattr(
        model_gateway,
        "get_settings",
        lambda: SimpleNamespace(model_gateway_url=None, model_api_key=None, model_name=None),
    )
    assert call(db) is None
    # 没配模型不是失败，是「本环境不用模型」，不该污染 agent_runs
    assert flushed(db).scalars(select(AgentRun)).all() == []


def test_successful_run_is_recorded_with_attempts_and_step(monkeypatch, db):
    use_gateway_settings(monkeypatch)

    async def fake_post(url, *, json, headers=None, timeout=None):
        return {"data": gateway_data()}

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    result = call(db)
    assert result is not None
    assert result.diagnosis_type == "LINKED_LIST_HEAD_UPDATE_ERROR"

    run = flushed(db).scalars(select(AgentRun)).one()
    assert run.workflow_type == "code_diagnosis"
    assert run.status == "SUCCEEDED"
    assert run.student_id == STUDENT_ID
    assert run.course_id == COURSE_ID
    assert run.attempts == 1
    assert run.prompt_version == "diagnosis_v0.1"
    assert run.model_provider == "TEST_GATEWAY"
    assert run.started_at is not None and run.finished_at is not None
    assert run.error_code is None

    step = flushed(db).scalars(select(AgentStep)).one()
    assert step.run_id == run.id
    assert step.step_name == "model_diagnosis"


def test_timeout_falls_back_but_leaves_failed_run_with_error_code(monkeypatch, db):
    use_gateway_settings(monkeypatch)

    async def fake_post(url, **kwargs):
        raise httpx.TimeoutException("too slow")

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    # 学生侧行为不变：返回 None，调用方降级到规则兜底
    assert call(db) is None

    run = flushed(db).scalars(select(AgentRun)).one()
    assert run.status == "FAILED"
    assert run.error_code == "LLM_TIMEOUT"
    assert run.attempts == 2  # 默认 retries=1，超时是瞬时故障
    assert run.finished_at is not None

    audit = flushed(db).scalars(select(AuditLog).where(AuditLog.event_type == "AI_RUN_FAILED")).one()
    assert audit.error_code == "LLM_TIMEOUT"
    # SAFE_DETAIL_KEYS 是允许列表，这三个 key 必须在里面，否则写了等于没写
    assert run.id in audit.details
    assert "llm_error_code" in audit.details
    assert "attempts" in audit.details


def test_schema_violation_is_recorded_as_schema_invalid(monkeypatch, db):
    use_gateway_settings(monkeypatch)

    async def fake_post(url, **kwargs):
        return {"data": gateway_data(confidence=1.7)}

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    assert call(db) is None
    run = flushed(db).scalars(select(AgentRun)).one()
    assert run.error_code == "LLM_SCHEMA_INVALID"
    assert run.attempts == 1  # schema 不合规不重试


def test_leaked_hint_is_rejected_and_recorded(monkeypatch, db):
    use_gateway_settings(monkeypatch)

    async def fake_post(url, **kwargs):
        return {"data": gateway_data(hint="直接 return head->next 就好")}

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    assert call(db) is None
    assert flushed(db).scalars(select(AgentRun)).one().error_code == "LLM_SCHEMA_INVALID"


def test_cross_course_source_is_rejected_by_reference_guardrail(monkeypatch, db):
    """§13.3：来源在白名单里也不够，还得属于当前课程。

    改造前 `validate_gateway_output` 只查白名单，这条会通过。
    """
    use_gateway_settings(monkeypatch)

    async def fake_post(url, **kwargs):
        return {"data": gateway_data(knowledge_source_ids=["kb_other_course"])}

    monkeypatch.setattr(llm_client, "_post_json", fake_post)

    version = db.get(SubmissionVersion, "ver_1")
    failed = [db.get(ToolTestResult, "tr_001")]
    # 故意把跨课程来源放进白名单，证明拦截来自引用校验而不是白名单
    sources = [db.get(KnowledgeSource, "kb_other_course")]
    assert model_gateway.request_gateway_diagnosis(db, version, failed, sources) is None
    assert flushed(db).scalars(select(AgentRun)).one().error_code == "LLM_SCHEMA_INVALID"
