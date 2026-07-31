"""内置版 §13.1 的七道护栏，按文档给的顺序组织：

    权限校验 → 上下文范围校验 → Schema 校验 → 引用校验
        → 答案泄露校验 → 内容长度校验 → 动作白名单校验

本步实现第 3、4、5、6 道。第 1 道建好函数与调用点但实现为 pass（原因见模块内
`check_hint_level_permission` 的 TODO）；第 2、7 道现在没有可校验的对象，
留函数位置与说明。

每道检查返回结构化结果而不是只抛异常，形状沿用改造前 `diagnosis.leakage_check`
的 `{passed, matched_fragments, rule_version}`，好对上内置版 §4.1 响应体里的
`safety: {answer_leakage_passed, student_scope_passed}`。
"""

import json
from collections.abc import Callable, Iterable
from typing import Any

from sqlalchemy.orm import Session

from backend.app.models import KnowledgeSource, Task


RULE_VERSION = "guardrail_v0.1"
LEAKAGE_RULE_VERSION = "hint_leakage_v0.1"

# 默认禁词。注意这批片段全是链表删除题的代码，对任何第二道题目都无效
# —— 所以 `tasks.hint_forbidden_fragments` 才是正路，这里只是存量题目的兜底。
DEFAULT_FORBIDDEN_HINT_FRAGMENTS = [
    "ListNode* deleteAt",
    "return head->next",
    "head = head->next",
    "prev->next = prev->next->next",
]

MAX_HINT_LENGTH = 300


def _result(check: str, passed: bool, **extra: Any) -> dict[str, Any]:
    return {"check": check, "passed": passed, "rule_version": RULE_VERSION, **extra}


# --- 1. 权限校验 ---------------------------------------------------------


def check_hint_level_permission(db: Session, diagnosis, level: int) -> dict[str, Any]:
    """三级提示是否被教师允许（内置版 §6.5 / §13.1 第一道）。

    **本步不做实际判断，漏洞依然存在。** 教师在 `TaskAssignment.allow_hint_level_3`
    关掉三级提示的任务，学生现在照样能拿到三级提示。

    TODO(依赖 `Submission.assignment_id`)：`allow_hint_level_3` 挂在
    `TaskAssignment` 上，而 `Submission` 只有 `student_id` + `task_id`。
    同一个 task 可以发给多个班、各自设置不同，从 `Diagnosis` 反查 assignment
    需要 student → class membership → TeachingAssignment → TaskAssignment 多跳，
    且学生同时在两个班上同一门课时结果有歧义。正确修法是给 `Submission` 加
    `assignment_id` 并回填历史数据，那是独立的数据模型决策，不塞进底座抽取里。
    """
    return _result("hint_level_permission", True, level=level, enforced=False)


# --- 2. 上下文范围校验 ---------------------------------------------------


def check_student_scope(*, student_id: str | None, context_student_id: str | None) -> dict[str, Any]:
    """确认送进 Prompt 的上下文都属于当前学生。

    现在诊断的上下文全部由 `build_gateway_payload` 从当前 version 现取，
    没有跨学生检索，无对象可校验。等 ContextBuilder（内置版 §11）出现后，
    这里改成逐条比对来源归属。
    """
    if student_id and context_student_id and student_id != context_student_id:
        return _result("student_scope", False, student_id=student_id)
    return _result("student_scope", True, student_id=student_id)


# --- 3. Schema 校验 ------------------------------------------------------


def check_schema(raw: dict[str, Any], validator: Callable[[dict[str, Any]], Any]) -> dict[str, Any]:
    """跑一遍输出 schema 校验，把 `ValueError` 转成结构化结果。

    模型调用路径上 schema 校验由 `llm_client` 直接抛 `LLMSchemaInvalid`
    （便于落 `agent_runs.error_code`）；这个函数给需要「不中断、只记录」
    的调用方用。
    """
    try:
        data = validator(raw)
    except ValueError as exc:
        return _result("schema", False, error=str(exc))
    return _result("schema", True, data=data)


# --- 4. 引用校验 ---------------------------------------------------------


def check_references(
    db: Session,
    *,
    source_ids: Iterable[str],
    allowed_source_ids: Iterable[str] | None = None,
    course_id: str | None = None,
    require_student_visible: bool = True,
) -> dict[str, Any]:
    """内置版 §13.3：来源必须存在、属于当前课程、允许学生访问、版本有效。

    改造前 `validate_gateway_output` 只查 `source_id` 在白名单内，
    `KnowledgeSource` 的 `course_id` / `student_visible` / `version`
    三个字段一个都没校验过。
    """
    ids = list(source_ids)
    allowed = set(allowed_source_ids) if allowed_source_ids is not None else None
    rejected: list[dict[str, str]] = []

    if not ids:
        return _result("reference", False, rejected=[{"source_id": "", "reason": "EMPTY_REFERENCE"}])

    for source_id in ids:
        if allowed is not None and source_id not in allowed:
            rejected.append({"source_id": source_id, "reason": "NOT_IN_ALLOWED_LIST"})
            continue
        source = db.get(KnowledgeSource, source_id)
        if source is None:
            rejected.append({"source_id": source_id, "reason": "SOURCE_NOT_FOUND"})
            continue
        if course_id and source.course_id != course_id:
            rejected.append({"source_id": source_id, "reason": "COURSE_MISMATCH"})
            continue
        if require_student_visible and not source.student_visible:
            rejected.append({"source_id": source_id, "reason": "NOT_STUDENT_VISIBLE"})
            continue
        if not (source.version or "").strip():
            rejected.append({"source_id": source_id, "reason": "INVALID_VERSION"})

    return _result("reference", not rejected, rejected=rejected)


# --- 5. 答案泄露校验 + 6. 内容长度校验 ---------------------------------


def resolve_forbidden_fragments(task: Task | None) -> list[str]:
    """取题目自配禁词，为空时回落默认列表。

    `tasks.hint_forbidden_fragments` 存 JSON 数组。存量题目都没填，
    所以实际仍走 `DEFAULT_FORBIDDEN_HINT_FRAGMENTS`。
    """
    raw = getattr(task, "hint_forbidden_fragments", None) if task is not None else None
    if not raw:
        return list(DEFAULT_FORBIDDEN_HINT_FRAGMENTS)
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return list(DEFAULT_FORBIDDEN_HINT_FRAGMENTS)
    fragments = [str(item) for item in parsed if str(item).strip()] if isinstance(parsed, list) else []
    return fragments or list(DEFAULT_FORBIDDEN_HINT_FRAGMENTS)


def check_answer_leakage(content: str, forbidden_fragments: list[str] | None = None) -> dict[str, Any]:
    fragments = forbidden_fragments if forbidden_fragments is not None else DEFAULT_FORBIDDEN_HINT_FRAGMENTS
    hits = [fragment for fragment in fragments if fragment in content]
    return _result("answer_leakage", not hits, matched_fragments=hits)


def check_content_length(content: str, max_length: int = MAX_HINT_LENGTH) -> dict[str, Any]:
    return _result(
        "content_length",
        len(content) <= max_length,
        length=len(content),
        max_length=max_length,
    )


def hint_safety_check(
    content: str,
    level: int,
    *,
    forbidden_fragments: list[str] | None = None,
    max_length: int = MAX_HINT_LENGTH,
) -> dict[str, Any]:
    """第 5、6 道合并成一个结果，存进 `hint_records.leakage_check`。

    这是改造前 `diagnosis.leakage_check` 与 `model_gateway.hint_leakage_errors`
    两份重复实现的唯一出口。返回形状与 `leakage_check` 保持一致
    （`passed` / `matched_fragments` / `level` / `rule_version`），
    超长仍以 `HINT_TOO_LONG` 出现在 `matched_fragments` 里
    —— 这是 `hint_leakage_errors` 的既有行为。
    """
    leakage = check_answer_leakage(content, forbidden_fragments)
    length = check_content_length(content, max_length)
    matched = list(leakage["matched_fragments"])
    if not length["passed"]:
        matched.append("HINT_TOO_LONG")
    return {
        "passed": leakage["passed"] and length["passed"],
        "matched_fragments": matched,
        "level": level,
        "rule_version": LEAKAGE_RULE_VERSION,
    }


# --- 7. 动作白名单校验 --------------------------------------------------


def check_action_whitelist(actions: Iterable[str] | None = None) -> dict[str, Any]:
    """内置版 §13.4。当前工作流不产出 actions，无对象可校验。

    等模型开始返回「跳转到某页 / 打开某任务」这类动作时，
    白名单在这里定义并逐条比对。
    """
    return _result("action_whitelist", True, actions=list(actions or []))
