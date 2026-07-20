import os
import subprocess
import tempfile
from pathlib import Path

from sandbox.runner import (
    SandboxResult,
    SandboxTestCase,
    build_driver_source,
    parse_test_stdout,
    security_rejected,
    validate_source,
)


DEFAULT_RUNNER_IMAGE = "codetrack-sandbox-runner:0.1"


def docker_run_command(
    workdir: Path,
    image: str,
    timeout_seconds: int,
    memory: str = "256m",
    cpus: str = "1.0",
    pids_limit: int = 64,
) -> list[str]:
    timeout = max(1, timeout_seconds)
    compile_timeout = max(10, timeout_seconds * 3)
    script = (
        f"g++ -std=c++17 -O2 -pipe /workspace/main.cpp -o /tmp/main "
        f"&& timeout {timeout}s /tmp/main"
    )
    return [
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--user",
        "10001:10001",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        str(pids_limit),
        "--memory",
        memory,
        "--cpus",
        cpus,
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=64m",
        "-v",
        f"{workdir.as_posix()}:/workspace:ro",
        "--workdir",
        "/workspace",
        image,
        "/bin/sh",
        "-lc",
        f"timeout {compile_timeout}s sh -lc {script!r}",
    ]


def run_linked_list_tests_in_docker(
    source_code: str,
    tests: list[SandboxTestCase],
    timeout_seconds: int = 3,
    image: str | None = None,
) -> SandboxResult:
    rejection_reason = validate_source(source_code)
    if rejection_reason:
        return security_rejected(rejection_reason)

    runner_image = image or os.getenv("CODETRACK_SANDBOX_RUNNER_IMAGE", DEFAULT_RUNNER_IMAGE)
    with tempfile.TemporaryDirectory(prefix="codetrack_docker_sandbox_") as tmp:
        root = Path(tmp).resolve()
        (root / "main.cpp").write_text(build_driver_source(source_code, tests), encoding="utf-8")
        command = docker_run_command(root, runner_image, timeout_seconds)
        try:
            executed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=max(15, timeout_seconds + 12),
            )
        except FileNotFoundError:
            return SandboxResult(
                status="INFRASTRUCTURE_ERROR",
                compile_exit_code=None,
                compiler_stdout="",
                compiler_stderr="docker command not found",
                tests=[],
                failure_reason="DOCKER_NOT_AVAILABLE",
            )
        except subprocess.TimeoutExpired as exc:
            return SandboxResult(
                status="TIMEOUT",
                compile_exit_code=None,
                compiler_stdout=exc.stdout or "",
                compiler_stderr=exc.stderr or "",
                tests=[],
                failure_reason="DOCKER_RUN_TIMEOUT",
            )

        stdout = executed.stdout[-65536:]
        stderr = executed.stderr[-65536:]
        if executed.returncode == 124:
            return SandboxResult(
                status="TIMEOUT",
                compile_exit_code=None,
                compiler_stdout=stdout,
                compiler_stderr=stderr,
                tests=[],
                failure_reason="RUN_TIMEOUT",
            )
        if executed.returncode != 0:
            status = "COMPILE_ERROR" if "error:" in stderr else "RUNTIME_ERROR"
            return SandboxResult(
                status=status,
                compile_exit_code=executed.returncode,
                compiler_stdout=stdout,
                compiler_stderr=stderr,
                tests=[],
                failure_reason=f"EXIT_CODE_{executed.returncode}",
            )

        return SandboxResult(
            status="SUCCEEDED",
            compile_exit_code=0,
            compiler_stdout="",
            compiler_stderr=stderr,
            tests=parse_test_stdout(stdout, tests),
        )
