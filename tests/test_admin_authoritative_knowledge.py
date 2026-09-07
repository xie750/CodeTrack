from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import AuthoritativeKnowledgeSource, RagChunk, RagDocument


def admin_client() -> TestClient:
    test_client = TestClient(app)
    test_client.headers.update({"X-Demo-User-Id": "user_admin_001"})
    return test_client


def test_seed_machine_learning_authority_ingests_rag_documents_and_retrieves():
    with admin_client() as client:
        seeded = client.post("/api/v1/admin/ai/authoritative-knowledge/seed-machine-learning")
        assert seeded.status_code == 200, seeded.text
        kb = seeded.json()["data"]
        assert kb["course_name"] == "机器学习"
        assert kb["status"] == "READY_TO_PUBLISH"
        assert kb["source_count"] >= 4
        assert kb["chunk_count"] >= 4
        assert kb["citation_pass_rate"] >= 90

        db = SessionLocal()
        try:
            sources = list(db.scalars(select(AuthoritativeKnowledgeSource)).all())
            assert sources
            assert all(source.rag_document_id for source in sources)
            document_ids = [source.rag_document_id for source in sources if source.rag_document_id]
            ready_docs = list(db.scalars(select(RagDocument).where(RagDocument.id.in_(document_ids))).all())
            assert ready_docs
            assert all(document.status == "READY" and document.active_version_id for document in ready_docs)
            chunk_count = db.scalar(
                select(RagChunk)
                .where(RagChunk.document_id.in_(document_ids), RagChunk.chunk_type == "child")
                .limit(1)
            )
            assert chunk_count is not None
        finally:
            db.close()

        retrieved = client.post(
            f"/api/v1/admin/ai/authoritative-knowledge/{kb['id']}/retrieve",
            json={"query": "过拟合 正则化 验证集"},
        )
        assert retrieved.status_code == 200, retrieved.text
        results = retrieved.json()["data"]["results"]
        assert results
        assert results[0]["source"]["publisher"] in {
            "Google Developers",
            "MIT OpenCourseWare",
            "Stanford University CS229",
            "scikit-learn",
        }

        rag = client.post(
            f"/api/v1/admin/ai/authoritative-knowledge/{kb['id']}/rag/query",
            json={"query": "过拟合和正则化有什么关系？"},
        )
        assert rag.status_code == 200, rag.text
        rag_data = rag.json()["data"]
        assert rag_data["citations"]
        assert rag_data["citations"][0]["source_kind"] == "PLATFORM_AUTHORITATIVE"
        assert rag_data["citations"][0]["trust_level"] == "AUTHORITATIVE"

        published = client.post(f"/api/v1/admin/ai/authoritative-knowledge/{kb['id']}/publish")
        assert published.status_code == 200, published.text
        assert published.json()["data"]["status"] == "PUBLISHED"


def test_authoritative_knowledge_requires_admin_role():
    with TestClient(app) as client:
        client.headers.update({"X-Demo-User-Id": "user_student_001"})
        response = client.get("/api/v1/admin/ai/authoritative-knowledge")
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "AUTH_FORBIDDEN"
