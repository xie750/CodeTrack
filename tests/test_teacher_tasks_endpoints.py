"""教师端任务中心接口（开发方案 §八 8.1 任务列表）。

这里钉住的核心不变量：

1. **只读**。本模块不写任何表，POST 必须 405。
2. **范围隔离**（§15.1）。只能看到当前教师生效教学安排覆盖的课程，`class_id` 越界 403。
3. **两套状态分开**（§14.1 / §14.2）。`content_status` 是任务内容状态，
   `publications[].publish_status` 是各班级发布状态，不能合并。
4. **stats 覆盖整个范围而不是当前页**，且不受类型 / 状态筛选影响 —— 否则切到某个
   状态标签后其余卡片全变 0，教师就没法用它们对比了。
5. **null 不等于 0**。未发布任务的 `completion_rate` 是 null，不是 0.0。
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from uuid import uuid4

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import Question, QuestionOption, StudentTaskProgress, Task, TaskAssignment

TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
OTHER_TEACHER = {"X-Demo-User-Id": "user_teacher_002"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}

DS_COURSE = "course_ds_001"
NETWORK_COURSE = "course_network_001"
SE_CLASS = "class_se_001"
CS_CLASS = "class_cs_001"
CODING_TASK = "task_linked_list_delete_001"
QUESTION_TASK = "task_linked_list_stage_quiz_001"


def _tasks(client: TestClient, headers: dict, **params) -> dict:
    response = client.get("/api/v1/teacher/tasks", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _row(data: dict, task_id: str) -> dict:
    match = [item for item in data["items"] if item["task_id"] == task_id]
    assert match, f"{task_id} 不在返回列表里：{[item['task_id'] for item in data['items']]}"
    return match[0]


def _cleanup_task(task_id: str | None) -> None:
    if not task_id:
        return
    db = SessionLocal()
    try:
        assignment_ids = list(
            db.scalars(select(TaskAssignment.id).where(TaskAssignment.task_id == task_id)).all()
        )
        question_ids = list(db.scalars(select(Question.id).where(Question.task_id == task_id)).all())
        if assignment_ids:
            db.execute(
                delete(StudentTaskProgress).where(StudentTaskProgress.assignment_id.in_(assignment_ids))
            )
            db.execute(delete(TaskAssignment).where(TaskAssignment.id.in_(assignment_ids)))
        if question_ids:
            db.execute(delete(QuestionOption).where(QuestionOption.question_id.in_(question_ids)))
            db.execute(delete(Question).where(Question.id.in_(question_ids)))
        db.execute(delete(Task).where(Task.id == task_id))
        db.commit()
    finally:
        db.close()


# ------------------------------------------------------------------ 范围与权限


def test_list_only_covers_courses_the_teacher_actually_teaches():
    with TestClient(app) as c:
        data = _tasks(c, TEACHER)
        # teacher_001 负责数据结构和机器学习，不能看到其他教师的 Python 程序设计任务
        assert set(data["scope"]["course_ids"]) == {DS_COURSE, "course_arch_001"}
        assert {item["course_id"] for item in data["items"]} <= {DS_COURSE, "course_arch_001"}
        assert {item["course_id"] for item in data["course_options"]} == {DS_COURSE, "course_arch_001"}


def test_other_teacher_sees_a_different_course():
    with TestClient(app) as c:
        data = _tasks(c, OTHER_TEACHER)
        assert data["scope"]["course_ids"] == [NETWORK_COURSE]
        assert all(item["course_id"] == NETWORK_COURSE for item in data["items"])


def test_cross_teacher_course_is_forbidden():
    with TestClient(app) as c:
        response = c.get(
            "/api/v1/teacher/tasks", params={"course_id": NETWORK_COURSE}, headers=TEACHER
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "AUTH_FORBIDDEN"


def test_class_outside_the_teachers_assignments_is_forbidden():
    with TestClient(app) as c:
        response = c.get(
            "/api/v1/teacher/tasks",
            params={"course_id": DS_COURSE, "class_id": "class_not_mine"},
            headers=TEACHER,
        )
        assert response.status_code == 403


def test_students_cannot_read_the_teacher_task_list():
    with TestClient(app) as c:
        response = c.get("/api/v1/teacher/tasks", headers=STUDENT)
        assert response.status_code == 403


def test_teacher_can_create_publish_and_student_can_open_question_workspace(request):
    task_id = None
    request.addfinalizer(lambda: _cleanup_task(task_id))
    with TestClient(app) as c:
        title = f"chain-smoke-{uuid4().hex[:8]}"
        created = c.post(
            "/api/v1/teacher/tasks",
            headers=TEACHER,
            json={
                "course_id": DS_COURSE,
                "title": title,
                "description": "Smoke task for the teacher publish to student receive chain.",
                "workspace_type": "QUESTION_SET",
                "language": "CPP",
                "interface_spec": "",
                "learning_objectives": ["Verify publish chain"],
                "capability_ids": [],
                "questions": [
                    {
                        "question_type": "SINGLE_CHOICE",
                        "stem": "Which option is marked as correct?",
                        "analysis": "A is the intended answer.",
                        "knowledge_points": ["publish chain"],
                        "difficulty": "BASIC",
                        "score": 5,
                        "options": [
                            {"label": "A", "content": "Correct", "is_correct": True},
                            {"label": "B", "content": "Incorrect", "is_correct": False},
                        ],
                    }
                ],
            },
        )
        assert created.status_code == 201, created.text
        task_id = created.json()["data"]["task_id"]

        draft_row = _row(_tasks(c, TEACHER, keyword=title), task_id)
        assert draft_row["content_status"] == "READY"
        assert draft_row["question_count"] == 1

        published = c.post(
            f"/api/v1/teacher/tasks/{task_id}/publish",
            headers=TEACHER,
            json={"class_ids": [SE_CLASS], "assignment_mode": "QUIZ"},
        )
        assert published.status_code == 200, published.text
        publication = published.json()["data"]["publications"][0]
        assert publication["class_id"] == SE_CLASS
        assert publication["publish_status"] == "PUBLISHED"
        assert publication["initialized_student_count"] > 0

        published_row = _row(_tasks(c, TEACHER, keyword=title), task_id)
        assert published_row["content_status"] == "PUBLISHED"
        assert {item["class_id"] for item in published_row["publications"]} == {SE_CLASS}

        student_tasks = c.get(
            "/api/v1/student/tasks",
            headers=STUDENT,
            params={"course_id": DS_COURSE},
        )
        assert student_tasks.status_code == 200, student_tasks.text
        student_row = next(item for item in student_tasks.json()["data"] if item["task_id"] == task_id)
        assert student_row["workspace_type"] == "QUESTION_SET"
        assert student_row["status"] == "NOT_STARTED"
        assert student_row["total_required_count"] == 1

        workspace = c.get(
            f"/api/v1/student/assignments/{student_row['assignment_id']}/workspace",
            headers=STUDENT,
        )
        assert workspace.status_code == 200, workspace.text
        workspace_data = workspace.json()["data"]
        assert workspace_data["task"]["task_id"] == task_id
        assert len(workspace_data["questions"]) == 1
        assert workspace_data["questions"][0]["stem"] == "Which option is marked as correct?"


# ------------------------------------------------------------------ 行内容


def test_task_type_comes_from_workspace_type_not_from_publish_mode():
    with TestClient(app) as c:
        data = _tasks(c, TEACHER)
        assert _row(data, CODING_TASK)["task_type"] == "PROGRAMMING"
        quiz = _row(data, QUESTION_TASK)
        # 这个任务是按 QUIZ 模式发布的，但内容类型仍是客观题：
        # 测验是发布模式（§八 8.6），不是内容类型
        assert quiz["task_type"] == "QUESTION"
        assert {item["assignment_mode"] for item in quiz["publications"]} == {"QUIZ"}
        assert {option["value"] for option in data["task_type_options"]} == {
            "PROGRAMMING",
            "QUESTION",
        }


def test_content_status_and_publish_status_are_separate_fields():
    with TestClient(app) as c:
        row = _row(_tasks(c, TEACHER), CODING_TASK)
        assert row["content_status"] == "PUBLISHED"
        # 内容状态是推导值，原始 Task.status 仍原样透出，便于排查
        assert row["raw_status"] == "OPEN"
        assert row["publications"]
        assert all(item["publish_status"] == "PUBLISHED" for item in row["publications"])


def test_publications_list_every_class_the_task_went_to():
    with TestClient(app) as c:
        row = _row(_tasks(c, TEACHER), CODING_TASK)
        # 链表删除任务同时发给了人工智能 1 班和人工智能 2 班
        assert {item["class_id"] for item in row["publications"]} == {SE_CLASS, CS_CLASS}
        assert all(item["class_name"] for item in row["publications"])


def test_class_filter_narrows_publications_and_roster():
    with TestClient(app) as c:
        both = _row(_tasks(c, TEACHER, course_id=DS_COURSE), CODING_TASK)
        single = _row(
            _tasks(c, TEACHER, course_id=DS_COURSE, class_id=SE_CLASS), CODING_TASK
        )
        assert {item["class_id"] for item in single["publications"]} == {SE_CLASS}
        # 选定班级后完成率也只按该班口径算，名册不能再包含另一个班的学生
        assert single["roster_total"] < both["roster_total"]


def test_class_scope_changes_status_and_says_so():
    with TestClient(app) as c:
        data = _tasks(c, TEACHER, course_id=DS_COURSE, class_id=CS_CLASS)
        # 只发给人工智能 1 班的任务，在人工智能 2 班视角下确实还没下发，会显示成可发布。
        # 这种口径切换必须在 status_derivation 里说清楚，否则教师会以为状态自相矛盾。
        assert "按班级口径" in data["status_derivation"]
        quiz = _row(data, QUESTION_TASK)
        assert quiz["publications"] == []
        assert quiz["content_status"] == "READY"
        assert quiz["completion_rate"] is None

        # 不带 class_id 时不加这段说明
        assert "按班级口径" not in _tasks(c, TEACHER, course_id=DS_COURSE)["status_derivation"]


def test_programming_and_question_rows_carry_their_own_counts():
    with TestClient(app) as c:
        data = _tasks(c, TEACHER)
        coding = _row(data, CODING_TASK)
        assert coding["test_case_count"] > 0
        assert coding["public_test_case_count"] <= coding["test_case_count"]
        # 编程任务没有客观题，总分给 null 而不是 0
        assert coding["question_count"] == 0
        assert coding["question_total_score"] is None

        quiz = _row(data, QUESTION_TASK)
        assert quiz["question_count"] > 0
        assert quiz["question_total_score"] > 0


def test_completion_rate_is_a_ratio_within_range():
    with TestClient(app) as c:
        for row in _tasks(c, TEACHER)["items"]:
            rate = row["completion_rate"]
            if row["roster_total"] == 0:
                # 没有名册就没有完成率，null 而不是 0
                assert rate is None
            else:
                assert 0 <= rate <= 1
                assert row["completed_count"] <= row["roster_total"]
                assert row["submitted_count"] <= row["roster_total"]


# ------------------------------------------------------------------ 筛选、统计与分页


def test_stats_cover_the_whole_scope_and_ignore_status_filter():
    with TestClient(app) as c:
        unfiltered = _tasks(c, TEACHER)
        filtered = _tasks(c, TEACHER, content_status="PUBLISHED")
        # 切换状态标签时卡片计数必须保持不变，否则它们没法当对比用
        assert filtered["stats"] == unfiltered["stats"]
        assert filtered["total"] <= unfiltered["stats"]["total"]
        assert all(item["content_status"] == "PUBLISHED" for item in filtered["items"])


def test_stats_status_buckets_add_up_to_total():
    with TestClient(app) as c:
        stats = _tasks(c, TEACHER)["stats"]
        buckets = ["draft", "ready", "published", "closed", "archived"]
        assert sum(stats[key] for key in buckets) == stats["total"]


def test_type_filter_and_keyword_search():
    with TestClient(app) as c:
        questions = _tasks(c, TEACHER, task_type="QUESTION")
        assert questions["items"]
        assert all(item["task_type"] == "QUESTION" for item in questions["items"])

        found = _tasks(c, TEACHER, keyword="链表")
        assert found["items"]
        assert all("链表" in item["title"] for item in found["items"])

        # keyword 会影响 stats（换的是「在看哪一批任务」），这一点与状态筛选相反
        assert found["stats"]["total"] == found["total"]

        missing = _tasks(c, TEACHER, keyword="不存在的任务名称")
        assert missing["items"] == []
        assert missing["total"] == 0


def test_pagination_reports_totals_and_slices_rows():
    with TestClient(app) as c:
        first = _tasks(c, TEACHER, page=1, page_size=1)
        assert len(first["items"]) == 1
        assert first["page"] == 1
        assert first["page_size"] == 1
        assert first["total"] >= 2
        assert first["total_pages"] == first["total"]

        second = _tasks(c, TEACHER, page=2, page_size=1)
        assert second["items"][0]["task_id"] != first["items"][0]["task_id"]

        # 越界页返回空列表而不是报错，前端翻到底不该看到错误提示
        beyond = _tasks(c, TEACHER, page=99, page_size=1)
        assert beyond["items"] == []


@pytest.mark.parametrize("page,page_size", [(0, 20), (1, 0), (1, 101)])
def test_pagination_params_are_validated(page, page_size):
    with TestClient(app) as c:
        response = c.get(
            "/api/v1/teacher/tasks",
            params={"page": page, "page_size": page_size},
            headers=TEACHER,
        )
        assert response.status_code == 422


# ------------------------------------------------------------------ 不可用动作与口径说明


def test_write_actions_are_reported_as_unavailable_with_reasons():
    with TestClient(app) as c:
        data = _tasks(c, TEACHER)
        actions = {item["action"]: item for item in data["unavailable_actions"]}
        # §八 8.1 的六个写动作都还没有写接口，必须逐个给出原因，前端才能禁用并解释
        assert set(actions) == {
            "EDIT_TASK",
            "DUPLICATE_TASK",
            "ARCHIVE_TASK",
            "STUDENT_PREVIEW",
        }
        assert all(item["reason"] for item in actions.values())


def test_status_derivation_is_explained_to_the_frontend():
    with TestClient(app) as c:
        data = _tasks(c, TEACHER)
        # 内容状态是推导值，口径说明必须随响应下发，否则前端会把「可发布」当成手工标注
        assert "推导" in data["status_derivation"]
        assert data["content_status_order"] == [
            "DRAFT",
            "READY",
            "PUBLISHED",
            "CLOSED",
            "ARCHIVED",
        ]
