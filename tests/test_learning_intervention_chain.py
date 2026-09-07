from fastapi.testclient import TestClient

from backend.app.main import app


TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}


def test_teacher_intervention_publishes_student_visible_practice_and_follow_up():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/teacher/analytics/interventions",
            headers=TEACHER,
            json={
                "course_id": "course_ds_001",
                "class_id": "class_se_001",
                "action": "class_practice",
                "title": "链表边界专项跟进",
                "content": "请完成一组链表头节点删除与越界判断的专项练习。",
                "knowledge_point": "链表边界处理",
            },
        )

        assert response.status_code == 201
        data = response.json()["data"]
        assert data["student_visible"] is True
        assert data["recipients"] == 1
        assert data["task_id"]
        assert data["assignment_id"]

        tasks = client.get("/api/v1/student/tasks?course_id=course_ds_001", headers=STUDENT)
        assert tasks.status_code == 200
        task_ids = {item["task_id"] for item in tasks.json()["data"]}
        assert data["task_id"] in task_ids

        center = client.get("/api/v1/student/interventions?course_id=course_ds_001", headers=STUDENT)
        assert center.status_code == 200
        payload = center.json()["data"]
        assert payload["summary"]["total"] >= 1
        item = next(row for row in payload["items"] if row["task_id"] == data["task_id"])
        assert item["type"] == "class_practice"
        assert item["action_label"] == "去完成练习"
        assert item["responded"] is False


def test_student_can_reply_to_teacher_intervention():
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/teacher/analytics/interventions",
            headers=TEACHER,
            json={
                "course_id": "course_ds_001",
                "class_id": "class_se_001",
                "action": "discussion",
                "title": "链表错因讨论",
                "content": "请写下你最容易出错的一步，以及准备如何避免。",
                "knowledge_point": "链表边界处理",
            },
        )
        assert created.status_code == 201

        center = client.get("/api/v1/student/interventions?course_id=course_ds_001", headers=STUDENT)
        event = next(row for row in center.json()["data"]["items"] if row["type"] == "discussion")

        reply = client.post(
            f"/api/v1/student/interventions/{event['id']}/reply",
            headers=STUDENT,
            json={"content": "我会先判断空链表和删除头节点，再移动指针。"},
        )
        assert reply.status_code == 201
        assert reply.json()["data"]["responded"] is True

        updated = client.get("/api/v1/student/interventions?course_id=course_ds_001", headers=STUDENT)
        updated_event = next(row for row in updated.json()["data"]["items"] if row["id"] == event["id"])
        assert updated_event["responded"] is True
