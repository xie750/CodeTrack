# Agent Harness 设计

## 1. 文件定位

项目级 agent 入口文件放在仓库根目录：`AGENTS.md`。

本文件只作为第二阶段助学场景的详细 agent 设计文档，供 `AGENTS.md` 引用。

## 2. 为什么需要 agents

第二阶段不是做一个单一聊天机器人，而是做一个面向计算机类专业基础课的助学系统。

系统里的 AI 能力需要分工明确：

- 有的负责诊断代码问题；
- 有的负责讲解知识；
- 有的负责生成学习资料；
- 有的负责维护学习画像；
- 有的负责推荐下一步学习路径。

因此需要明确智能体职责、输入输出、边界和协作方式，避免后续实现变成一个“大而全 Prompt”。

## 3. Agent 设计原则

- 每个 agent 只负责一个清晰任务。
- 所有 agent 必须基于课程知识库和页面上下文工作。
- 涉及知识结论时必须给出引用来源。
- 涉及作业和考核时不能直接泄露完整答案。
- 低置信度输出必须标注风险。
- Agent 输出要能被页面消费，而不是只返回大段自然语言。
- 第一版允许 rule fallback 或 mock response，但接口结构要按真实 agent 预留。

## 4. Agent 总览

| Agent | 作用 | 第一版状态 |
| --- | --- | --- |
| Learning Navigator Agent | 根据画像推荐下一步学习路径 | P0 |
| Code Diagnosis Agent | 根据代码、测试结果和知识库生成诊断 | P0 |
| Progressive Hint Agent | 生成分层提示 | P0 |
| Concept Tutor Agent | 讲解课程知识点和回答问题 | P0 |
| Artifact Generator Agent | 生成笔记、卡片、思维导图、PPT 大纲 | P0 |
| Learner Profile Agent | 更新学习画像 | P0 |
| Citation Guard Agent | 检查引用来源和回答可信度 | P1 |

## 5. Learning Navigator Agent

### 5.1 职责

负责告诉学生“下一步该学什么”。

### 5.2 输入

```text
learner_profile
assigned_tasks
recent_submissions
learning_artifacts
course_knowledge_graph
```

### 5.3 输出

```text
recommended_next_steps
reason
priority
related_task_id
related_knowledge_points
suggested_action
```

### 5.4 页面使用位置

- 学习首页；
- 自主学习页；
- 任务完成总结页。

## 6. Code Diagnosis Agent

### 6.1 职责

负责在学生提交代码后，基于系统验证结果生成可追溯诊断。

### 6.2 输入

```text
task_detail
student_code
execution_status
test_results
compiler_output
learner_profile
retrieved_course_sources
```

### 6.3 输出

```text
diagnosis_type
explanation
failed_evidence
knowledge_point_mapping
citations
confidence
needs_teacher_review
next_action
```

### 6.4 边界

- 不替代系统测试结果；
- 不直接给完整答案；
- 不引用不存在的知识源；
- 不把隐藏测试细节暴露给学生。

## 7. Progressive Hint Agent

### 7.1 职责

负责根据诊断结果生成一级、二级、三级提示。

### 7.2 提示层级

```text
level_1: 知识点方向和思考提醒
level_2: 错误分支、边界条件或关键逻辑提醒
level_3: 修复思路或局部伪代码
```

### 7.3 输入

```text
diagnosis
task_mode
hint_level_requested
learner_profile
previous_hints
```

### 7.4 输出

```text
hint_level
hint_content
unlock_reason
risk_notice
next_allowed_levels
```

### 7.5 边界

- 考核模式下三级提示可被禁用；
- 不能输出完整标准答案；
- 不能连续生成重复提示。

## 8. Concept Tutor Agent

### 8.1 职责

负责概念讲解、代码问题解释、学习策略建议和多轮问答。

### 8.2 输入

```text
user_question
current_page_context
learner_profile
retrieved_course_sources
conversation_history
```

### 8.3 输出

```text
answer
step_by_step_explanation
profile_based_tip
citations
confidence
allowed_actions
```

### 8.4 页面使用位置

- AI 助学页；
- 任务工作台右侧 AI 辅助栏；
- 自主学习页；
- 我的资料详情页。

## 9. Artifact Generator Agent

### 9.1 职责

负责把 AI 输出转化成可保存的学习资料。

### 9.2 第一版资料类型

- 学习笔记；
- 知识卡片；
- 错题总结；
- 思维导图；
- PPT 大纲；
- 视频讲解脚本。

视频讲解脚本只作为文本资料生成，不做真实视频生成。

### 9.3 输入

```text
source_content
artifact_type
knowledge_points
learner_profile
citations
student_note
```

### 9.4 输出

```text
artifact_title
artifact_type
artifact_content
knowledge_points
citations
recommended_tags
save_payload
```

## 10. Learner Profile Agent

### 10.1 职责

负责把学习行为转化为学习画像更新。

### 10.2 输入事件

```text
task_started
code_submitted
execution_finished
diagnosis_generated
hint_viewed
task_completed
self_study_generated
artifact_saved
ai_question_asked
```

### 10.3 输出

```text
strong_knowledge_points_delta
weak_knowledge_points_delta
frequent_error_types_delta
hint_dependency_change
recommendation_signals
profile_summary
```

### 10.4 边界

- 画像是学习状态，不是学生评价标签；
- 不用单次失败直接给学生下结论；
- 画像更新需要能解释原因；
- 敏感结论不在学生端直接展示。

## 11. Citation Guard Agent

### 11.1 职责

负责检查 AI 输出是否有可靠来源。

### 11.2 第一版处理

第一版可以先做轻量校验：

- 是否包含 citation；
- citation 是否来自课程知识库；
- 是否存在虚构来源；
- 是否存在低置信度风险。

### 11.3 输出

```text
is_valid
missing_citation
invalid_citation_ids
risk_flags
safe_to_show
```

## 12. Agent 协作链路

### 12.1 教师任务链路

```text
学生提交代码
-> Code Diagnosis Agent
-> Progressive Hint Agent
-> Learner Profile Agent
-> Artifact Generator Agent
-> Learning Navigator Agent
```

### 12.2 自主学习链路

```text
学生选择知识点
-> Learning Navigator Agent
-> Concept Tutor Agent
-> Artifact Generator Agent
-> Learner Profile Agent
```

### 12.3 AI 问答链路

```text
学生提问
-> Concept Tutor Agent
-> Citation Guard Agent
-> Artifact Generator Agent
-> Learner Profile Agent
```

## 13. Harness 实现建议

第一版实现时，不要求所有 agent 都真实调用大模型。

建议分层：

```text
真实链路:
  Code Diagnosis Agent
  Progressive Hint Agent

规则或 mock:
  Learning Navigator Agent
  Learner Profile Agent
  Artifact Generator Agent
  Citation Guard Agent

可替换接口:
  Concept Tutor Agent
```

所有 agent 都应暴露稳定输入输出结构，方便后续从 mock 切换到真实模型、RAG 或工作流编排。

