from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.database import SessionLocal
from backend.app.models import StudentKnowledgeGraph
from backend.app.services.seed import seed_demo_data


def test_student_course_knowledge_graph_is_scoped_by_class_and_course():
    with TestClient(app) as client:
        se_response = client.get(
            "/api/v1/student/courses/course_ds_001/knowledge-graph",
            headers={"X-Demo-User-Id": "user_student_001"},
        )
        cs_response = client.get(
            "/api/v1/student/courses/course_ds_001/knowledge-graph",
            headers={"X-Demo-User-Id": "user_student_002"},
        )

    assert se_response.status_code == 200
    assert cs_response.status_code == 200

    se_graph = se_response.json()["data"]
    cs_graph = cs_response.json()["data"]

    assert se_graph["id"] == "kg_ta_se1_ds_001"
    assert se_graph["class_id"] == "class_se_001"
    assert se_graph["course_id"] == "course_ds_001"
    assert se_graph["node_count"] == len(se_graph["nodes"])
    assert se_graph["edge_count"] == len(se_graph["edges"])

    assert cs_graph["id"] == "kg_ta_cs1_ds_001"
    assert cs_graph["class_id"] == "class_cs_001"
    assert cs_graph["course_id"] == "course_ds_001"
    assert cs_graph["id"] != se_graph["id"]


def test_student_course_knowledge_graph_rejects_unjoined_course():
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/student/courses/course_arch_001/knowledge-graph",
            headers={"X-Demo-User-Id": "user_student_002"},
        )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "COURSE_NOT_IN_STUDENT_CLASS"


def test_seed_preserves_teacher_published_course_knowledge_graph():
    with TestClient(app):
        pass

    with SessionLocal() as db:
        graph = db.get(StudentKnowledgeGraph, "kg_ta_se1_ds_001")
        assert graph is not None
        graph.title = "教师发布后的课程图谱"
        graph.description = "教师端发布后同步到学生端的动态图谱。"
        graph.nodes_json = '[{"id":"node-teacher-published","label":"教师发布节点"}]'
        graph.edges_json = "[]"
        db.commit()

    with SessionLocal() as db:
        seed_demo_data(db)
        db.commit()

    with SessionLocal() as db:
        graph = db.get(StudentKnowledgeGraph, "kg_ta_se1_ds_001")
        assert graph is not None
        assert graph.title == "教师发布后的课程图谱"
        assert graph.description == "教师端发布后同步到学生端的动态图谱。"
        assert graph.nodes_json == '[{"id":"node-teacher-published","label":"教师发布节点"}]'
