from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from backend.app.api import (
    admin_authoritative_knowledge,
    admin_ai_usage,
    auth,
    executions,
    health,
    rag,
    student,
    tasks,
    teacher,
    teacher_ai_review,
    teacher_analytics,
    teacher_courses,
    teacher_improvement,
    teacher_monitor,
    teacher_research,
    teacher_resources,
    teacher_submissions,
    teacher_tasks,
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
    app.include_router(admin_authoritative_knowledge.router)
    app.include_router(admin_ai_usage.router)
    app.include_router(rag.router)
    app.include_router(auth.router)
    app.include_router(tasks.router)
    app.include_router(student.router)
    app.include_router(executions.router)
    app.include_router(versions.router)
    app.include_router(teacher.router)
    app.include_router(teacher_ai_review.router)
    app.include_router(teacher_analytics.router)
    app.include_router(teacher_courses.router)
    app.include_router(teacher_improvement.router)
    app.include_router(teacher_monitor.router)
    app.include_router(teacher_research.router)
    app.include_router(teacher_resources.router)
    app.include_router(teacher_submissions.router)
    app.include_router(teacher_tasks.router)

    frontend_dist = Path(__file__).resolve().parents[2] / "dist"
    if frontend_dist.exists():
        from fastapi.staticfiles import StaticFiles
        from starlette.exceptions import HTTPException as StarletteHTTPException

        class SPAStaticFiles(StaticFiles):
            async def get_response(self, path: str, scope: dict[str, Any]):
                try:
                    return await super().get_response(path, scope)
                except StarletteHTTPException as exc:
                    if (
                        exc.status_code == 404
                        and scope.get("method") in {"GET", "HEAD"}
                        and not path.startswith(("api/", "docs", "redoc", "openapi.json"))
                    ):
                        return await super().get_response("index.html", scope)
                    raise

        app.mount("/", SPAStaticFiles(directory=frontend_dist, html=True), name="frontend")

    return app


app = create_app()
