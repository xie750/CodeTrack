from fastapi.testclient import TestClient
from sqlalchemy import delete

from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import CourseDiscussion, DiscussionReply, Notification


TEACHER = {"X-User-Id": "teacher-01"}
STUDENT = {"X-User-Id": "student-03"}


def test_teacher_draft_publish_and_student_reply_flow():
    discussion_id = None
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/teacher/discussions",
            headers=TEACHER,
            json={
                "course_id": "course-ds",
                "class_id": "class-se1",
                "title": "Discussion flow test",
                "content": "Explain the insertion complexity of a linked list.",
                "publish": False,
            },
        )
        assert created.status_code == 201
        discussion_id = created.json()["data"]["id"]
        assert created.json()["data"]["status"] == "draft"

        student_rows = client.get("/api/v1/student/discussions", headers=STUDENT)
        assert student_rows.status_code == 200
        assert all(item["id"] != discussion_id for item in student_rows.json()["data"])

        published = client.post(
            f"/api/v1/teacher/discussions/{discussion_id}/publish", headers=TEACHER,
        )
        assert published.status_code == 200
        assert published.json()["data"]["status"] == "published"

        student_rows = client.get("/api/v1/student/discussions", headers=STUDENT).json()["data"]
        assert any(item["id"] == discussion_id for item in student_rows)

        replied = client.post(
            f"/api/v1/student/discussions/{discussion_id}/replies",
            headers=STUDENT,
            json={"content": "Insertion is O(1) when the target position is known."},
        )
        assert replied.status_code == 201
        assert replied.json()["data"]["participant_count"] == 1
        assert replied.json()["data"]["reply_count"] == 1

        teacher_rows = client.get(
            "/api/v1/teacher/discussions?course_id=course-ds", headers=TEACHER,
        ).json()["data"]
        item = next(row for row in teacher_rows if row["id"] == discussion_id)
        assert item["replies"][0]["student_name"]

        ended = client.post(
            f"/api/v1/teacher/discussions/{discussion_id}/end", headers=TEACHER,
        )
        assert ended.status_code == 200
        assert ended.json()["data"]["status"] == "ended"

        student_rows = client.get("/api/v1/student/discussions", headers=STUDENT).json()["data"]
        assert all(item["id"] != discussion_id for item in student_rows)
        closed_reply = client.post(
            f"/api/v1/student/discussions/{discussion_id}/replies",
            headers=STUDENT, json={"content": "Late reply"},
        )
        assert closed_reply.status_code == 404

    if discussion_id:
        with SessionLocal() as db:
            db.execute(delete(Notification).where(
                (Notification.title == "课堂讨论：Discussion flow test")
                | (Notification.content == "Insertion is O(1) when the target position is known.")
            ))
            db.execute(delete(DiscussionReply).where(DiscussionReply.discussion_id == discussion_id))
            db.execute(delete(CourseDiscussion).where(CourseDiscussion.id == discussion_id))
            db.commit()
