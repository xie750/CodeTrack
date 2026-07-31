# CodeTrack 学生端智能体工作流开发方案（后端内置版）

> 项目范围：只设计 CodeTrack 学生端的智能体与 AI 工作流。  
> 实现方式：不接 Dify、n8n、MCP Server、外部工作流平台或独立 Agent 服务，全部逻辑直接写在现有 FastAPI 后端中。  
> 核心原则：业务规则由后端控制，大模型只承担解释、生成和内容组织，不直接决定成绩、任务状态或学习画像分数。

---

# 一、当前学生端 AI 基础

## 1.1 已经具备的能力

当前项目已经有：

- [x] 学生登录、课程、班级与任务上下文
- [x] 编程任务提交
- [x] 沙箱执行与测试结果
- [x] 代码提交版本记录
- [x] 代码错误诊断
- [x] 三级渐进提示
- [x] 提示答案泄露检查
- [x] AI 调用失败后的规则兜底
- [x] 诊断置信度与教师审核标记
- [x] 客观题自动判分
- [x] 学习任务进度
- [x] 学习画像
- [x] 知识点掌握状态
- [x] 高频错误统计
- [x] 学习建议
- [x] 学习事件与能力证据
- [x] 基础课程知识源

可以继续复用的现有代码：

```text
backend/app/services/model_gateway.py
backend/app/services/diagnosis.py
backend/app/services/submissions.py
backend/app/services/question_workflow.py
backend/app/api/student.py
backend/app/api/tasks.py
backend/app/api/versions.py
backend/app/models/entities.py
```

## 1.2 当前主要缺口

- [ ] AI 导师页面还是演示回答
- [ ] 自主学习页面仍使用前端 Mock 内容
- [ ] AI 对话没有真实会话记录
- [ ] 没有统一的学生智能体编排器
- [ ] 没有统一的上下文组装服务
- [ ] 没有学生可调用的后端工具层
- [ ] 没有真实的笔记、卡片、思维导图保存能力
- [ ] 没有动态练习生成与练习结果记录
- [ ] 学习计划仍以静态建议为主
- [ ] 知识检索仍是固定知识源引用，不是完整检索流程

---

# 二、学生端智能体的总体定位

学生端不建议建立多个可以自由协作的复杂 Agent。

第一版采用：

```text
一个学生学习助手
＋ 多条固定工作流
＋ 一组受控后端工具
＋ 统一安全校验
```

学生学习助手负责理解学生意图，但实际数据访问和业务操作全部通过后端工具完成。

## 2.1 学生端智能体应承担的工作

- 解释课程概念
- 结合学生画像进行个性化讲解
- 结合任务和提交记录解释错误
- 推荐下一步学习动作
- 生成练习题
- 生成复习笔记
- 生成知识卡片
- 生成思维导图数据
- 生成 PPT 大纲
- 保存学习资料
- 帮助学生制定短期学习计划
- 引导学生使用合适等级的提示

## 2.2 学生端智能体不能承担的工作

- 不能直接修改成绩
- 不能直接判定编程题是否正确
- 不能直接修改学习画像分数
- 不能绕过沙箱执行
- 不能向学生展示隐藏测试
- 不能直接提供考核任务完整答案
- 不能直接修改教师发布的任务
- 不能访问其他学生数据
- 不能读取其他班级或课程数据
- 不能把模型自由输出直接写入核心业务表

---

# 三、推荐工程架构

## 3.1 整体结构

```text
学生端 React 页面
        │
        ▼
FastAPI 学生 AI 接口
        │
        ▼
StudentAgentOrchestrator
        │
        ├── 意图识别
        ├── 上下文组装
        ├── 工作流选择
        ├── 工具调用
        ├── 模型调用
        ├── 安全校验
        └── 结果保存
        │
        ▼
现有业务服务与数据库
```

## 3.2 不接外部工作流平台

第一版不使用：

- Dify
- n8n
- 独立 MCP Server
- 外部 Agent 平台
- Temporal
- Kafka
- 独立向量数据库
- 多智能体自动协作

全部工作流使用普通 Python 函数、Pydantic 状态对象和 FastAPI 接口实现。

## 3.3 推荐后端目录

```text
backend/app/ai/
├── __init__.py
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
    ├── learning_plan.py
    └── artifact_generation.py
```

## 3.4 各文件职责

| 文件 | 职责 |
|---|---|
| `schemas.py` | 定义工作流输入、状态和输出 Schema |
| `orchestrator.py` | 统一接收请求、选择工作流并执行 |
| `intent_router.py` | 判断学生问题属于哪种学习意图 |
| `context_builder.py` | 组装学生、课程、任务、画像和提交上下文 |
| `knowledge_retriever.py` | 检索当前课程可用知识来源 |
| `prompt_builder.py` | 按不同工作流构建 Prompt |
| `guardrails.py` | 检查答案泄露、引用、权限和结构 |
| `run_recorder.py` | 保存每次智能体运行过程 |
| `tools/` | 提供受控的数据读取和写入函数 |
| `workflows/` | 实现具体学生学习工作流 |

---

# 四、统一智能体运行方式

## 4.1 统一入口

建议新增：

```text
POST /api/v1/student/agent/chat
```

学生提交：

```json
{
  "conversation_id": null,
  "course_id": "course_ds_001",
  "assignment_id": "assignment_001",
  "page_context": "TASK_WORKSPACE",
  "message": "为什么我删除头节点后测试没有通过？"
}
```

后端返回：

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
      "type": "OPEN_TASK",
      "label": "返回当前任务",
      "payload": {
        "assignment_id": "assignment_001"
      }
    },
    {
      "type": "GENERATE_NOTE",
      "label": "整理成复习笔记"
    }
  ],
  "safety": {
    "answer_leakage_passed": true,
    "student_scope_passed": true
  }
}
```

## 4.2 学生问题意图

建议第一版只识别以下意图：

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

不要让模型自由创建新的意图名称。

## 4.3 工作流选择逻辑

```text
收到学生消息
→ 校验学生身份
→ 校验课程和任务访问权限
→ 判断当前页面
→ 识别问题意图
→ 组装最小必要上下文
→ 选择对应工作流
→ 调用受控工具
→ 调用模型或规则模板
→ 校验结构、引用和答案泄露
→ 保存运行记录和对话
→ 返回前端
```

---

# 五、学生端工具层

智能体不能直接操作 SQLAlchemy Session，也不能根据模型自由拼 SQL。

所有数据访问都通过后端工具函数完成。

## 5.1 学生上下文工具

```text
get_student_context
get_student_courses
get_current_course
get_current_class
```

返回：

- 学生 ID
- 学生姓名
- 班级
- 当前课程
- 任课教师
- 当前教学关系

## 5.2 任务工具

```text
get_assignment_context
get_task_public_context
get_task_progress
get_question_attempt_summary
```

只返回学生有权看到的内容：

- 任务标题
- 任务说明
- 学习目标
- 公开测试
- 截止时间
- 当前进度
- 已使用提示等级

不得返回：

- 隐藏测试输入
- 隐藏测试预期输出
- 参考答案
- 教师内部备注

## 5.3 提交工具

```text
get_latest_submission
get_submission_history_summary
get_latest_execution_summary
get_latest_diagnosis
get_hint_history
```

智能体读取的是整理后的摘要，不直接把所有历史代码全部塞入 Prompt。

## 5.4 学习画像工具

```text
get_student_profile
get_weak_knowledge_points
get_frequent_errors
get_active_recommendations
get_capability_evidence_summary
```

## 5.5 知识工具

```text
search_course_knowledge
get_knowledge_source
get_related_resources
```

## 5.6 学习资料工具

```text
save_learning_artifact
list_learning_artifacts
update_learning_artifact
delete_learning_artifact
```

## 5.7 工具调用规范

每个工具都必须：

- 校验当前学生身份
- 校验课程权限
- 限制返回字段
- 使用 Pydantic 输出
- 记录调用结果
- 不返回其他学生数据
- 不将数据库异常直接暴露给模型

---

# 六、工作流一：编程学习教练

## 6.1 页面对应

```text
TaskWorkspace.tsx
```

## 6.2 当前基础

现有后端已经完成：

```text
代码提交
→ 沙箱执行
→ 测试结果
→ AI 或规则诊断
→ 三级提示
→ 能力证据
```

该工作流不需要重新实现，只需要重构到统一智能体架构中。

## 6.3 完整工作流

```text
学生提交代码
→ 创建不可变提交版本
→ 沙箱编译和执行
→ 获取测试结果
→ 判断执行状态
   ├─ 全部通过
   │   → 生成正向能力证据
   │   → 更新任务进度
   │   → 生成完成总结
   └─ 存在失败
       → 提取失败证据
       → 检索相关知识源
       → 生成结构化诊断
       → 校验诊断引用
       → 校验提示答案泄露
       → 判断置信度
       → 创建一级提示
       → 保存负向能力证据
       → 更新任务进度
```

## 6.4 智能体输出

- 错误类型
- 错误解释
- 失败证据
- 相关知识点
- 知识引用
- 置信度
- 一级提示
- 下一步操作

## 6.5 提示解锁规则

```text
一级提示：诊断就绪后开放
二级提示：查看一级提示后开放
三级提示：查看二级提示后开放，且教师允许
```

## 6.6 边界

- 诊断不能替代沙箱结果
- 编程正确性以测试结果为准
- 提示不能包含完整实现
- 学生不能通过对话绕过提示等级
- 隐藏测试只转换为错误摘要
- 低置信度诊断不能伪装成确定结论

---

# 七、工作流二：AI 导师对话

## 7.1 页面对应

```text
AiTutor.tsx
```

## 7.2 页面目标

AI 导师不是通用聊天框，而是基于：

- 当前学生
- 当前课程
- 当前页面
- 当前任务
- 学习画像
- 最近错误
- 课程知识来源

进行受控回答。

## 7.3 完整工作流

```text
学生发送问题
→ 获取页面上下文
→ 识别问题意图
→ 获取当前课程
→ 获取学习画像摘要
→ 按需获取任务或提交
→ 检索课程知识
→ 生成回答
→ 校验引用
→ 校验答案泄露
→ 生成可执行动作
→ 保存对话
```

## 7.4 页面上下文类型

```text
LEARNING_HOME
COURSE_TASKS
TASK_WORKSPACE
QUESTION_WORKSPACE
LEARNING_PROFILE
SELF_STUDY
LEARNING_LIBRARY
AI_TUTOR
```

不同页面只加载必要数据。

例如：

### 在任务工作台提问

加载：

- 当前任务
- 最新提交
- 最新测试结果
- 最新诊断
- 已使用提示等级

### 在学习画像提问

加载：

- 薄弱知识点
- 高频错误
- 当前建议
- 最近任务完成情况

### 在自主学习提问

加载：

- 当前知识点
- 当前生成资料
- 课程知识来源
- 学生画像摘要

## 7.5 AI 导师可执行动作

```text
OPEN_TASK
OPEN_PROFILE
OPEN_SELF_STUDY
GENERATE_PRACTICE
GENERATE_NOTE
GENERATE_KNOWLEDGE_CARD
SAVE_ARTIFACT
UPDATE_LEARNING_PLAN
```

前端只根据后端返回的固定动作类型执行，不执行模型生成的任意 URL 或代码。

## 7.6 对话边界

- 考核任务中不直接给完整答案
- 不回答其他学生情况
- 不把内部画像算法暴露给学生
- 不声称未被证据支持的结论
- 必须明确区分事实、建议和不确定判断
- 没有可靠知识来源时降低置信度

---

# 八、工作流三：自主学习内容生成

## 8.1 页面对应

```text
SelfStudy.tsx
```

## 8.2 当前问题

当前页面中的以下内容是前端常量：

- 概念讲解
- 练习题
- 复习笔记
- 知识卡片
- 思维导图
- PPT 大纲

需要替换为真实后端生成流程。

## 8.3 统一接口

```text
POST /api/v1/student/self-study/generate
```

请求：

```json
{
  "course_id": "course_ds_001",
  "knowledge_point": "链表头节点删除",
  "output_type": "REVIEW_NOTE",
  "difficulty": "ADAPTIVE"
}
```

## 8.4 输出类型

```text
CONCEPT_EXPLANATION
PRACTICE_SET
REVIEW_NOTE
KNOWLEDGE_CARD
MIND_MAP
PPT_OUTLINE
```

## 8.5 工作流

```text
学生选择课程和知识点
→ 校验知识点属于当前课程
→ 获取该知识点掌握状态
→ 获取相关高频错误
→ 检索课程知识来源
→ 选择输出模板
→ 生成结构化内容
→ 校验引用和内容结构
→ 返回预览
→ 学生确认保存
```

## 8.6 不同内容的结构化输出

### 概念讲解

```json
{
  "title": "链表头节点删除",
  "definition": "……",
  "key_points": ["……"],
  "common_errors": ["……"],
  "example": "……",
  "self_check": "……"
}
```

### 复习笔记

```json
{
  "title": "链表边界处理复习笔记",
  "summary": "……",
  "knowledge_points": ["……"],
  "error_review": ["……"],
  "checklist": ["……"]
}
```

### 知识卡片

```json
{
  "front": "删除链表头节点时需要注意什么？",
  "back": "……",
  "tags": ["链表", "边界条件"]
}
```

### 思维导图

```json
{
  "root": {
    "title": "链表删除",
    "children": [
      {
        "title": "边界情况",
        "children": []
      }
    ]
  }
}
```

### PPT 大纲

```json
{
  "title": "链表删除复习",
  "slides": [
    {
      "title": "问题引入",
      "points": ["……"]
    }
  ]
}
```

## 8.7 边界

- 生成内容必须绑定课程
- 必须保留知识来源
- 不允许生成与课程无关的资料
- 练习题不能直接进入正式考试
- 学生保存前允许预览
- 失败时返回规则模板，而不是空白页面

---

# 九、工作流四：个性化练习生成

## 9.1 页面入口

可从以下位置进入：

- AI 导师
- 自主学习
- 学习画像
- 任务完成总结

## 9.2 工作流

```text
学生请求练习
→ 获取课程和知识点
→ 获取掌握度
→ 获取最近错误
→ 确定练习难度
→ 检索课程知识
→ 生成候选题
→ 校验题目结构
→ 校验答案一致性
→ 保存练习集
→ 学生作答
→ 规则判分
→ 生成练习反馈
→ 记录学习事件
```

## 9.3 第一版题型

- 单选题
- 多选题
- 判断题

第一版不生成：

- 任意编程判题题目
- 主观简答自动评分
- 正式考试题

## 9.4 难度规则

```text
掌握度低
→ 基础概念题为主

掌握度中等
→ 概念题＋边界场景题

掌握度较高
→ 综合应用题
```

难度先由规则决定，模型只负责生成对应内容。

## 9.5 练习反馈

反馈包含：

- 得分
- 正确题数
- 错误知识点
- 每题解析
- 建议复习内容
- 是否推荐再次练习

---

# 十、工作流五：学习计划与下一步推荐

## 10.1 页面对应

- 学习首页
- 学习画像
- AI 导师

## 10.2 实现原则

学习推荐采用：

```text
规则计算
＋ AI 解释
```

不让模型自由决定学生必须做什么。

## 10.3 规则输入

- 未完成任务
- 任务截止时间
- 薄弱知识点
- 高频错误
- 最近完成率
- 提示依赖程度
- 最近学习时间
- 教师发布的补救任务
- 当前有效推荐

## 10.4 工作流

```text
读取学生学习状态
→ 规则计算优先事项
→ 生成候选学习动作
→ 排序
→ AI 组织成易理解的计划
→ 保存计划版本
→ 展示到学生首页
```

## 10.5 学习动作类型

```text
COMPLETE_TASK
REVIEW_KNOWLEDGE
GENERATE_PRACTICE
READ_RESOURCE
RETRY_TASK
VIEW_TEACHER_FEEDBACK
SELF_STUDY
```

## 10.6 推荐输出

```json
{
  "summary": "本周优先完成链表阶段任务。",
  "items": [
    {
      "priority": 1,
      "action_type": "RETRY_TASK",
      "title": "重新完成链表删除任务",
      "reason": "最近两次提交仍存在头节点错误",
      "target_id": "assignment_001"
    }
  ]
}
```

## 10.7 边界

- 推荐不能替代教师正式任务
- 已过期或无权限内容不能推荐
- 推荐必须说明原因
- 学生可以标记完成、稍后处理或不感兴趣
- 模型不能修改原始任务截止时间

---

# 十一、工作流六：学习资料保存与再加工

## 11.1 页面对应

```text
LearningLibrary.tsx
```

## 11.2 可保存内容

```text
REVIEW_NOTE
KNOWLEDGE_CARD
MIND_MAP
PPT_OUTLINE
AI_CONVERSATION_SUMMARY
PRACTICE_SUMMARY
```

## 11.3 建议新增数据表

```text
LearningArtifact
```

建议字段：

```text
id
student_id
course_id
artifact_type
title
content_json
source_type
source_id
knowledge_source_ids
status
created_at
updated_at
```

## 11.4 页面功能

- 保存 AI 生成内容
- 查看我的资料
- 按课程筛选
- 按知识点筛选
- 修改标题
- 编辑内容
- 收藏
- 删除
- 再生成
- 从笔记生成练习
- 从对话生成知识卡片

## 11.5 工作流

```text
AI 生成内容
→ 学生预览
→ 学生点击保存
→ 校验内容所有权
→ 保存结构化资料
→ 记录学习事件
→ 在资料库展示
```

---

# 十二、轻量知识检索设计

第一版不接外部向量数据库，也不必立即使用复杂 RAG。

## 12.1 第一版检索方式

```text
course_id 过滤
＋ student_visible 过滤
＋ 知识点关键词匹配
＋ source_type 过滤
＋ authority_level 排序
```

## 12.2 检索输入

- 当前课程
- 当前知识点
- 学生问题关键词
- 当前任务知识点
- 最近错误标签

## 12.3 检索输出

每条知识来源只返回：

- source_id
- title
- summary
- source_type
- version
- authority_level

## 12.4 后续升级

课程资料增加后，再新增：

```text
KnowledgeDocument
KnowledgeChunk
```

先使用数据库全文或关键词检索，不在第一版引入独立向量服务。

---

# 十三、安全校验设计

## 13.1 统一 Guardrail

所有学生端 AI 输出都经过：

```text
权限校验
→ 上下文范围校验
→ Schema 校验
→ 引用校验
→ 答案泄露校验
→ 内容长度校验
→ 动作白名单校验
```

## 13.2 答案泄露检查

继续复用并扩展现有：

```text
leakage_check
ensure_hint_safe
```

检查范围包括：

- 完整函数实现
- 明确参考答案
- 隐藏测试输入输出
- 可直接复制提交的完整代码
- 超过允许提示等级的内容

## 13.3 引用校验

模型返回的知识来源必须满足：

- 来源存在
- 属于当前课程
- 允许学生访问或允许 AI 引用
- 版本有效
- 与当前问题相关

## 13.4 动作白名单

模型只能返回预定义动作：

```text
OPEN_TASK
OPEN_PROFILE
OPEN_SELF_STUDY
GENERATE_PRACTICE
GENERATE_NOTE
GENERATE_KNOWLEDGE_CARD
SAVE_ARTIFACT
UPDATE_LEARNING_PLAN
```

不得返回：

- 任意 SQL
- 任意后端函数名
- 任意脚本
- 任意外部链接跳转
- 修改成绩动作
- 修改任务动作

---

# 十四、建议新增数据表

## 14.1 第一阶段必须增加

### AIConversation

```text
id
student_id
course_id
title
status
created_at
updated_at
```

### AIMessage

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

### AgentRun

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

### AgentStep

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

### LearningArtifact

```text
id
student_id
course_id
artifact_type
title
content_json
knowledge_source_ids
status
created_at
updated_at
```

## 14.2 第二阶段可增加

```text
GeneratedPracticeSet
GeneratedPracticeQuestion
StudentLearningPlan
StudentLearningPlanItem
KnowledgeDocument
KnowledgeChunk
```

---

# 十五、建议新增学生端接口

## 15.1 AI 导师

```text
POST /api/v1/student/agent/chat
GET  /api/v1/student/agent/conversations
GET  /api/v1/student/agent/conversations/{conversation_id}
DELETE /api/v1/student/agent/conversations/{conversation_id}
```

## 15.2 自主学习

```text
POST /api/v1/student/self-study/generate
```

## 15.3 个性化练习

```text
POST /api/v1/student/practice-sets/generate
GET  /api/v1/student/practice-sets/{practice_set_id}
POST /api/v1/student/practice-sets/{practice_set_id}/submit
```

## 15.4 学习资料

```text
GET    /api/v1/student/artifacts
POST   /api/v1/student/artifacts
GET    /api/v1/student/artifacts/{artifact_id}
PUT    /api/v1/student/artifacts/{artifact_id}
DELETE /api/v1/student/artifacts/{artifact_id}
```

## 15.5 学习计划

```text
GET  /api/v1/student/learning-plan
POST /api/v1/student/learning-plan/generate
POST /api/v1/student/learning-plan/items/{item_id}/complete
POST /api/v1/student/learning-plan/items/{item_id}/dismiss
```

## 15.6 现有代码诊断接口

保留现有任务、执行、版本、诊断和提示接口，不重复创建一套 Agent 接口。

---

# 十六、统一工作流状态对象

建议在 `schemas.py` 中定义：

```python
class StudentAgentState(BaseModel):
    run_id: str
    student_id: str
    course_id: str
    assignment_id: str | None = None
    page_context: str
    message: str | None = None
    intent: str | None = None

    student_context: dict | None = None
    task_context: dict | None = None
    profile_context: dict | None = None
    submission_context: dict | None = None
    knowledge_sources: list[dict] = []

    model_output: dict | None = None
    final_output: dict | None = None
    confidence: float = 0
    errors: list[str] = []
```

工作流中的每一步接收状态并返回更新后的状态。

```python
state = load_context(state)
state = route_intent(state)
state = retrieve_knowledge(state)
state = generate_answer(state)
state = validate_output(state)
state = save_result(state)
```

这种方式已经具备图工作流的清晰结构，但不依赖外部工作流框架。

---

# 十七、错误与降级处理

## 17.1 模型调用失败

```text
模型失败
→ 使用规则模板
→ 标记 model_provider = RULE_FALLBACK
→ 降低置信度
→ 返回可操作建议
→ 记录错误
```

## 17.2 知识来源不足

```text
没有可靠来源
→ 不生成确定性结论
→ 返回“当前课程资料不足”
→ 推荐查看任务说明或教师资料
→ 降低置信度
```

## 17.3 画像不足

```text
没有足够画像
→ 使用课程和任务上下文回答
→ 明确标记“未使用个性化画像”
```

## 17.4 任务上下文缺失

```text
页面没有 assignment_id
→ 不加载提交和测试
→ 只进行概念解释或课程资料生成
```

## 17.5 后端工具失败

```text
记录 AgentStep 失败
→ 不把数据库错误暴露给学生
→ 返回统一错误信息
→ 保留 run_id 便于排查
```

---

# 十八、前端页面改造对应关系

## 18.1 AiTutor.tsx

需要改造：

- [ ] 移除演示对话
- [ ] 接入真实聊天接口
- [ ] 支持 conversation_id
- [ ] 展示引用来源
- [ ] 展示置信度
- [ ] 展示是否使用画像
- [ ] 根据 actions 渲染操作按钮
- [ ] 支持保存笔记和生成练习
- [ ] 支持历史对话

## 18.2 SelfStudy.tsx

需要改造：

- [ ] 移除 `selfStudyOutputs`
- [ ] 知识点来自课程数据
- [ ] 调用生成接口
- [ ] 按输出 Schema 渲染
- [ ] 支持重新生成
- [ ] 支持保存到资料
- [ ] 展示真实引用来源
- [ ] 展示生成失败和规则降级

## 18.3 TaskWorkspace.tsx

需要改造：

- [ ] 完整接入代码提交
- [ ] 轮询执行状态
- [ ] 展示测试结果
- [ ] 展示诊断
- [ ] 请求一级、二级和三级提示
- [ ] 展示引用来源
- [ ] 从诊断进入 AI 导师追问
- [ ] 将当前任务作为页面上下文

## 18.4 LearningProfile.tsx

需要增加：

- [ ] 针对薄弱知识点生成练习
- [ ] 生成复习计划
- [ ] 询问 AI 为什么形成该建议
- [ ] 跳转相关任务
- [ ] 跳转自主学习

## 18.5 LearningLibrary.tsx

需要增加：

- [ ] 展示真实 LearningArtifact
- [ ] 支持编辑和删除
- [ ] 支持从资料继续生成
- [ ] 支持按课程和类型筛选

## 18.6 LearningHome.tsx

需要增加：

- [ ] 展示真实下一步学习计划
- [ ] 支持完成和忽略建议
- [ ] 支持直接进入任务或自主学习

---

# 十九、推荐开发任务拆分

## 开发任务 A：智能体公共基础

负责：

- `schemas.py`
- `orchestrator.py`
- `intent_router.py`
- `context_builder.py`
- `guardrails.py`
- `run_recorder.py`
- AgentRun 与 AgentStep

## 开发任务 B：AI 导师

负责：

- 对话接口
- 会话与消息表
- 意图路由
- 上下文加载
- 引用和动作输出
- `AiTutor.tsx` 对接

## 开发任务 C：自主学习与资料

负责：

- 自主学习生成
- 结构化资料输出
- LearningArtifact
- 资料保存与编辑
- `SelfStudy.tsx`
- `LearningLibrary.tsx`

## 开发任务 D：编程学习教练

负责：

- 整理现有诊断工作流
- 统一工具和状态
- 三级提示
- 任务工作台对接
- 提交后追问 AI 导师

## 开发任务 E：练习与学习计划

负责：

- 个性化练习生成
- 练习判分与反馈
- 学习计划生成
- 学习首页和画像页面联动

---

# 二十、推荐开发顺序

## 第一阶段：打通已有 AI

```text
TaskWorkspace 真实提交
→ 沙箱结果
→ 诊断
→ 三级提示
→ 学习画像更新
```

## 第二阶段：统一智能体基础

```text
AgentRun
→ AgentStep
→ ContextBuilder
→ Tool Layer
→ Guardrail
→ Orchestrator
```

## 第三阶段：AI 导师

```text
真实对话
→ 意图路由
→ 画像与任务上下文
→ 知识检索
→ 引用与动作
```

## 第四阶段：自主学习

```text
真实内容生成
→ 笔记
→ 卡片
→ 思维导图
→ PPT 大纲
→ 我的资料
```

## 第五阶段：练习与学习计划

```text
个性化练习
→ 自动判分
→ 学习建议
→ 学习计划
→ 首页与画像联动
```

---

# 二十一、第一版最终闭环

```text
学生进入班级任务
→ 完成编程或客观题任务
→ 系统自动判题
→ 失败时生成 AI 诊断
→ 学生逐级查看提示
→ 学生在 AI 导师中继续追问
→ AI 结合任务、画像和课程知识回答
→ 学生生成复习笔记或练习
→ 保存到我的资料
→ 系统记录学习事件
→ 学习画像和下一步计划更新
```

第一版完成后，学生端将形成：

```text
任务学习
＋ 自动评测
＋ AI 诊断
＋ 分层提示
＋ 个性化问答
＋ 自主学习
＋ 资料沉淀
＋ 学习画像
＋ 下一步推荐
```

---

# 二十二、最终技术结论

学生端第一版采用：

```text
FastAPI
＋ SQLAlchemy
＋ Pydantic
＋ 现有 model_gateway
＋ 普通 Python 工作流函数
＋ 数据库运行记录
＋ FastAPI BackgroundTasks
```

不接外部平台，不引入复杂多智能体，不重建现有判题和画像系统。

最重要的工程原则是：

```text
模型负责解释和生成
规则负责判断和限制
工具负责访问业务数据
工作流负责组织步骤
数据库负责保留过程证据
```
