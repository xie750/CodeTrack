from __future__ import annotations

from backend.app.core.database import SessionLocal
from backend.app.services.rag.documents import ingest_document_version
from backend.app.workers.celery_app import celery_app


class _EagerTask:
    def delay(self, document_id: str, version_id: str):
        ingest_document_version_task(document_id, version_id)

        class Result:
            id = "eager"

        return Result()


if celery_app is not None:

    @celery_app.task(name="rag.ingest_document_version")
    def ingest_document_version_task(document_id: str, version_id: str) -> None:
        db = SessionLocal()
        try:
            ingest_document_version(db, document_id, version_id)
        finally:
            db.close()

else:

    def ingest_document_version_task(document_id: str, version_id: str) -> None:
        db = SessionLocal()
        try:
            ingest_document_version(db, document_id, version_id)
        finally:
            db.close()

    ingest_document_version_task.delay = _EagerTask().delay  # type: ignore[attr-defined]
