import re
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuditLog, Chapter, Course, KnowledgePoint, User


router = APIRouter(prefix="/api/v1/teacher/knowledge-graph")


class CandidateRequest(BaseModel):
    course_id: str


class CandidateNode(BaseModel):
    name: str
    description: str = ""
    difficulty: str = "基础"


class ConfirmCandidates(BaseModel):
    course_id: str
    candidates: list[CandidateNode]


class NodeUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    difficulty: str = "基础"
    mastery: int = Field(default=0, ge=0, le=100)
    position_x: int = Field(default=50, ge=0, le=100)
    position_y: int = Field(default=50, ge=0, le=100)


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


@router.post("/ai-candidates")
def generate_graph_candidates(
    payload: CandidateRequest,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    owned_course(db, teacher, payload.course_id)
    chapters = db.scalars(
        select(Chapter)
        .where(Chapter.course_id == payload.course_id)
        .order_by(Chapter.position)
    ).all()
    existing = {
        item.name
        for item in db.scalars(
            select(KnowledgePoint)
            .join(Chapter)
            .where(Chapter.course_id == payload.course_id)
        ).all()
    }
    candidates = []
    for chapter in chapters:
        name = re.sub(r"^第\s*\d+\s*章\s*", "", chapter.title).strip()
        if name and name not in existing:
            candidates.append({
                "name": name,
                "description": f"从课程大纲“{chapter.title}”提取的候选知识点。",
                "difficulty": "基础",
            })
    for name in ["递归", "排序算法", "图的遍历"]:
        if name not in existing and not any(item["name"] == name for item in candidates):
            candidates.append({
                "name": name,
                "description": "基于课程大纲与现有知识点关系生成的候选节点。",
                "difficulty": "进阶",
            })
    return {
        "data": {
            "candidates": candidates,
            "generator": "outline_extractor_rule",
            "requires_teacher_confirmation": True,
        }
    }


@router.post("/confirm")
def confirm_graph_candidates(
    payload: ConfirmCandidates,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    owned_course(db, teacher, payload.course_id)
    chapter = db.scalar(
        select(Chapter)
        .where(Chapter.course_id == payload.course_id)
        .order_by(Chapter.position)
    )
    if not chapter:
        raise HTTPException(status_code=422, detail="Course has no chapter")
    existing = {
        item.name
        for item in db.scalars(
            select(KnowledgePoint)
            .join(Chapter)
            .where(Chapter.course_id == payload.course_id)
        ).all()
    }
    created = []
    for index, candidate in enumerate(payload.candidates):
        if candidate.name in existing:
            continue
        item = KnowledgePoint(
            id=f"kp-ai-{uuid.uuid4().hex[:10]}",
            chapter_id=chapter.id,
            name=candidate.name,
            description=candidate.description,
            difficulty=candidate.difficulty,
            mastery=0,
            position_x=20 + (index * 17) % 70,
            position_y=20 + (index * 23) % 65,
        )
        db.add(item)
        created.append(item)
    db.add(AuditLog(actor_id=teacher.id, action="knowledge_graph.ai_candidates.confirm", resource_type="course", resource_id=payload.course_id, detail="|".join(item.name for item in created)))
    db.commit()
    return {"data": {"created": len(created), "ids": [item.id for item in created]}}


@router.put("/nodes/{node_id}")
def update_graph_node(
    node_id: str,
    payload: NodeUpdate,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    item = db.get(KnowledgePoint, node_id)
    chapter = db.get(Chapter, item.chapter_id) if item else None
    if not item or not chapter:
        raise HTTPException(status_code=404, detail="Node not found")
    owned_course(db, teacher, chapter.course_id)
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.add(AuditLog(actor_id=teacher.id, action="knowledge_graph.node.update", resource_type="knowledge_point", resource_id=item.id, detail=item.name))
    db.commit()
    return {
        "data": {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "difficulty": item.difficulty,
            "mastery": item.mastery,
            "x": item.position_x,
            "y": item.position_y,
        }
    }
