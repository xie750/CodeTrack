import uuid
import re

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import ForeignKey, Integer, String, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .database import Base, get_db
from .models import AuditLog, Chapter, Course, Material, User


class MaterialFolder(Base):
    __tablename__ = "material_folders"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    position: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(20), default="manual")


router = APIRouter(prefix="/api/v1/teacher/material-folders")


class FolderCreate(BaseModel):
    course_id: str
    name: str = Field(min_length=1, max_length=160)
    parent_id: str | None = None


class OutlineRequest(BaseModel):
    course_id: str


class OutlineConfirm(BaseModel):
    course_id: str
    folders: list[str]


class DeletedFolderMaterialKeep(BaseModel):
    target_folder_id: str | None = None


def teacher_user(
    x_user_id: str = Header(default="teacher-01"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=403, detail="Teacher permission required")
    return user


def owned_course(db: Session, teacher: User, course_id: str) -> Course:
    course = db.get(Course, course_id)
    if not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def serialize_folder(item: MaterialFolder):
    return {
        "id": item.id,
        "course_id": item.course_id,
        "parent_id": item.parent_id,
        "name": item.name,
        "position": item.position,
        "source": item.source,
    }


def serialize_folder_material(item: Material) -> dict:
    return {
        "id": item.id,
        "course_id": item.course_id,
        "title": item.title,
        "type": item.type,
        "chapter": item.chapter_label,
        "size": item.size,
        "visibility": item.visibility,
        "status": item.status,
        "citations": item.citations,
        "content_url": item.content_url,
        "updated_at": item.updated_at.isoformat(),
    }


def folder_key(value: str) -> str:
    value = re.sub(r"^第\s*[一二三四五六七八九十百\d]+\s*章\s*", "", value)
    value = re.sub(r"^\s*\d+(?:\.\d+)*[.、]?\s*", "", value)
    value = re.sub(r"资料|目录|[\s_-]", "", value)
    return value.lower()


def material_belongs_to_folder(material: Material, folder: MaterialFolder) -> bool:
    folder_name = folder_key(folder.name)
    chapter_name = folder_key(material.chapter_label or "")
    if not folder_name or not chapter_name:
        return False
    return folder_name in chapter_name or chapter_name in folder_name


def folder_materials(db: Session, folder: MaterialFolder) -> list[Material]:
    rows = db.scalars(select(Material).where(Material.course_id == folder.course_id)).all()
    return [item for item in rows if material_belongs_to_folder(item, folder)]


def is_deleted_folder(item: MaterialFolder) -> bool:
    return item.source.startswith("deleted|")


def restore_folder_source(item: MaterialFolder) -> None:
    item.source = item.source.split("|", 1)[1] if is_deleted_folder(item) else item.source


@router.get("")
def list_folders(
    course_id: str,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    owned_course(db, teacher, course_id)
    items = db.scalars(
        select(MaterialFolder)
        .where(
            MaterialFolder.course_id == course_id,
            ~MaterialFolder.source.startswith("deleted|"),
            MaterialFolder.name != "回收站",
        )
        .order_by(MaterialFolder.position, MaterialFolder.name)
    ).all()
    return {"data": [serialize_folder(item) for item in items]}


@router.get("/trash")
def list_deleted_folders(
    course_id: str,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    owned_course(db, teacher, course_id)
    items = db.scalars(
        select(MaterialFolder)
        .where(
            MaterialFolder.course_id == course_id,
            MaterialFolder.source.startswith("deleted|"),
        )
        .order_by(MaterialFolder.position, MaterialFolder.name)
    ).all()
    data = []
    for item in items:
        materials = folder_materials(db, item)
        data.append({
            **serialize_folder(item),
            "material_count": len(materials),
            "materials": [serialize_folder_material(material) for material in materials],
        })
    return {"data": data}


@router.post("", status_code=201)
def create_folder(
    payload: FolderCreate,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    owned_course(db, teacher, payload.course_id)
    position = len(db.scalars(select(MaterialFolder).where(MaterialFolder.course_id == payload.course_id)).all()) + 1
    item = MaterialFolder(
        id=f"folder-{uuid.uuid4().hex[:10]}",
        course_id=payload.course_id,
        parent_id=payload.parent_id,
        name=payload.name,
        position=position,
        source="manual",
    )
    db.add(item)
    db.add(AuditLog(actor_id=teacher.id, action="material_folder.create", resource_type="material_folder", resource_id=item.id, detail=item.name))
    db.commit()
    return {"data": serialize_folder(item)}


@router.delete("/{folder_id}")
def delete_folder(
    folder_id: str,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    item = db.get(MaterialFolder, folder_id)
    if not item:
        raise HTTPException(status_code=404, detail="Material folder not found")
    owned_course(db, teacher, item.course_id)
    materials = folder_materials(db, item)
    active_materials = [
        material
        for material in materials
        if material.status != "deleted" and not material.status.startswith("folder_deleted|")
    ]
    if not materials:
        name = item.name
        db.delete(item)
        db.add(AuditLog(actor_id=teacher.id, action="material_folder.delete_empty", resource_type="material_folder", resource_id=folder_id, detail=name))
        db.commit()
        return {"data": {"id": folder_id, "mode": "permanent", "material_count": 0}}

    if not is_deleted_folder(item):
        item.source = f"deleted|{item.source}"
    for material in active_materials:
        material.status = f"folder_deleted|{material.status}"
    db.add(AuditLog(actor_id=teacher.id, action="material_folder.trash", resource_type="material_folder", resource_id=folder_id, detail=f"{item.name}:{len(materials)}"))
    db.commit()
    return {"data": {**serialize_folder(item), "mode": "trash", "material_count": len(materials)}}


@router.post("/{folder_id}/restore")
def restore_folder(
    folder_id: str,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    item = db.get(MaterialFolder, folder_id)
    if not item:
        raise HTTPException(status_code=404, detail="Material folder not found")
    owned_course(db, teacher, item.course_id)
    restore_folder_source(item)
    restored_count = 0
    for material in folder_materials(db, item):
        if material.status.startswith("folder_deleted|"):
            material.status = material.status.split("|", 1)[1]
            restored_count += 1
    db.add(AuditLog(actor_id=teacher.id, action="material_folder.restore", resource_type="material_folder", resource_id=folder_id, detail=f"{item.name}:{restored_count}"))
    db.commit()
    return {"data": {**serialize_folder(item), "material_count": restored_count}}


@router.post("/{folder_id}/materials/{material_id}/keep")
def keep_deleted_folder_material(
    folder_id: str,
    material_id: str,
    payload: DeletedFolderMaterialKeep,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    folder = db.get(MaterialFolder, folder_id)
    material = db.get(Material, material_id)
    if not folder or not is_deleted_folder(folder):
        raise HTTPException(status_code=404, detail="Deleted material folder not found")
    owned_course(db, teacher, folder.course_id)
    if not material or material.course_id != folder.course_id or not material_belongs_to_folder(material, folder):
        raise HTTPException(status_code=404, detail="Material is not in this deleted folder")
    if not material.status.startswith("folder_deleted|"):
        raise HTTPException(status_code=409, detail="Material is not deleted with this folder")

    target_name = "未分类资料"
    target_folder = None
    if payload.target_folder_id:
        target_folder = db.get(MaterialFolder, payload.target_folder_id)
        if (
            not target_folder
            or target_folder.course_id != folder.course_id
            or is_deleted_folder(target_folder)
            or target_folder.id == folder.id
        ):
            raise HTTPException(status_code=422, detail="Target material folder is unavailable")
        target_name = target_folder.name

    material.chapter_label = target_name
    material.status = material.status.split("|", 1)[1]
    db.flush()
    remaining_count = len(folder_materials(db, folder))
    folder_removed = remaining_count == 0
    if folder_removed:
        db.delete(folder)
    db.add(AuditLog(
        actor_id=teacher.id,
        action="material_folder.material.keep",
        resource_type="material",
        resource_id=material.id,
        detail=f"{folder.name}->{target_name}",
    ))
    db.commit()
    return {
        "data": {
            "material": serialize_folder_material(material),
            "target_folder_id": target_folder.id if target_folder else None,
            "target_folder_name": target_name,
            "remaining_count": remaining_count,
            "folder_removed": folder_removed,
        }
    }


@router.post("/ai-outline")
def generate_outline_candidates(
    payload: OutlineRequest,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    owned_course(db, teacher, payload.course_id)
    chapters = db.scalars(
        select(Chapter)
        .where(Chapter.course_id == payload.course_id)
        .order_by(Chapter.position)
    ).all()
    candidates = [chapter.title for chapter in chapters]
    candidates.extend(["实验指导", "参考资料"])
    return {
        "data": {
            "candidates": candidates,
            "generator": "course_outline_rule",
            "requires_teacher_confirmation": True,
        }
    }


@router.post("/confirm-outline")
def confirm_outline(
    payload: OutlineConfirm,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    owned_course(db, teacher, payload.course_id)
    existing = {
        item.name: item
        for item in db.scalars(
            select(MaterialFolder).where(MaterialFolder.course_id == payload.course_id)
        ).all()
    }
    created = []
    for position, name in enumerate(payload.folders, 1):
        if name in existing:
            item = existing[name]
            if is_deleted_folder(item):
                restore_folder_source(item)
                for material in folder_materials(db, item):
                    if material.status.startswith("folder_deleted|"):
                        material.status = material.status.split("|", 1)[1]
            item.position = position
        else:
            item = MaterialFolder(
                id=f"folder-{uuid.uuid4().hex[:10]}",
                course_id=payload.course_id,
                name=name,
                position=position,
                source="ai_confirmed",
            )
            db.add(item)
            created.append(item)
    db.add(AuditLog(actor_id=teacher.id, action="material_folder.ai_outline.confirm", resource_type="course", resource_id=payload.course_id, detail="|".join(payload.folders)))
    db.commit()
    items = db.scalars(
        select(MaterialFolder)
        .where(
            MaterialFolder.course_id == payload.course_id,
            ~MaterialFolder.source.startswith("deleted|"),
            MaterialFolder.name != "回收站",
        )
        .order_by(MaterialFolder.position)
    ).all()
    return {"data": {"created": len(created), "folders": [serialize_folder(item) for item in items]}}


