import asyncio
import json
import subprocess
from types import SimpleNamespace

import pytest

from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings
from backend.app.services import openmaic_generator as generator


@pytest.fixture
def configured(monkeypatch, tmp_path):
    monkeypatch.setenv("CODETRACK_MODEL_API_KEY", "test-secret")
    monkeypatch.setenv("CODETRACK_MODEL_NAME", "test-model")
    get_settings.cache_clear()
    package = tmp_path / "node_modules/@openmaic/generation/dist"
    package.mkdir(parents=True)
    (package / "index.js").touch()
    monkeypatch.setattr(generator, "OPENMAIC_ROOT", tmp_path)
    monkeypatch.setattr(generator.shutil, "which", lambda _: "node")
    yield
    get_settings.cache_clear()


def test_native_generator_uses_stdin_and_keeps_complete_payload(configured, monkeypatch):
    payload = {"scenes": [{"actions": [{"type": "spotlight", "elementId": "chart"}]}], "metadata": {"generation_pipeline": "openmaic_native"}}

    def run(command, **kwargs):
        assert "test-secret" not in str(command)
        request = json.loads(kwargs["input"])
        assert request["model"]["api_key"] == "test-secret"
        assert request["message"] == "学习神经网络"
        return SimpleNamespace(returncode=0, stdout=json.dumps({"event": {"phase": "outline"}}) + "\n" + json.dumps({"result": payload}))

    monkeypatch.setattr(generator.subprocess, "run", run)
    result = asyncio.run(generator.generate_openmaic_classroom({"message": "学习神经网络"}))
    assert result["scenes"] == payload["scenes"]
    assert result["metadata"]["generation_steps"] == [{"phase": "outline"}]


@pytest.mark.parametrize("mode,code", [("timeout", "CLASSROOM_GENERATION_TIMEOUT"), ("invalid", "CLASSROOM_GENERATION_FAILED")])
def test_native_generator_reports_failure_without_template(configured, monkeypatch, mode, code):
    def run(command, **kwargs):
        if mode == "timeout":
            raise subprocess.TimeoutExpired(command, 1)
        return SimpleNamespace(returncode=1, stdout=json.dumps({"error": "Model HTTP 401"}))

    monkeypatch.setattr(generator.subprocess, "run", run)
    with pytest.raises(ApiError) as raised:
        asyncio.run(generator.generate_openmaic_classroom({"message": "test"}))
    assert raised.value.detail["code"] == code
