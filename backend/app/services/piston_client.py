from __future__ import annotations

import json
from dataclasses import dataclass
from time import perf_counter
from typing import Any

import httpx

from backend.app.models import TestCase
from backend.app.services.programming_specs import PISTON_LANGUAGE_ALIASES, ProgrammingSpec, normalize_language


@dataclass(frozen=True)
class PistonRunResult:
    status: str
    compile_exit_code: int | None
    compiler_stdout: str
    compiler_stderr: str
    tests: list[dict[str, Any]]
    failure_reason: str | None
    resource_usage: dict[str, Any]


def _loads(value: str) -> Any:
    return json.loads(value)


def _case_payload(record: TestCase) -> dict[str, Any]:
    return {
        "test_case_id": record.id,
        "name": record.name,
        "visibility": record.visibility,
        "input_data": _loads(record.input_data),
        "expected_output": _loads(record.expected_output),
        "expected_output_summary": record.expected_output_summary,
        "hidden_failure_summary": record.hidden_failure_summary,
        "error_tag": record.error_tag,
        "sort_order": record.sort_order,
    }


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _safe_case_json(cases: list[dict[str, Any]]) -> str:
    return json.dumps(
        [
            {
                "id": case["test_case_id"],
                "name": case["name"],
                "input": case["input_data"],
                "expected": case["expected_output"],
            }
            for case in cases
        ],
        ensure_ascii=False,
    )


def _build_python_two_sum(source_code: str, cases: list[dict[str, Any]]) -> str:
    return f"""import json
import time

{source_code}

TESTS = {_safe_case_json(cases)}

for case in TESTS:
    started = time.perf_counter()
    try:
        nums = list(case["input"]["nums"])
        target = case["input"]["target"]
        actual = Solution().twoSum(nums, target)
        duration_ms = int((time.perf_counter() - started) * 1000)
        print(json.dumps({{"id": case["id"], "actual": actual, "duration_ms": duration_ms}}, ensure_ascii=False))
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        print(json.dumps({{"id": case["id"], "error": type(exc).__name__ + ": " + str(exc), "duration_ms": duration_ms}}, ensure_ascii=False))
"""


def _build_python_linked_list_delete(source_code: str, cases: list[dict[str, Any]]) -> str:
    return f"""import json
import time

{source_code}

TESTS = {_safe_case_json(cases)}

for case in TESTS:
    started = time.perf_counter()
    try:
        values = list(case["input"]["values"])
        position = case["input"]["position"]
        actual = Solution().deleteAt(values, position)
        duration_ms = int((time.perf_counter() - started) * 1000)
        print(json.dumps({{"id": case["id"], "actual": actual, "duration_ms": duration_ms}}, ensure_ascii=False))
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        print(json.dumps({{"id": case["id"], "error": type(exc).__name__ + ": " + str(exc), "duration_ms": duration_ms}}, ensure_ascii=False))
"""


def _cpp_vector(values: list[int]) -> str:
    return "{" + ",".join(str(value) for value in values) + "}"


def _java_array(values: list[int]) -> str:
    return "new int[]{" + ",".join(str(value) for value in values) + "}"


def _java_string(value: str) -> str:
    return json.dumps(value)


def _build_cpp_two_sum(source_code: str, cases: list[dict[str, Any]]) -> str:
    test_lines = []
    for case in cases:
        input_data = case["input_data"]
        nums = _cpp_vector(input_data["nums"])
        expected = _json(case["expected_output"])
        test_lines.append(
            f'    runTest("{case["test_case_id"]}", vector<int>{nums}, {int(input_data["target"])}, R"json({expected})json");'
        )
    return f"""#include <bits/stdc++.h>
using namespace std;

{source_code}

string vectorJson(vector<int> values) {{
    string out = "[";
    for (size_t i = 0; i < values.size(); i++) {{
        if (i > 0) out += ",";
        out += to_string(values[i]);
    }}
    out += "]";
    return out;
}}

void runTest(const string& id, vector<int> nums, int target, const string& expected) {{
    auto started = chrono::steady_clock::now();
    try {{
        Solution solution;
        vector<int> actual = solution.twoSum(nums, target);
        auto ended = chrono::steady_clock::now();
        auto duration = chrono::duration_cast<chrono::milliseconds>(ended - started).count();
        cout << "{{\\\"id\\\":\\\"" << id << "\\\",\\\"actual\\\":" << vectorJson(actual)
             << ",\\\"duration_ms\\\":" << duration << "}}" << "\\n";
    }} catch (const exception& exc) {{
        auto ended = chrono::steady_clock::now();
        auto duration = chrono::duration_cast<chrono::milliseconds>(ended - started).count();
        cout << "{{\\\"id\\\":\\\"" << id << "\\\",\\\"error\\\":\\\"" << exc.what()
             << "\\\",\\\"duration_ms\\\":" << duration << "}}" << "\\n";
    }}
}}

int main() {{
{chr(10).join(test_lines)}
    return 0;
}}
"""


def _build_java_two_sum(source_code: str, cases: list[dict[str, Any]]) -> str:
    test_lines = []
    for case in cases:
        input_data = case["input_data"]
        nums = _java_array(input_data["nums"])
        test_lines.append(
            f'        runTest({_java_string(case["test_case_id"])}, {nums}, {int(input_data["target"])});'
        )
    return f"""import java.util.*;

public class Main {{
    static String jsonArray(int[] values) {{
        if (values == null) return "null";
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < values.length; i++) {{
            if (i > 0) out.append(",");
            out.append(values[i]);
        }}
        out.append("]");
        return out.toString();
    }}

    static String jsonString(String value) {{
        return value.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"");
    }}

    static void runTest(String id, int[] nums, int target) {{
        long started = System.nanoTime();
        try {{
            int[] actual = new Solution().twoSum(nums, target);
            long durationMs = (System.nanoTime() - started) / 1_000_000;
            System.out.println("{{\\"id\\":\\"" + id + "\\",\\"actual\\":" + jsonArray(actual) + ",\\"duration_ms\\":" + durationMs + "}}");
        }} catch (Exception exc) {{
            long durationMs = (System.nanoTime() - started) / 1_000_000;
            System.out.println("{{\\"id\\":\\"" + id + "\\",\\"error\\":\\"" + jsonString(exc.getClass().getSimpleName() + ": " + exc.getMessage()) + "\\",\\"duration_ms\\":" + durationMs + "}}");
        }}
    }}

    public static void main(String[] args) {{
{chr(10).join(test_lines)}
    }}
}}

{source_code}
"""


def _build_java_linked_list_delete(source_code: str, cases: list[dict[str, Any]]) -> str:
    test_lines = []
    for case in cases:
        input_data = case["input_data"]
        values = _java_array(input_data["values"])
        test_lines.append(
            f'        runTest({_java_string(case["test_case_id"])}, {values}, {int(input_data["position"])});'
        )
    return f"""import java.util.*;

public class Main {{
    static String jsonArray(int[] values) {{
        if (values == null) return "null";
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < values.length; i++) {{
            if (i > 0) out.append(",");
            out.append(values[i]);
        }}
        out.append("]");
        return out.toString();
    }}

    static String jsonString(String value) {{
        return value.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"");
    }}

    static void runTest(String id, int[] values, int position) {{
        long started = System.nanoTime();
        try {{
            int[] actual = new Solution().deleteAt(values, position);
            long durationMs = (System.nanoTime() - started) / 1_000_000;
            System.out.println("{{\\"id\\":\\"" + id + "\\",\\"actual\\":" + jsonArray(actual) + ",\\"duration_ms\\":" + durationMs + "}}");
        }} catch (Exception exc) {{
            long durationMs = (System.nanoTime() - started) / 1_000_000;
            System.out.println("{{\\"id\\":\\"" + id + "\\",\\"error\\":\\"" + jsonString(exc.getClass().getSimpleName() + ": " + exc.getMessage()) + "\\",\\"duration_ms\\":" + durationMs + "}}");
        }}
    }}

    public static void main(String[] args) {{
{chr(10).join(test_lines)}
    }}
}}

{source_code}
"""


def _build_javascript_two_sum(source_code: str, cases: list[dict[str, Any]]) -> str:
    return f"""{source_code}

const tests = {_safe_case_json(cases)};

for (const testCase of tests) {{
  const started = Date.now();
  try {{
    const actual = twoSum([...testCase.input.nums], testCase.input.target);
    console.log(JSON.stringify({{ id: testCase.id, actual, duration_ms: Date.now() - started }}));
  }} catch (error) {{
    console.log(JSON.stringify({{ id: testCase.id, error: `${{error.name}}: ${{error.message}}`, duration_ms: Date.now() - started }}));
  }}
}}
"""


def _stdio_filename(language: str) -> str:
    return {
        "CPP": "main.cpp",
        "PYTHON": "main.py",
        "JAVA": "Main.java",
        "JAVASCRIPT": "main.js",
    }.get(language, "main.txt")


def build_piston_source(language: str, spec: ProgrammingSpec, source_code: str, cases: list[dict[str, Any]]) -> tuple[str, str]:
    normalized = normalize_language(language)
    if spec.runner_profile == "leetcode_two_sum_v1":
        if normalized == "PYTHON":
            return "main.py", _build_python_two_sum(source_code, cases)
        if normalized == "JAVA":
            return "Main.java", _build_java_two_sum(source_code, cases)
        if normalized == "CPP":
            return "main.cpp", _build_cpp_two_sum(source_code, cases)
        if normalized == "JAVASCRIPT":
            return "main.js", _build_javascript_two_sum(source_code, cases)
    if spec.runner_profile == "linked_list_delete_transform_v1":
        if normalized == "PYTHON":
            return "main.py", _build_python_linked_list_delete(source_code, cases)
        if normalized == "JAVA":
            return "Main.java", _build_java_linked_list_delete(source_code, cases)
    if spec.runner_profile == "stdio_cpp_v1" and normalized == "CPP":
        return _stdio_filename(normalized), source_code
    raise ValueError(f"Unsupported runner profile/language: {spec.runner_profile}/{normalized}")


def outputs_match(actual: Any, expected: Any, comparison: str) -> bool:
    if comparison == "unordered_json_array":
        if not isinstance(actual, list) or not isinstance(expected, list):
            return False
        try:
            return sorted(actual) == sorted(expected)
        except TypeError:
            return False
    return actual == expected


def parse_case_stdout(stdout: str) -> dict[str, dict[str, Any]]:
    parsed: dict[str, dict[str, Any]] = {}
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        case_id = payload.get("id")
        if isinstance(case_id, str):
            parsed[case_id] = payload
    return parsed


def map_tests(stdout: str, cases: list[dict[str, Any]], comparison: str) -> list[dict[str, Any]]:
    output_by_id = parse_case_stdout(stdout)
    results: list[dict[str, Any]] = []
    for case in cases:
        output = output_by_id.get(case["test_case_id"])
        error = output.get("error") if output else "No structured output was produced for this case."
        actual = output.get("actual") if output and "actual" in output else None
        passed = error is None and outputs_match(actual, case["expected_output"], comparison)
        if case["visibility"] == "HIDDEN":
            visible_actual = "已通过" if passed else (case["hidden_failure_summary"] or "隐藏测试未通过")
        elif error:
            visible_actual = error
        else:
            visible_actual = _json(actual)
        results.append(
            {
                "test_case_id": case["test_case_id"],
                "name": case["name"],
                "visibility": case["visibility"],
                "status": "PASSED" if passed else "FAILED",
                "expected_output_summary": case["expected_output_summary"],
                "actual_output": visible_actual,
                "duration_ms": int(output.get("duration_ms", 0)) if output else 0,
                "error_tag": case["error_tag"],
                "sort_order": case["sort_order"],
                "error_message": "" if passed else (error or "输出与期望不一致"),
            }
        )
    return results


def _expected_stdout(value: Any) -> str:
    if isinstance(value, str):
        return value
    return _json(value)


def _case_stdin(input_data: Any) -> str:
    if isinstance(input_data, dict) and "stdin" in input_data:
        return str(input_data["stdin"])
    if isinstance(input_data, str):
        return input_data
    return _json(input_data)


def _stdio_case_result(case: dict[str, Any], stdout: str, stderr: str, *, duration_ms: int) -> dict[str, Any]:
    actual = stdout.rstrip()
    expected = _expected_stdout(case["expected_output"]).rstrip()
    passed = actual == expected and stderr.strip() == ""
    if case["visibility"] == "HIDDEN":
        visible_actual = "已通过" if passed else (case["hidden_failure_summary"] or "隐藏测试未通过")
    else:
        visible_actual = actual if actual else stderr[-1000:]
    return {
        "test_case_id": case["test_case_id"],
        "name": case["name"],
        "visibility": case["visibility"],
        "status": "PASSED" if passed else "FAILED",
        "expected_output_summary": case["expected_output_summary"],
        "actual_output": visible_actual,
        "duration_ms": duration_ms,
        "error_tag": case["error_tag"],
        "sort_order": case["sort_order"],
        "error_message": "" if passed else "Output did not match expected stdout.",
    }


def _post_execute(
    *,
    base_url: str,
    piston_language: str,
    filename: str,
    content: str,
    stdin: str,
    timeout_seconds: int,
) -> dict[str, Any]:
    response = httpx.post(
        f"{base_url.rstrip('/')}/api/v2/execute",
        json={
            "language": piston_language,
            "version": "*",
            "files": [{"name": filename, "content": content}],
            "stdin": stdin,
            "compile_timeout": max(1000, timeout_seconds * 1000),
            "run_timeout": max(1000, timeout_seconds * 1000),
        },
        timeout=max(20, timeout_seconds + 15),
        trust_env=False,
    )
    response.raise_for_status()
    return response.json()


def _compile_error_result(compile_data: dict[str, Any], spec: ProgrammingSpec, started: float) -> PistonRunResult:
    return PistonRunResult(
        status="COMPILE_ERROR",
        compile_exit_code=int(compile_data.get("code") or 1),
        compiler_stdout=(compile_data.get("stdout") or "")[-4000:],
        compiler_stderr=(compile_data.get("stderr") or compile_data.get("output") or "")[-4000:],
        tests=[],
        failure_reason=None,
        resource_usage={"profile": spec.runner_profile, "piston_ms": int((perf_counter() - started) * 1000)},
    )


def execute_stdio_with_piston(
    *,
    base_url: str,
    piston_language: str,
    filename: str,
    content: str,
    cases: list[dict[str, Any]],
    spec: ProgrammingSpec,
    timeout_seconds: int,
) -> PistonRunResult:
    started = perf_counter()
    results: list[dict[str, Any]] = []
    compiler_stdout = ""
    compiler_stderr = ""
    try:
        for case in cases:
            case_started = perf_counter()
            data = _post_execute(
                base_url=base_url,
                piston_language=piston_language,
                filename=filename,
                content=content,
                stdin=_case_stdin(case["input_data"]),
                timeout_seconds=timeout_seconds,
            )
            compile_data = data.get("compile") or {}
            run_data = data.get("run") or {}
            compile_code = compile_data.get("code")
            compiler_stdout = (compile_data.get("stdout") or "")[-4000:]
            compiler_stderr = (compile_data.get("stderr") or compile_data.get("output") or "")[-4000:]
            if compile_code not in (None, 0):
                return _compile_error_result(compile_data, spec, started)

            signal = run_data.get("signal")
            stdout = run_data.get("stdout") or ""
            stderr = run_data.get("stderr") or run_data.get("output") or ""
            if signal:
                return PistonRunResult(
                    status="TIMEOUT" if "KILL" in str(signal).upper() else "RUNTIME_ERROR",
                    compile_exit_code=0,
                    compiler_stdout=stdout[-4000:],
                    compiler_stderr=stderr[-4000:],
                    tests=results,
                    failure_reason=f"SIGNAL_{signal}",
                    resource_usage={"profile": spec.runner_profile, "piston_ms": int((perf_counter() - started) * 1000)},
                )
            run_code = run_data.get("code")
            if run_code not in (None, 0):
                return PistonRunResult(
                    status="RUNTIME_ERROR",
                    compile_exit_code=0,
                    compiler_stdout=stdout[-4000:],
                    compiler_stderr=stderr[-4000:],
                    tests=results,
                    failure_reason=f"EXIT_CODE_{run_code}",
                    resource_usage={"profile": spec.runner_profile, "piston_ms": int((perf_counter() - started) * 1000)},
                )
            results.append(
                _stdio_case_result(
                    case,
                    stdout,
                    stderr,
                    duration_ms=int((perf_counter() - case_started) * 1000),
                )
            )
    except Exception as exc:
        return PistonRunResult(
            status="INFRASTRUCTURE_ERROR",
            compile_exit_code=None,
            compiler_stdout="",
            compiler_stderr="",
            tests=[],
            failure_reason=f"PISTON_UNAVAILABLE: {type(exc).__name__}",
            resource_usage={"profile": spec.runner_profile, "piston_url": base_url},
        )

    return PistonRunResult(
        status="SUCCEEDED",
        compile_exit_code=0,
        compiler_stdout=compiler_stdout,
        compiler_stderr=compiler_stderr,
        tests=results,
        failure_reason=None,
        resource_usage={
            "profile": spec.runner_profile,
            "piston_ms": int((perf_counter() - started) * 1000),
            "case_count": len(cases),
        },
    )


def execute_with_piston(
    *,
    base_url: str,
    execution_id: str,
    language: str,
    spec: ProgrammingSpec,
    source_code: str,
    test_cases: list[TestCase],
    timeout_seconds: int,
) -> PistonRunResult:
    cases = [_case_payload(case) for case in test_cases]
    normalized = normalize_language(language)
    piston_language = PISTON_LANGUAGE_ALIASES.get(normalized)
    if not piston_language:
        return PistonRunResult(
            status="INFRASTRUCTURE_ERROR",
            compile_exit_code=None,
            compiler_stdout="",
            compiler_stderr="",
            tests=[],
            failure_reason="LANGUAGE_NOT_MAPPED_TO_PISTON",
            resource_usage={"profile": spec.runner_profile, "execution_id": execution_id},
        )

    try:
        filename, content = build_piston_source(normalized, spec, source_code, cases)
    except ValueError as exc:
        return PistonRunResult(
            status="INFRASTRUCTURE_ERROR",
            compile_exit_code=None,
            compiler_stdout="",
            compiler_stderr=str(exc),
            tests=[],
            failure_reason="RUNNER_PROFILE_NOT_SUPPORTED",
            resource_usage={"profile": spec.runner_profile, "execution_id": execution_id},
        )

    if spec.runner_profile == "stdio_cpp_v1":
        return execute_stdio_with_piston(
            base_url=base_url,
            piston_language=piston_language,
            filename=filename,
            content=content,
            cases=cases,
            spec=spec,
            timeout_seconds=timeout_seconds,
        )

    started = perf_counter()
    try:
        data = _post_execute(
            base_url=base_url,
            piston_language=piston_language,
            filename=filename,
            content=content,
            stdin="",
            timeout_seconds=timeout_seconds,
        )
    except Exception as exc:
        return PistonRunResult(
            status="INFRASTRUCTURE_ERROR",
            compile_exit_code=None,
            compiler_stdout="",
            compiler_stderr="",
            tests=[],
            failure_reason=f"PISTON_UNAVAILABLE: {type(exc).__name__}",
            resource_usage={"profile": spec.runner_profile, "piston_url": base_url},
        )

    compile_data = data.get("compile") or {}
    run_data = data.get("run") or {}
    compile_code = compile_data.get("code")
    if compile_code not in (None, 0):
        return _compile_error_result(compile_data, spec, started)

    run_code = run_data.get("code")
    signal = run_data.get("signal")
    stdout = run_data.get("stdout") or ""
    stderr = run_data.get("stderr") or run_data.get("output") or ""
    if signal:
        return PistonRunResult(
            status="TIMEOUT" if "KILL" in str(signal).upper() else "RUNTIME_ERROR",
            compile_exit_code=0,
            compiler_stdout=stdout[-4000:],
            compiler_stderr=stderr[-4000:],
            tests=[],
            failure_reason=f"SIGNAL_{signal}",
            resource_usage={"profile": spec.runner_profile, "piston_ms": int((perf_counter() - started) * 1000)},
        )
    if run_code not in (None, 0):
        return PistonRunResult(
            status="RUNTIME_ERROR",
            compile_exit_code=0,
            compiler_stdout=stdout[-4000:],
            compiler_stderr=stderr[-4000:],
            tests=[],
            failure_reason=f"EXIT_CODE_{run_code}",
            resource_usage={"profile": spec.runner_profile, "piston_ms": int((perf_counter() - started) * 1000)},
        )

    return PistonRunResult(
        status="SUCCEEDED",
        compile_exit_code=0,
        compiler_stdout=(compile_data.get("stdout") or "")[-4000:],
        compiler_stderr=(compile_data.get("stderr") or "")[-4000:],
        tests=map_tests(stdout, cases, spec.comparison),
        failure_reason=None,
        resource_usage={"profile": spec.runner_profile, "piston_ms": int((perf_counter() - started) * 1000)},
    )
