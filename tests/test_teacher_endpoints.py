from fastapi.testclient import TestClient

from backend.app.main import app

TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
OTHER_TEACHER = {"X-Demo-User-Id": "user_teacher_002"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}


def test_teacher_courses_aggregate_by_course_without_duplicates():
    with TestClient(app) as c:
        response = c.get("/api/v1/teacher/courses", headers=TEACHER)
        assert response.status_code == 200
        data = response.json()["data"]

        course_ids = [item["course_id"] for item in data]
        # user_teacher_001 在 course_ds_001 上有两条教学安排，聚合后仍只能出现一次
        assert len(course_ids) == len(set(course_ids))
        assert "course_ds_001" in course_ids

        course = next(item for item in data if item["course_id"] == "course_ds_001")
        # 两个行政班各一名在册学生，跨班去重后为 2
        assert course["student_count"] == 2
        assert course["task_count"] > 0
        assert course["status"] == "ACTIVE"


def test_teaching_assignments_expose_one_row_per_class():
    with TestClient(app) as c:
        response = c.get("/api/v1/teacher/teaching-assignments", headers=TEACHER)
        assert response.status_code == 200
        data = response.json()["data"]

        ds_rows = [item for item in data if item["course_id"] == "course_ds_001"]
        assert len(ds_rows) == 2
        assert {item["class_id"] for item in ds_rows} == {"class_se_001", "class_cs_001"}
        assert all(item["class_name"] for item in ds_rows)
        assert all(item["student_count"] == 1 for item in ds_rows)


def test_task_monitor_counts_students_who_submitted():
    with TestClient(app) as c:
        response = c.get(
            "/api/v1/teacher/tasks/task_linked_list_delete_001/monitor", headers=TEACHER
        )
        assert response.status_code == 200
        data = response.json()["data"]

        assert data["course_id"] == "course_ds_001"
        assert data["total_students"] == len(data["submissions"])
        counted = (
            data["submitted_count"] + data["in_progress_count"] + data["not_started_count"]
        )
        assert counted == data["total_students"]

        # 有提交记录的学生不能被算作未开始
        for row in data["submissions"]:
            if row["version_count"] > 0:
                assert row["status"] != "NOT_STARTED"


def test_dashboard_stats_match_returned_courses():
    with TestClient(app) as c:
        response = c.get("/api/v1/teacher/dashboard", headers=TEACHER)
        assert response.status_code == 200
        data = response.json()["data"]

        assert data["teacher"]["id"] == "user_teacher_001"
        assert data["stats"]["course_count"] == len(data["courses"])
        assert len(data["recent_submissions"]) <= 10
        for row in data["recent_submissions"]:
            assert row["course_id"] in {item["course_id"] for item in data["courses"]}


def test_dashboard_can_scope_to_one_teaching_assignment():
    with TestClient(app) as c:
        scoped = c.get(
            "/api/v1/teacher/dashboard?teaching_assignment_id=ta_se1_ds_001", headers=TEACHER
        )
        assert scoped.status_code == 200
        # 单个行政班只有一名在册学生
        assert scoped.json()["data"]["stats"]["student_count"] == 1

        assert (
            c.get("/api/v1/teacher/dashboard?teaching_assignment_id=ta_se1_network_001", headers=TEACHER).status_code
            == 404
        )


def test_teacher_endpoints_reject_other_roles_and_other_courses():
    with TestClient(app) as c:
        assert c.get("/api/v1/teacher/courses", headers=STUDENT).status_code == 403
        assert c.get("/api/v1/teacher/courses").status_code == 401
        assert c.get("/api/v1/teacher/courses/nope", headers=TEACHER).status_code == 404
        assert c.get("/api/v1/teacher/tasks/nope/monitor", headers=TEACHER).status_code == 404

        # 未参与的课程不可读
        assert c.get("/api/v1/teacher/courses/course_network_001", headers=TEACHER).status_code == 403
        # 另一位教师只能看到自己的课程
        other = c.get("/api/v1/teacher/courses", headers=OTHER_TEACHER).json()["data"]
        assert [item["course_id"] for item in other] == ["course_network_001"]
