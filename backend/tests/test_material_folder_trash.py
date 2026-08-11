from fastapi.testclient import TestClient

from backend.app.main import app


HEADERS = {"X-User-Id": "teacher-01"}


def test_empty_folder_is_deleted_permanently():
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/teacher/material-folders",
            headers=HEADERS,
            json={"course_id": "course-ds", "name": "Empty folder for test"},
        )
        assert created.status_code == 201
        folder_id = created.json()["data"]["id"]

        deleted = client.delete(f"/api/v1/teacher/material-folders/{folder_id}", headers=HEADERS)
        assert deleted.status_code == 200
        assert deleted.json()["data"]["mode"] == "permanent"

        trash = client.get(
            "/api/v1/teacher/material-folders/trash?course_id=course-ds",
            headers=HEADERS,
        )
        assert all(item["id"] != folder_id for item in trash.json()["data"])


def test_non_empty_folder_and_its_materials_can_be_restored():
    with TestClient(app) as client:
        folder_name = "Folder recycle test"
        created_folder = client.post(
            "/api/v1/teacher/material-folders",
            headers=HEADERS,
            json={"course_id": "course-ds", "name": folder_name},
        )
        folder_id = created_folder.json()["data"]["id"]
        created_material = client.post(
            "/api/v1/teacher/materials",
            headers=HEADERS,
            json={
                "course_id": "course-ds",
                "title": "Folder recycle material",
                "type": "doc",
                "chapter_label": folder_name,
                "size": "1 MB",
                "visibility": "teacher",
            },
        )
        material_id = created_material.json()["data"]["id"]

        deleted = client.delete(f"/api/v1/teacher/material-folders/{folder_id}", headers=HEADERS)
        assert deleted.status_code == 200
        assert deleted.json()["data"]["mode"] == "trash"
        assert deleted.json()["data"]["material_count"] == 1

        active_materials = client.get(
            "/api/v1/teacher/materials?course_id=course-ds",
            headers=HEADERS,
        ).json()["data"]
        assert all(item["id"] != material_id for item in active_materials)

        deleted_folders = client.get(
            "/api/v1/teacher/material-folders/trash?course_id=course-ds",
            headers=HEADERS,
        ).json()["data"]
        deleted_folder = next(item for item in deleted_folders if item["id"] == folder_id)
        assert deleted_folder["material_count"] == 1

        restored = client.post(
            f"/api/v1/teacher/material-folders/{folder_id}/restore",
            headers=HEADERS,
        )
        assert restored.status_code == 200
        assert restored.json()["data"]["material_count"] == 1

        active_materials = client.get(
            "/api/v1/teacher/materials?course_id=course-ds",
            headers=HEADERS,
        ).json()["data"]
        assert any(item["id"] == material_id for item in active_materials)


def test_materials_in_deleted_folder_can_be_kept_individually_or_moved():
    with TestClient(app) as client:
        source_name = "Deleted folder material choices"
        source = client.post(
            "/api/v1/teacher/material-folders",
            headers=HEADERS,
            json={"course_id": "course-ds", "name": source_name},
        ).json()["data"]
        target = client.post(
            "/api/v1/teacher/material-folders",
            headers=HEADERS,
            json={"course_id": "course-ds", "name": "Existing target folder"},
        ).json()["data"]

        material_ids = []
        for title in ["Keep independently", "Move to existing folder"]:
            created = client.post(
                "/api/v1/teacher/materials",
                headers=HEADERS,
                json={
                    "course_id": "course-ds",
                    "title": title,
                    "type": "doc",
                    "chapter_label": source_name,
                    "size": "1 MB",
                    "visibility": "teacher",
                },
            ).json()["data"]
            material_ids.append(created["id"])

        client.delete(f"/api/v1/teacher/material-folders/{source['id']}", headers=HEADERS)
        deleted_folder = next(
            item
            for item in client.get(
                "/api/v1/teacher/material-folders/trash?course_id=course-ds",
                headers=HEADERS,
            ).json()["data"]
            if item["id"] == source["id"]
        )
        assert deleted_folder["material_count"] == 2
        assert len(deleted_folder["materials"]) == 2

        kept = client.post(
            f"/api/v1/teacher/material-folders/{source['id']}/materials/{material_ids[0]}/keep",
            headers=HEADERS,
            json={"target_folder_id": None},
        ).json()["data"]
        assert kept["target_folder_name"] == "未分类资料"
        assert kept["remaining_count"] == 1
        assert kept["folder_removed"] is False

        moved = client.post(
            f"/api/v1/teacher/material-folders/{source['id']}/materials/{material_ids[1]}/keep",
            headers=HEADERS,
            json={"target_folder_id": target["id"]},
        ).json()["data"]
        assert moved["target_folder_name"] == target["name"]
        assert moved["remaining_count"] == 0
        assert moved["folder_removed"] is True

        active = {
            item["id"]: item
            for item in client.get(
                "/api/v1/teacher/materials?course_id=course-ds",
                headers=HEADERS,
            ).json()["data"]
        }
        assert active[material_ids[0]]["chapter"] == "未分类资料"
        assert active[material_ids[1]]["chapter"] == target["name"]
