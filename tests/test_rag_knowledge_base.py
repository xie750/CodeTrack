from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.app.main import app
from backend.app.core.database import SessionLocal
from backend.app.models import AgentRun, AgentStep, RagChunk, RagDocument, RagDocumentElement
from backend.app.services.rag.documents import ingest_document_version
from backend.app.services.rag.utils import vector_from_db


def client() -> TestClient:
    test_client = TestClient(app)
    test_client.headers.update({"X-Demo-User-Id": "user_student_001"})
    return test_client


def create_ready_kb_with_document(c: TestClient):
    kb = c.post("/api/v1/knowledge-bases", json={"name": "RAG Test KB", "description": "test"})
    assert kb.status_code == 200, kb.text
    kb_id = kb.json()["data"]["id"]
    fixture = Path("tests/fixtures/simple.md")
    with fixture.open("rb") as file:
        upload = c.post("/api/v1/knowledge-bases/{}/documents".format(kb_id), files={"file": ("simple.md", file, "text/markdown")})
    assert upload.status_code == 202, upload.text
    assert upload.json()["data"]["file_profile"]["file_type"] == "markdown"
    document_id = upload.json()["data"]["document_id"]
    status = c.get(f"/api/v1/documents/{document_id}")
    assert status.status_code == 200, status.text
    assert status.json()["data"]["status"] == "ready"
    assert status.json()["data"]["content_profile"]["content_profile"] == "sectioned_note"
    assert status.json()["data"]["chunking_strategy"] == "markdown_section"
    return kb_id, document_id


def test_rag_mvp_e2e_retrieve_rag_and_delete():
    with client() as c:
        kb_id, document_id = create_ready_kb_with_document(c)

        retrieved = c.post(
            f"/api/v1/knowledge-bases/{kb_id}/retrieve",
            json={"query": "文档中的核心概念是什么？", "debug": True},
        )
        assert retrieved.status_code == 200, retrieved.text
        results = retrieved.json()["data"]["results"]
        assert results
        assert results[0]["parent_chunk_id"]
        assert results[0]["file_name"] == "simple.md"
        assert "核心概念" in " ".join(results[0]["heading_path"])

        rag = c.post(
            f"/api/v1/knowledge-bases/{kb_id}/rag/query",
            json={"query": "文档中的核心概念是什么？", "stream": False},
        )
        assert rag.status_code == 200, rag.text
        rag_data = rag.json()["data"]
        assert "[1]" in rag_data["answer"]
        assert rag_data["citations"]
        assert rag_data["citations"][0]["document_name"] == "simple.md"
        assert rag_data["citations"][0]["child_chunk_id"]
        assert rag_data["citations"][0]["parent_chunk_id"]

        db = SessionLocal()
        try:
            document = db.get(RagDocument, document_id)
            assert document is not None
            assert document.active_version_id
            grouped = dict(
                db.execute(
                    select(RagChunk.chunk_type, func.count())
                    .where(RagChunk.document_version_id == document.active_version_id)
                    .group_by(RagChunk.chunk_type)
                ).all()
            )
            assert grouped["parent"] >= 1
            assert grouped["child"] >= 1
            vector = db.scalar(
                select(RagChunk.embedding).where(
                    RagChunk.document_version_id == document.active_version_id,
                    RagChunk.embedding.is_not(None),
                )
            )
            assert len(vector_from_db(vector)) == 1024

            run = db.scalar(
                select(AgentRun)
                .where(
                    AgentRun.workflow_type == "rag_document_ingestion",
                    AgentRun.input_json.contains(document_id),
                )
                .order_by(AgentRun.started_at.desc())
                .limit(1)
            )
            assert run is not None
            assert run.status == "SUCCEEDED"
            step_names = [
                step.step_name
                for step in db.scalars(
                    select(AgentStep).where(AgentStep.run_id == run.id).order_by(AgentStep.step_order)
                ).all()
            ]
            assert step_names == [
                "file_intake_agent",
                "document_parser_agent",
                "content_profile_agent",
                "cleaning_strategy_agent",
                "chunk_planner_agent",
                "chunk_builder_agent",
                "retrieval_quality_agent",
                "embedding_agent",
                "index_agent",
            ]
        finally:
            db.close()

        deleted = c.delete(f"/api/v1/documents/{document_id}")
        assert deleted.status_code == 200, deleted.text
        after_delete = c.post(
            f"/api/v1/knowledge-bases/{kb_id}/retrieve",
            json={"query": "文档中的核心概念是什么？", "debug": True},
        )
        assert after_delete.status_code == 200
        assert after_delete.json()["data"]["results"] == []


def test_ingest_is_idempotent_for_same_version():
    with client() as c:
        _, document_id = create_ready_kb_with_document(c)

    db = SessionLocal()
    try:
        document = db.get(RagDocument, document_id)
        assert document is not None and document.active_version_id
        before_chunks = db.scalar(select(func.count()).select_from(RagChunk).where(RagChunk.document_version_id == document.active_version_id))
        before_elements = db.scalar(select(func.count()).select_from(RagDocumentElement).where(RagDocumentElement.document_version_id == document.active_version_id))
        ingest_document_version(db, document.id, document.active_version_id)
        after_chunks = db.scalar(select(func.count()).select_from(RagChunk).where(RagChunk.document_version_id == document.active_version_id))
        after_elements = db.scalar(select(func.count()).select_from(RagDocumentElement).where(RagDocumentElement.document_version_id == document.active_version_id))
        assert after_chunks == before_chunks
        assert after_elements == before_elements
    finally:
        db.close()


def test_document_can_be_uploaded_then_confirmed_for_processing():
    with client() as c:
        kb = c.post("/api/v1/knowledge-bases", json={"name": "Two Step KB", "description": "test"})
        assert kb.status_code == 200, kb.text
        kb_id = kb.json()["data"]["id"]

        fixture = Path("tests/fixtures/simple.txt")
        with fixture.open("rb") as file:
            upload = c.post(
                f"/api/v1/knowledge-bases/{kb_id}/documents?auto_process=false",
                files={"file": ("simple.txt", file, "text/plain")},
            )
        assert upload.status_code == 202, upload.text
        document_id = upload.json()["data"]["document_id"]

        pending = c.get(f"/api/v1/documents/{document_id}")
        assert pending.status_code == 200, pending.text
        assert pending.json()["data"]["status"] == "uploaded"
        assert pending.json()["data"]["stats"]["children"] == 0

        listed = c.get(f"/api/v1/knowledge-bases/{kb_id}/documents")
        assert listed.status_code == 200, listed.text
        assert listed.json()["data"]["items"][0]["status"] == "uploaded"

        process = c.post(f"/api/v1/documents/{document_id}/process")
        assert process.status_code == 200, process.text

        ready = c.get(f"/api/v1/documents/{document_id}")
        assert ready.status_code == 200, ready.text
        assert ready.json()["data"]["status"] == "ready"
        assert ready.json()["data"]["stats"]["children"] >= 1

        run_response = c.get(f"/api/v1/documents/{document_id}/ingestion-run")
        assert run_response.status_code == 200, run_response.text
        run_payload = run_response.json()["data"]["run"]
        assert run_payload["workflow_type"] == "rag_document_ingestion"
        assert run_payload["status"] == "SUCCEEDED"
        assert [step["name"] for step in run_payload["steps"]] == [
            "file_intake_agent",
            "document_parser_agent",
            "content_profile_agent",
            "cleaning_strategy_agent",
            "chunk_planner_agent",
            "chunk_builder_agent",
            "retrieval_quality_agent",
            "embedding_agent",
            "index_agent",
        ]

        chunks = c.get(f"/api/v1/documents/{document_id}/chunks")
        assert chunks.status_code == 200, chunks.text
        assert chunks.json()["data"]["items"]
        assert chunks.json()["data"]["items"][0]["metadata"]["chunking_strategy"] == "plain_recursive"


def test_ready_document_can_generate_knowledge_graph_import_plan():
    with client() as c:
        kb = c.post("/api/v1/knowledge-bases", json={"name": "Graph Import KB", "description": "test"})
        assert kb.status_code == 200, kb.text
        kb_id = kb.json()["data"]["id"]

        created = c.post(
            f"/api/v1/knowledge-bases/{kb_id}/documents/from-text?auto_process=false",
            json={
                "title": "linked-list-graph-note",
                "content": """# 链表边界处理

链表由节点和指针组成。头节点是链表入口，删除头节点时需要返回新的头指针。

## 栈的应用

栈遵循后进先出规则，括号匹配是栈的典型应用。""",
            },
        )
        assert created.status_code == 202, created.text
        document_id = created.json()["data"]["document_id"]

        process = c.post(f"/api/v1/documents/{document_id}/process")
        assert process.status_code == 200, process.text

        plan = c.get(f"/api/v1/documents/{document_id}/knowledge-graph/import-plan")
        assert plan.status_code == 200, plan.text
        data = plan.json()["data"]

        assert data["import_policy"]["mode"] == "preview_only"
        assert data["import_policy"]["requires_confirmation"] is True
        assert data["segmentation"]["source_layers"][1]["layer"] == "parent_chunk"
        assert data["segmentation"]["source_layers"][2]["layer"] == "evidence_chunk"
        assert data["segmentation"]["chunk_groups"]

        node_names = {node["name"] for node in data["nodes"]}
        assert {"链表", "头节点", "栈", "括号匹配"}.issubset(node_names)
        linked_list = next(node for node in data["nodes"] if node["name"] == "链表")
        assert linked_list["evidence"]
        assert linked_list["evidence"][0]["chunk_id"] in linked_list["source_chunk_ids"]

        relation_pairs = {(edge["source_name"], edge["target_name"], edge["type"]) for edge in data["edges"]}
        assert ("链表", "头节点", "CONTAINS") in relation_pairs
        assert ("栈", "括号匹配", "APPLIES_TO") in relation_pairs
        assert data["quality"]["candidate_node_count"] >= 4


def test_knowledge_graph_import_plan_requires_ready_document_and_owner():
    with client() as c:
        kb = c.post("/api/v1/knowledge-bases", json={"name": "Graph Import Pending KB", "description": "test"})
        assert kb.status_code == 200, kb.text
        kb_id = kb.json()["data"]["id"]
        created = c.post(
            f"/api/v1/knowledge-bases/{kb_id}/documents/from-text?auto_process=false",
            json={"title": "pending-note", "content": "链表和头节点。"},
        )
        assert created.status_code == 202, created.text
        document_id = created.json()["data"]["document_id"]

        pending = c.get(f"/api/v1/documents/{document_id}/knowledge-graph/import-plan")
        assert pending.status_code == 409
        assert pending.json()["error"]["code"] == "DOCUMENT_NOT_READY"

        denied = c.get(
            f"/api/v1/documents/{document_id}/knowledge-graph/import-plan",
            headers={"X-Demo-User-Id": "user_student_002"},
        )
        assert denied.status_code == 403
        assert denied.json()["error"]["code"] == "KB_PERMISSION_DENIED"


def test_deleted_document_can_be_uploaded_again_with_same_hash():
    with client() as c:
        kb = c.post("/api/v1/knowledge-bases", json={"name": "Delete Reupload KB", "description": "test"})
        assert kb.status_code == 200, kb.text
        kb_id = kb.json()["data"]["id"]

        fixture = Path("tests/fixtures/simple.md")
        with fixture.open("rb") as file:
            first = c.post(
                f"/api/v1/knowledge-bases/{kb_id}/documents?auto_process=false",
                files={"file": ("simple.md", file, "text/markdown")},
            )
        assert first.status_code == 202, first.text
        first_id = first.json()["data"]["document_id"]

        duplicate_before_delete = c.post(
            f"/api/v1/knowledge-bases/{kb_id}/documents?auto_process=false",
            files={"file": ("simple.md", fixture.read_bytes(), "text/markdown")},
        )
        assert duplicate_before_delete.status_code == 409

        deleted = c.delete(f"/api/v1/documents/{first_id}")
        assert deleted.status_code == 200, deleted.text

        with fixture.open("rb") as file:
            second = c.post(
                f"/api/v1/knowledge-bases/{kb_id}/documents?auto_process=false",
                files={"file": ("simple.md", file, "text/markdown")},
            )
        assert second.status_code == 202, second.text
        assert second.json()["data"]["document_id"] != first_id


def test_same_markdown_has_stable_chunks_across_knowledge_bases():
    with client() as c:
        first_kb, first_doc = create_ready_kb_with_document(c)
        second_kb, second_doc = create_ready_kb_with_document(c)
        assert first_kb != second_kb

        first_chunks = c.get(f"/api/v1/documents/{first_doc}/chunks")
        second_chunks = c.get(f"/api/v1/documents/{second_doc}/chunks")
        assert first_chunks.status_code == 200, first_chunks.text
        assert second_chunks.status_code == 200, second_chunks.text

        first_signature = [
            (item["content"], item["heading_path"], item["metadata"]["split_reason"])
            for item in first_chunks.json()["data"]["items"]
        ]
        second_signature = [
            (item["content"], item["heading_path"], item["metadata"]["split_reason"])
            for item in second_chunks.json()["data"]["items"]
        ]
        assert first_signature == second_signature
