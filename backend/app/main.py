from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.app.api import (
    auth,
    executions,
    health,
    student,
    tasks,
    teacher,
    teacher_ai_review,
    teacher_analytics,
    teacher_improvement,
    versions,
)
from backend.app.core.api_response import ApiError, api_error_handler
from backend.app.core.database import SessionLocal, engine
from backend.app.models import Base
from backend.app.services.seed import seed_demo_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_demo_data(db)
    finally:
        db.close()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="CodeTrack Demo V0.1", version="0.1.0", lifespan=lifespan)
    app.add_exception_handler(ApiError, api_error_handler)
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(tasks.router)
    app.include_router(student.router)
    app.include_router(executions.router)
    app.include_router(versions.router)
    app.include_router(teacher.router)
    app.include_router(teacher_ai_review.router)
    app.include_router(teacher_analytics.router)
    app.include_router(teacher_improvement.router)

    return app


app = create_app()
