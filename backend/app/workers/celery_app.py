from __future__ import annotations

from backend.app.core.config import get_settings


settings = get_settings()

try:
    from celery import Celery
except ImportError:  # pragma: no cover - only used before dependencies are installed
    Celery = None  # type: ignore[assignment]


if Celery is not None:
    celery_app = Celery(
        "codetrack_rag",
        broker=settings.redis_url,
        backend=settings.redis_url,
        include=["backend.app.workers.tasks.ingest_document"],
    )
    celery_app.conf.update(
        task_track_started=True,
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        task_always_eager=settings.rag_celery_task_always_eager,
        task_eager_propagates=True,
    )
else:
    celery_app = None
