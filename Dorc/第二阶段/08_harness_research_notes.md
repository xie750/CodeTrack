# Harness 工程调研笔记

## 1. 调研结论

当前主流 agent / harness 工程思路不是“先写一个万能聊天框”，而是围绕以下要素搭建：

- 项目级 agent 指令入口；
- 明确的场景和用户流；
- 可执行的工程骨架；
- 受控 mock / seed 数据；
- 可替换的 agent 和 workflow；
- 可观察、可验证、可回放的测试闭环；
- 人在关键节点上保留审阅和决策权。

因此 CodeTrack 第二阶段不应该只写产品文档，也不应该只写 Prompt。它应该是一套可让 agent 持续协作开发的 harness。

## 2. AGENTS.md 的位置

项目级 `AGENTS.md` 应放在仓库根目录，作为 agent 进入项目时优先读取的工程说明。

子目录下的 agent 文档只适合作为局部说明或细节设计，不适合作为全项目入口。

本项目采用：

```text
AGENTS.md
-> Dorc/第二阶段/README.md
-> Dorc/第二阶段/具体设计文档
```

## 3. 可借鉴的主流思路

### 3.1 OpenAI Harness Engineering

OpenAI 的 harness engineering 强调：人负责指定意图、设计环境和反馈回路，agent 负责执行。

对 CodeTrack 的启发：

- 不靠口头约定推进项目；
- 需要稳定文档、测试、seed 数据和验证脚本；
- 每一轮开发都能通过具体反馈闭环修正；
- `AGENTS.md` 不写成长文档，而是作为 agent 进入项目的地图。

参考：https://openai.com/index/harness-engineering/

### 3.2 Microsoft Agent Framework

Microsoft Agent Framework 将能力分为 agents、harness 和 workflows。它强调长任务中的计划、待办、上下文、文件访问、记忆、审批、可观测性，以及工作流中的路由、检查点和人机协作。

对 CodeTrack 的启发：

- 开放式问题用 agent；
- 固定流程用 workflow；
- 学生任务诊断这种链路应更像 workflow；
- AI 问答、自主学习更像 agent；
- 学习画像、资料保存、诊断引用需要状态管理。

参考：https://learn.microsoft.com/en-us/agent-framework/overview/

### 3.3 LangGraph

LangGraph 强调图状态、检查点、持久化、人机回环和可恢复执行。

对 CodeTrack 的启发：

- 学生学习过程需要保存状态；
- AI 诊断、提示申请、资料生成要能回放；
- 教师或系统规则可以在高风险节点介入；
- 后续助教场景可以复用这些状态。

参考：https://docs.langchain.org.cn/oss/python/langgraph/persistence

### 3.4 AutoGen

AutoGen 强调可对话、可定制、多 agent 协同、工具调用和人类参与。

对 CodeTrack 的启发：

- 不同 agent 应有清晰职责；
- 代码诊断、概念讲解、资料生成不应混成一个 agent；
- 工具结果应作为 agent 输入，而不是让模型凭空判断；
- 支持人工介入，为后续教师复核留接口。

参考：https://microsoft.github.io/autogen/docs/Use-Cases/agent_chat/

### 3.5 CrewAI

CrewAI 强调 role、goal、task、process，把 agent 当成有明确职责的协作成员。

对 CodeTrack 的启发：

- 每个助学 agent 要有明确角色和目标；
- 任务链路要定义先后顺序；
- 资料生成、学习导航、画像更新可以由不同 agent 协作完成；
- 不要让一个 agent 同时承担所有职责。

参考：https://docs.crewai.com/core-concepts/Agents

## 4. CodeTrack 第二阶段采用的 Harness 结构

```text
AGENTS.md
  项目级 agent 入口和工程约束

Dorc/第二阶段/
  产品范围
  核心链路
  页面地图
  功能设计
  UI/UX 规范
  工程 harness
  agent harness 设计
  调研笔记
  迭代计划

frontend/
  学生端页面 harness

backend/
  API、服务、画像、AI workflow harness

tests/
  核心链路验证

scripts/
  seed、演示、发布检查
```

## 5. 第二阶段落地标准

第一版 harness 不追求所有能力真实完整，但必须做到：

- 页面能跑；
- 数据能展示；
- 核心链路能走通；
- agent 输入输出结构稳定；
- mock 能被真实服务替换；
- 每个 AI 输出都有来源、置信度和下一步动作；
- 开发者和 agent 都能从根目录 `AGENTS.md` 找到正确上下文。

