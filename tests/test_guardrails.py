"""`ai/guardrails.py` 的护栏行为。

引用校验（§13.3）的四条规则各一例 —— 跨课程来源和 `student_visible=False`
是改造前完全没有校验的两个真实缺口。

用内存库而不是共享的 `codetrack_test.db`：这几条断言与 seed 数据无关，
不该跟着全套测试的执行顺序走。
"""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.ai import guardrails
from backend.app.models import Base, KnowledgeSource, Task


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, future=True)()
    session.add_all(
        [
            KnowledgeSource(
                id="kb_ok",
                course_id="course_ds_001",
                title="链表首节点删除",
                summary="删除首节点后链表起点会变化。",
                source_type="COURSEWARE",
                version="v1.0",
                authority_level="HIGH",
                student_visible=True,
            ),
            KnowledgeSource(
                id="kb_other_course",
                course_id="course_other_002",
                title="别的课程的资料",
                summary="不属于当前课程。",
                source_type="COURSEWARE",
                version="v1.0",
                authority_level="HIGH",
                student_visible=True,
            ),
            KnowledgeSource(
                id="kb_teacher_only",
                course_id="course_ds_001",
                title="教师内部资料",
                summary="含参考答案，不对学生开放。",
                source_type="TEACHER_NOTE",
                version="v1.0",
                authority_level="HIGH",
                student_visible=False,
            ),
            KnowledgeSource(
                id="kb_no_version",
                course_id="course_ds_001",
                title="未标注版本的资料",
                summary="版本字段为空。",
                source_type="COURSEWARE",
                version="   ",
                authority_level="LOW",
                student_visible=True,
            ),
        ]
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def reasons(result: dict) -> set[str]:
    return {item["reason"] for item in result["rejected"]}


def test_reference_check_accepts_visible_same_course_source(db):
    result = guardrails.check_references(db, source_ids=["kb_ok"], course_id="course_ds_001")
    assert result["passed"] is True
    assert result["rejected"] == []


def test_reference_check_rejects_missing_source(db):
    result = guardrails.check_references(db, source_ids=["kb_does_not_exist"], course_id="course_ds_001")
    assert result["passed"] is False
    assert reasons(result) == {"SOURCE_NOT_FOUND"}


def test_reference_check_rejects_cross_course_source(db):
    result = guardrails.check_references(db, source_ids=["kb_other_course"], course_id="course_ds_001")
    assert result["passed"] is False
    assert reasons(result) == {"COURSE_MISMATCH"}


def test_reference_check_rejects_source_hidden_from_students(db):
    result = guardrails.check_references(db, source_ids=["kb_teacher_only"], course_id="course_ds_001")
    assert result["passed"] is False
    assert reasons(result) == {"NOT_STUDENT_VISIBLE"}


def test_reference_check_rejects_blank_version(db):
    result = guardrails.check_references(db, source_ids=["kb_no_version"], course_id="course_ds_001")
    assert result["passed"] is False
    assert reasons(result) == {"INVALID_VERSION"}


def test_reference_check_rejects_ids_outside_allowed_list(db):
    result = guardrails.check_references(
        db,
        source_ids=["kb_ok"],
        allowed_source_ids={"kb_something_else"},
        course_id="course_ds_001",
    )
    assert result["passed"] is False
    assert reasons(result) == {"NOT_IN_ALLOWED_LIST"}


def test_reference_check_rejects_empty_reference(db):
    result = guardrails.check_references(db, source_ids=[], course_id="course_ds_001")
    assert result["passed"] is False
    assert reasons(result) == {"EMPTY_REFERENCE"}


def test_hint_safety_check_flags_leaked_fragment():
    result = guardrails.hint_safety_check("直接写 return head->next 就行", 1)
    assert result["passed"] is False
    assert "return head->next" in result["matched_fragments"]
    assert result["rule_version"] == "hint_leakage_v0.1"


def test_hint_safety_check_flags_overlong_hint():
    result = guardrails.hint_safety_check("提" * 301, 2)
    assert result["passed"] is False
    assert result["matched_fragments"] == ["HINT_TOO_LONG"]
    assert result["level"] == 2


def test_hint_safety_check_accepts_clean_hint():
    result = guardrails.hint_safety_check("请检查删除首节点后返回值是否仍指向旧节点。", 1)
    assert result["passed"] is True
    assert result["matched_fragments"] == []


def test_forbidden_fragments_fall_back_to_default_when_task_has_none():
    task = Task(id="task_x", hint_forbidden_fragments=None)
    assert guardrails.resolve_forbidden_fragments(task) == guardrails.DEFAULT_FORBIDDEN_HINT_FRAGMENTS
    assert guardrails.resolve_forbidden_fragments(None) == guardrails.DEFAULT_FORBIDDEN_HINT_FRAGMENTS


def test_forbidden_fragments_use_task_configuration():
    task = Task(id="task_y", hint_forbidden_fragments=json.dumps(["binary_search(", "mid = "]))
    fragments = guardrails.resolve_forbidden_fragments(task)
    assert fragments == ["binary_search(", "mid = "]
    # 换了题目之后，链表禁词自然不再生效 —— 这正是加这个字段的目的
    assert guardrails.check_answer_leakage("return head->next", fragments)["passed"] is True
    assert guardrails.check_answer_leakage("mid = (l + r) / 2", fragments)["passed"] is False


def test_forbidden_fragments_ignore_unparseable_configuration():
    task = Task(id="task_z", hint_forbidden_fragments="{not json")
    assert guardrails.resolve_forbidden_fragments(task) == guardrails.DEFAULT_FORBIDDEN_HINT_FRAGMENTS


def test_hint_level_permission_is_declared_but_not_enforced_yet(db):
    """这条测试固定的是「已知漏洞」，不是期望行为。

    `check_hint_level_permission` 现在恒返回 passed=True，`enforced=False`
    标出它没有真正判断 `TaskAssignment.allow_hint_level_3`。等 `Submission`
    有了 `assignment_id`，这条测试要改成断言真实的拒绝行为。
    """
    result = guardrails.check_hint_level_permission(db, None, 3)
    assert result["passed"] is True
    assert result["enforced"] is False
