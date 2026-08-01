"""教学首页聚合接口测试（开发方案 §五）。

重点验证三件事：
1. 范围收窄 —— 首页始终只看一个教学班，越界参数被挡掉（§15.1）；
2. 口径自洽 —— 卡片、最近任务和学情摘要之间的数字互相对得上；
3. 空态与「无数据」不被写成 0（§11.7）。
"""

from fastapi.testclient import TestClient

from backend.app.main import app

TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
OTHER_TEACHER = {"X-Demo-User-Id": "user_teacher_002"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}

OVERVIEW = "/api/v1/teacher/dashboard/overview"

STAT_KEYS = {
    "student_count",
    "active_task_count",
    "avg_completion_rate",
    "overdue_student_count",
    "pending_ai_review_count",
    "risk_student_count",
}


def _overview(client: TestClient, query: str = "", headers=TEACHER) -> dict:
    response = client.get(f"{OVERVIEW}{query}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_overview_defaults_to_one_teaching_class():
    with TestClient(app) as c:
        data = _overview(c)

        current = data["context"]["current"]
        assert current["teaching_assignment_id"]
        assert current["course_id"] == "course_ds_001"
        # 只能落在当前教师负责的班上
        assert current["class_id"] in {"class_se_001", "class_cs_001"}

        # 选择器必须把当前项标出来，否则前端只能靠顺序猜
        assert [item for item in data["context"]["terms"] if item["is_current"]]
        assert [item for item in data["context"]["courses"] if item["is_current"]]
        selected = [item for item in data["context"]["classes"] if item["is_current"]]
        assert len(selected) == 1
        assert selected[0]["class_id"] == current["class_id"]


def test_overview_class_options_carry_teaching_assignment_id():
    """班级选择器必须带上 teaching_assignment_id，切换班级才能按 §15.1 收窄。"""
    with TestClient(app) as c:
        data = _overview(c)
        for item in data["context"]["classes"]:
            assert item["teaching_assignment_id"]
            assert item["student_count"] >= 0


def test_overview_all_six_stat_cards_have_target_route():
    """§5.2 B「所有卡片点击后必须进入对应明细页面」。"""
    with TestClient(app) as c:
        data = _overview(c)
        assert set(data["stats"]) == STAT_KEYS
        for key, card in data["stats"].items():
            assert card["target_route"], f"{key} 缺少下钻路由"


def test_overview_stats_agree_with_recent_tasks():
    with TestClient(app) as c:
        data = _overview(c)
        stats = data["stats"]
        tasks = data["recent_tasks"]

        # 名册人数就是每个任务的分母
        for row in tasks:
            assert row["total"] == stats["student_count"]["value"]
            assert row["completed"] + row["in_progress"] + row["not_started"] <= row["total"]

        # 进行中任务数不能超过返回的任务数上限之外的口径：活跃任务必然是可见任务的子集
        assert stats["active_task_count"]["value"] >= len(
            [row for row in tasks if row["is_active"]]
        )


def test_overview_completion_rate_uses_full_roster_as_denominator():
    with TestClient(app) as c:
        data = _overview(c)
        for row in data["recent_tasks"]:
            expected = round(row["completed"] * 100 / row["total"], 1)
            assert row["completion_rate"] == expected
            assert row["submit_rate"] >= row["completion_rate"]


def test_overview_todos_carry_type_label_and_route():
    """§5.2 C：待办要能区分四类，并且「立即处理」跳得到真正能处置的页面。"""
    with TestClient(app) as c:
        data = _overview(c)
        labels = data["todo_type_labels"]
        assert set(labels) == {"TASK", "STUDENT", "AI_REVIEW", "FEEDBACK"}

        for todo in data["todos"]:
            assert todo["type"] in labels
            assert todo["level"] in {"HIGH", "WATCH", "NOTICE"}
            assert todo["target_route"].startswith("/teacher/")
            assert todo["title"]

        # 高优先级排在前面，教师从上往下处理
        ranks = {"HIGH": 0, "WATCH": 1, "NOTICE": 2}
        levels = [ranks[todo["level"]] for todo in data["todos"]]
        assert levels == sorted(levels)


def test_overview_mark_todo_done_is_declared_unavailable():
    """待办状态表还没建，按钮不能假装能用（与预警中心同一约定）。"""
    with TestClient(app) as c:
        data = _overview(c)
        actions = {item["action"]: item for item in data["unavailable_actions"]}
        assert "MARK_TODO_DONE" in actions
        assert actions["MARK_TODO_DONE"]["reason"]


def test_overview_class_summary_matches_diagnosis_page():
    """首页摘要点进去就是 §十 诊断页，两处必须同源。"""
    with TestClient(app) as c:
        data = _overview(c)
        current = data["context"]["current"]
        summary = data["class_summary"]

        analytics = c.get(
            "/api/v1/teacher/analytics/class"
            f"?course_id={current['course_id']}&class_id={current['class_id']}",
            headers=TEACHER,
        )
        assert analytics.status_code == 200
        full = analytics.json()["data"]

        # 高频错误：首页取前几名，顺序和数字都必须与诊断页一致
        assert summary["top_errors"] == full["errors"][: len(summary["top_errors"])]

        # 薄弱知识点：只收有证据的知识点，且按平均掌握度升序
        averages = {
            item["knowledge_point"]: item["avg_mastery"]
            for item in full["knowledge"]["point_averages"]
        }
        scores = [item["avg_mastery"] for item in summary["weak_knowledge_points"]]
        assert scores == sorted(scores)
        for item in summary["weak_knowledge_points"]:
            assert item["avg_mastery"] is not None
            assert item["avg_mastery"] == averages[item["knowledge_point"]]


def test_overview_completion_trend_is_chronological():
    with TestClient(app) as c:
        data = _overview(c)
        trend = data["class_summary"]["completion_trend"]
        published = [row["published_at"] or "" for row in trend]
        assert published == sorted(published)

        # 最近任务是倒序，趋势是正序，两者覆盖同一批任务
        recent_ids = {row["task_id"] for row in data["recent_tasks"]}
        assert recent_ids.issubset({row["task_id"] for row in trend})


def test_overview_can_scope_to_a_specific_teaching_assignment():
    with TestClient(app) as c:
        data = _overview(c, "?teaching_assignment_id=ta_cs1_ds_001")
        assert data["context"]["current"]["teaching_assignment_id"] == "ta_cs1_ds_001"
        assert data["context"]["current"]["class_id"] == "class_cs_001"


def test_overview_rejects_other_teachers_teaching_assignment():
    """404 而不是 403：否则能靠状态码探测别的教师有哪些教学安排。"""
    with TestClient(app) as c:
        response = c.get(f"{OVERVIEW}?teaching_assignment_id=ta_se1_ds_001", headers=OTHER_TEACHER)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "TEACHING_ASSIGNMENT_NOT_FOUND"


def test_overview_rejects_unknown_teaching_assignment():
    with TestClient(app) as c:
        response = c.get(f"{OVERVIEW}?teaching_assignment_id=ta_not_exist", headers=TEACHER)
        assert response.status_code == 404


def test_overview_rejects_filters_outside_teacher_scope():
    with TestClient(app) as c:
        assert c.get(f"{OVERVIEW}?course_id=course_not_mine", headers=TEACHER).status_code == 403
        assert c.get(f"{OVERVIEW}?class_id=class_not_mine", headers=TEACHER).status_code == 403


def test_overview_rejects_students():
    with TestClient(app) as c:
        assert c.get(OVERVIEW, headers=STUDENT).status_code == 403
