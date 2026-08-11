from pathlib import Path
import re
import shutil
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuditLog, Course, Material, User


router = APIRouter(prefix="/api/v1")
UPLOAD_ROOT = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
ALLOWED_SUFFIXES = {".pdf", ".ppt", ".pptx", ".doc", ".docx", ".csv", ".xlsx", ".mp4", ".txt"}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024


def teacher_user(
    x_user_id: str = Header(default="teacher-01"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=403, detail="Teacher permission required")
    return user


def safe_name(filename: str) -> str:
    name = Path(filename).name
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)


@router.post("/teacher/materials/upload", status_code=201)
def upload_material(
    course_id: str = Form(...),
    chapter_label: str = Form(default="Uncategorized"),
    visibility: str = Form(default="teacher"),
    file: UploadFile = File(...),
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    course = db.get(Course, course_id)
    if not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Course not found")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    stored_name = f"{uuid.uuid4().hex}-{safe_name(file.filename or 'material')}"
    target = UPLOAD_ROOT / stored_name
    size = 0
    with target.open("wb") as output:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                output.close()
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File exceeds 200 MB")
            output.write(chunk)

    item = Material(
        id=f"material-{uuid.uuid4().hex[:10]}",
        course_id=course_id,
        title=file.filename or "material",
        type=suffix.lstrip(".") or "file",
        chapter_label=chapter_label,
        size=f"{size / 1024 / 1024:.1f} MB",
        visibility=visibility,
        status="ready",
        content_url=f"/api/v1/material-files/{stored_name}",
    )
    db.add(item)
    db.add(AuditLog(actor_id=teacher.id, action="material.upload", resource_type="material", resource_id=item.id, detail=item.title))
    db.commit()
    return {
        "data": {
            "id": item.id,
            "title": item.title,
            "status": item.status,
            "size": item.size,
            "content_url": item.content_url,
        }
    }


@router.get("/material-files/{stored_name}")
def download_material(
    stored_name: str,
    x_user_id: str = Header(default="teacher-01"),
    db: Session = Depends(get_db),
):
    user = db.get(User, x_user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    clean_name = safe_name(stored_name)
    target = (UPLOAD_ROOT / clean_name).resolve()
    if target.parent != UPLOAD_ROOT.resolve() or not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    material = db.query(Material).filter(Material.content_url == f"/api/v1/material-files/{clean_name}").first()
    if not material or material.status == "deleted" or material.status.startswith("folder_deleted|"):
        raise HTTPException(status_code=404, detail="Material not found")
    if user.role == "student" and material.visibility != "students":
        raise HTTPException(status_code=403, detail="Material is not visible to students")
    return FileResponse(target, filename=material.title)
