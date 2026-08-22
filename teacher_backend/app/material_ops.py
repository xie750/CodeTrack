import re
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuditLog, Chapter, Course, KnowledgePoint, Material, MaterialKnowledgeLink, User
router = APIRouter(prefix="/api/v1/teacher/materials")


class MaterialUpdate(BaseModel):
    visibility: str | None = None
    status: str | None = None


class MaterialGraphImport(BaseModel):
    knowledge_point_ids: list[str] = []
    create_from_material: bool = False


def teacher_user(
    x_user_id: str = Header(default="teacher-01"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=403, detail="Teacher permission required")
    return user


def owned_material(db: Session, teacher: User, material_id: str) -> Material:
    item = db.get(Material, material_id)
    course = db.get(Course, item.course_id) if item else None
    if not item or not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Material not found")
    return item


def serialize_material(item: Material) -> dict:
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


def material_knowledge_points(db: Session, material_id: str) -> list[dict]:
    rows = db.execute(
        select(KnowledgePoint.id, KnowledgePoint.name)
        .join(MaterialKnowledgeLink, MaterialKnowledgeLink.knowledge_point_id == KnowledgePoint.id)
        .where(MaterialKnowledgeLink.material_id == material_id)
        .order_by(KnowledgePoint.name)
    ).all()
    return [{"id": row.id, "name": row.name} for row in rows]


@router.get("/trash")
def list_trash_materials(
    course_id: str,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    course = db.get(Course, course_id)
    if not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Course not found")
    items = db.scalars(
        select(Material)
        .where(Material.course_id == course_id, Material.status == "deleted")
        .order_by(Material.updated_at.desc())
    ).all()
    return {"data": [{**serialize_material(item), "knowledge_points": material_knowledge_points(db, item.id)} for item in items]}


@router.post("/{material_id}/knowledge-graph")
def import_material_to_knowledge_graph(
    material_id: str,
    payload: MaterialGraphImport,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    item = owned_material(db, teacher, material_id)
    if item.status == "deleted" or item.status.startswith("folder_deleted|"):
        raise HTTPException(status_code=409, detail="Deleted material cannot be imported")

    course_points = db.scalars(
        select(KnowledgePoint)
        .join(Chapter)
        .where(Chapter.course_id == item.course_id)
    ).all()
    points_by_id = {point.id: point for point in course_points}
    invalid_ids = [point_id for point_id in payload.knowledge_point_ids if point_id not in points_by_id]
    if invalid_ids:
        raise HTTPException(status_code=422, detail="Knowledge point does not belong to this course")

    linked_ids = list(dict.fromkeys(payload.knowledge_point_ids))
    created_node = None
    if payload.create_from_material:
        title = re.sub(r"\.[A-Za-z0-9]{1,6}$", "", item.title).strip() or item.title
        created_node = next((point for point in course_points if point.name == title), None)
        if created_node is None:
            chapters = db.scalars(
                select(Chapter)
                .where(Chapter.course_id == item.course_id)
                .order_by(Chapter.position)
            ).all()
            if not chapters:
                raise HTTPException(status_code=422, detail="Course has no chapter")
            chapter = next((row for row in chapters if row.title in item.chapter_label or item.chapter_label in row.title), chapters[0])
            created_node = KnowledgePoint(
                id=f"kp-material-{uuid.uuid4().hex[:10]}",
                chapter_id=chapter.id,
                name=title[:120],
                description=f"由教学资料《{item.title}》导入生成，可在知识图谱中查看关联资料。",
                difficulty="基础",
                mastery=0,
                position_x=35 + len(course_points) * 13 % 55,
                position_y=30 + len(course_points) * 17 % 55,
            )
            db.add(created_node)
            db.flush()
        if created_node.id not in linked_ids:
            linked_ids.append(created_node.id)

    if not linked_ids:
        raise HTTPException(status_code=422, detail="Select at least one knowledge point or create a new one")

    db.execute(delete(MaterialKnowledgeLink).where(MaterialKnowledgeLink.material_id == item.id))
    for point_id in linked_ids:
        db.add(MaterialKnowledgeLink(material_id=item.id, knowledge_point_id=point_id))
    item.citations = len(linked_ids)
    db.add(AuditLog(
        actor_id=teacher.id,
        action="material.knowledge_graph.import",
        resource_type="material",
        resource_id=item.id,
        detail="|".join(linked_ids),
    ))
    db.commit()
    return {
        "data": {
            "material_id": item.id,
            "linked_count": len(linked_ids),
            "created_node_id": created_node.id if created_node else None,
            "knowledge_points": material_knowledge_points(db, item.id),
        }
    }


@router.patch("/{material_id}")
def update_material(
    material_id: str,
    payload: MaterialUpdate,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    item = owned_material(db, teacher, material_id)
    if payload.visibility is not None:
        if payload.visibility not in {"teacher", "students"}:
            raise HTTPException(status_code=422, detail="Invalid visibility")
        item.visibility = payload.visibility
    if payload.status is not None:
        if payload.status not in {"ready", "disabled"}:
            raise HTTPException(status_code=422, detail="Invalid status")
        item.status = payload.status
    db.add(AuditLog(actor_id=teacher.id, action="material.update", resource_type="material", resource_id=item.id, detail=f"{item.visibility}:{item.status}"))
    db.commit()
    return {"data": {"id": item.id, "visibility": item.visibility, "status": item.status}}


@router.delete("/{material_id}")
def delete_material(
    material_id: str,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    item = owned_material(db, teacher, material_id)
    if item.status == "deleted":
        return {"data": serialize_material(item)}
    item.status = "deleted"
    db.add(AuditLog(actor_id=teacher.id, action="material.trash", resource_type="material", resource_id=material_id, detail=item.title))
    db.commit()
    db.refresh(item)
    return {"data": serialize_material(item)}


@router.post("/{material_id}/restore")
def restore_material(
    material_id: str,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    item = owned_material(db, teacher, material_id)
    if item.status != "deleted":
        return {"data": serialize_material(item)}
    item.status = "ready"
    db.add(AuditLog(actor_id=teacher.id, action="material.restore", resource_type="material", resource_id=material_id, detail=item.title))
    db.commit()
    db.refresh(item)
    return {"data": serialize_material(item)}


