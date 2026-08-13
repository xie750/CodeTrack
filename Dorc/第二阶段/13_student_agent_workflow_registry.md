# 学生端智能体工作流登记册

## 1. 文档目的

本文档用于沉淀 CodeTrack 学生端智能体工作流的长期设计。

后续如果新增、拆分或调整工作流，优先在本文档中补充，而不是分散写在临时说明里。

本文档承担三件事：

- 记录当前学生端 AI 大工作流；
- 固定后端工作流、工具、状态和输出契约；
- 为后续补充自主学习、资料沉淀、练习生成、学习计划等材料提供统一入口。

本文档不是一次性方案。它是后续迭代的工作流总账。

## 2. 当前实现原则

第一版学生端智能体不做自由多智能体自治，而采用：

```text
一个学生学习助手
+ 多条固定工作流
+ 一组受控后端工具
+ 统一安全校验
+ 数据库运行记录
```

核心原则：

- 模型负责解释、生成和内容组织；
- 规则负责判断、限制和排序；
- 工具负责读取和写入业务数据；
- 工作流负责组织步骤；
- 数据库负责保留过程证据；
- 前端只消费结构化结果，不执行模型生成的任意指令。

第一版不接 Dify、n8n、独立 Agent 服务或外部工作流平台。当前推荐使用现有 FastAPI 后端内置工作流实现，等流程稳定后再评估引入 LangGraph。

## 3. 总体大工作流

学生端大闭环分为两条主线和一个贯穿式 AI 助学入口。

### 3.1 教师任务学习闭环

```text
学习首页
-> 已分配课程任务
-> 任务工作台
-> 代码编辑和提交
-> 沙箱执行
-> 系统验证结果
-> AI 诊断
-> 分层提示
-> 重新提交
-> 学习总结
-> 学习者画像更新
-> 保存学习资料
-> 下一步推荐
```

首版重点：

- 系统验证结果必须先于 AI 解释展示；
- AI 诊断必须带引用、置信度和下一步动作；
- 提示分为三级，不能直接泄露完整答案；
- 通过后生成学习总结，并进入我的资料或可保存为资料。

### 3.2 自主学习闭环

```text
自主学习
-> 选择课程和知识点
-> 查看知识点详情、前置知识、后继知识
-> AI 生成讲解 / 笔记 / 卡片 / 思维导图 / PPT 大纲 / 练习
-> 展示引用来源和置信度
-> 学生预览
-> 保存为学习资料
-> 记录学习事件
-> 学习者画像更新
-> 下一步推荐
```

首版重点：

- 知识点从课程知识图谱或课程知识点表读取；
- 内容生成必须绑定课程和知识点；
- 生成内容必须保留引用来源；
- 保存的资料必须进入我的资料页，而不是只停留在当前页面。

### 3.3 AI 导师贯穿入口

```text
学生提问
-> 识别页面上下文
-> 识别意图
-> 读取课程、任务、提交、画像和资料上下文
-> 检索课程知识来源
-> 生成结构化回答
-> 引用校验和答案泄露校验
-> 返回回答、置信度、引用和可执行动作
-> 保存对话和运行记录
```

AI 导师不是通用聊天框。它必须结合：

- 当前课程；
- 当前页面；
- 当前任务或知识点；
- 学习画像；
- 课程知识库；
- 学生有权访问的数据。

## 4. 后端推荐结构

建议学生端智能体相关代码集中在：

```text
backend/app/ai/
├── schemas.py
├── orchestrator.py
├── intent_router.py
├── context_builder.py
├── knowledge_retriever.py
├── prompt_builder.py
├── guardrails.py
├── run_recorder.py
├── tools/
│   ├── student_tools.py
│   ├── task_tools.py
│   ├── submission_tools.py
│   ├── profile_tools.py
│   ├── knowledge_tools.py
│   └── artifact_tools.py
└── workflows/
    ├── code_coach.py
    ├── tutor_chat.py
    ├── self_study.py
    ├── practice_generation.py
    ├── artifact_generation.py
    └── learning_plan.py
```

各模块职责：

| 模块 | 职责 |
| --- | --- |
| `schemas.py` | 工作流输入、状态、输出 Schema |
| `orchestrator.py` | 统一接收请求，选择并执行工作流 |
| `intent_router.py` | 将学生问题归类到固定意图 |
| `context_builder.py` | 组装学生、课程、任务、画像、提交和页面上下文 |
| `knowledge_retriever.py` | 检索当前课程可引用知识来源 |
| `prompt_builder.py` | 按工作流构建提示词 |
| `guardrails.py` | 权限、引用、泄露、动作白名单和结构校验 |
| `run_recorder.py` | 保存 AgentRun、AgentStep、输入输出摘要 |
| `tools/` | 受控业务数据读写函数 |
| `workflows/` | 各条固定学生学习工作流 |

## 5. 统一状态对象

第一版工作流可以先使用普通 Python 函数串联，但所有步骤应围绕同一个状态对象读写。

建议状态对象：

```python
class StudentAgentState(BaseModel):
    run_id: str
    student_id: str
    course_id: str
    page_context: str

    message: str | None = None
    intent: str | None = None
    assignment_id: str | None = None
    task_id: str | None = None
    knowledge_point: str | None = None
    output_type: str | None = None

    student_context: dict | None = None
    course_context: dict | None = None
    task_context: dict | None = None
    submission_context: dict | None = None
    profile_context: dict | None = None
    artifact_context: dict | None = None
    knowledge_sources: list[dict] = []

    model_output: dict | None = None
    final_output: dict | None = None
    confidence: float = 0
    safety: dict = {}
    actions: list[dict] = []
    errors: list[str] = []
```

推荐执行形态：

```text
create_run
-> validate_scope
-> build_context
-> route_intent
-> retrieve_knowledge
-> generate
-> validate_output
-> build_actions
-> save_result
-> return_response
```

## 6. 统一工具层

智能体不能直接访问 SQLAlchemy Session 或自由拼 SQL。所有数据访问必须通过工具层。

### 6.1 学生上下文工具

```text
get_student_context
get_student_courses
get_current_class
get_current_course
```

返回学生身份、班级、课程和任课教师，不返回其他学生信息。

### 6.2 任务工具

```text
get_assignment_context
get_task_public_context
get_task_progress
get_question_attempt_summary
```

只能返回学生有权看到的公开任务信息。

不得返回：

- 隐藏测试输入；
- 隐藏测试预期输出；
- 参考答案；
- 教师内部备注。

### 6.3 提交工具

```text
get_latest_submission
get_submission_history_summary
get_latest_execution_summary
get_latest_diagnosis
get_hint_history
```

返回整理后的摘要，避免把完整历史代码无节制塞入模型上下文。

### 6.4 画像工具

```text
get_student_profile
get_weak_knowledge_points
get_frequent_errors
get_active_recommendations
get_capability_evidence_summary
```

画像工具只提供学习状态，不输出贬损性标签。

### 6.5 知识工具

```text
search_course_knowledge
get_knowledge_source
get_related_knowledge_points
get_related_artifacts
```

知识来源必须限定在当前学生有权访问的课程范围内。

### 6.6 资料工具

```text
save_learning_artifact
list_learning_artifacts
get_learning_artifact
update_learning_artifact
delete_learning_artifact
```

资料保存前必须校验学生身份、课程权限、来源引用和资料类型。

## 7. 工作流清单

### 7.1 工作流 A：编程学习教练

页面：

```text
TaskWorkspace
```

触发方式：

- 学生提交代码；
- 学生查看诊断；
- 学生请求分层提示；
- 学生通过后生成总结。

流程：

```text
学生提交代码
-> 创建提交版本
-> 沙箱执行
-> 保存测试结果
-> 判断通过状态
-> 检索相关知识源
-> 生成诊断或总结
-> 校验引用和答案泄露
-> 写入学习事件
-> 更新任务进度和画像信号
```

输出：

```text
execution_result
diagnosis
hint_level_1
citations
confidence
next_actions
```

边界：

- 不替代系统测试结果；
- 不暴露隐藏测试；
- 不直接给完整答案；
- 考核模式下三级提示可关闭。

### 7.2 工作流 B：AI 导师对话

页面：

```text
AiTutor
TaskWorkspace 右侧 AI 栏
SelfStudy 右侧 AI 栏
LearningLibrary 资料详情
LearningProfile 画像详情
```

入口：

```http
POST /api/v1/student/agent/chat
```

请求示例：

```json
{
  "conversation_id": null,
  "course_id": "course_ds_001",
  "assignment_id": "assign_ds_linked_list_001",
  "page_context": "TASK_WORKSPACE",
  "message": "为什么我删除头节点后测试没有通过？"
}
```

流程：

```text
校验学生和课程权限
-> 加载页面上下文
-> 识别意图
-> 加载画像、任务、提交或资料摘要
-> 检索课程知识来源
-> 生成回答
-> 校验引用、泄露和动作白名单
-> 保存对话和消息
-> 返回结构化回答
```

输出示例：

```json
{
  "conversation_id": "conv_xxx",
  "message_id": "msg_xxx",
  "intent": "CODE_EXPLANATION",
  "answer": "……",
  "confidence": 0.86,
  "citations": [
    {
      "source_id": "kb_head_node_delete",
      "title": "链表头节点删除"
    }
  ],
  "actions": [
    {
      "type": "GENERATE_NOTE",
      "label": "整理成复习笔记",
      "payload": {}
    }
  ],
  "safety": {
    "citation_passed": true,
    "answer_leakage_passed": true,
    "student_scope_passed": true
  }
}
```

### 7.3 工作流 C：自主学习内容生成

页面：

```text
SelfStudy
StudentKnowledgeMap
```

入口：

```http
POST /api/v1/student/self-study/generate
```

请求示例：

```json
{
  "course_id": "course_ds_001",
  "knowledge_point": "链表边界处理",
  "output_type": "REVIEW_NOTE",
  "difficulty": "ADAPTIVE"
}
```

流程：

```text
校验课程和知识点
-> 获取知识点掌握状态
-> 获取相关高频错误
-> 检索课程知识来源
-> 选择输出模板
-> 生成结构化内容
-> 校验引用和内容结构
-> 返回预览
-> 学生确认保存时写入 LearningArtifact
```

支持输出类型：

```text
CONCEPT_EXPLANATION
STEP_EXAMPLE
PRACTICE_SET
REVIEW_NOTE
KNOWLEDGE_CARD
MIND_MAP
PPT_OUTLINE
```

### 7.4 工作流 D：学习资料生成与保存

页面：

```text
SelfStudy
AiTutor
TaskWorkspace
LearningLibrary
```

入口：

```http
POST /api/v1/student/artifacts
```

流程：

```text
接收生成内容或对话内容
-> 校验资料类型
-> 校验学生和课程权限
-> 校验引用来源
-> 生成保存 payload
-> 写入 LearningArtifact
-> 写入 LearnerEvent
-> 返回资料详情
```

资料类型：

```text
REVIEW_NOTE
KNOWLEDGE_CARD
MISTAKE_SUMMARY
MIND_MAP
PPT_OUTLINE
AI_CONVERSATION_SUMMARY
TASK_SUMMARY
PRACTICE_SUMMARY
```

### 7.5 工作流 E：个性化练习生成

首版状态：

```text
P1
```

入口建议：

```http
POST /api/v1/student/practice-sets/generate
```

流程：

```text
选择知识点
-> 读取掌握度和错因
-> 规则确定难度
-> 检索课程知识
-> 生成题目
-> 校验题目结构和答案
-> 保存练习集
-> 学生作答
-> 规则判分
-> 生成反馈
-> 写入学习事件
```

第一版题型：

- 单选题；
- 多选题；
- 判断题。

暂不生成正式考试题和新的编程判题题目。

### 7.6 工作流 F：学习计划与下一步推荐

页面：

```text
LearningHome
LearningProfile
AiTutor
TaskWorkspace 完成总结
```

入口建议：

```http
GET  /api/v1/student/learning-plan
POST /api/v1/student/learning-plan/generate
```

流程：

```text
读取未完成任务、截止时间、画像和错因
-> 规则生成候选动作
-> 排序
-> AI 组织成学生可理解的解释
-> 保存计划版本
-> 前端展示可执行动作
```

推荐动作类型：

```text
COMPLETE_TASK
RETRY_TASK
REVIEW_KNOWLEDGE
GENERATE_PRACTICE
READ_RESOURCE
OPEN_SELF_STUDY
VIEW_TEACHER_FEEDBACK
```

## 8. 意图枚举

第一版只允许固定意图，不让模型自由创造意图名称。

```text
CONCEPT_EXPLANATION
CODE_EXPLANATION
TASK_GUIDANCE
PRACTICE_GENERATION
NOTE_GENERATION
KNOWLEDGE_CARD_GENERATION
MIND_MAP_GENERATION
PPT_OUTLINE_GENERATION
LEARNING_PLAN
RESOURCE_RECOMMENDATION
GENERAL_FOLLOW_UP
```

无法确定时使用：

```text
GENERAL_FOLLOW_UP
```

## 9. 页面上下文枚举

```text
LEARNING_HOME
COURSE_TASKS
TASK_WORKSPACE
QUESTION_WORKSPACE
SELF_STUDY
AI_TUTOR
LEARNING_LIBRARY
LEARNING_PROFILE
COURSE_KNOWLEDGE_MAP
```

不同页面只加载必要上下文。

例如：

- `TASK_WORKSPACE` 加载任务、提交、测试结果、诊断和提示摘要；
- `SELF_STUDY` 加载当前知识点、画像摘要和课程知识源；
- `LEARNING_LIBRARY` 加载当前资料、引用和相关知识点；
- `LEARNING_PROFILE` 加载薄弱知识点、高频错因和推荐。

## 10. 动作白名单

AI 只能返回固定动作类型，前端只执行这些白名单动作。

```text
OPEN_TASK
OPEN_PROFILE
OPEN_SELF_STUDY
OPEN_LIBRARY_ARTIFACT
GENERATE_PRACTICE
GENERATE_NOTE
GENERATE_KNOWLEDGE_CARD
GENERATE_MIND_MAP
GENERATE_PPT_OUTLINE
SAVE_ARTIFACT
UPDATE_LEARNING_PLAN
CONTINUE_CHAT
```

不得返回：

- 任意 SQL；
- 任意后端函数名；
- 任意脚本；
- 任意外部跳转；
- 修改成绩动作；
- 修改教师任务动作；
- 访问其他学生数据的动作。

## 11. 安全校验

所有学生端 AI 输出都必须经过：

```text
权限校验
-> 上下文范围校验
-> Schema 校验
-> 引用校验
-> 答案泄露校验
-> 内容长度校验
-> 动作白名单校验
```

### 11.1 引用校验

模型返回的引用必须满足：

- source_id 存在；
- 属于当前课程；
- 当前学生可访问；
- 来源状态有效；
- 与当前问题或知识点相关。

### 11.2 答案泄露校验

继续复用并扩展现有 guardrail：

```text
leakage_check
ensure_hint_safe
```

检查范围：

- 完整函数实现；
- 明确参考答案；
- 隐藏测试输入输出；
- 可直接复制提交的完整代码；
- 超过当前提示等级的内容。

### 11.3 低置信度处理

如果引用不足、模型失败或上下文不足，应：

- 降低 confidence；
- 标记 risk_flags；
- 使用规则模板兜底；
- 明确提示学生当前回答依据不足；
- 给出可执行下一步，而不是空白失败。

## 12. 运行记录

建议新增或复用以下记录表。

### 12.1 AgentRun

```text
id
student_id
course_id
workflow_type
status
input_json
output_json
model_provider
model_name
prompt_version
started_at
finished_at
error_message
```

### 12.2 AgentStep

```text
id
run_id
step_name
step_order
status
input_summary
output_summary
started_at
finished_at
```

### 12.3 AIConversation

```text
id
student_id
course_id
title
status
created_at
updated_at
```

### 12.4 AIMessage

```text
id
conversation_id
role
content
intent
citations_json
actions_json
confidence
created_at
```

## 13. 开发顺序

### 13.1 第一阶段：打通工作流基础

- 新增 `StudentAgentState`；
- 新增 AgentRun / AgentStep；
- 新增 ContextBuilder；
- 新增受控工具层；
- 新增统一 Guardrail；
- 新增 Orchestrator。

### 13.2 第二阶段：AI 导师

- 接入真实对话接口；
- 移除前端演示问答；
- 展示引用、置信度、是否使用画像；
- 支持动作按钮；
- 支持保存为资料。

### 13.3 第三阶段：自主学习与知识库

- 知识点来自课程知识图谱或课程知识点表；
- 调用自学生成接口；
- 展示结构化生成内容；
- 支持保存到我的资料；
- 写入学习事件。

### 13.4 第四阶段：练习和学习计划

- 个性化练习生成；
- 练习结果反馈；
- 学习计划生成；
- 首页和画像联动。

## 14. 后续补充模板

新增工作流时，在本节复制以下模板追加。

```text
### 工作流名称

状态：
P0 / P1 / P2 / 暂缓

页面：
涉及哪些前端页面

入口：
HTTP 接口或内部触发方式

触发条件：
用户动作、系统事件或定时任务

输入：
需要哪些上下文和业务数据

流程：
步骤 1
-> 步骤 2
-> 步骤 3

输出：
返回给前端或写入数据库的结构

安全边界：
不能做什么

验收标准：
如何判断该工作流完成
```

