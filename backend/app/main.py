from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.app.api import executions, health, tasks, teacher, versions
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
    app.include_router(tasks.router)
    app.include_router(executions.router)
    app.include_router(versions.router)
    app.include_router(teacher.router)

    return app


app = create_app()
