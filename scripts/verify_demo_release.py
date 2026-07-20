import json
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_DIR = ROOT / "docs" / "evidence"
REPORT_JSON = EVIDENCE_DIR / "release-status.json"
REPORT_MD = EVIDENCE_DIR / "release-status.md"


def run_command(command: list[str], cwd: Path = ROOT, timeout: int = 120) -> tuple[bool, str]:
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
        output = (completed.stdout + completed.stderr).strip()
        return completed.returncode == 0, output[-4000:]
    except Exception as exc:
        return False, str(exc)


def check_file(path: Path, min_size: int = 1) -> tuple[bool, str]:
    if not path.exists():
        return False, "missing"
    size = path.stat().st_size
    if size < min_size:
        return False, f"too small: {size}"
    return True, f"{size} bytes"


def check_screenshot_evidence() -> tuple[bool, dict]:
    screenshots = [
        "student-workspace-after-diagnosis.png",
        "student-workspace-after-level2-hint.png",
        "teacher-timeline.png",
        "mobile-initial.png",
    ]
    details = {}
    ok = True
    for name in screenshots:
        passed, detail = check_file(EVIDENCE_DIR / name, min_size=5000)
        details[name] = detail
        ok = ok and passed

    report_path = EVIDENCE_DIR / "qa-report.json"
    passed, detail = check_file(report_path, min_size=100)
    details["qa-report.json"] = detail
    ok = ok and passed
    if passed:
        report = json.loads(report_path.read_text(encoding="utf-8"))
        mobile_can_scroll_x = bool(report.get("mobileMetrics", {}).get("canScrollX"))
        desktop_can_scroll_x = bool(report.get("desktopMetrics", {}).get("canScrollX"))
        checks = set(report.get("checks", []))
        required_checks = {
            "desktop student flow reached RULE_FALLBACK diagnosis",
            "level 2 progressive hint displayed",
            "teacher timeline displayed execution event",
            "teacher timeline displayed diagnosis event",
            "mobile initial task workspace loaded",
        }
        missing_checks = sorted(required_checks - checks)
        details["viewport_fit"] = {
            "desktop_can_scroll_x": desktop_can_scroll_x,
            "mobile_can_scroll_x": mobile_can_scroll_x,
        }
        details["missing_qa_checks"] = missing_checks
        ok = ok and not mobile_can_scroll_x and not desktop_can_scroll_x and not missing_checks
    return ok, details


def check_clean_migration_seed() -> tuple[bool, dict]:
    db_path = ROOT / "codetrack_release_check.db"
    if db_path.exists():
        db_path.unlink()
    env = dict(**{k: v for k, v in dict().items()})
    command_prefix = "$env:CODETRACK_DATABASE_URL='sqlite:///./codetrack_release_check.db'; "
    ok_migrate, migrate_output = run_command(
        ["powershell", "-NoProfile", "-Command", command_prefix + "python -m alembic upgrade head"],
        timeout=120,
    )
    ok_seed, seed_output = run_command(
        ["powershell", "-NoProfile", "-Command", command_prefix + "python .\\scripts\\seed_demo.py"],
        timeout=120,
    )
    counts = {}
    if db_path.exists():
        conn = sqlite3.connect(db_path)
        counts = {
            "tasks": conn.execute("select count(*) from tasks").fetchone()[0],
            "test_cases": conn.execute("select count(*) from test_cases").fetchone()[0],
            "knowledge_sources": conn.execute("select count(*) from knowledge_sources").fetchone()[0],
        }
        conn.close()
    ok_counts = counts == {"tasks": 1, "test_cases": 5, "knowledge_sources": 4}
    return ok_migrate and ok_seed and ok_counts, {
        "migration": migrate_output,
        "seed": seed_output,
        "counts": counts,
    }


def check_validation_notes() -> tuple[bool, dict]:
    notes_path = ROOT / "docs" / "demo_v0.1_validation_notes.md"
    passed, detail = check_file(notes_path, min_size=1000)
    details: dict[str, object] = {"file": detail}
    if not passed:
        return False, details
    text = notes_path.read_text(encoding="utf-8")
    required_fragments = [
        "39 passed",
        "Repeated `Idempotency-Key` requests are verified not to create extra versions",
        "Resubmitting a failed solution creates a new diagnosis",
        "Diagnosis responses include source IDs plus readable knowledge-source entries",
        "Low-confidence model output is stored as `LOW_CONFIDENCE`",
        "Teacher timeline includes submit, execution, test result, diagnosis, hint, and capability evidence events",
        "Repeated same-boundary failures create `NEGATIVE` / `REPEATED_BOUNDARY_FAILURE` evidence",
        "`.env.example` contains current backend, sandbox and model integration keys with empty secret placeholders",
        "OpenAPI now exposes the version-history response schema with `source_code` and `code_hash`",
        "Completion summary includes total duration and next-step suggestion",
        "OpenAPI now exposes the completion-summary response schema with `total_duration_ms` and `next_step_suggestion`",
        "`/ready` performs a real database dependency query and returns `database: ok`",
    ]
    missing = [fragment for fragment in required_fragments if fragment not in text]
    details["missing_fragments"] = missing
    return not missing, details


def check_env_example() -> tuple[bool, dict]:
    env_path = ROOT / ".env.example"
    passed, detail = check_file(env_path, min_size=100)
    details: dict[str, object] = {"file": detail}
    if not passed:
        return False, details
    lines = env_path.read_text(encoding="utf-8").splitlines()
    values = {}
    for line in lines:
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    required_keys = {
        "CODETRACK_DATABASE_URL",
        "CODETRACK_DEMO_USER_ID",
        "CODETRACK_SANDBOX_TIMEOUT_SECONDS",
        "CODETRACK_SANDBOX_SERVICE_URL",
        "CODETRACK_MODEL_GATEWAY_URL",
        "CODETRACK_MODEL_API_KEY",
        "CODETRACK_MODEL_API_BASE_URL",
        "CODETRACK_MODEL_NAME",
    }
    missing = sorted(required_keys - set(values))
    leaked_secret_keys = [
        key for key in ("CODETRACK_MODEL_API_KEY", "CODETRACK_MODEL_GATEWAY_URL", "CODETRACK_MODEL_NAME")
        if values.get(key)
    ]
    details["missing_keys"] = missing
    details["non_empty_secret_placeholders"] = leaked_secret_keys
    return not missing and not leaked_secret_keys, details


def main() -> int:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    checks: list[dict] = []

    screenshot_ok, screenshot_details = check_screenshot_evidence()
    checks.append({
        "id": "screenshot_evidence",
        "status": "PASS" if screenshot_ok else "FAIL",
        "details": screenshot_details,
    })

    migration_ok, migration_details = check_clean_migration_seed()
    checks.append({
        "id": "clean_migration_seed",
        "status": "PASS" if migration_ok else "FAIL",
        "details": migration_details,
    })

    notes_ok, notes_details = check_validation_notes()
    checks.append({
        "id": "validation_notes_current",
        "status": "PASS" if notes_ok else "FAIL",
        "details": notes_details,
    })

    env_ok, env_details = check_env_example()
    checks.append({
        "id": "env_example_safe",
        "status": "PASS" if env_ok else "FAIL",
        "details": env_details,
    })

    docker_available = shutil.which("docker") is not None
    checks.append({
        "id": "docker_runtime_available",
        "status": "PASS" if docker_available else "BLOCKED",
        "details": "docker command is available" if docker_available else "docker command is unavailable in this environment",
    })

    required_files = [
        "backend/app/services/model_gateway.py",
        "backend/app/services/sandbox_client.py",
        "backend/app/services/audit.py",
        "sandbox/docker_runner.py",
        "deploy/docker-compose.yml",
        "deploy/README.md",
        "frontend/scripts/capture-evidence.mjs",
        "tests/test_demo_flow.py",
        "tests/test_sandbox_service.py",
        "tests/test_api_contract_audit.py",
        "Dorc/第一阶段/CodeTrack_dev_docs_v0.1/api/02_demo_v0.1_api.md",
        ".env.example",
        "docs/demo_v0.1_validation_notes.md",
    ]
    file_details = {}
    file_ok = True
    for relative in required_files:
        passed, detail = check_file(ROOT / relative)
        file_details[relative] = detail
        file_ok = file_ok and passed
    checks.append({
        "id": "required_artifacts_present",
        "status": "PASS" if file_ok else "FAIL",
        "details": file_details,
    })

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "overall_status": "FAIL" if any(item["status"] == "FAIL" for item in checks) else (
            "BLOCKED" if any(item["status"] == "BLOCKED" for item in checks) else "PASS"
        ),
        "checks": checks,
    }
    REPORT_JSON.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# CodeTrack Demo V0.1 Release Status",
        "",
        f"Generated at: `{summary['generated_at']}`",
        "",
        f"Overall status: `{summary['overall_status']}`",
        "",
        "| Check | Status |",
        "|---|---|",
    ]
    for item in checks:
        lines.append(f"| `{item['id']}` | `{item['status']}` |")
    lines.extend([
        "",
        "Notes:",
        "- `BLOCKED` means the implementation has an artifact or command path, but this machine lacks the external runtime needed to execute it.",
        "- Docker runtime validation remains blocked on this machine because `docker` is unavailable.",
    ])
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if summary["overall_status"] == "FAIL" else 0


if __name__ == "__main__":
    sys.exit(main())
