import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any


@dataclass(frozen=True)
class SandboxTestCase:
    test_case_id: str
    name: str
    visibility: str
    input_values: list[int]
    position: int
    expected_values: list[int]
    expected_output_summary: str
    hidden_failure_summary: str | None
    error_tag: str
    sort_order: int


@dataclass(frozen=True)
class SandboxResult:
    status: str
    compile_exit_code: int | None
    compiler_stdout: str
    compiler_stderr: str
    tests: list[dict[str, Any]]
    failure_reason: str | None = None


FORBIDDEN_PATTERNS = [
    re.compile(r"\bint\s+main\s*\("),
    re.compile(r"\bsystem\s*\("),
    re.compile(r"\bfopen\s*\("),
    re.compile(r"\bifstream\b|\bofstream\b"),
    re.compile(r"\bthread\b"),
]


def format_array(values: list[int]) -> str:
    return "[" + ",".join(str(value) for value in values) + "]"


def _cpp_vector(values: list[int]) -> str:
    return "{" + ",".join(str(value) for value in values) + "}"


def build_driver_source(source_code: str, tests: list[SandboxTestCase]) -> str:
    test_lines = []
    for case in tests:
        expected = _cpp_vector(case.expected_values)
        values = _cpp_vector(case.input_values)
        test_lines.append(
            f'    runTest("{case.test_case_id}", "{case.name}", vector<int>{values}, '
            f"{case.position}, vector<int>{expected});"
        )

    return f"""
#include <bits/stdc++.h>
using namespace std;

struct ListNode {{
    int val;
    ListNode* next;
    ListNode(int x) : val(x), next(nullptr) {{}}
}};

{source_code}

ListNode* buildList(const vector<int>& values) {{
    ListNode* head = nullptr;
    ListNode* tail = nullptr;
    for (int value : values) {{
        ListNode* node = new ListNode(value);
        if (head == nullptr) {{
            head = node;
            tail = node;
        }} else {{
            tail->next = node;
            tail = node;
        }}
    }}
    return head;
}}

vector<int> toVector(ListNode* head) {{
    vector<int> values;
    int guard = 0;
    while (head != nullptr && guard < 100) {{
        values.push_back(head->val);
        head = head->next;
        guard++;
    }}
    if (guard >= 100) {{
        values.push_back(999999);
    }}
    return values;
}}

string formatVector(const vector<int>& values) {{
    string out = "[";
    for (size_t i = 0; i < values.size(); i++) {{
        if (i > 0) out += ",";
        out += to_string(values[i]);
    }}
    out += "]";
    return out;
}}

void cleanup(ListNode* head) {{
    unordered_set<ListNode*> seen;
    while (head != nullptr && !seen.count(head)) {{
        seen.insert(head);
        ListNode* next = head->next;
        delete head;
        head = next;
    }}
}}

void runTest(const string& id, const string& name, vector<int> values, int position, vector<int> expected) {{
    auto start = chrono::steady_clock::now();
    ListNode* head = buildList(values);
    ListNode* result = deleteAt(head, position);
    vector<int> actual = toVector(result);
    auto end = chrono::steady_clock::now();
    auto duration = chrono::duration_cast<chrono::milliseconds>(end - start).count();
    cout << id << "\\t" << formatVector(actual) << "\\t" << duration << "\\n";
    cleanup(result);
}}

int main() {{
{chr(10).join(test_lines)}
    return 0;
}}
"""


def validate_source(source_code: str) -> str | None:
    if len(source_code.encode("utf-8")) > 20 * 1024:
        return "SUBMISSION_CODE_TOO_LARGE"
    for pattern in FORBIDDEN_PATTERNS:
        if pattern.search(source_code):
            return "FORBIDDEN_CODE_PATTERN"
    return None


def security_rejected(reason: str) -> SandboxResult:
    return SandboxResult(
        status="SECURITY_REJECTED",
        compile_exit_code=None,
        compiler_stdout="",
        compiler_stderr="",
        tests=[],
        failure_reason=reason,
    )


def parse_test_stdout(stdout: str, tests: list[SandboxTestCase]) -> list[dict[str, Any]]:
    output_by_id: dict[str, tuple[str, int]] = {}
    for line in stdout.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            output_by_id[parts[0]] = (parts[1], int(parts[2]))

    results = []
    for case in tests:
        actual, duration_ms = output_by_id.get(case.test_case_id, ("", 0))
        expected = format_array(case.expected_values)
        passed = actual == expected
        if case.visibility == "HIDDEN":
            visible_actual = "已通过" if passed else (case.hidden_failure_summary or "隐藏测试未通过")
        else:
            visible_actual = actual
        results.append(
            {
                "test_case_id": case.test_case_id,
                "name": case.name,
                "visibility": case.visibility,
                "status": "PASSED" if passed else "FAILED",
                "expected_output_summary": case.expected_output_summary,
                "actual_output": visible_actual,
                "duration_ms": duration_ms,
                "error_tag": case.error_tag,
                "sort_order": case.sort_order,
                "error_message": "" if passed else "输出与期望不一致",
            }
        )
    return results


def run_linked_list_tests(
    source_code: str,
    tests: list[SandboxTestCase],
    timeout_seconds: int = 3,
) -> SandboxResult:
    rejection_reason = validate_source(source_code)
    if rejection_reason:
        return security_rejected(rejection_reason)

    with tempfile.TemporaryDirectory(prefix="codetrack_sandbox_") as tmp:
        root = Path(tmp)
        main_cpp = root / "main.cpp"
        exe = root / ("main.exe" if os.name == "nt" else "main")
        main_cpp.write_text(build_driver_source(source_code, tests), encoding="utf-8")

        compile_start = perf_counter()
        compile_cmd = ["g++", "-std=c++17", "-O2", "-pipe", str(main_cpp), "-o", str(exe)]
        compile_timeout = max(15, timeout_seconds * 5)
        try:
            compiled = subprocess.run(
                compile_cmd,
                cwd=root,
                capture_output=True,
                text=True,
                timeout=compile_timeout,
            )
        except subprocess.TimeoutExpired as exc:
            return SandboxResult(
                status="TIMEOUT",
                compile_exit_code=None,
                compiler_stdout=exc.stdout or "",
                compiler_stderr=exc.stderr or "",
                tests=[],
                failure_reason="COMPILE_TIMEOUT",
            )

        if compiled.returncode != 0:
            return SandboxResult(
                status="COMPILE_ERROR",
                compile_exit_code=compiled.returncode,
                compiler_stdout=compiled.stdout[-4000:],
                compiler_stderr=compiled.stderr[-4000:],
                tests=[],
            )

        remaining = max(1, timeout_seconds)
        try:
            executed = subprocess.run(
                [str(exe)],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=remaining,
            )
        except subprocess.TimeoutExpired as exc:
            return SandboxResult(
                status="TIMEOUT",
                compile_exit_code=0,
                compiler_stdout=compiled.stdout[-4000:],
                compiler_stderr=(compiled.stderr + (exc.stderr or ""))[-4000:],
                tests=[],
                failure_reason="RUN_TIMEOUT",
            )

        if executed.returncode != 0:
            return SandboxResult(
                status="RUNTIME_ERROR",
                compile_exit_code=0,
                compiler_stdout=compiled.stdout[-4000:],
                compiler_stderr=(compiled.stderr + executed.stderr)[-4000:],
                tests=[],
                failure_reason=f"EXIT_CODE_{executed.returncode}",
            )

        return SandboxResult(
            status="SUCCEEDED",
            compile_exit_code=0,
            compiler_stdout=compiled.stdout[-4000:],
            compiler_stderr=compiled.stderr[-4000:],
            tests=parse_test_stdout(executed.stdout, tests),
        )


def case_from_record(record: Any) -> SandboxTestCase:
    input_data = json.loads(record.input_data)
    return SandboxTestCase(
        test_case_id=record.id,
        name=record.name,
        visibility=record.visibility,
        input_values=input_data["values"],
        position=input_data["position"],
        expected_values=json.loads(record.expected_output),
        expected_output_summary=record.expected_output_summary,
        hidden_failure_summary=record.hidden_failure_summary,
        error_tag=record.error_tag,
        sort_order=record.sort_order,
    )
