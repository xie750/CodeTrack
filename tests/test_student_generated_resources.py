import pytest
import sys
from types import SimpleNamespace
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import AgentStep, LearnerEvent
from backend.app.services import student_resources
from backend.app.services.presenton_client import _generation_body


STUDENT = {"X-Demo-User-Id": "user_student_001"}
OTHER_STUDENT = {"X-Demo-User-Id": "user_student_002"}


@pytest.fixture(autouse=True)
def disable_real_ppt_preview(monkeypatch):
    monkeypatch.setenv("CODETRACK_PPT_PREVIEW_ENABLED", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


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


def test_student_can_create_resource_folder():
    with TestClient(app) as client:
        before = client.get("/api/v1/student/resources/folders", headers=STUDENT)
        assert before.status_code == 200

        created = client.post(
            "/api/v1/student/resources/folders",
            headers=STUDENT,
            json={"name": "自学资料夹"},
        )
        assert created.status_code == 201
        folder = created.json()["data"]
        assert folder["name"] == "自学资料夹"
        assert folder["student_id"] == "user_student_001"

        listing = client.get("/api/v1/student/resources/folders", headers=STUDENT)
        assert listing.status_code == 200
        assert "自学资料夹" in {item["name"] for item in listing.json()["data"]["items"]}

        reserved = client.post(
            "/api/v1/student/resources/folders",
            headers=STUDENT,
            json={"name": "课程资料"},
        )
        assert reserved.status_code == 409
        assert reserved.json()["error"]["code"] == "RESOURCE_FOLDER_RESERVED"


def test_student_profile_and_generated_resources_are_scoped_to_current_user(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    with TestClient(app) as client:
        first_profile = client.get(
            "/api/v1/student/profile",
            params={"course_id": "course_ds_001"},
            headers=STUDENT,
        )
        second_profile = client.get(
            "/api/v1/student/profile",
            params={"course_id": "course_ds_001"},
            headers=OTHER_STUDENT,
        )
        assert first_profile.status_code == 200
        assert second_profile.status_code == 200
        assert first_profile.json()["data"]["student"]["id"] == "user_student_001"
        assert second_profile.json()["data"]["student"]["id"] == "user_student_002"
        assert first_profile.json()["data"]["student"]["class_id"] == "class_se_001"
        assert second_profile.json()["data"]["student"]["class_id"] == "class_cs_001"

        generated = client.post(
            "/api/v1/student/resources/generate",
            headers=STUDENT,
            json={
                "course_id": "course_ds_001",
                "resource_type": "PRACTICE_SET",
                "message": "帮我生成关于链表边界处理的练习题",
            },
        )
        assert generated.status_code == 200
        resource_id = generated.json()["data"]["resource"]["id"]

        detail = client.get(f"/api/v1/student/resources/{resource_id}", headers=OTHER_STUDENT)
        workspace = client.get(f"/api/v1/student/resources/{resource_id}/practice", headers=OTHER_STUDENT)
        submitted = client.post(
            f"/api/v1/student/resources/{resource_id}/practice/submit",
            headers=OTHER_STUDENT,
            json={"answers": []},
        )

        for response in (detail, workspace, submitted):
            assert response.status_code == 404
            assert response.json()["error"]["code"] == "GENERATED_RESOURCE_NOT_FOUND"


def test_ppt_generation_prioritizes_explicit_student_topic_over_course_fallback(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_PPT_RENDERER", "local")
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/ppt/generate",
            headers=STUDENT,
            json={"course_id": "course_arch_001", "message": "生成Java基础语法相关的PPT"},
        )

    assert generated.status_code == 200
    resource = generated.json()["data"]["resource"]
    slide_text = " ".join(
        [slide["title"] + " " + " ".join(slide.get("bullets", [])) for slide in resource["render_payload"]["slides"]]
    )
    assert resource["knowledge_point"] == "Java基础语法"
    assert "Java基础语法" in resource["title"]
    assert "Java基础语法" in slide_text
    assert resource["citations"] == []


def test_requested_topic_extraction_keeps_discipline_terms():
    assert student_resources._extract_requested_topic("生成机器学习相关的PPT") == "机器学习"
    assert student_resources._extract_requested_topic("帮我生成关于队列的讲解 PPT") == "队列"
    assert student_resources._extract_requested_topic("帮我把链表删除节点整理成适合复习的思维导图") == "链表删除节点"
    assert student_resources._extract_requested_topic("生成队列的学习文档") == "队列"


def test_model_ppt_generation_receives_student_request_contract(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-test")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "test-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://model.test/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_PPT_RENDERER", "local")
    captured: dict[str, object] = {}

    async def fake_chat_json(messages, **kwargs):
        captured["messages"] = messages
        captured["kwargs"] = kwargs
        return SimpleNamespace(
            data={
                "title": "Java基础语法讲解 PPT",
                "summary": "围绕 Java基础语法 生成面向学生的讲解材料。",
                "slides": [
                    {"title": "Java基础语法", "bullets": ["变量、类型与表达式"], "citation_ids": []},
                    {"title": "语句结构", "bullets": ["条件、循环与方法调用"], "citation_ids": []},
                    {"title": "易错点", "bullets": ["类型转换和作用域"], "citation_ids": []},
                    {"title": "练习设计", "bullets": ["用小程序巩固 Java基础语法"], "citation_ids": []},
                ],
            }
        )

    monkeypatch.setattr(student_resources, "chat_json", fake_chat_json)
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/ppt/generate",
            headers=STUDENT,
            json={"course_id": "course_arch_001", "message": "生成Java基础语法相关的PPT"},
        )

    assert generated.status_code == 200
    payload = student_resources._json_loads(captured["messages"][1]["content"], {})
    assert payload["student_request"] == "生成Java基础语法相关的PPT"
    assert payload["request_contract"]["requested_topic"] == "Java基础语法"
    assert "用户显式主题" in payload["request_contract"]["priority"][0]
    assert payload["knowledge_sources"] == []
    resource = generated.json()["data"]["resource"]
    assert resource["knowledge_point"] == "Java基础语法"
    assert resource["citations"] == []


def test_model_ppt_generation_rejects_off_topic_model_output(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "sk-test")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "test-model")
    monkeypatch.setenv("CODETRACK_MODEL_API_BASE_URL", "https://model.test/v1")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_PPT_RENDERER", "local")

    async def fake_chat_json(messages, **kwargs):
        return SimpleNamespace(
            data={
                "title": "过拟合与正则化讲解 PPT",
                "summary": "围绕机器学习中的过拟合与正则化生成。",
                "slides": [
                    {"title": "过拟合", "bullets": ["训练集和测试集表现差异"], "citation_ids": []},
                    {"title": "正则化", "bullets": ["约束模型复杂度"], "citation_ids": []},
                    {"title": "验证集", "bullets": ["用于调参"], "citation_ids": []},
                    {"title": "总结", "bullets": ["避免过拟合"], "citation_ids": []},
                ],
            }
        )

    monkeypatch.setattr(student_resources, "chat_json", fake_chat_json)
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/ppt/generate",
            headers=STUDENT,
            json={"course_id": "course_arch_001", "message": "生成Java基础语法相关的PPT"},
        )

    assert generated.status_code == 200
    resource = generated.json()["data"]["resource"]
    assert resource["knowledge_point"] == "Java基础语法"
    assert "Java基础语法" in resource["title"]
    assert resource["render_payload"]["metadata"]["model_content_fallback"] is True
    assert "model slides do not match requested topic" in resource["render_payload"]["metadata"]["model_content_fallback_error"]


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


def test_ppt_generation_exposes_pdf_preview_when_available(monkeypatch, tmp_path):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_PPT_RENDERER", "local")
    monkeypatch.setenv("CODETRACK_RESOURCE_STORAGE_DIR", str(tmp_path / "resources"))
    get_settings.cache_clear()

    def fake_pdf_preview(resource_id, pptx_path, file_format):
        preview_path = tmp_path / "resources" / "generated" / "previews" / resource_id / f"{resource_id}.pdf"
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        preview_path.write_bytes(b"%PDF-1.4\n" + b"preview" * 80)
        return {
            "preview_renderer": "libreoffice_pdf",
            "preview_format": "PDF",
            "preview_available": True,
            "preview_path": str(preview_path),
            "preview_media_type": "application/pdf",
        }

    monkeypatch.setattr(student_resources, "_render_ppt_pdf_preview", fake_pdf_preview)

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/ppt/generate",
            headers=STUDENT,
            json={"course_id": "course_ds_001", "message": "帮我生成关于队列的讲解 PPT"},
        )
        assert generated.status_code == 200
        resource = generated.json()["data"]["resource"]
        assert resource["preview_available"] is True
        assert resource["preview_url"] == f"/api/v1/student/resources/{resource['id']}/preview"
        assert resource["render_payload"]["metadata"]["preview_url"] == resource["preview_url"]

        preview = client.get(resource["preview_url"], headers=STUDENT)
        assert preview.status_code == 200
        assert preview.headers["content-type"] == "application/pdf"
        assert preview.content.startswith(b"%PDF-1.4")


def test_ppt_pdf_preview_soft_falls_back_without_libreoffice(monkeypatch, tmp_path):
    monkeypatch.setenv("CODETRACK_PPT_PREVIEW_ENABLED", "true")
    monkeypatch.setenv("CODETRACK_PPT_PREVIEW_RENDERER", "libreoffice")
    get_settings.cache_clear()
    pptx_path = tmp_path / "sample.pptx"
    pptx_path.write_bytes(b"pptx" * 100)
    monkeypatch.setattr(student_resources, "_resolve_libreoffice_command", lambda settings: None)

    metadata = student_resources._render_ppt_pdf_preview("res_preview_missing", str(pptx_path), "PPTX")

    assert metadata["preview_renderer"] == "libreoffice_pdf"
    assert metadata["preview_format"] == "PDF"
    assert metadata.get("preview_available") is not True
    assert "LibreOffice" in metadata["preview_error"]


def test_preview_endpoint_generates_missing_ppt_preview_on_demand(monkeypatch, tmp_path):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    monkeypatch.setenv("CODETRACK_PPT_RENDERER", "local")
    monkeypatch.setenv("CODETRACK_PPT_PREVIEW_ENABLED", "false")
    monkeypatch.setenv("CODETRACK_RESOURCE_STORAGE_DIR", str(tmp_path / "resources"))
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/ppt/generate",
            headers=STUDENT,
            json={"course_id": "course_ds_001", "message": "帮我生成关于二叉树的讲解 PPT"},
        )
        assert generated.status_code == 200
        resource = generated.json()["data"]["resource"]
        assert resource["preview_available"] is False

        def fake_pdf_preview(resource_id, pptx_path, file_format):
            preview_path = tmp_path / "resources" / "generated" / "previews" / resource_id / f"{resource_id}.pdf"
            preview_path.parent.mkdir(parents=True, exist_ok=True)
            preview_path.write_bytes(b"%PDF-1.4\n" + b"on-demand" * 80)
            return {
                "preview_renderer": "powerpoint_pdf",
                "preview_format": "PDF",
                "preview_available": True,
                "preview_path": str(preview_path),
                "preview_media_type": "application/pdf",
            }

        monkeypatch.setenv("CODETRACK_PPT_PREVIEW_ENABLED", "true")
        get_settings.cache_clear()
        monkeypatch.setattr(student_resources, "_render_ppt_pdf_preview", fake_pdf_preview)

        preview = client.get(f"/api/v1/student/resources/{resource['id']}/preview", headers=STUDENT)
        assert preview.status_code == 200
        assert preview.headers["content-type"] == "application/pdf"
        assert preview.content.startswith(b"%PDF-1.4")


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
        if resource_type == "DOCUMENT":
            markdown = resource["render_payload"]["markdown"]
            assert markdown.startswith("# ")
            assert "## 用户需求拆解" in markdown
            assert "## 必须掌握的规则" in markdown
            assert "## 10 分钟自检任务" in markdown
            assert "| 模块 | 必须掌握什么 | 判断自己会不会 |" in markdown
            assert "## 引用来源" in markdown
            assert resource["render_payload"]["metadata"]["render_kernel"] == "react-markdown"
            assert resource["render_payload"]["metadata"]["document_style"] == "study-handout"
        assert resource["citations"]
        assert resource["download_available"] is True
        assert resource["saved_to_resource_center"] is (resource_type in {"PRACTICE_SET", "PODCAST_SCRIPT"})

        if resource_type not in {"PRACTICE_SET", "PODCAST_SCRIPT"}:
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


def test_generated_practice_resource_auto_saves_and_submits_to_profile(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/generate",
            headers=STUDENT,
            json={
                "course_id": "course_ds_001",
                "resource_type": "PRACTICE_SET",
                "message": "帮我生成关于队列的练习题",
            },
        )
        assert generated.status_code == 200
        resource = generated.json()["data"]["resource"]
        assert resource["saved_to_resource_center"] is True

        listing = client.get("/api/v1/student/resources/generated", headers=STUDENT)
        assert listing.status_code == 200
        assert resource["id"] in {item["id"] for item in listing.json()["data"]["items"]}

        workspace = client.get(f"/api/v1/student/resources/{resource['id']}/practice", headers=STUDENT)
        assert workspace.status_code == 200
        questions = workspace.json()["data"]["questions"]
        assert questions
        assert "answer" not in questions[0]
        assert all("is_correct" not in option for question in questions for option in question["options"])

        answers = []
        source_questions = resource["render_payload"]["questions"]
        for index, question in enumerate(questions):
            source_question = source_questions[index]
            if question["options"]:
                answer_text = source_question["answer"]
                answer_index = source_question["options"].index(answer_text)
                answers.append({"question_id": question["question_id"], "selected_option_ids": [str(answer_index)]})
            else:
                answers.append({"question_id": question["question_id"], "selected_option_ids": [source_question["answer"]]})

        submitted = client.post(
            f"/api/v1/student/resources/{resource['id']}/practice/submit",
            headers=STUDENT,
            json={"answers": answers},
        )
        assert submitted.status_code == 201
        result = submitted.json()["data"]
        assert result["status"] == "SUBMITTED"
        assert result["correct_count"] >= 1
        assert result["profile_signal"]["summary"]

    db = SessionLocal()
    try:
        event = db.query(LearnerEvent).filter(
            LearnerEvent.student_id == "user_student_001",
            LearnerEvent.event_type == "GENERATED_PRACTICE_SUBMITTED",
        ).order_by(LearnerEvent.created_at.desc()).first()
        assert event is not None
        assert resource["id"] in event.payload
    finally:
        db.close()


def test_generated_podcast_auto_saves_and_listening_updates_profile(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/generate",
            headers=STUDENT,
            json={
                "course_id": "course_ds_001",
                "resource_type": "PODCAST_SCRIPT",
                "message": "帮我生成关于队列的播客讲解",
            },
        )
        assert generated.status_code == 200
        resource = generated.json()["data"]["resource"]
        assert resource["resource_type"] == "PODCAST_SCRIPT"
        assert resource["saved_to_resource_center"] is True
        assert resource["render_payload"]["metadata"]["playback_mode"] == "browser_speech_synthesis"
        assert any(segment.get("takeaway") for segment in resource["render_payload"]["segments"])

        listing = client.get("/api/v1/student/resources/generated", headers=STUDENT)
        assert listing.status_code == 200
        assert resource["id"] in {item["id"] for item in listing.json()["data"]["items"]}

        listened = client.post(
            f"/api/v1/student/resources/{resource['id']}/podcast/listened",
            headers=STUDENT,
            json={"completed_segment_count": len(resource["render_payload"]["segments"])},
        )
        assert listened.status_code == 200
        payload = listened.json()["data"]
        assert payload["event_type"] == "PODCAST_LISTENED"
        assert payload["completion_ratio"] == 1
        assert "播客" in payload["profile_signal"]["summary"]

    db = SessionLocal()
    try:
        event = db.query(LearnerEvent).filter(
            LearnerEvent.student_id == "user_student_001",
            LearnerEvent.event_type == "PODCAST_LISTENED",
        ).order_by(LearnerEvent.created_at.desc()).first()
        assert event is not None
        assert resource["id"] in event.payload
    finally:
        db.close()


def test_student_mind_map_uses_dedicated_agent_workflow(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/generate",
            headers=STUDENT,
            json={
                "course_id": "course_ds_001",
                "resource_type": "MIND_MAP",
                "message": "帮我把链表删除节点整理成适合复习的思维导图",
            },
        )

    assert generated.status_code == 200
    resource = generated.json()["data"]["resource"]
    payload = resource["render_payload"]
    nodes = payload["nodes"]
    edges = payload["edges"]
    assert resource["resource_type"] == "MIND_MAP"
    assert payload["artifact_type"] == "MIND_MAP"
    assert payload["central_topic"]
    assert resource["item_count"] >= 12
    assert any(node["node_type"] == "profile_tip" for node in nodes)
    assert any(node["node_type"] == "mistake" for node in nodes)
    assert all("confidence" in node for node in nodes)
    assert any(edge["relationship_type"] == "solves" for edge in edges)
    assert "生成练习" in payload["recommended_next_actions"]

    db = SessionLocal()
    try:
        step_names = [
            step.step_name
            for step in db.query(AgentStep)
            .filter(AgentStep.run_id == resource["run_id"])
            .order_by(AgentStep.step_order)
            .all()
        ]
    finally:
        db.close()
    assert step_names == [
        "create_run",
        "build_context",
        "mind_map_planner_agent",
        "mind_map_content_agent",
        "relationship_refiner_agent",
        "citation_guard_agent",
        "mind_map_critic_agent",
        "persist_mind_map_resource",
    ]


def test_student_mind_map_uses_programming_template_for_java_topic(monkeypatch):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "")
    monkeypatch.setenv("CODETRACK_MODEL_GATEWAY_URL", "")
    get_settings.cache_clear()

    with TestClient(app) as client:
        generated = client.post(
            "/api/v1/student/resources/generate",
            headers=STUDENT,
            json={
                "course_id": "course_arch_001",
                "resource_type": "MIND_MAP",
                "message": "生成java基础语法的思维导图",
            },
        )

    assert generated.status_code == 200
    resource = generated.json()["data"]["resource"]
    payload = resource["render_payload"]
    nodes = payload["nodes"]
    edges = payload["edges"]
    node_ids = {node["id"] for node in nodes}
    labels = {node["label"] for node in nodes}
    assert resource["knowledge_point"] == "java基础语法"
    assert payload["metadata"]["topic_family"] == "programming"
    assert "流程控制" in labels
    assert "函数与对象" in labels
    assert "边界条件" not in labels
    assert "画状态图" not in labels
    assert "当前课程资料未覆盖该主题" in payload["risk_flags"]
    assert all(edge["source"] in node_ids and edge["target"] in node_ids for edge in edges)
