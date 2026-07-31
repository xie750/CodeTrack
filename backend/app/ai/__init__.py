"""CodeTrack AI 底座。

本包只提供可复用的底层能力，不含任何具体工作流：

- `errors`      —— 模型调用的分类异常，取代静默 `return None`
- `schemas`     —— AI 输出结构与运行上下文
- `llm_client`  —— 通用模型客户端（async 内核 + sync 桥）
- `guardrails`  —— 内置版 §13.1 的七道护栏
- `run_recorder`—— AgentRun / AgentStep 落库

具体工作流（代码诊断、AI 导师……）留在 `backend/app/services/` 下，
等第二个工作流出现后再抽通用编排层。
"""
