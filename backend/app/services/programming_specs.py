from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.models import Task


LANGUAGE_LABELS = {
    "CPP": "C++17",
    "PYTHON": "Python 3",
    "JAVASCRIPT": "JavaScript",
}

PISTON_LANGUAGE_ALIASES = {
    "CPP": "c++",
    "PYTHON": "python",
    "JAVASCRIPT": "javascript",
}


@dataclass(frozen=True)
class ProgrammingSpec:
    runner_profile: str
    supported_languages: list[str]
    default_language: str
    function_signature: str
    editable_region: str
    language_templates: dict[str, str]
    rules: list[str]
    comparison: str = "exact_json"

    def supports(self, language: str) -> bool:
        return normalize_language(language) in self.supported_languages

    def template_for(self, language: str | None = None) -> str:
        selected = normalize_language(language or self.default_language)
        return self.language_templates.get(selected) or self.language_templates[self.default_language]

    def to_api(self) -> dict[str, Any]:
        return {
            "function_signature": self.function_signature,
            "editable_region": self.editable_region,
            "student_template": self.template_for(),
            "rules": self.rules,
            "runner_profile": self.runner_profile,
            "supported_languages": self.supported_languages,
            "default_language": self.default_language,
            "language_templates": self.language_templates,
            "language_labels": {key: LANGUAGE_LABELS.get(key, key) for key in self.supported_languages},
            "comparison": self.comparison,
        }


def normalize_language(language: str) -> str:
    normalized = (language or "").strip().upper().replace("-", "_")
    aliases = {
        "C++": "CPP",
        "CXX": "CPP",
        "PY": "PYTHON",
        "JS": "JAVASCRIPT",
        "NODE": "JAVASCRIPT",
        "NODEJS": "JAVASCRIPT",
    }
    return aliases.get(normalized, normalized)


TWO_SUM_SPEC = ProgrammingSpec(
    runner_profile="leetcode_two_sum_v1",
    supported_languages=["PYTHON", "CPP", "JAVASCRIPT"],
    default_language="PYTHON",
    function_signature="twoSum(nums, target) -> indices",
    editable_region="SOLUTION_ONLY",
    comparison="unordered_json_array",
    language_templates={
        "PYTHON": """class Solution:
    def twoSum(self, nums, target):
        # Return the indices of two numbers whose sum is target.
        return []
""",
        "CPP": """class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        // Return the indices of two numbers whose sum is target.
        return {};
    }
};
""",
        "JAVASCRIPT": """function twoSum(nums, target) {
  // Return the indices of two numbers whose sum is target.
  return [];
}
""",
    },
    rules=[
        "Return two indices, not the values themselves.",
        "Each test has exactly one valid answer.",
        "The same element cannot be used twice.",
        "For this task, index order does not matter.",
    ],
)


LINKED_LIST_DELETE_SPEC = ProgrammingSpec(
    runner_profile="legacy_linked_list_delete_v1",
    supported_languages=["CPP"],
    default_language="CPP",
    function_signature="ListNode* deleteAt(ListNode* head, int position);",
    editable_region="FUNCTION_ONLY",
    language_templates={
        "CPP": """ListNode* deleteAt(ListNode* head, int position) {
    // Implement deletion at the given position.
    return head;
}
""",
    },
    rules=[
        "Return nullptr for an empty list.",
        "Return the original list for an invalid position.",
        "When deleting the head node, return the new head.",
    ],
)


STDIO_CPP_SPEC = ProgrammingSpec(
    runner_profile="stdio_cpp_v1",
    supported_languages=["CPP"],
    default_language="CPP",
    function_signature="Read from stdin and write to stdout.",
    editable_region="FULL_PROGRAM",
    language_templates={
        "CPP": """#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    return 0;
}
""",
    },
    rules=[
        "Read all input from standard input.",
        "Write only the required answer to standard output.",
    ],
)


def get_programming_spec(task: Task) -> ProgrammingSpec:
    signature = task.interface_spec or ""
    if task.id == "task_two_sum_001" or "twoSum" in signature:
        return TWO_SUM_SPEC
    if "deleteAt" in signature:
        return LINKED_LIST_DELETE_SPEC
    return STDIO_CPP_SPEC
