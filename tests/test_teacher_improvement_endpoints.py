"""教师端教学改进接口（开发方案 §十二 12.1 教学策略优化）。

这里钉住的核心不变量有三条：

1. **只读**。本模块不写任何表，POST 必须 405。
2. **规则生成，不是 AI**。`suggestion_meta.generator == "RULE"`、`llm_used is False`，
   每条建议都带触发它的统计证据。
3. **无数据返回 null，不返回 0**。「没人评分」和「都是 0 分」是相反的事实。

范围隔离按 §15.1：`class_id` 和 `compare_class_id` 都必须落在当前教师的教学安排内。
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services import teaching_improvement as rules

TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
OTHER_TEACHER = {"X-Demo-User-Id": "user_teacher_002"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}

DS_COURSE = "course_ds_001"
NETWORK_COURSE = "course_network_001"
SE_CLASS = "class_se_001"
CS_CLASS = "class_cs_001"


def _strategy(client: TestClient, headers: dict, **params) -> dict:
    response = client.get(
        "/api/v1/teacher/improvement/strategy", params=params, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


# ------------------------------------------------------------------ 范围与选项


def test_strategy_defaults_to_all_classes_of_the_course():
    with TestClient(app) as c:
        data = _strategy(c, TEACHER, course_id=DS_COURSE)
        # teacher_001 在 course_ds_001 上带两个班，不传 class_id 时两个都要聚合进来
        assert set(data["scope"]["class_ids"]) == {SE_CLASS, CS_CLASS}
        assert data["scope"]["active_student_count"] == 2
        assert data["scope"]["small_sample"] is False
        assert {item["class_id"] for item in data["class_options"]} == {SE_CLASS, CS_CLASS}
        assert all(item["is_current"] for item in data["class_options"])


def test_class_options_only_list_the_teachers_own_classes():
    with TestClient(app) as c:
        data = _strategy(c, OTHER_TEACHER, course_id=NETWORK_COURSE)
        # teacher_002 只有一条网络课的教学安排，不能看到别人的班
        assert {item["class_id"] for item in data["class_options"]} == {SE_CLASS}
        assert data["scope"]["course_id"] == NETWORK_COURSE


def test_cross_teacher_course_is_forbidden():
    with TestClient(app) as c:
        forbidden = c.get(
            "/api/v1/teacher/improvement/strategy",
            params={"course_id": NETWORK_COURSE},
            headers=TEACHER,
        )
        assert forbidden.status_code == 403
        assert forbidden.json()["error"]["code"] == "AUTH_FORBIDDEN"

        reverse = c.get(
            "/api/v1/teacher/improvement/strategy",
            params={"course_id": DS_COURSE},
            headers=OTHER_TEACHER,
        )
        assert reverse.status_code == 403


def test_compare_class_is_scoped_too():
    """对比参数不能成为绕过范围校验的口子。"""
    with TestClient(app) as c:
        response = c.get(
            "/api/v1/teacher/improvement/strategy",
            params={
                "course_id": NETWORK_COURSE,
                "class_id": SE_CLASS,
                "compare_class_id": CS_CLASS,  # 不属于 teacher_002 的网络课教学安排
            },
            headers=OTHER_TEACHER,
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "AUTH_FORBIDDEN"


def test_student_cannot_reach_teacher_endpoint():
    with TestClient(app) as c:
        response = c.get(
            "/api/v1/teacher/improvement/strategy",
            params={"course_id": DS_COURSE},
            headers=STUDENT,
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "AUTH_FORBIDDEN"


def test_endpoint_is_read_only():
    """§12.1 本轮只提供只读聚合，POST 不应存在。"""
    with TestClient(app) as c:
        assert c.post("/api/v1/teacher/improvement/strategy", headers=TEACHER).status_code == 405


# ------------------------------------------------------------------ 聚合口径


def test_summary_matches_seeded_class_data():
    with TestClient(app) as c:
        summary = _strategy(c, TEACHER, course_id=DS_COURSE, class_id=SE_CLASS)["summary"]
        assert summary["published_task_count"] == 5
        assert summary["active_student_count"] == 1
        # 完成率是实测值而不是「无数据」：seed 里没有 COMPLETED 的进度，所以是 0.0
        assert summary["completion_rate"] is not None
        # 成绩类指标不钉死：test_question_workspace 跑过答题流程后会写入新的
        # StudentTaskProgress.score，这里只钉「有评分就必须有均值」这个口径
        assert summary["scored_count"] >= 1
        assert summary["avg_score"] is not None


def test_weak_knowledge_points_ranked_ascending_by_class_average():
    with TestClient(app) as c:
        points = _strategy(c, TEACHER, course_id=DS_COURSE, class_id=SE_CLASS)[
            "weak_knowledge_points"
        ]
        # 不按名字钉第一名：测试共用同一个 dev 库，test_demo_flow 跑过答题流程后会新增
        # 知识点，排行首位会变。这里钉的是口径本身 —— 升序排列，且状态与均值一致。
        by_point = {item["knowledge_point"]: item for item in points}
        seeded = by_point["链表边界处理"]
        assert seeded["avg_mastery"] == 52.0
        assert seeded["state"] == "WEAK"

        scores = [item["avg_mastery"] for item in points if item["avg_mastery"] is not None]
        assert scores == sorted(scores)
        # 有证据的知识点必须排在无证据的前面
        missing = [index for index, item in enumerate(points) if item["avg_mastery"] is None]
        assert all(index >= len(scores) for index in missing)


def test_frequent_errors_use_the_row_label_not_error_labels_map():
    """标签取 learner_error_stats.label；ERROR_LABELS 缺 seed 里的部分类型且文案不一致。"""
    with TestClient(app) as c:
        errors = _strategy(c, TEACHER, course_id=DS_COURSE, class_id=SE_CLASS)["frequent_errors"]
        by_type = {item["error_type"]: item for item in errors}
        head = by_type["HEAD_NODE_RETURN_MISSING"]
        # ERROR_LABELS 里这条写的是「头节点返回遗漏」，库里是「头节点返回值遗漏」
        assert head["label"] == "头节点返回值遗漏"
        assert head["total_count"] >= 3
        assert head["related_knowledge_points"] == ["链表", "边界处理"]

        # 排序口径：先按影响人数降序，再按累计次数降序
        keys = [(-item["student_count"], -item["total_count"]) for item in errors]
        assert keys == sorted(keys)


def test_empty_data_returns_null_instead_of_zero():
    """teacher_002 的网络课没有进度和错误统计：要 200 + null，不是 500 或 0。"""
    with TestClient(app) as c:
        data = _strategy(c, OTHER_TEACHER, course_id=NETWORK_COURSE)
        summary = data["summary"]
        assert data["frequent_errors"] == []
        assert summary["avg_score"] is None
        assert summary["scored_count"] == 0
        codes = {item["code"] for item in data["data_gaps"]}
        assert "NO_SCORED_PROGRESS" in codes
        assert "NO_ERROR_STAT" in codes


def test_profile_history_gap_is_always_reported():
    """§12.3 做不了改进前后对比的根本原因，每次都要说清楚。"""
    with TestClient(app) as c:
        for course in (DS_COURSE,):
            data = _strategy(c, TEACHER, course_id=course)
            assert "NO_PROFILE_HISTORY" in {item["code"] for item in data["data_gaps"]}


def test_window_only_filters_task_metrics():
    """时间窗口只筛任务发布时间，不影响知识点和错误统计。"""
    with TestClient(app) as c:
        full = _strategy(c, TEACHER, course_id=DS_COURSE, class_id=SE_CLASS, window_days=0)
        narrow = _strategy(c, TEACHER, course_id=DS_COURSE, class_id=SE_CLASS, window_days=7)

        # 不断言窗口内的绝对条数：seed 的 published_at 是硬编码日期，绝对断言会随时间失效
        assert narrow["summary"]["published_task_count"] <= full["summary"]["published_task_count"]
        assert narrow["weak_knowledge_points"] == full["weak_knowledge_points"]
        assert narrow["frequent_errors"] == full["frequent_errors"]
        assert narrow["window"]["days"] == 7


def test_class_compare_returns_both_sides_and_null_propagating_deltas():
    with TestClient(app) as c:
        data = _strategy(
            c,
            TEACHER,
            course_id=DS_COURSE,
            class_id=SE_CLASS,
            compare_class_id=CS_CLASS,
        )
        compare = data["compare"]
        assert compare is not None
        assert compare["class_ids"] == [CS_CLASS]
        # 人工智能 2 班没有已评分进度，所以差值必须是 None 而不是把对面当 0 分
        assert compare["summary"]["avg_score"] is None
        assert compare["deltas"]["avg_score"] is None
        assert compare["deltas"]["avg_mastery"] is not None


def test_compare_with_same_class_is_ignored():
    with TestClient(app) as c:
        data = _strategy(
            c, TEACHER, course_id=DS_COURSE, class_id=SE_CLASS, compare_class_id=SE_CLASS
        )
        assert data["compare"] is None


# ------------------------------------------------------------------ 规则建议


def test_suggestions_are_rule_generated_and_carry_evidence():
    with TestClient(app) as c:
        data = _strategy(c, TEACHER, course_id=DS_COURSE, class_id=SE_CLASS)
        meta = data["suggestion_meta"]
        assert meta["generator"] == "RULE"
        assert meta["llm_used"] is False

        suggestions = data["suggestions"]
        assert suggestions
        for item in suggestions:
            assert item["generator"] == "RULE"
            assert item["rule_id"]
            assert item["title"] and item["detail"]

        fired = {item["rule_id"] for item in suggestions}
        assert {"WEAK_KNOWLEDGE_POINT", "HIGH_FREQUENCY_ERROR", "LOW_COMPLETION"} <= fired

        # 有动作类建议必须给出证据，INFO 类允许没有
        for item in suggestions:
            if item["severity"] in ("HIGH", "MEDIUM"):
                assert item["evidence"], item["rule_id"]
                assert all(entry["source_table"] for entry in item["evidence"])

        ranks = [rules.SEVERITY_RANK[item["severity"]] for item in suggestions]
        assert ranks == sorted(ranks, reverse=True)


def test_suggestions_are_never_empty_even_without_data():
    with TestClient(app) as c:
        rich = _strategy(c, TEACHER, course_id=DS_COURSE, class_id=SE_CLASS)["suggestions"]
        empty = _strategy(c, OTHER_TEACHER, course_id=NETWORK_COURSE)["suggestions"]
        assert len(rich) >= 1
        assert len(empty) >= 1
        assert "INSUFFICIENT_SCORE_DATA" in {item["rule_id"] for item in empty}


def test_unavailable_actions_explain_every_unwired_control():
    with TestClient(app) as c:
        data = _strategy(c, TEACHER, course_id=DS_COURSE)
        actions = {item["action"]: item for item in data["unavailable_actions"]}
        assert {
            "ADOPT_SUGGESTION",
            "IGNORE_SUGGESTION",
            "GENERATE_MATERIAL",
            "CREATE_REMEDIAL_TASK",
        } <= set(actions)
        # 理由文案由后端提供，前端不自己编
        assert all(item["reason"] for item in actions.values())
        assert actions["CREATE_REMEDIAL_TASK"]["target_route"] == "/teacher/tasks/new"
        assert actions["ADOPT_SUGGESTION"]["target_route"] is None


# ------------------------------------------------------------------ 规则引擎单测（纯函数，不连库）


def _summary(**overrides) -> dict:
    base = {
        "published_task_count": 3,
        "active_student_count": 20,
        "with_profile": 20,
        "without_profile": 0,
        "completion_rate": 90.0,
        "avg_score": 85.0,
        "scored_count": 20,
        "avg_mastery": 85.0,
        "knowledge_point_count": 2,
        "weak_knowledge_point_count": 0,
        "error_total_count": 0,
        "error_type_count": 0,
        "hint_level_2_plus_count": 0,
        "hint_ratio": 0.0,
        "avg_overall_progress": 85.0,
        "avg_compile_error_rate": 10.0,
        "avg_logic_error_rate": 10.0,
        "hint_dependency": {},
    }
    base.update(overrides)
    return base


def _point(score: float | None) -> dict:
    return {
        "knowledge_point": "链表",
        "avg_mastery": score,
        "state": None,
        "covered_students": 4,
        "weak_student_count": 1,
        "weak_ratio": 25.0,
    }


NO_TREND = {"early": None, "late": None, "note": ""}


@pytest.mark.parametrize(
    "completion, expected",
    [(60.0, False), (59.9, True)],
)
def test_low_completion_threshold_is_exclusive(completion, expected):
    fired = {
        item["rule_id"]
        for item in rules.build_suggestions(
            _summary(completion_rate=completion), [], [], NO_TREND
        )
    }
    assert ("LOW_COMPLETION" in fired) is expected


@pytest.mark.parametrize(
    "score, rule",
    [(59.9, "WEAK_KNOWLEDGE_POINT"), (60.0, "DEVELOPING_KNOWLEDGE_POINT")],
)
def test_weak_and_developing_are_mutually_exclusive(score, rule):
    fired = {
        item["rule_id"]
        for item in rules.build_suggestions(_summary(), [_point(score)], [], NO_TREND)
    }
    assert rule in fired
    other = {"WEAK_KNOWLEDGE_POINT", "DEVELOPING_KNOWLEDGE_POINT"} - {rule}
    assert not (other & fired)


@pytest.mark.parametrize("count, expected", [(2, False), (3, True)])
def test_high_frequency_error_threshold(count, expected):
    errors = [
        {
            "error_type": "X",
            "label": "错误 X",
            "student_count": 1,
            "total_count": count,
            "severity": "HIGH",
            "related_knowledge_points": [],
        }
    ]
    fired = {
        item["rule_id"] for item in rules.build_suggestions(_summary(), [], errors, NO_TREND)
    }
    assert ("HIGH_FREQUENCY_ERROR" in fired) is expected


def test_all_null_summary_yields_only_info_rules_and_never_raises():
    blank = _summary(
        active_student_count=0,
        with_profile=0,
        completion_rate=None,
        avg_score=None,
        scored_count=0,
        avg_mastery=None,
        hint_ratio=None,
        avg_compile_error_rate=None,
        avg_logic_error_rate=None,
    )
    items = rules.build_suggestions(blank, [], [], NO_TREND)
    assert items
    assert {item["severity"] for item in items} == {"INFO"}


def test_missing_mastery_is_not_treated_as_weakest():
    """没有证据的知识点排在最后，不能被当成最薄弱的那个去出建议。"""
    points = rules.build_weak_knowledge_points(
        {
            "rows": [],
            "point_averages": [
                {"knowledge_point": "无证据", "avg_mastery": None, "covered_students": 0},
                {"knowledge_point": "薄弱", "avg_mastery": 40.0, "covered_students": 2},
            ],
        }
    )
    assert points[0]["knowledge_point"] == "薄弱"
    assert points[-1]["avg_mastery"] is None
    assert points[-1]["state"] is None


def test_deltas_propagate_none():
    result = rules.deltas(_summary(avg_score=None), _summary(avg_score=70.0))
    assert result["avg_score"] is None
    assert result["completion_rate"] == 0.0
