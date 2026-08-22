from fastapi.testclient import TestClient

from teacher_backend.app.main import app


def test_regenerate_join_code_and_batch_import_students():
    headers = {"X-User-Id": "teacher-01"}
    with TestClient(app) as client:
        regenerate = client.post(
            "/api/v1/teacher/classes/class-se1/join-code",
            headers=headers,
        )
        assert regenerate.status_code == 200
        code = regenerate.json()["data"]["join_code"]
        assert len(code) == 8

        imported = client.post(
            "/api/v1/teacher/classes/class-se1/students/import",
            headers=headers,
            json={
                "students": [
                    {"name": "批量导入学生", "number": "2024999001"},
                    {"name": "重复学生", "number": "2024999001"},
                ]
            },
        )
        assert imported.status_code == 200
        result = imported.json()["data"]
        assert result["created"] == 1
        assert result["enrolled"] == 1
        assert result["skipped"] == 1

        roster = client.get(
            "/api/v1/teacher/classes/class-se1/students",
            headers=headers,
        )
        assert roster.status_code == 200
        assert any(item["number"] == "2024999001" for item in roster.json()["data"])

        join_status = client.get(
            "/api/v1/teacher/classes/class-se1/join-status",
            headers=headers,
        )
        assert join_status.status_code == 200
        join_data = join_status.json()["data"]
        assert join_data["class_id"] == "class-se1"
        assert join_data["summary"]["joined"] == len(join_data["rows"])
        imported_row = next(item for item in join_data["rows"] if item["number"] == "2024999001")
        assert imported_row["join_status"] == "joined"
        assert imported_row["join_method"] in {"分享链接", "二维码", "班级邀请码", "批量导入"}
        assert imported_row["joined_at"]



