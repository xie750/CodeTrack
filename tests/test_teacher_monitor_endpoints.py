"""教师端提交进度看板接口（开发方案 §九 9.1）。

重点锁四件事：
1. 权限边界 —— 教师只能看自己教学安排范围内的班级、任务和学生（§15.1），导出同样校验。
2. 概览口径 —— `stats` 覆盖整个名册，不随筛选变化，否则卡片就不能当筛选入口用。
3. 状态推导 —— 编码任务不写 `StudentTaskProgress`，已提交的学生不能被算成未开始。
4. 真实零值与"不适用"可区分 —— 编程任务没有分数字段，avg_score 是 None 且
   score_supported 为 False，不是 0 分。
"""

import pytest
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import Submission

TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
OTHER_TEACHER = {"X-Demo-User-Id": "user_teacher_002"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}

COURSE = "course_ds_001"
# user_teacher_001 名下的教学班
OWN_CLASS = "class_se_001"
# 编程任务（CODING）与客观题任务（QUESTION_SET），两者成绩口径不同
CODING_TASK = "task_linked_list_boundary_review_001"
QUESTION_TASK = "task_stack_queue_preview_001"
# 种子数据里唯一有成绩的客观题任务（进度行 score=76）
SCORED_QUESTION_TASK = "task_linked_list_stage_quiz_001"

BOARD = "/api/v1/teacher/monitor/board"
EXPORT = "/api/v1/teacher/monitor/board/export"


@pytest.fixture(name="client")
def client_fixture():
    with TestClient(app) as c:
        yield c


def board(client: TestClient, headers=None, **params):
    response = client.get(BOARD, headers=headers or TEACHER, params=params)
    assert response.status_code == 200, response.text
    return response.json()["data"]


# ---------------------------------------------------------------- 默认兜底


def test_board_defaults_to_latest_published_task(client):
    """不传任何参数也要有数据：课程落到第一门，任务落到最近发布的那个。"""
    data = board(client)
    assert data["scope"]["course_id"]
    assert data["scope"]["task_id"]
    assert data["task"] is not None
    assert data["empty_reason"] is None

    # 兜底选中的任务必须在选项里标成 is_current，否则前端下拉框会显示成未选
    current = [item for item in data["task_options"] if item["is_current"]]
    assert [item["task_id"] for item in current] == [data["scope"]["task_id"]]

    # 任务选项按发布时间倒序，教师进来最先看到刚发的那个
    published = [item["published_at"] for item in data["task_options"] if item["published_at"]]
    assert published == sorted(published, reverse=True)


def test_board_exposes_filter_options_and_gaps(client):
    data = board(client, task_id=CODING_TASK)
    assert [item["value"] for item in data["status_options"]] == [
        "NOT_STARTED",
        "IN_PROGRESS",
        "SUBMITTED",
        "NEEDS_REVISION",
        "COMPLETED",
        "OVERDUE",
    ]
    assert [item["value"] for item in data["hint_level_options"]] == ["0", "1", "2", "3"]

    # 缺失能力的原因由后端下发，前端不自己编文案
    actions = {item["action"] for item in data["unavailable_actions"]}
    assert {"TEACHER_SCORE", "TEACHER_FEEDBACK"} <= actions
    assert all(item["reason"] for item in data["unavailable_actions"])


# ---------------------------------------------------------------- 名册与状态


def test_roster_includes_students_without_submission(client):
    """没提交过的学生也必须出现，否则"未开始"根本统计不出来。"""
    data = board(client, task_id=QUESTION_TASK)
    stats = data["stats"]
    assert stats["total"] == len(data["items"]) or data["total_pages"] > 1

    # 各状态人数之和不超过名册总数（同一学生只占一行）
    buckets = stats["not_started"] + stats["in_progress"] + stats["submitted"]
    assert buckets <= stats["total"]

    for row in data["items"]:
        assert row["student_id"]
        assert row["class_id"]
        # 未提交的行 submission_id 是 None，前端据此禁用「提交详情」
        if row["version_count"] == 0:
            assert row["submission_id"] is None


def test_coding_task_status_derived_from_submission(client):
    """编码任务不写 `StudentTaskProgress`，状态必须从 `Submission.status` 回退推导。

    种子数据里这个编程任务只有一条 NOT_STARTED 的进度行、没有提交记录，正好能验证这件事：
    插入一条 PASSED 提交后，状态必须变成 COMPLETED，而不是停在进度表写死的 NOT_STARTED。
    """
    before = board(client, task_id=CODING_TASK)
    target = next(row for row in before["items"] if row["submission_id"] is None)
    assert target["status"] == "NOT_STARTED"
    assert target["last_submitted_at"] is None

    submitted_at = datetime(2026, 7, 30, 10, 0, tzinfo=timezone.utc)
    db = SessionLocal()
    try:
        db.add(
            Submission(
                id="sub_monitor_test_001",
                student_id=target["student_id"],
                task_id=CODING_TASK,
                status="PASSED",
                latest_version_no=1,
                first_submitted_at=submitted_at,
                last_submitted_at=submitted_at,
                passed_at=submitted_at,
            )
        )
        db.commit()
    finally:
        db.close()

    try:
        after = board(client, task_id=CODING_TASK)
        row = next(item for item in after["items"] if item["student_id"] == target["student_id"])
        assert row["status"] == "COMPLETED"
        assert row["submission_id"] == "sub_monitor_test_001"
        # 进度表的 last_submitted_at 是空的，必须回落到提交记录，不能显示"未记录"
        assert row["last_submitted_at"] is not None
        assert row["passed_at"] is not None
        # 已完成的学生不算逾期，即使早已过截止时间
        assert row["overdue"] is False
        assert after["stats"]["completed"] >= 1
    finally:
        db = SessionLocal()
        try:
            leftover = db.get(Submission, "sub_monitor_test_001")
            if leftover is not None:
                db.delete(leftover)
                db.commit()
        finally:
            db.close()


def test_overdue_is_independent_of_status(client):
    """逾期与状态正交：不能因为逾期就把状态覆盖成 OVERDUE。"""
    data = board(client, task_id=CODING_TASK)
    for row in data["items"]:
        assert row["status"] in {
            "NOT_STARTED",
            "IN_PROGRESS",
            "SUBMITTED",
            "NEEDS_REVISION",
            "COMPLETED",
        }
        assert isinstance(row["overdue"], bool)
        # 已完成的学生不算逾期
        if row["status"] == "COMPLETED":
            assert row["overdue"] is False


# ---------------------------------------------------------------- 成绩口径


def test_programming_task_has_no_score(client):
    """编程任务没有分数字段：avg_score 是 None，不是 0。"""
    data = board(client, task_id=CODING_TASK)
    assert data["task"]["score_supported"] is False
    assert data["stats"]["score_supported"] is False
    assert data["stats"]["avg_score"] is None
    assert data["stats"]["scored_count"] == 0
    # 口径说明必须给出来，教师要知道为什么没有分数
    assert data["task"]["score_note"]
    for row in data["items"]:
        assert row["score"] is None


def test_question_task_supports_score(client):
    """客观题按题目分值换算百分制，看板要能读出真实平均分。"""
    data = board(client, task_id=SCORED_QUESTION_TASK)
    assert data["task"]["score_supported"] is True
    assert data["stats"]["score_supported"] is True
    assert data["stats"]["scored_count"] >= 1
    assert data["stats"]["avg_score"] is not None

    scored = [row for row in data["items"] if row["score"] is not None]
    assert scored, "这个客观题任务的进度行里应当有成绩"


def test_question_task_without_attempt_has_no_avg(client):
    """同为客观题，没人作答时 avg_score 是 None 而不是 0。"""
    data = board(client, task_id=QUESTION_TASK)
    assert data["task"]["score_supported"] is True
    if data["stats"]["scored_count"] == 0:
        assert data["stats"]["avg_score"] is None


def test_empty_roster_rates_are_none_not_zero(client):
    """名册为空时完成率是 None：0% 和"没有学生"是两件事。"""
    data = board(client, task_id=CODING_TASK)
    if data["stats"]["total"] == 0:
        assert data["stats"]["completion_rate"] is None
        assert data["stats"]["submit_rate"] is None
    else:
        assert data["stats"]["completion_rate"] is not None


# ---------------------------------------------------------------- 筛选与分页


def test_stats_cover_whole_roster_regardless_of_filter(client):
    """卡片计数不跟着筛选走，否则点开一张卡其余全变 0，就没法互相对照了。"""
    baseline = board(client, task_id=CODING_TASK)
    filtered = board(client, task_id=CODING_TASK, status="COMPLETED")
    assert filtered["stats"] == baseline["stats"]
    assert filtered["total"] <= baseline["total"]


def test_status_filter_matches_rows(client):
    data = board(client, task_id=CODING_TASK, status="NEEDS_REVISION")
    assert all(row["status"] == "NEEDS_REVISION" for row in data["items"])


def test_overdue_filter_uses_flag_not_status(client):
    data = board(client, task_id=CODING_TASK, status="OVERDUE")
    assert all(row["overdue"] for row in data["items"])


def test_hint_level_zero_means_no_hint(client):
    """hint_level=0 是"未使用提示"这个有效筛选值，不能被当成"不限"。"""
    none_used = board(client, task_id=CODING_TASK, hint_level=0)
    assert all(row["highest_hint_level"] == 0 for row in none_used["items"])

    at_least_one = board(client, task_id=CODING_TASK, hint_level=1)
    assert all(row["highest_hint_level"] >= 1 for row in at_least_one["items"])


def test_error_type_options_only_list_present_tags(client):
    """错误类型选项只列名册里真实出现过的标签，避免选了必然为空。"""
    data = board(client, task_id=CODING_TASK)
    present = {tag for row in data["items"] for tag in row["error_tags"]}
    offered = {item["value"] for item in data["error_type_options"]}
    assert present <= offered
    for item in data["error_type_options"]:
        assert item["label"]

    if offered:
        tag = sorted(offered)[0]
        filtered = board(client, task_id=CODING_TASK, error_type=tag)
        assert all(tag in row["error_tags"] for row in filtered["items"])


def test_keyword_searches_name_and_id(client):
    data = board(client, task_id=CODING_TASK)
    if not data["items"]:
        pytest.skip("名册为空，无法验证搜索")
    target = data["items"][0]
    by_name = board(client, task_id=CODING_TASK, keyword=target["student_name"])
    assert target["student_id"] in [row["student_id"] for row in by_name["items"]]

    miss = board(client, task_id=CODING_TASK, keyword="不存在的学生zzz")
    assert miss["items"] == []
    assert miss["total"] == 0


def test_pagination_reports_totals(client):
    data = board(client, task_id=CODING_TASK, page=1, page_size=1)
    assert data["page"] == 1
    assert data["page_size"] == 1
    assert len(data["items"]) <= 1
    assert data["total_pages"] >= 1


# ---------------------------------------------------------------- 权限边界


def test_student_cannot_read_board(client):
    assert client.get(BOARD, headers=STUDENT).status_code == 403


def test_teacher_cannot_read_other_teacher_class(client):
    response = client.get(
        BOARD, headers=OTHER_TEACHER, params={"course_id": COURSE, "class_id": OWN_CLASS}
    )
    assert response.status_code == 403


def test_unpublished_or_foreign_task_is_rejected(client):
    response = client.get(BOARD, headers=TEACHER, params={"task_id": "task_does_not_exist"})
    assert response.status_code == 403


# ---------------------------------------------------------------- 导出


def test_export_returns_csv_with_bom(client):
    response = client.get(EXPORT, headers=TEACHER, params={"task_id": CODING_TASK})
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]
    # BOM 是给 Excel 的，没有它中文列名会乱码
    assert response.text.startswith("﻿")
    header = response.text.splitlines()[0]
    assert "学号" in header and "任务状态" in header


def test_export_marks_programming_score_not_applicable(client):
    """编程任务导出的成绩列写"不适用"，不能是空白或 0。"""
    response = client.get(EXPORT, headers=TEACHER, params={"task_id": CODING_TASK})
    rows = [line for line in response.text.splitlines()[1:] if line.strip()]
    if not rows:
        pytest.skip("名册为空，无法验证导出行")
    assert all("不适用" in line for line in rows)


def test_export_respects_filters(client):
    full = client.get(EXPORT, headers=TEACHER, params={"task_id": CODING_TASK})
    filtered = client.get(
        EXPORT,
        headers=TEACHER,
        params={"task_id": CODING_TASK, "keyword": "不存在的学生zzz"},
    )
    assert len(filtered.text.splitlines()) <= len(full.text.splitlines())
    # 只剩表头
    assert len([line for line in filtered.text.splitlines() if line.strip()]) == 1


def test_export_enforces_permission(client):
    """§15.1 所有导出也必须执行权限校验。"""
    assert client.get(EXPORT, headers=STUDENT).status_code == 403
    assert (
        client.get(
            EXPORT, headers=OTHER_TEACHER, params={"course_id": COURSE, "class_id": OWN_CLASS}
        ).status_code
        == 403
    )
