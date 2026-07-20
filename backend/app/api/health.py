from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db

router = APIRouter(tags=["health"])


class ResponseMeta(BaseModel):
    request_id: str


class HealthData(BaseModel):
    status: str


class HealthResponse(BaseModel):
    data: HealthData
    meta: ResponseMeta


class ReadyDependencies(BaseModel):
    database: str


class ReadyData(BaseModel):
    status: str
    dependencies: ReadyDependencies


class ReadyResponse(BaseModel):
    data: ReadyData
    meta: ResponseMeta


@router.get("/health", response_model=HealthResponse)
def health():
    return ok({"status": "ok"})


@router.get("/ready", response_model=ReadyResponse)
def ready(db: Session = Depends(get_db)):
    try:
        db.execute(text("select 1"))
    except SQLAlchemyError as exc:
        raise ApiError(
            503,
            "SYSTEM_DEPENDENCY_UNAVAILABLE",
            "数据库依赖不可用",
            {"dependency": "database", "error": type(exc).__name__},
        ) from exc
    return ok({"status": "ready", "dependencies": {"database": "ok"}})
