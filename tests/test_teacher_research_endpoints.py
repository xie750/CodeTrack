import json
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import (
    KnowledgeSource,
    LearnerEvent,
    PracticeProject,
    PracticeProjectActivity,
    PracticeProjectEnrollment,
    PracticeProjectMaterial,
    PracticeProjectSubmission,
    StudentGeneratedResource,
    TeacherResearchActivity,
    TeacherResearchMaterial,
    TeacherResearchProject,
)


TEACHER_HEADERS = {"X-Demo-User-Id": "user_teacher_001"}
STUDENT_HEADERS = {"X-Demo-User-Id": "user_student_001"}
COURSE_ID = "course_arch_001"


def _cleanup_teacher_research(project_id: str | None, student_project_id: str | None, resource_id: str | None) -> None:
    db = SessionLocal()
    try:
        if project_id and not student_project_id:
            project = db.get(TeacherResearchProject, project_id)
            student_project_id = project.student_project_id if project else None

        if project_id:
            db.execute(delete(TeacherResearchMaterial).where(TeacherResearchMaterial.project_id == project_id))
            db.execute(delete(TeacherResearchActivity).where(TeacherResearchActivity.project_id == project_id))
            db.execute(delete(TeacherResearchProject).where(TeacherResearchProject.id == project_id))

        if student_project_id:
            resource_ids = [
                item["artifact_resource_id"]
                for item in (
                    json.loads(submission.content_json) if submission.content_json else {}
                    for submission in db.scalars(
                        select(PracticeProjectSubmission).where(PracticeProjectSubmission.project_id == student_project_id)
                    ).all()
                )
                if isinstance(item, dict) and item.get("artifact_resource_id")
            ]
            if resource_ids:
                db.execute(delete(StudentGeneratedResource).where(StudentGeneratedResource.id.in_(resource_ids)))
            db.execute(delete(LearnerEvent).where(LearnerEvent.payload.like(f'%"{student_project_id}"%')))
            db.execute(delete(PracticeProjectActivity).where(PracticeProjectActivity.project_id == student_project_id))
            db.execute(delete(PracticeProjectSubmission).where(PracticeProjectSubmission.project_id == student_project_id))
            db.execute(delete(PracticeProjectMaterial).where(PracticeProjectMaterial.project_id == student_project_id))
            db.execute(delete(PracticeProjectEnrollment).where(PracticeProjectEnrollment.project_id == student_project_id))
            db.execute(delete(PracticeProject).where(PracticeProject.id == student_project_id))

        if resource_id:
            db.execute(delete(KnowledgeSource).where(KnowledgeSource.id == resource_id))
        db.commit()
    finally:
        db.close()


def test_teacher_research_harness_publish_review_and_archive_flow(request):
    created_ids = {"project_id": None, "student_project_id": None, "resource_id": None}
    request.addfinalizer(
        lambda: _cleanup_teacher_research(
            created_ids["project_id"],
            created_ids["student_project_id"],
            created_ids["resource_id"],
        )
    )

    with TestClient(app) as client:
        title = f"teacher-research-harness-{uuid4().hex[:8]}"
        created = client.post(
            "/api/v1/teacher/research/projects",
            headers=TEACHER_HEADERS,
            json={
                "course_id": COURSE_ID,
                "title": title,
                "direction": "轻量视觉模型 benchmark 与课堂复现",
                "description": "围绕论文追踪、代码复现和学生阶段材料提交形成教师科研 Harness。",
                "tags": ["人工智能专业", "代码复现", "前沿追踪"],
            },
        )
        assert created.status_code == 201, created.text
        project = created.json()["data"]
        created_ids["project_id"] = project["id"]
        assert project["harness"]["guardrails"]
        assert project["external_sources"][0]["url"].startswith("https://arxiv.org/")
        assert project["publish_scope"]["basis"].startswith("发布对象由绑定课程")
        assert project["publish_scope"]["classes"][0]["class_id"] == "class_se_001"
        assert project["publish_scope"]["classes"][0]["students"][0]["student_id"] == "user_student_001"

        frontier = client.post(
            f"/api/v1/teacher/research/projects/{project['id']}/frontier-track",
            headers=TEACHER_HEADERS,
            json={"focus": "轻量视觉模型 benchmark 2026"},
        )
        assert frontier.status_code == 200, frontier.text
        frontier_project = frontier.json()["data"]["project"]
        assert frontier_project["frontier_topics"][0]["source_url"].startswith("https://arxiv.org/")
        assert any(source["platform"] == "papers_with_code" for source in frontier_project["external_sources"])

        material = client.post(
            f"/api/v1/teacher/research/projects/{project['id']}/materials",
            headers=TEACHER_HEADERS,
            json={
                "material_type": "FRONTIER_LINK",
                "title": "前沿论文检索入口",
                "description": "给学生补充论文和 benchmark 跳转。",
                "content": "本阶段关注论文摘要、代码仓库和数据集说明。",
                "external_url": "https://paperswithcode.com/",
            },
        )
        assert material.status_code == 201, material.text
        assert material.json()["data"]["project"]["stats"]["material_count"] == 1

        upload = client.post(
            f"/api/v1/teacher/research/projects/{project['id']}/materials/upload",
            headers=TEACHER_HEADERS,
            data={
                "title": "baseline 复现实验脚本",
                "description": "学生可基于该脚本补充实验记录。",
                "material_type": "CODE_FILE",
            },
            files={"file": ("baseline.py", b"print('baseline')\n", "text/x-python")},
        )
        assert upload.status_code == 201, upload.text
        uploaded_material = upload.json()["data"]["material"]

        download = client.get(uploaded_material["download_url"], headers=TEACHER_HEADERS)
        assert download.status_code == 200
        assert download.content == b"print('baseline')\n"

        published = client.post(
            f"/api/v1/teacher/research/projects/{project['id']}/publish",
            headers=TEACHER_HEADERS,
            json={"class_ids": ["class_se_001"]},
        )
        assert published.status_code == 200, published.text
        published_data = published.json()["data"]
        created_ids["student_project_id"] = published_data["student_project_id"]
        assert published_data["project"]["status"] == "PUBLISHED"
        assert published_data["created_enrollments"] >= 1

        student_detail = client.get(
            f"/api/v1/student/practice-projects/{published_data['student_project_id']}",
            headers=STUDENT_HEADERS,
        )
        assert student_detail.status_code == 200, student_detail.text
        student_project = student_detail.json()["data"]
        assert student_project["project"]["title"] == title
        assert student_project["research_brief"]["external_sources"][0]["url"].startswith("https://arxiv.org/")
        assert "代码/Notebook/实验文件" in student_project["submission_requirements"]

        student_submission = client.post(
            f"/api/v1/student/practice-projects/{published_data['student_project_id']}/submissions",
            headers=STUDENT_HEADERS,
            json={
                "title": "P1 论文追踪与代码复现实验",
                "description": "提交 baseline 运行记录和论文阅读摘要。",
                "materials": ["baseline.py", "论文阅读摘要"],
                "note": "当前实验可复现，下一步补充 benchmark 对照。",
            },
        )
        assert student_submission.status_code == 201, student_submission.text
        submission_id = student_submission.json()["data"]["submission"]["id"]

        reviewed = client.post(
            f"/api/v1/teacher/research/projects/{project['id']}/submissions/{submission_id}/review",
            headers=TEACHER_HEADERS,
            json={"status": "APPROVED", "comment": "材料可复查，继续补充 benchmark 对照。"},
        )
        assert reviewed.status_code == 200, reviewed.text
        assert reviewed.json()["data"]["submission"]["status"] == "APPROVED"
        assert reviewed.json()["data"]["submission"]["review_comment"] == "材料可复查，继续补充 benchmark 对照。"

        archived = client.post(f"/api/v1/teacher/research/projects/{project['id']}/archive", headers=TEACHER_HEADERS)
        assert archived.status_code == 200, archived.text
        archived_data = archived.json()["data"]
        created_ids["resource_id"] = archived_data["resource_id"]
        assert archived_data["project"]["status"] == "ARCHIVED"
        assert archived_data["resource_id"].startswith("research_resource_")
