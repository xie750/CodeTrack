# Harness 工程框架

## 1. Harness 定义

第二阶段 harness 不是最终完整系统，而是一套可验证、可演示、可继续扩展的工程骨架。

它需要支撑：

- 页面导航跑通；
- 核心助学链路跑通；
- AI 工作流可替换；
- 演示数据可控；
- 后续助教、助研可以接入。

## 2. 前端框架建议

当前项目已有 React + TypeScript + Vite，可以继续沿用。

建议前端结构：

```text
frontend/src/
├── app/
│   ├── AppShell.tsx
│   ├── routes.tsx
│   └── navigation.ts
├── features/
│   ├── dashboard/
│   ├── tasks/
│   ├── workspace/
│   ├── self-study/
│   ├── ai-tutor/
│   ├── library/
│   └── profile/
├── shared/
│   ├── api/
│   ├── components/
│   ├── hooks/
│   ├── layout/
│   └── types/
└── styles/
    ├── tokens.css
    └── app.css
```

第一轮可以不强制真实路由库，允许用本地状态模拟导航；但文档和组件命名要按真实路由准备。

## 3. 页面路由建议

```text
/student
/student/tasks
/student/tasks/:taskId
/student/self-study
/student/ai
/student/library
/student/profile
```

其中 `/student/profile` 可以暂不出现在一级导航，只作为画像详情页或抽屉入口。

## 4. 后端模块建议

继续保留 FastAPI + SQLAlchemy。

建议新增或调整模块：

```text
backend/app/api/
├── student_dashboard.py
├── learning_tasks.py
├── ai_tutor.py
├── self_study.py
├── learning_library.py
└── learner_profile.py

backend/app/services/
├── learner_profile.py
├── recommendation.py
├── knowledge_retrieval.py
├── artifact_generation.py
└── ai_workflows.py
```

第一版可以用 seed 数据和 rule fallback 保证演示稳定。

## 5. 核心数据对象

### 5.1 LearnerProfile

```text
student_id
course_id
strong_knowledge_points
weak_knowledge_points
frequent_error_types
hint_dependency_level
compile_error_rate
logic_error_rate
recent_activity
recommended_next_steps
updated_at
```

### 5.2 AssignedTask

```text
task_id
course_id
title
description
knowledge_points
difficulty
deadline
status
latest_submission_summary
```

### 5.3 LearningArtifact

```text
artifact_id
student_id
type
title
content
knowledge_points
source_context
citations
ai_generated
created_at
updated_at
```

### 5.4 AiTutorResponse

```text
message_id
answer
steps
profile_based_tips
citations
confidence
allowed_actions
risk_flags
```

## 6. AI 工作流 Harness

### 6.1 任务诊断工作流

```text
input:
  task
  current_code
  execution_result
  test_results
  learner_profile
  retrieved_knowledge

output:
  diagnosis_type
  explanation
  hint_level_1
  citations
  confidence
  next_action
```

### 6.2 自主学习工作流

```text
input:
  knowledge_point
  learner_profile
  target_output_type
  course_sources

output:
  generated_content
  citations
  suggested_exercises
  save_as_artifact_payload
```

### 6.3 AI 问答工作流

```text
input:
  user_question
  current_page_context
  learner_profile
  retrieved_knowledge

output:
  answer
  step_by_step_explanation
  citations
  profile_adaptation
  allowed_actions
```

## 7. 演示数据 Harness

第一版演示数据需要固定，避免现场不稳定：

```text
学生：王同学
课程：数据结构与程序设计基础
任务：
  1. 单链表删除节点
  2. 栈实现括号匹配
  3. 二叉树前序遍历
知识点：
  链表边界处理
  栈的后进先出
  递归遍历
资料：
  链表复习笔记
  指针错误知识卡片
  栈队列对比思维导图
```

## 8. 验证 Harness

每次完成一轮实现，需要能验证：

- 学生可以从首页进入任务；
- 学生可以提交代码并看到结果；
- 失败后可以看到 AI 诊断和引用来源；
- 学生可以申请分层提示；
- 通过后可以生成总结；
- 总结可以保存到资料库；
- 学习画像会出现可见变化；
- 自主学习能生成至少一种资料；
- AI 助学回答能显示画像适配和引用来源。

## 9. 后续接入点

该 harness 后续可以扩展：

- 助教看板读取学生画像和任务结果；
- 助研模块复用资料库和 AI 工作流；
- 多课程通过 course_id 扩展；
- 多模态通过 artifact type 扩展；
- 模型微调或 RAG 替换不影响页面主链路。

