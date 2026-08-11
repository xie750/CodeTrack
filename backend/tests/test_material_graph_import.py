from fastapi.testclient import TestClient
from sqlalchemy import delete

from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import Material, MaterialKnowledgeLink


HEADERS = {"X-User-Id": "teacher-01"}


def test_material_can_be_linked_to_graph_node_and_returned_by_graph():
    material_id = None
    with TestClient(app) as client:
        graph = client.get(
            "/api/v1/teacher/knowledge-graph?course_id=course-ds",
            headers=HEADERS,
        )
        assert graph.status_code == 200
        point_id = graph.json()["data"]["nodes"][0]["id"]

        created = client.post(
            "/api/v1/teacher/materials",
            headers=HEADERS,
            json={
                "course_id": "course-ds",
                "title": "Graph import test material",
                "type": "doc",
                "chapter_label": "Graph test chapter",
                "size": "1 KB",
                "visibility": "teacher",
            },
        )
        assert created.status_code == 201
        material_id = created.json()["data"]["id"]

        imported = client.post(
            f"/api/v1/teacher/materials/{material_id}/knowledge-graph",
            headers=HEADERS,
            json={"knowledge_point_ids": [point_id], "create_from_material": False},
        )
        assert imported.status_code == 200
        assert imported.json()["data"]["linked_count"] == 1

        materials = client.get(
            "/api/v1/teacher/materials?course_id=course-ds",
            headers=HEADERS,
        ).json()["data"]
        material = next(item for item in materials if item["id"] == material_id)
        assert material["knowledge_points"] == [{"id": point_id, "name": material["knowledge_points"][0]["name"]}]

        graph = client.get(
            "/api/v1/teacher/knowledge-graph?course_id=course-ds",
            headers=HEADERS,
        ).json()["data"]
        node = next(item for item in graph["nodes"] if item["id"] == point_id)
        linked = next(item for item in node["materials"] if item["id"] == material_id)
        assert linked["relation"] == "explicit"

    if material_id:
        with SessionLocal() as db:
            db.execute(delete(MaterialKnowledgeLink).where(MaterialKnowledgeLink.material_id == material_id))
            item = db.get(Material, material_id)
            if item:
                db.delete(item)
            db.commit()
