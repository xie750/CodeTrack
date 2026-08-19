import pytest
import sys
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.main import app
from backend.app.services.presenton_client import _generation_body


STUDENT = {"X-Demo-User-Id": "user_student_001"}


def test_student_can_generate_save_and_download_ppt_resource(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_PPT_RENDERER", "local")
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/ppt/generate",
            headers=STUDENT,
            json={"course_id": "course_ds_001", "message": "帮我生成关于队列的讲解 PPT"},
        )
        assert generated.status_code == 200
        resource = generated.json()["data"]["resource"]
        assert resource["resource_type"] == "PPT"
        assert resource["status"] == "READY"
        assert resource["slide_count"] >= 4
        assert resource["render_payload"]["slides"]
        assert resource["citations"]
        assert resource["saved_to_resource_center"] is False

        saved = client.post(f"/api/v1/student/resources/{resource['id']}/save", headers=STUDENT)
        assert saved.status_code == 200
        assert saved.json()["data"]["saved_to_resource_center"] is True

        listing = client.get("/api/v1/student/resources/generated", headers=STUDENT)
        assert listing.status_code == 200
        ids = {item["id"] for item in listing.json()["data"]["items"]}
        assert resource["id"] in ids

        downloaded = client.get(f"/api/v1/student/resources/{resource['id']}/download", headers=STUDENT)
        assert downloaded.status_code == 200
        assert downloaded.headers["content-type"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        assert len(downloaded.content) > 1000


def test_ppt_generation_uses_presenton_when_configured(monkeypatch, tmp_path):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_PPT_RENDERER", "presenton")
    monkeypatch.setenv("CODETRACK_PRESENTON_ENABLED", "true")
    monkeypatch.setenv("CODETRACK_PRESENTON_BASE_URL", "http://presenton.local")
    get_settings.cache_clear()

    async def fake_presenton(**kwargs):
        output_path = tmp_path / f"{kwargs['resource_id']}.pptx"
        output_path.write_bytes(b"presenton-pptx" * 100)
        return {
            "file_path": str(output_path),
            "file_format": "PPTX",
            "download_path": "/generated/fake.pptx",
            "provider_payload": {
                "presentation_id": "deck_001",
                "edit_path": "/app/fake/edit",
            },
        }

    monkeypatch.setattr(
        "backend.app.services.student_resources.generate_presenton_pptx",
        fake_presenton,
    )

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/generate",
            headers=STUDENT,
            json={
                "course_id": "course_ds_001",
                "resource_type": "PPT",
                "message": "帮我生成关于队列的讲解 PPT",
            },
        )
        assert generated.status_code == 200
        resource = generated.json()["data"]["resource"]
        assert resource["resource_type"] == "PPT"
        assert resource["file_format"] == "PPTX"
        assert resource["render_payload"]["metadata"]["renderer"] == "presenton"
        assert resource["render_payload"]["metadata"]["presenton_presentation_id"] == "deck_001"


def test_ppt_generation_uses_ppt_master_command_when_configured(monkeypatch, tmp_path):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_PPT_RENDERER", "ppt_master")
    monkeypatch.setenv("CODETRACK_PPT_MASTER_ENABLED", "true")

    runner = tmp_path / "fake_ppt_master.py"
    runner.write_text(
        """
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--request-json", required=True)
parser.add_argument("--output-pptx", required=True)
args = parser.parse_args()
request = json.loads(Path(args.request_json).read_text(encoding="utf-8"))
assert request["ppt_master_home"]
assert request["ppt_master_skill_dir"].endswith("skills" + "/" + "ppt-master") or request["ppt_master_skill_dir"].endswith("skills" + "\\\\" + "ppt-master")
Path(args.output_pptx).write_bytes(b"ppt-master-pptx" * 100)
Path(request["metadata_json"]).write_text(json.dumps({"project_id": "pm_001", "export_path": args.output_pptx}), encoding="utf-8")
print("ppt master done")
""".strip(),
        encoding="utf-8",
    )
    monkeypatch.setenv("CODETRACK_PPT_MASTER_COMMAND", f'"{sys.executable}" "{runner}"')
    ppt_master_home = tmp_path / "ppt-master-main"
    (ppt_master_home / "skills" / "ppt-master").mkdir(parents=True)
    monkeypatch.setenv("CODETRACK_PPT_MASTER_HOME", str(ppt_master_home))
    monkeypatch.setenv("CODETRACK_PPT_MASTER_WORKSPACE_DIR", str(tmp_path / "workspace"))
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/generate",
            headers=STUDENT,
            json={
                "course_id": "course_ds_001",
                "resource_type": "PPT",
                "message": "帮我生成关于队列的讲解 PPT",
            },
        )
        assert generated.status_code == 200
        resource = generated.json()["data"]["resource"]
        assert resource["resource_type"] == "PPT"
        assert resource["file_format"] == "PPTX"
        metadata = resource["render_payload"]["metadata"]
        assert metadata["renderer"] == "ppt_master"
        assert metadata["renderer_requested"] == "ppt_master"
        assert metadata["ppt_master_project_id"] == "pm_001"


def test_student_can_read_ppt_renderer_config(monkeypatch):
    monkeypatch.setenv("CODETRACK_PPT_RENDERER", "ppt_master")
    monkeypatch.setenv("CODETRACK_PPT_MASTER_ENABLED", "false")
    get_settings.cache_clear()

    with TestClient(app) as client:
        response = client.get("/api/v1/student/resources/ppt/renderers", headers=STUDENT)

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["requested"] == "ppt_master"
    assert payload["active"] == "local_pptx"
    assert payload["available"]["local_pptx"] is True


def test_presenton_generation_body_uses_fixed_slide_markdown():
    settings = get_settings()
    slides = [
        {
            "title": "队列讲解",
            "subtitle": "数据结构",
            "bullets": ["FIFO 先进先出", "适合任务排队"],
            "speaker_notes": "先用排队场景解释。",
        },
        {"title": "常见错误", "bullets": ["空队列未判断"]},
    ]

    body = _generation_body(settings, "生成队列教学 PPT", slides)

    assert "n_slides" not in body
    assert body["include_title_slide"] is False
    assert body["slides_markdown"][0].startswith("# 队列讲解")
    assert "FIFO 先进先出" in body["slides_markdown"][0]
    assert "不要重新规划页数" in body["instructions"]


@pytest.mark.parametrize(
    ("resource_type", "payload_key", "min_size"),
    [
        ("DOCUMENT", "sections", 1000),
        ("MIND_MAP", "nodes", 200),
        ("PRACTICE_SET", "questions", 200),
        ("KNOWLEDGE_CARD", "cards", 200),
        ("PODCAST_SCRIPT", "segments", 200),
    ],
)
def test_student_can_generate_save_and_download_generic_resources(monkeypatch, resource_type, payload_key, min_size):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_PPT_RENDERER", "local")
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/generate",
            headers=STUDENT,
            json={
                "course_id": "course_ds_001",
                "resource_type": resource_type,
                "message": "帮我生成关于队列的学习资源",
            },
        )
        assert generated.status_code == 200
        resource = generated.json()["data"]["resource"]
        assert resource["resource_type"] == resource_type
        assert resource["status"] == "READY"
        assert resource["item_count"] >= 1
        assert resource["render_payload"][payload_key]
        assert resource["citations"]
        assert resource["download_available"] is True
        assert resource["saved_to_resource_center"] is False

        saved = client.post(f"/api/v1/student/resources/{resource['id']}/save", headers=STUDENT)
        assert saved.status_code == 200
        assert saved.json()["data"]["saved_to_resource_center"] is True

        listing = client.get("/api/v1/student/resources/generated", headers=STUDENT)
        assert listing.status_code == 200
        ids = {item["id"] for item in listing.json()["data"]["items"]}
        assert resource["id"] in ids

        downloaded = client.get(f"/api/v1/student/resources/{resource['id']}/download", headers=STUDENT)
        assert downloaded.status_code == 200
        assert len(downloaded.content) > min_size
