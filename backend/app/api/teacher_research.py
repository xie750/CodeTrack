from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.core.api_response import ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import User
from backend.app.services.teacher_research import (
    archive_to_course_resource,
    create_material,
    create_teacher_research_project,
    get_teacher_research_project,
    list_teacher_research_projects,
    material_file,
    publish_to_students,
    refresh_frontier,
    review_submission,
    upload_material_file,
)


router = APIRouter(prefix="/api/v1/teacher/research", tags=["teacher-research"])


class TeacherResearchProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    direction: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=3000)
    course_id: str | None = None
    tags: list[str] = Field(default_factory=list)


class TeacherResearchFrontierRequest(BaseModel):
    focus: str = Field(default="", max_length=120)


class TeacherResearchMaterialRequest(BaseModel):
    material_type: str = Field(default="NOTE", max_length=40)
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=3000)
    content: str = Field(default="", max_length=200_000)
    external_url: str = Field(default="", max_length=1000)


class TeacherResearchSubmissionReview(BaseModel):
    status: str = Field(default="APPROVED", max_length=30)
    comment: str = Field(default="", max_length=3000)


class TeacherResearchPublishRequest(BaseModel):
    class_ids: list[str] | None = None


def _teacher(user: User) -> User:
    require_role(user, "TEACHER")
    return user


@router.get("/projects")
def teacher_research_projects(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    result = list_teacher_research_projects(db, _teacher(user))
    db.commit()
    return ok(result)


@router.post("/projects", status_code=status.HTTP_201_CREATED)
def teacher_research_create_project(
    payload: TeacherResearchProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    result = create_teacher_research_project(
        db,
        _teacher(user),
        title=payload.title,
        direction=payload.direction,
        description=payload.description,
        course_id=payload.course_id,
        tags=payload.tags,
    )
    db.commit()
    return ok(result)


@router.get("/projects/{project_id}")
def teacher_research_project_detail(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return ok(get_teacher_research_project(db, _teacher(user), project_id))


@router.post("/projects/{project_id}/frontier-track")
def teacher_research_refresh_frontier(
    project_id: str,
    payload: TeacherResearchFrontierRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    result = refresh_frontier(db, _teacher(user), project_id, payload.focus)
    db.commit()
    return ok(result)


@router.post("/projects/{project_id}/materials", status_code=status.HTTP_201_CREATED)
def teacher_research_create_material(
    project_id: str,
    payload: TeacherResearchMaterialRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    result = create_material(
        db,
        _teacher(user),
        project_id,
        material_type=payload.material_type,
        title=payload.title,
        description=payload.description,
        content=payload.content,
        external_url=payload.external_url,
    )
    db.commit()
    return ok(result)


@router.post("/projects/{project_id}/materials/upload", status_code=status.HTTP_201_CREATED)
async def teacher_research_upload_material(
    project_id: str,
    material_type: str = Form(default="CODE_FILE"),
    title: str = Form(default=""),
    description: str = Form(default=""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    content = await file.read()
    result = upload_material_file(
        db,
        _teacher(user),
        project_id,
        material_type=material_type,
        title=title,
        description=description,
        content=content,
        file_name=file.filename,
        mime_type=file.content_type,
    )
    db.commit()
    return ok(result)


@router.get("/projects/{project_id}/materials/{material_id}/download")
def teacher_research_download_material(
    project_id: str,
    material_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    material = material_file(db, _teacher(user), project_id, material_id)
    return FileResponse(material.storage_path, filename=material.file_name or material.title, media_type=material.mime_type)


@router.post("/projects/{project_id}/publish")
def teacher_research_publish(
    project_id: str,
    payload: TeacherResearchPublishRequest | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    result = publish_to_students(db, _teacher(user), project_id, class_ids=payload.class_ids if payload else None)
    db.commit()
    return ok(result)


@router.post("/projects/{project_id}/submissions/{submission_id}/review")
def teacher_research_review_submission(
    project_id: str,
    submission_id: str,
    payload: TeacherResearchSubmissionReview,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    result = review_submission(db, _teacher(user), project_id, submission_id, status=payload.status, comment=payload.comment)
    db.commit()
    return ok(result)


@router.post("/projects/{project_id}/archive")
def teacher_research_archive(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    result = archive_to_course_resource(db, _teacher(user), project_id)
    db.commit()
    return ok(result)
