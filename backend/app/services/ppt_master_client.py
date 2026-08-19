from __future__ import annotations

import asyncio
import json
import os
import shlex
import subprocess
from pathlib import Path
from typing import Any

from backend.app.core.config import Settings, get_settings


class PptMasterError(RuntimeError):
    pass


def ppt_master_configured(settings: Settings | None = None) -> bool:
    value = settings or get_settings()
    return bool(value.ppt_master_enabled and value.ppt_master_command)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


def _tail(text: str, limit: int = 1600) -> str:
    value = (text or "").strip()
    return value[-limit:] if len(value) > limit else value


def _command_parts(
    *,
    command: str,
    request_path: Path,
    output_path: Path,
    workspace_dir: Path,
    resource_id: str,
) -> list[str]:
    replacements = {
        "{request_json}": str(request_path),
        "{output_pptx}": str(output_path),
        "{workspace_dir}": str(workspace_dir),
        "{resource_id}": resource_id,
    }
    expanded = command
    used_placeholder = False
    sentinels: dict[str, str] = {}
    for index, key in enumerate(replacements):
        if key in expanded:
            used_placeholder = True
            sentinel = f"__CODETRACK_PPT_MASTER_ARG_{index}__"
            sentinels[sentinel] = replacements[key]
            expanded = expanded.replace(key, sentinel)
    parts = shlex.split(expanded, posix=True)
    if not parts:
        raise PptMasterError("PPT Master 命令为空。")
    if sentinels:
        parts = [
            next(
                (
                    part.replace(sentinel, value)
                    for sentinel, value in sentinels.items()
                    if sentinel in part
                ),
                part,
            )
            for part in parts
        ]
    if not used_placeholder:
        parts.extend(["--request-json", str(request_path), "--output-pptx", str(output_path)])
    return parts


def _run_ppt_master_command(
    command: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    timeout: int,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )


async def generate_ppt_master_pptx(
    *,
    resource_id: str,
    title: str,
    message: str,
    knowledge_point: str,
    slides: list[dict[str, Any]],
    citations: list[dict[str, Any]],
    output_dir: Path,
    settings: Settings | None = None,
) -> dict[str, Any]:
    value = settings or get_settings()
    if not ppt_master_configured(value):
        raise PptMasterError("PPT Master 未启用或未配置包装命令。")

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    workspace_dir = Path(value.ppt_master_workspace_dir or output_dir / resource_id).resolve()
    workspace_dir.mkdir(parents=True, exist_ok=True)
    ppt_master_home = Path(value.ppt_master_home).resolve() if value.ppt_master_home else None
    ppt_master_skill_dir = ppt_master_home / "skills" / "ppt-master" if ppt_master_home else None
    request_path = workspace_dir / f"{resource_id}.ppt-master-request.json"
    metadata_path = workspace_dir / f"{resource_id}.ppt-master-metadata.json"
    output_path = output_dir / f"{resource_id}.pptx"
    request_payload = {
        "resource_id": resource_id,
        "title": title,
        "message": message,
        "knowledge_point": knowledge_point,
        "slides": slides,
        "citations": citations,
        "output_pptx": str(output_path),
        "metadata_json": str(metadata_path),
        "workspace_dir": str(workspace_dir),
        "ppt_master_home": str(ppt_master_home) if ppt_master_home else "",
        "ppt_master_skill_dir": str(ppt_master_skill_dir) if ppt_master_skill_dir else "",
        "requirements": [
            "生成中文教学 PPTX，而不是只生成大纲。",
            "保留每页标题、要点、讲稿提示和课程引用依据。",
            "视觉风格要现代、干净，适合人工智能专业课程展示。",
            "最终文件必须写入 output_pptx 指定路径。",
        ],
    }
    request_path.write_text(_json_dumps(request_payload), encoding="utf-8")

    command = _command_parts(
        command=str(value.ppt_master_command),
        request_path=request_path,
        output_path=output_path,
        workspace_dir=workspace_dir,
        resource_id=resource_id,
    )
    env = os.environ.copy()
    env.update(
        {
            "CODETRACK_PPT_MASTER_REQUEST_JSON": str(request_path),
            "CODETRACK_PPT_MASTER_OUTPUT_PPTX": str(output_path),
            "CODETRACK_PPT_MASTER_METADATA_JSON": str(metadata_path),
            "CODETRACK_PPT_MASTER_WORKSPACE_DIR": str(workspace_dir),
            "CODETRACK_PPT_MASTER_RESOURCE_ID": resource_id,
            "CODETRACK_PPT_MASTER_HOME": str(ppt_master_home) if ppt_master_home else "",
            "CODETRACK_PPT_MASTER_SKILL_DIR": str(ppt_master_skill_dir) if ppt_master_skill_dir else "",
        }
    )

    timeout_seconds = max(30, int(value.ppt_master_timeout_seconds or 300))
    try:
        completed = await asyncio.to_thread(
            _run_ppt_master_command,
            command,
            cwd=workspace_dir,
            env=env,
            timeout=timeout_seconds,
        )
    except OSError as exc:
        raise PptMasterError(f"PPT Master 命令启动失败：{exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise PptMasterError("PPT Master 生成超时。") from exc

    stdout = completed.stdout or ""
    stderr = completed.stderr or ""
    if completed.returncode != 0:
        detail = _tail(stderr or stdout)
        raise PptMasterError(f"PPT Master 命令返回 {completed.returncode}：{detail}")

    if not output_path.exists() or output_path.stat().st_size < 100:
        raise PptMasterError("PPT Master 未生成有效 PPTX 文件。")

    metadata: dict[str, Any] = {}
    if metadata_path.exists():
        try:
            loaded = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            loaded = {}
        if isinstance(loaded, dict):
            metadata = loaded

    return {
        "file_path": str(output_path),
        "file_format": "PPTX",
        "provider_payload": metadata,
        "stdout_tail": _tail(stdout, 800),
        "stderr_tail": _tail(stderr, 800),
        "request_path": str(request_path),
    }
