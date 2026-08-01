"""教师端课程教学接口。对应开发方案 §六 6.1 课程与班级、§六 6.2 课程大纲、§15.1 权限、§15.2 数据。

这里钉住的核心不变量：

1. 知识点是按**名称**软关联的（资料、题目、画像三处都存名字），所以
   (course_id, name) 必须唯一，被引用的知识点既不能删也不能改名 —— 改了名历史引用
   会静默变成孤儿。
2. 引用判断必须是精确成员判断，不是子串匹配：「链表」不能被「链表边界处理」的引用污染。
3. §6.1 的名单只读，风险等级与预警中心（`GET /alerts`）同源，不另算一套。
4. 教师只能看到自己有生效教学安排的课程，学生一律进不来（§15.1）。
5. 关键写操作留审计，且 detail key 活过 `safe_details` 的 allowlist（§15.2）。
"""

import json

import pytest
from fastapi.testclient import TestClient

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import (
    AuditLog,
    Course,
    CourseChapter,
    CourseKnowledgePoint,
)

TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
OTHER_TEACHER = {"X-Demo-User-Id": "user_teacher_002"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}
JSON = {"Content-Type": "application/json"}

COURSE_ID = "course_ds_001"
# user_teacher_002 负责的课程，用来验证跨课程越界
OTHER_COURSE_ID = "course_network_001"

# 种子大纲（seed.py）：第三章下 5 个知识点全部被资料/题目/画像引用，
# 第四章下的「栈的基本操作」故意没有任何引用，是唯一可删的那个。
SEEDED_CHAPTER_ID = "chp_ds_linear_list"
SEEDED_EMPTY_CHAPTER_ID = "chp_ds_stack_queue"
SEEDED_BOUND_POINT_ID = "kp_ds_linked_list_boundary"
SEEDED_BOUND_POINT_NAME = "链表边界处理"
SEEDED_FREE_POINT_ID = "kp_ds_stack_basic"


@pytest.fixture()
def client():
    """带 lifespan 的客户端，保证建表和种子数据就绪。

    用例结束后把自己造的章节和知识点删干净，并把课程说明改回种子值 ——
    否则统计类断言会被上一个用例的残留带偏。
    """
    with TestClient(app) as test_client:
        db = SessionLocal()
        try:
            seeded_chapters = {row.id for row in db.query(CourseChapter).all()}
            seeded_points = {row.id for row in db.query(CourseKnowledgePoint).all()}
            course = db.get(Course, COURSE_ID)
            original_description = course.description if course else ""
        finally:
            db.close()
        yield test_client
        _cleanup(seeded_chapters, seeded_points, original_description)


def _cleanup(keep_chapters: set[str], keep_points: set[str], description: str) -> None:
    db = SessionLocal()
    try:
        for point in db.query(CourseKnowledgePoint).all():
            if point.id not in keep_points:
                db.delete(point)
        for chapter in db.query(CourseChapter).all():
            if chapter.id not in keep_chapters:
                db.delete(chapter)
        course = db.get(Course, COURSE_ID)
        if course is not None:
            course.description = description
        db.commit()
    finally:
        db.close()


def _create_chapter(client: TestClient, title: str = "第九章 测试章节", **overrides) -> dict:
    payload = {"title": title, "summary": ""}
    payload.update(overrides)
    response = client.post(
        f"/api/v1/teacher/courses/{COURSE_ID}/chapters",
        headers={**TEACHER, **JSON},
        json=payload,
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _create_point(client: TestClient, chapter_id: str, name: str, **overrides) -> dict:
    payload = {"name": name}
    payload.update(overrides)
    response = client.post(
        f"/api/v1/teacher/chapters/{chapter_id}/knowledge-points",
        headers={**TEACHER, **JSON},
        json=payload,
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


# --- 权限（§15.1）-----------------------------------------------------------


def test_student_cannot_reach_any_course_teaching_endpoint(client):
    assert client.get("/api/v1/teacher/course-classes", headers=STUDENT).status_code == 403
    assert (
        client.get(f"/api/v1/teacher/courses/{COURSE_ID}/syllabus", headers=STUDENT).status_code
        == 403
    )


def test_other_teacher_is_forbidden_on_course_scoped_reads(client):
    """没有生效教学安排的课程一律 403，不靠 course_id 单独判断。"""
    response = client.get(f"/api/v1/teacher/courses/{COURSE_ID}/syllabus", headers=OTHER_TEACHER)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "AUTH_FORBIDDEN"


def test_other_teacher_gets_404_on_chapter_owned_by_someone_else(client):
    """单对象读不到统一 404 —— 否则能靠状态码探测别人课程的章节 ID 是否存在。"""
    response = client.patch(
        f"/api/v1/teacher/chapters/{SEEDED_CHAPTER_ID}",
        headers={**OTHER_TEACHER, **JSON},
        json={"summary": "越界修改"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "CHAPTER_NOT_FOUND"


def test_roster_of_another_teachers_class_is_404(client):
    response = client.get(
        "/api/v1/teacher/course-classes/ta_se1_network_001/students", headers=TEACHER
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "TEACHING_ASSIGNMENT_NOT_FOUND"


# --- §6.1 课程与班级 --------------------------------------------------------


def test_course_classes_returns_one_row_per_teaching_assignment(client):
    """一行 = 一个「行政班 × 课程」，不是按课程聚合。"""
    response = client.get("/api/v1/teacher/course-classes", headers=TEACHER)
    assert response.status_code == 200, response.text
    data = response.json()["data"]

    # 种子里 user_teacher_001 有 ta_se1_ds_001 和 ta_cs1_ds_001 两个安排、同一门课
    assert len(data["items"]) == 2
    assert {item["class_name"] for item in data["items"]} == {"软件工程 1 班", "计科 1 班"}
    assert data["stats"]["course_count"] == 1
    assert data["stats"]["class_count"] == 2
    assert response.json()["meta"]["total"] == 2
    for item in data["items"]:
        assert item["teaching_assignment_id"]
        assert item["student_count"] >= 0


def test_course_class_filters_narrow_items_but_not_stats(client):
    """stats / filters 覆盖整个教学范围，不随筛选变化（与资料中心、任务监控一致）。"""
    baseline = client.get("/api/v1/teacher/course-classes", headers=TEACHER).json()["data"]

    filtered = client.get(
        "/api/v1/teacher/course-classes", headers=TEACHER, params={"keyword": "计科"}
    ).json()["data"]
    assert len(filtered["items"]) == 1
    assert filtered["items"][0]["class_name"] == "计科 1 班"
    assert filtered["stats"] == baseline["stats"]
    assert filtered["filters"] == baseline["filters"]

    by_term = client.get(
        "/api/v1/teacher/course-classes", headers=TEACHER, params={"term": "2026-demo"}
    ).json()["data"]
    assert len(by_term["items"]) == 2
    assert client.get(
        "/api/v1/teacher/course-classes", headers=TEACHER, params={"term": "不存在的学期"}
    ).json()["data"]["items"] == []


def test_roster_risk_levels_match_the_alert_center(client):
    """风险等级与 §10.3 预警中心同源，不另算一套规则。"""
    roster = client.get(
        "/api/v1/teacher/course-classes/ta_se1_ds_001/students", headers=TEACHER
    )
    assert roster.status_code == 200, roster.text
    data = roster.json()["data"]

    alerts = client.get(
        "/api/v1/teacher/alerts", headers=TEACHER, params={"course_id": COURSE_ID, "class_id": "class_se_001"}
    ).json()["data"]
    alert_levels = {row["student_id"]: row["level"] for row in alerts["alerts"]}

    for row in data["items"]:
        expected = alert_levels.get(row["student_id"], "NORMAL")
        assert row["risk_level"] == expected
        # 不只靠颜色表达状态：命中规则要能说出来
        if expected != "NORMAL":
            assert row["risk_rules"]

    assert data["stats"]["total"] == len(data["items"])
    assert sum(data["stats"]["risk_counts"].values()) == data["stats"]["total"]


def test_roster_risk_filter_and_pagination(client):
    base = client.get(
        "/api/v1/teacher/course-classes/ta_se1_ds_001/students", headers=TEACHER
    ).json()
    total = base["data"]["stats"]["total"]

    high = client.get(
        "/api/v1/teacher/course-classes/ta_se1_ds_001/students",
        headers=TEACHER,
        params={"risk": "HIGH"},
    ).json()
    assert all(row["risk_level"] == "HIGH" for row in high["data"]["items"])
    assert high["data"]["stats"]["total"] == total  # stats 不随筛选变

    paged = client.get(
        "/api/v1/teacher/course-classes/ta_se1_ds_001/students",
        headers=TEACHER,
        params={"page": 1, "page_size": 1},
    ).json()
    assert paged["meta"]["page_size"] == 1
    assert len(paged["data"]["items"]) <= 1


def test_roster_rejects_unknown_risk_level(client):
    response = client.get(
        "/api/v1/teacher/course-classes/ta_se1_ds_001/students",
        headers=TEACHER,
        params={"risk": "NOPE"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["details"]["field"] == "risk"


def test_course_description_can_be_edited_and_read_back(client):
    response = client.patch(
        f"/api/v1/teacher/courses/{COURSE_ID}/description",
        headers={**TEACHER, **JSON},
        json={"description": "本学期重点：链表边界与栈队列应用"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["description"] == "本学期重点：链表边界与栈队列应用"

    again = client.get(f"/api/v1/teacher/courses/{COURSE_ID}", headers=TEACHER)
    assert again.json()["data"]["description"] == "本学期重点：链表边界与栈队列应用"


def test_course_description_is_forbidden_for_other_teacher(client):
    response = client.patch(
        f"/api/v1/teacher/courses/{COURSE_ID}/description",
        headers={**OTHER_TEACHER, **JSON},
        json={"description": "越界"},
    )
    assert response.status_code == 403


# --- §6.2 章节与知识点 ------------------------------------------------------


def test_syllabus_returns_seeded_two_level_tree(client):
    response = client.get(f"/api/v1/teacher/courses/{COURSE_ID}/syllabus", headers=TEACHER)
    assert response.status_code == 200, response.text
    data = response.json()["data"]

    titles = [chapter["title"] for chapter in data["chapters"]]
    assert titles == ["第三章 线性表", "第四章 栈与队列"]  # 按 sort_order
    assert data["stats"]["chapter_count"] == 2
    assert data["stats"]["knowledge_point_count"] == 6

    linear = data["chapters"][0]
    names = [point["name"] for point in linear["knowledge_points"]]
    assert SEEDED_BOUND_POINT_NAME in names
    # 名下有生效知识点的章节不能删
    assert linear["deletable"] is False


def test_create_chapter_and_reject_duplicate_title(client):
    created = _create_chapter(client)
    assert created["title"] == "第九章 测试章节"
    assert created["knowledge_point_count"] == 0
    assert created["deletable"] is True

    dup = client.post(
        f"/api/v1/teacher/courses/{COURSE_ID}/chapters",
        headers={**TEACHER, **JSON},
        json={"title": "第九章 测试章节"},
    )
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "CHAPTER_TITLE_DUPLICATED"


def test_create_knowledge_point_under_chapter(client):
    chapter = _create_chapter(client)
    point = _create_point(
        client, chapter["chapter_id"], "测试知识点", point_type="ALGORITHM", difficulty="ADVANCED"
    )
    assert point["chapter_id"] == chapter["chapter_id"]
    assert point["point_type"] == "ALGORITHM"
    assert point["difficulty"] == "ADVANCED"
    assert point["deletable"] is True

    tree = client.get(f"/api/v1/teacher/courses/{COURSE_ID}/syllabus", headers=TEACHER).json()["data"]
    target = next(c for c in tree["chapters"] if c["chapter_id"] == chapter["chapter_id"])
    assert [p["name"] for p in target["knowledge_points"]] == ["测试知识点"]


def test_knowledge_point_name_is_unique_per_course(client):
    """名称唯一是软关联的前提 —— 同名会让按名字回查资料/题目/画像出现歧义。"""
    chapter = _create_chapter(client)
    response = client.post(
        f"/api/v1/teacher/chapters/{chapter['chapter_id']}/knowledge-points",
        headers={**TEACHER, **JSON},
        json={"name": SEEDED_BOUND_POINT_NAME},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "KNOWLEDGE_POINT_NAME_DUPLICATED"


def test_invalid_point_type_and_difficulty_are_rejected(client):
    chapter = _create_chapter(client)
    bad_type = client.post(
        f"/api/v1/teacher/chapters/{chapter['chapter_id']}/knowledge-points",
        headers={**TEACHER, **JSON},
        json={"name": "枚举测试", "point_type": "NOPE"},
    )
    assert bad_type.status_code == 422
    assert bad_type.json()["error"]["details"]["field"] == "point_type"

    bad_difficulty = client.post(
        f"/api/v1/teacher/chapters/{chapter['chapter_id']}/knowledge-points",
        headers={**TEACHER, **JSON},
        json={"name": "枚举测试2", "difficulty": "NOPE"},
    )
    assert bad_difficulty.status_code == 422
    assert bad_difficulty.json()["error"]["details"]["field"] == "difficulty"


def test_knowledge_point_can_move_between_chapters(client):
    chapter_a = _create_chapter(client, "第九章 A")
    chapter_b = _create_chapter(client, "第十章 B")
    point = _create_point(client, chapter_a["chapter_id"], "可移动知识点")

    response = client.patch(
        f"/api/v1/teacher/knowledge-points/{point['knowledge_point_id']}",
        headers={**TEACHER, **JSON},
        json={"chapter_id": chapter_b["chapter_id"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["chapter_id"] == chapter_b["chapter_id"]


# --- 删除与改名保护（§6.2 开发边界）----------------------------------------


def test_referenced_knowledge_point_cannot_be_deleted(client):
    """§6.2「已被正式任务使用的知识点不得直接删除」。"""
    response = client.delete(
        f"/api/v1/teacher/knowledge-points/{SEEDED_BOUND_POINT_ID}", headers=TEACHER
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "KNOWLEDGE_POINT_IN_USE"

    # 行必须还在
    db = SessionLocal()
    try:
        assert db.get(CourseKnowledgePoint, SEEDED_BOUND_POINT_ID) is not None
    finally:
        db.close()


def test_referenced_knowledge_point_cannot_be_renamed(client):
    """软关联靠名字，改名会让历史引用变成孤儿，所以被引用就不许改名。"""
    response = client.patch(
        f"/api/v1/teacher/knowledge-points/{SEEDED_BOUND_POINT_ID}",
        headers={**TEACHER, **JSON},
        json={"name": "换个名字"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "KNOWLEDGE_POINT_IN_USE"

    db = SessionLocal()
    try:
        assert db.get(CourseKnowledgePoint, SEEDED_BOUND_POINT_ID).name == SEEDED_BOUND_POINT_NAME
    finally:
        db.close()


def test_referenced_knowledge_point_can_still_be_edited_and_disabled(client):
    """挡的只是删除和改名，摘要、标签和停用照常可改。"""
    response = client.patch(
        f"/api/v1/teacher/knowledge-points/{SEEDED_BOUND_POINT_ID}",
        headers={**TEACHER, **JSON},
        json={"summary": "补一段说明", "difficulty": "ADVANCED", "status": "ARCHIVED"},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["summary"] == "补一段说明"
    assert data["status"] == "ARCHIVED"

    # 复原，避免影响后面的用例（种子行不在 cleanup 的删除范围内）
    client.patch(
        f"/api/v1/teacher/knowledge-points/{SEEDED_BOUND_POINT_ID}",
        headers={**TEACHER, **JSON},
        json={"summary": "", "difficulty": "INTERMEDIATE", "status": "ACTIVE"},
    )


def test_unreferenced_knowledge_point_can_be_deleted(client):
    chapter = _create_chapter(client)
    point = _create_point(client, chapter["chapter_id"], "无人引用的知识点")

    usage = client.get(
        f"/api/v1/teacher/knowledge-points/{point['knowledge_point_id']}/usage", headers=TEACHER
    ).json()["data"]
    assert usage["resource_count"] == 0
    assert usage["question_count"] == 0
    assert usage["profile_count"] == 0
    assert usage["deletable"] is True
    assert usage["blocked_reason"] is None

    assert (
        client.delete(
            f"/api/v1/teacher/knowledge-points/{point['knowledge_point_id']}", headers=TEACHER
        ).status_code
        == 200
    )


def test_usage_lists_the_actual_referencing_resources(client):
    """删除对话框要能列出具体资料，而不是只说一句「被引用了」。"""
    usage = client.get(
        f"/api/v1/teacher/knowledge-points/{SEEDED_BOUND_POINT_ID}/usage", headers=TEACHER
    ).json()["data"]
    assert usage["deletable"] is False
    assert usage["blocked_reason"]
    # 种子里 4 份资料的 knowledge_points 都含「链表边界处理」
    assert usage["resource_count"] == 4
    assert {item["resource_id"] for item in usage["resources"]} == {
        "kb_linked_list_delete_basic",
        "kb_head_node_delete",
        "kb_empty_list_guard",
        "kb_boundary_test_reasoning",
    }


def test_usage_does_not_match_substrings(client):
    """「链表」不能被「链表边界处理」的引用污染 —— 引用判断是精确成员判断。

    这条如果挂了，说明有人把引用检查写成了 SQL LIKE '%name%'，删除保护会形同虚设：
    任何短名字都会被误判成「已被引用」而永远删不掉。
    """
    chapter = _create_chapter(client)
    point = _create_point(client, chapter["chapter_id"], "链表")

    usage = client.get(
        f"/api/v1/teacher/knowledge-points/{point['knowledge_point_id']}/usage", headers=TEACHER
    ).json()["data"]
    assert usage["resource_count"] == 0
    assert usage["question_count"] == 0
    assert usage["profile_count"] == 0
    assert usage["deletable"] is True


def test_chapter_with_active_points_cannot_be_deleted(client):
    response = client.delete(f"/api/v1/teacher/chapters/{SEEDED_CHAPTER_ID}", headers=TEACHER)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CHAPTER_NOT_EMPTY"

    db = SessionLocal()
    try:
        assert db.get(CourseChapter, SEEDED_CHAPTER_ID) is not None
    finally:
        db.close()


def test_empty_chapter_can_be_deleted(client):
    chapter = _create_chapter(client)
    assert (
        client.delete(f"/api/v1/teacher/chapters/{chapter['chapter_id']}", headers=TEACHER).status_code
        == 200
    )


# --- 拖拽排序（§6.2）-------------------------------------------------------


def test_reorder_chapters_rewrites_sort_order(client):
    response = client.post(
        f"/api/v1/teacher/courses/{COURSE_ID}/syllabus/reorder",
        headers={**TEACHER, **JSON},
        json={"chapters": [SEEDED_EMPTY_CHAPTER_ID, SEEDED_CHAPTER_ID]},
    )
    assert response.status_code == 200, response.text
    assert [c["chapter_id"] for c in response.json()["data"]["chapters"]] == [
        SEEDED_EMPTY_CHAPTER_ID,
        SEEDED_CHAPTER_ID,
    ]

    # 复原种子顺序
    client.post(
        f"/api/v1/teacher/courses/{COURSE_ID}/syllabus/reorder",
        headers={**TEACHER, **JSON},
        json={"chapters": [SEEDED_CHAPTER_ID, SEEDED_EMPTY_CHAPTER_ID]},
    )


def test_reorder_knowledge_points_within_chapter(client):
    chapter = _create_chapter(client)
    first = _create_point(client, chapter["chapter_id"], "排序甲")
    second = _create_point(client, chapter["chapter_id"], "排序乙")

    response = client.post(
        f"/api/v1/teacher/courses/{COURSE_ID}/syllabus/reorder",
        headers={**TEACHER, **JSON},
        json={
            "chapter_id": chapter["chapter_id"],
            "knowledge_points": [second["knowledge_point_id"], first["knowledge_point_id"]],
        },
    )
    assert response.status_code == 200, response.text
    target = next(
        c for c in response.json()["data"]["chapters"] if c["chapter_id"] == chapter["chapter_id"]
    )
    assert [p["name"] for p in target["knowledge_points"]] == ["排序乙", "排序甲"]


def test_reorder_rejects_foreign_and_duplicate_ids(client):
    unknown = client.post(
        f"/api/v1/teacher/courses/{COURSE_ID}/syllabus/reorder",
        headers={**TEACHER, **JSON},
        json={"chapters": ["chp_does_not_exist"]},
    )
    assert unknown.status_code == 422
    assert unknown.json()["error"]["code"] == "SYLLABUS_REORDER_INVALID"

    duplicated = client.post(
        f"/api/v1/teacher/courses/{COURSE_ID}/syllabus/reorder",
        headers={**TEACHER, **JSON},
        json={"chapters": [SEEDED_CHAPTER_ID, SEEDED_CHAPTER_ID]},
    )
    assert duplicated.status_code == 422

    empty = client.post(
        f"/api/v1/teacher/courses/{COURSE_ID}/syllabus/reorder",
        headers={**TEACHER, **JSON},
        json={},
    )
    assert empty.status_code == 422


# --- 审计（§15.2）----------------------------------------------------------


def test_syllabus_writes_are_audited_with_surviving_detail_keys(client):
    """detail key 必须在 `audit.SAFE_DETAIL_KEYS` 里，否则 safe_details 会静默丢掉。"""
    chapter = _create_chapter(client, "第九章 审计章节")
    point = _create_point(client, chapter["chapter_id"], "审计知识点")

    db = SessionLocal()
    try:
        chapter_log = (
            db.query(AuditLog)
            .filter(AuditLog.event_type == "TEACHER_CHAPTER_CREATED")
            .order_by(AuditLog.created_at.desc())
            .first()
        )
        assert chapter_log is not None
        assert chapter_log.user_id == "user_teacher_001"
        chapter_details = json.loads(chapter_log.details)
        assert chapter_details["chapter_id"] == chapter["chapter_id"]
        assert chapter_details["course_id"] == COURSE_ID
        assert chapter_details["syllabus_action"] == "CREATE_CHAPTER"

        point_log = (
            db.query(AuditLog)
            .filter(AuditLog.event_type == "TEACHER_KNOWLEDGE_POINT_CREATED")
            .order_by(AuditLog.created_at.desc())
            .first()
        )
        assert point_log is not None
        point_details = json.loads(point_log.details)
        assert point_details["knowledge_point_id"] == point["knowledge_point_id"]
        assert point_details["knowledge_point_name"] == "审计知识点"
    finally:
        db.close()


def test_course_description_update_is_audited(client):
    client.patch(
        f"/api/v1/teacher/courses/{COURSE_ID}/description",
        headers={**TEACHER, **JSON},
        json={"description": "审计用说明"},
    )
    db = SessionLocal()
    try:
        entry = (
            db.query(AuditLog)
            .filter(AuditLog.event_type == "TEACHER_COURSE_UPDATED")
            .order_by(AuditLog.created_at.desc())
            .first()
        )
        assert entry is not None
        details = json.loads(entry.details)
        assert details["course_id"] == COURSE_ID
        assert details["course_action"] == "UPDATE_DESCRIPTION"
    finally:
        db.close()
