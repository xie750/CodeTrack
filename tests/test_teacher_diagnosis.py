"""教师端学情诊断接口（开发方案 §十）。

重点锁三件事：
1. 权限边界 —— 教师只能看自己教学安排范围内的班级和学生（§15.1）。
2. 口径一致 —— 教师个体诊断与学生端画像必须逐字段相同（迁移执行清单 §11.7 验收）。
3. 真实零值与无数据可区分 —— 没有画像不是 404，avg_score 缺失是 None 不是 0（§11.8）。
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
OTHER_TEACHER = {"X-Demo-User-Id": "user_teacher_002"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}

COURSE = "course_ds_001"
# user_teacher_001 名下的两个教学班
OWN_CLASS = "class_se_001"
OWN_STUDENT = "user_student_001"


@pytest.fixture(name="client")
def client_fixture():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------- 选项接口


def test_class_options_only_expose_own_teaching_assignments(client):
    response = client.get(
        "/api/v1/teacher/diagnosis/options/classes",
        params={"course_id": COURSE},
        headers=TEACHER,
    )
    assert response.status_code == 200
    data = response.json()["data"]

    class_ids = {item["class_id"] for item in data}
    assert class_ids == {"class_se_001", "class_cs_001"}
    # 每条选项都带教学安排 ID，前端不需要再反查（§15.1）
    assert all(item["teaching_assignment_id"] for item in data)
    assert all(item["student_count"] >= 0 for item in data)


def test_student_options_flag_profile_coverage(client):
    response = client.get(
        "/api/v1/teacher/diagnosis/options/students",
        params={"course_id": COURSE},
        headers=TEACHER,
    )
    assert response.status_code == 200
    data = response.json()["data"]

    assert {item["student_id"] for item in data} == {"user_student_001", "user_student_002"}
    # has_profile 让前端能提前标出没有画像的学生，而不是点开才发现是空页
    assert all("has_profile" in item for item in data)
    assert all(item["class_name"] for item in data)


def test_student_options_narrow_to_selected_class(client):
    response = client.get(
        "/api/v1/teacher/diagnosis/options/students",
        params={"course_id": COURSE, "class_id": OWN_CLASS},
        headers=TEACHER,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert [item["student_id"] for item in data] == ["user_student_001"]


def test_task_options_only_include_published_tasks(client):
    response = client.get(
        "/api/v1/teacher/diagnosis/options/tasks",
        params={"course_id": COURSE},
        headers=TEACHER,
    )
    assert response.status_code == 200
    data = response.json()["data"]

    assert len(data) > 0
    task_ids = [item["task_id"] for item in data]
    # 同一任务发给多个班时也只出现一次
    assert len(task_ids) == len(set(task_ids))


# ---------------------------------------------------------------- 班级学情


def test_class_analytics_distinguishes_real_zero_from_missing_data(client):
    response = client.get(
        "/api/v1/teacher/analytics/class",
        params={"course_id": COURSE},
        headers=TEACHER,
    )
    assert response.status_code == 200
    data = response.json()["data"]

    roster = data["roster"]
    assert roster["total"] == 2
    assert roster["with_profile"] + roster["without_profile"] == roster["total"]

    # 没有任何评分的任务给 None，有评分的给数值 —— 不能都塞 0
    trend = data["score_trend"]
    assert len(trend) > 0
    for point in trend:
        if point["scored_count"] == 0:
            assert point["avg_score"] is None
        else:
            assert isinstance(point["avg_score"], (int, float))
        # 提交率和通过率是真实比例，恒有值
        assert 0 <= point["submit_rate"] <= 100
        assert 0 <= point["pass_rate"] <= 100


def test_class_analytics_knowledge_matrix_is_rectangular(client):
    response = client.get(
        "/api/v1/teacher/analytics/class",
        params={"course_id": COURSE},
        headers=TEACHER,
    )
    knowledge = response.json()["data"]["knowledge"]

    points = knowledge["points"]
    assert len(points) > 0
    # 热力图必须是完整矩阵，缺证据的格子用 None 占位而不是省略，否则前端列会错位
    for row in knowledge["rows"]:
        assert [cell["knowledge_point"] for cell in row["cells"]] == points
    assert [item["knowledge_point"] for item in knowledge["point_averages"]] == points

    for item in knowledge["point_averages"]:
        if item["covered_students"] == 0:
            assert item["avg_mastery"] is None


def test_class_analytics_narrowed_by_class_changes_roster(client):
    whole = client.get(
        "/api/v1/teacher/analytics/class",
        params={"course_id": COURSE},
        headers=TEACHER,
    ).json()["data"]
    single = client.get(
        "/api/v1/teacher/analytics/class",
        params={"course_id": COURSE, "class_id": OWN_CLASS},
        headers=TEACHER,
    ).json()["data"]

    assert whole["roster"]["total"] == 2
    assert single["roster"]["total"] == 1
    assert [item["class_id"] for item in single["classes"]] == [OWN_CLASS]


def test_class_analytics_task_filter_does_not_shrink_roster(client):
    base = client.get(
        "/api/v1/teacher/analytics/class",
        params={"course_id": COURSE},
        headers=TEACHER,
    ).json()["data"]
    task_id = base["score_trend"][0]["task_id"]

    filtered = client.get(
        "/api/v1/teacher/analytics/class",
        params={"course_id": COURSE, "task_id": task_id},
        headers=TEACHER,
    ).json()["data"]

    # task_id 只收窄成绩趋势，名册口径不变
    assert filtered["roster"] == base["roster"]
    assert [item["task_id"] for item in filtered["score_trend"]] == [task_id]


# ---------------------------------------------------------------- 个体诊断


def test_student_analytics_matches_student_profile_field_by_field(client):
    """教师端和学生端必须读同一套画像（§10.2），这条测试防止两端口径漂移。"""
    teacher_view = client.get(
        "/api/v1/teacher/analytics/student",
        params={"course_id": COURSE, "student_id": OWN_STUDENT},
        headers=TEACHER,
    )
    student_view = client.get(
        "/api/v1/student/profile",
        params={"course_id": COURSE},
        headers=STUDENT,
    )
    assert teacher_view.status_code == 200
    assert student_view.status_code == 200

    teacher_data = teacher_view.json()["data"]
    student_data = student_view.json()["data"]

    for key in (
        "student",
        "course",
        "overview",
        "knowledge_states",
        "frequent_errors",
        "recommendations",
    ):
        assert teacher_data[key] == student_data[key], f"{key} 口径不一致"


def test_student_analytics_adds_teacher_only_blocks(client):
    teacher_data = client.get(
        "/api/v1/teacher/analytics/student",
        params={"course_id": COURSE, "student_id": OWN_STUDENT},
        headers=TEACHER,
    ).json()["data"]
    student_data = client.get(
        "/api/v1/student/profile",
        params={"course_id": COURSE},
        headers=STUDENT,
    ).json()["data"]

    teacher_only = ("capability_evidence", "hint_usage", "behavior_timeline", "task_history")
    for key in teacher_only:
        assert key in teacher_data
        # 学生端不得看到内部证据和提示明细（§10.2 双端可见性边界）
        assert key not in student_data

    assert teacher_data["has_profile"] is True
    assert len(teacher_data["task_history"]) > 0


def test_no_profile_branch_returns_none_from_shared_serializer():
    """画像缺失时共享序列化函数返回 None，由调用方决定是 404 还是空状态。

    种子数据里每个「在册且教师可见」的学生都恰好有画像，所以 has_profile=False 这条
    分支在端到端层面构造不出来。这里直接锁服务层行为，保证前端拿到的是
    200 + has_profile=false 而不是 404 —— 教师会把 404 读成权限出错。
    """
    from backend.app.core.database import SessionLocal
    from backend.app.services.learner_profile import serialize_learner_profile

    db = SessionLocal()
    try:
        assert (
            serialize_learner_profile(db, "user_student_002", "course_network_001") is None
        )
        # 对照组：有画像时六个键齐全
        payload = serialize_learner_profile(db, OWN_STUDENT, COURSE)
        assert payload is not None
        assert set(payload) == {
            "student",
            "course",
            "overview",
            "knowledge_states",
            "frequent_errors",
            "recommendations",
        }
    finally:
        db.close()


# ---------------------------------------------------------------- 预警中心


def test_alerts_are_read_only_and_carry_evidence(client):
    response = client.get(
        "/api/v1/teacher/alerts",
        params={"course_id": COURSE},
        headers=TEACHER,
    )
    assert response.status_code == 200
    data = response.json()["data"]

    # 写操作依赖尚未建立的预警状态表，接口必须显式说不可用（§15.2）
    assert data["actions_available"] is False
    assert data["actions_disabled_reason"]

    assert data["alert_count"] == len(data["alerts"])
    assert sum(data["level_counts"].values()) == data["alert_count"]
    assert len(data["rules"]) == 7

    known_codes = {item["code"] for item in data["rules"]}
    for alert in data["alerts"]:
        assert alert["level"] in {"HIGH", "WATCH", "NOTICE"}
        assert alert["rules"], "命中的学生必须至少带一条规则"
        for rule in alert["rules"]:
            assert rule["code"] in known_codes
            # 每条规则都要给出可追查的证据，不能只给个结论
            assert rule["evidence"]
        assert alert["rule_codes"] == [rule["code"] for rule in alert["rules"]]


def test_alerts_sorted_by_risk_level(client):
    data = client.get(
        "/api/v1/teacher/alerts",
        params={"course_id": COURSE},
        headers=TEACHER,
    ).json()["data"]

    rank = {"HIGH": 0, "WATCH": 1, "NOTICE": 2}
    levels = [rank[item["level"]] for item in data["alerts"]]
    assert levels == sorted(levels)


# ---------------------------------------------------------------- 权限边界


@pytest.mark.parametrize(
    "path,params",
    [
        ("/api/v1/teacher/analytics/class", {"course_id": COURSE}),
        ("/api/v1/teacher/alerts", {"course_id": COURSE}),
        ("/api/v1/teacher/diagnosis/options/classes", {"course_id": COURSE}),
        (
            "/api/v1/teacher/analytics/student",
            {"course_id": COURSE, "student_id": OWN_STUDENT},
        ),
    ],
)
def test_students_and_anonymous_cannot_reach_diagnosis(client, path, params):
    assert client.get(path, params=params, headers=STUDENT).status_code == 403
    assert client.get(path, params=params).status_code == 401


def test_teacher_cannot_read_another_teachers_class(client):
    response = client.get(
        "/api/v1/teacher/analytics/class",
        params={"course_id": COURSE, "class_id": OWN_CLASS},
        headers=OTHER_TEACHER,
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "AUTH_FORBIDDEN"


def test_teacher_cannot_read_another_teachers_student(client):
    response = client.get(
        "/api/v1/teacher/analytics/student",
        params={"course_id": COURSE, "student_id": OWN_STUDENT},
        headers=OTHER_TEACHER,
    )
    assert response.status_code == 403


def test_course_without_teaching_assignment_is_forbidden(client):
    """course_arch_001 上 teacher_001 只是课程成员，没有教学安排 —— 学情范围按教学安排算。"""
    response = client.get(
        "/api/v1/teacher/analytics/class",
        params={"course_id": "course_arch_001"},
        headers=TEACHER,
    )
    assert response.status_code == 403


def test_unknown_class_and_student_are_forbidden(client):
    assert (
        client.get(
            "/api/v1/teacher/analytics/class",
            params={"course_id": COURSE, "class_id": "class_does_not_exist"},
            headers=TEACHER,
        ).status_code
        == 403
    )
    assert (
        client.get(
            "/api/v1/teacher/analytics/student",
            params={"course_id": COURSE, "student_id": "user_does_not_exist"},
            headers=TEACHER,
        ).status_code
        == 403
    )
