from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import Course, Enrollment, Task, TaskAssignment, TeachingAssignment, User


def test_student_can_join_teacher_course_offering_and_see_tasks():
    suffix = uuid4().hex[:8]
    student_id = f"user_student_join_{suffix}"
    course_id = f"course_join_{suffix}"
    teaching_assignment_id = f"ta_join_{suffix}"
    task_id = f"task_join_{suffix}"
    assignment_id = f"assign_join_{suffix}"

    try:
        headers = {"X-Demo-User-Id": student_id}
        with TestClient(app) as client:
            db = SessionLocal()
            try:
                db.add(User(id=student_id, username=f"join_{suffix}", display_name="旁听同学", role="STUDENT", status="ACTIVE"))
                db.add(
                    Course(
                        id=course_id,
                        name="深度学习导论",
                        description="人工智能专业扩展课程，用于验证学生主动加入课程。",
                        term="2026-demo",
                        status="ACTIVE",
                        owner_teacher_id="user_teacher_001",
                    )
                )
                db.add(
                    TeachingAssignment(
                        id=teaching_assignment_id,
                        class_id="class_cs_001",
                        course_id=course_id,
                        teacher_id="user_teacher_001",
                        term="2026-demo",
                        status="ACTIVE",
                    )
                )
                db.add(
                    Task(
                        id=task_id,
                        course_id=course_id,
                        title="卷积网络概念练习",
                        description="验证加入课程后可以看到老师发布的任务。",
                        workspace_type="CODING",
                        language="PYTHON",
                        interface_spec="solve() -> None",
                        learning_objectives='["深度学习", "卷积网络"]',
                        capability_ids="[]",
                        status="OPEN",
                    )
                )
                db.add(
                    TaskAssignment(
                        id=assignment_id,
                        task_id=task_id,
                        teaching_assignment_id=teaching_assignment_id,
                        published_by="user_teacher_001",
                        publish_status="PUBLISHED",
                        assignment_mode="PRACTICE",
                    )
                )
                db.commit()
            finally:
                db.close()

            before = client.get("/api/v1/student/learning-context", headers=headers)
            assert before.status_code == 200, before.text
            assert before.json()["data"]["student"]["state"] == "NO_CLASS"
            assert before.json()["data"]["courses"] == []

            offerings = client.get("/api/v1/student/course-offerings", headers=headers)
            assert offerings.status_code == 200, offerings.text
            offering_ids = {item["teaching_assignment_id"] for item in offerings.json()["data"]["items"]}
            assert teaching_assignment_id in offering_ids

            joined = client.post(
                "/api/v1/student/course-offerings/join",
                headers=headers,
                json={"teaching_assignment_id": teaching_assignment_id},
            )
            assert joined.status_code == 201, joined.text
            joined_context = joined.json()["data"]["learning_context"]
            assert [course["course_id"] for course in joined_context["courses"]] == [course_id]
            assert joined_context["courses"][0]["class_name"] == "人工智能 2 班"

            tasks = client.get("/api/v1/student/tasks", headers=headers, params={"course_id": course_id})
            assert tasks.status_code == 200, tasks.text
            task_rows = tasks.json()["data"]
            assert [task["assignment_id"] for task in task_rows] == [assignment_id]
            assert task_rows[0]["title"] == "卷积网络概念练习"
    finally:
        db = SessionLocal()
        try:
            db.execute(delete(Enrollment).where(Enrollment.user_id == student_id))
            db.execute(delete(TaskAssignment).where(TaskAssignment.id == assignment_id))
            db.execute(delete(Task).where(Task.id == task_id))
            db.execute(delete(TeachingAssignment).where(TeachingAssignment.id == teaching_assignment_id))
            db.execute(delete(Course).where(Course.id == course_id))
            db.execute(delete(User).where(User.id == student_id))
            db.commit()
        finally:
            db.close()
