"""Run the vendored OpenMAIC generation package without exposing model keys to browsers."""

import asyncio
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings


OPENMAIC_ROOT = Path(__file__).resolve().parents[3] / "third_party" / "openmaic"


def _run_generator(payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    node = shutil.which(settings.openmaic_node_command)
    if not node or not (OPENMAIC_ROOT / "node_modules/@openmaic/generation/dist/index.js").exists():
        raise ApiError(503, "OPENMAIC_GENERATOR_UNAVAILABLE", "课堂生成依赖未就绪，请安装 Node.js 并在 third_party/openmaic 执行 pnpm install。")
    request = {
        **payload,
        "model": {
            "name": settings.model_name,
            "api_key": settings.model_api_key,
            "base_url": settings.model_api_base_url,
            "timeout_seconds": settings.openmaic_model_timeout_seconds,
        },
    }
    try:
        result = subprocess.run(
            [node, str(OPENMAIC_ROOT / "scripts/codetrack-generate.mjs")],
            input=json.dumps(request, ensure_ascii=False),
            capture_output=True, text=True, encoding="utf-8", cwd=OPENMAIC_ROOT,
            timeout=settings.openmaic_generation_timeout_seconds,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired as exc:
        raise ApiError(504, "CLASSROOM_GENERATION_TIMEOUT", "课堂内容生成超时，未保存不完整课堂，请稍后重试。") from exc
    except OSError as exc:
        raise ApiError(503, "OPENMAIC_GENERATOR_UNAVAILABLE", "无法启动本地课堂生成器，请检查 Node.js 配置。") from exc
    events = []
    output = None
    error = "OpenMAIC generation process failed."
    for line in result.stdout.splitlines():
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if not isinstance(item, dict):
            continue
        if "event" in item:
            events.append(item["event"])
        if "result" in item:
            output = item["result"]
        if "error" in item:
            error = str(item["error"])
    if result.returncode or not isinstance(output, dict) or not output.get("scenes"):
        raise ApiError(502, "CLASSROOM_GENERATION_FAILED", "课堂内容未通过生成或质量检查，未保存模板课堂，请重试。", details={"reason": error[:600], "progress": events[-1:]})
    output.setdefault("metadata", {})["generation_steps"] = events
    return output


async def generate_openmaic_classroom(payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    if not settings.model_api_key or not settings.model_name:
        raise ApiError(503, "CLASSROOM_MODEL_NOT_CONFIGURED", "请先配置课堂生成模型，再生成 AI 讲解课堂。")
    # A worker thread also works under Uvicorn's Windows selector event loop.
    return await asyncio.to_thread(_run_generator, payload)
