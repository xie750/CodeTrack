from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.core.api_response import ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user
from backend.app.models import User
from backend.app.services.authoritative_knowledge import (
    add_authoritative_source,
    get_authoritative_kb,
    list_authoritative_kbs,
    publish_authoritative_kb,
    query_authoritative,
    require_admin,
    retrieve_authoritative,
    review_source,
    seed_machine_learning_authority,
    serialize_kb,
    serialize_source,
)


router = APIRouter(prefix="/api/v1/admin/ai/authoritative-knowledge", tags=["admin-authoritative-knowledge"])


class SourceCreate(BaseModel):
    authoritative_kb_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=255)
    source_kind: str = Field(default="教师审定讲义", min_length=1, max_length=40)
    publisher: str = Field(min_length=1, max_length=160)
    source_url: str = ""
    license_note: str = ""
    chapter: str = Field(default="", max_length=160)
    knowledge_points: list[str] = Field(default_factory=list)
    source_summary: str = ""
    content: str = Field(min_length=1)
    auto_review: bool = False


class RetrieveRequest(BaseModel):
    query: str = Field(min_length=1)


@router.post("/seed-machine-learning")
def seed_machine_learning(db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    kb = seed_machine_learning_authority(db, user)
    return ok(serialize_kb(db, kb))


@router.get("")
def list_items(db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    items = [serialize_kb(db, kb) for kb in list_authoritative_kbs(db)]
    return ok({"items": items})


@router.get("/{kb_id}")
def detail(kb_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    return ok(serialize_kb(db, get_authoritative_kb(db, kb_id)))


@router.post("/sources")
def create_source(payload: SourceCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    source = add_authoritative_source(
        db,
        user,
        akb_id=payload.authoritative_kb_id,
        title=payload.title,
        source_kind=payload.source_kind,
        publisher=payload.publisher,
        source_url=payload.source_url,
        license_note=payload.license_note,
        chapter=payload.chapter,
        knowledge_points=payload.knowledge_points,
        source_summary=payload.source_summary,
        content=payload.content,
        auto_review=payload.auto_review,
    )
    return ok(serialize_source(db, source))


@router.post("/sources/{source_id}/review")
def review(source_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    source = review_source(db, user, source_id)
    return ok(serialize_source(db, source))


@router.post("/{kb_id}/publish")
def publish(kb_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    kb = publish_authoritative_kb(db, user, kb_id)
    return ok(serialize_kb(db, kb))


@router.post("/{kb_id}/retrieve")
def retrieve(kb_id: str, payload: RetrieveRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    return ok(retrieve_authoritative(db, kb_id, payload.query))


@router.post("/{kb_id}/rag/query")
def query(kb_id: str, payload: RetrieveRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_admin(user)
    result: dict[str, Any] = query_authoritative(db, kb_id, payload.query)
    return ok(result)
