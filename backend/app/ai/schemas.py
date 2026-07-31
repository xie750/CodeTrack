"""AI 输出结构与运行上下文。

只放真正的交集。内置版 §16 的 `StudentAgentState`（`message` / `intent` /
`page_context`）是按导师对话长的，套不到代码诊断上，等第 2 步 tutor_chat
有真实需要时再定，不在这里凭空发明。
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class DiagnosisOutput:
    """代码诊断工作流的模型输出。

    字段与改造前的 `model_gateway.GatewayDiagnosis` 完全一致
    —— `model_gateway.GatewayDiagnosis` 现在就是本类的别名，
    `tests/test_model_gateway.py` 的属性访问契约不变。
    """

    diagnosis_type: str
    confidence: float
    explanation: str
    verified_evidence_ids: list[str]
    knowledge_source_ids: list[str]
    hint: str
    needs_teacher_review: bool
    model_provider: str
    model_name: str


@dataclass
class AgentRunContext:
    """一次 AI 运行的身份信息，供 `run_recorder` 落库。

    `run_id` 由调用方在 `start_run` 前生成，好处是失败路径上也能把它
    放进 `ApiError.details` / 审计日志（内置版 §17.5 的「保留 run_id」）。
    """

    run_id: str
    workflow_type: str
    student_id: str | None = None
    course_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)
