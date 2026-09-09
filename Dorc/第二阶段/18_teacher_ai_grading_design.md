# 助教场景：作业与试题智能批改设计

## 1. 背景与定位

截图中的助教场景要求覆盖：

- 智能备课；
- 作业与试题批改；
- 学情精准诊断。

当前第二阶段主线仍然是学生助学闭环，但教师端已经进入双端一体化开发范围。作业与试题批改不能只做“教师手工打分”，需要补成教师端支撑学生助学闭环的核心 AI 能力。

本设计把“智能批改”定义为：

```text
规则判定事实
-> AI 生成预评与证据解释
-> 教师审核与修订
-> 学生查看确认后的反馈
-> 学情画像和教学改进同步更新
```

AI 不直接发布最终成绩，不直接修改学习画像分数，也不替代教师责任。AI 负责减少教师重复劳动、生成可解释依据、识别共性问题和形成改进建议。

## 2. 当前已有基础

仓库中已经具备以下落点：

- 客观题、填空题和作答记录：`Question`、`QuestionOption`、`QuestionAttempt`、`QuestionAnswer`。
- 客观题规则判分和画像更新：`question_workflow.evaluate_questions()`、`submit_question_answers()`。
- 编程题沙箱和 AI 诊断：`SubmissionVersion`、`ExecutionRun`、`Diagnosis`、`HintRecord`。
- 教师最终评分与反馈：`Grade`、`TeacherFeedback`。
- AI 运行记录：`AgentRun`、`AgentStep`。
- 教师 AI 审核：`DiagnosisReview` 和 `/api/v1/teacher/ai-reviews`。
- 教师端班级学情聚合：`teacher_monitor`、`teacher_analytics`、`teaching_improvement`。

缺口是：

- 题目和作业没有统一的 AI 预评结果对象；
- 简答、作文、实验报告、开放式作业缺少 rubric 驱动的 AI 辅助评阅；
- 客观题错因仍主要依赖题目预设 `error_type`，缺少 AI 对错误原因和改进建议的个性化解释；
- 教师批改页面还缺少“AI 批改依据、置信度、待复核原因、评语草稿、同类错误聚类”。

## 3. 批改对象范围

第一版建议按题型分层实现。

### 3.1 客观题

范围：

- 单选题；
- 多选题；
- 判断题；
- 有标准答案的填空题。

处理方式：

```text
规则判题
-> 得分、正确率、错题明细
-> AI 解释错因和知识点
-> 生成个性化改进建议
-> 更新画像事件
```

客观题最终得分由规则引擎产生，AI 只解释“为什么错、关联哪个知识点、下一步怎么补”。

### 3.2 半开放题

范围：

- 简答题；
- 概念解释；
- 代码阅读题；
- 实验报告中的短答字段。

处理方式：

```text
Rubric 评分项
-> AI 按评分项给预评分
-> 抽取命中证据和缺失点
-> 生成教师评语草稿
-> 低置信度进入教师复核
```

AI 预评分不能直接成为最终成绩。教师保存或发布后，才写入 `Grade`。

### 3.3 主观题和综合作业

范围：

- 作文式回答；
- 项目报告；
- 课堂活动反思；
- 算法设计说明；
- 机器学习实验分析。

处理方式：

```text
任务要求 + Rubric + 学生答案
-> AI 分维度预评
-> 检查关键概念覆盖
-> 检查逻辑完整性和证据支撑
-> 标记疑似偏题、空泛、抄袭风险
-> 教师审核并发布最终反馈
```

第一版只做文本输入，不做复杂多模态文件深度解析。文件型报告可以先由学生粘贴正文或由后续资料解析链路接入。

### 3.4 编程题

现有链路保持：

```text
沙箱执行
-> 测试用例事实
-> AI 诊断
-> 渐进式提示
-> 教师审核
```

需要补强的是把编程题 AI 诊断转成教师批改页面中的“AI 预评依据”和“评语草稿”，而不是只显示给学生。

## 4. 智能批改工作流

### 4.1 Objective Grading Workflow

适用于客观题和标准填空。

```text
学生交卷
-> Rule Grader 计算得分
-> Error Mapping Agent 映射错因和知识点
-> Feedback Draft Agent 生成学生反馈草稿
-> Profile Signal Agent 写入画像信号
-> Teacher Review Queue 仅收纳异常结果
```

异常结果包括：

- 题目答案配置疑似错误；
- 多数学生集中错同一道题；
- 填空答案与标准答案语义接近但字符串未命中；
- 学生质疑评分；
- AI 解释置信度低。

### 4.2 Subjective Grading Workflow

适用于简答、报告和综合作业。

```text
学生提交文本
-> Rubric Loader 读取评分标准
-> Context Builder 读取课程、任务和知识点
-> Retrieval Agent 检索课程知识库
-> AI Rubric Grader 逐维度预评
-> Evidence Extractor 抽取学生答案证据
-> Citation Guard 校验引用
-> Risk Guard 标记低置信度和风险
-> Teacher Review Queue 生成待批改项
```

输出必须结构化：

```json
{
  "grading_result_id": "aigrade_xxx",
  "target_type": "QUESTION_ANSWER",
  "target_id": "qanswer_xxx",
  "rubric_version": "rubric_v1",
  "suggested_score": 8.0,
  "max_score": 10,
  "dimensions": [
    {
      "dimension_id": "concept_accuracy",
      "label": "概念准确性",
      "suggested_score": 3.5,
      "max_score": 4,
      "evidence": ["学生准确说明了监督学习需要带标签样本。"],
      "missing_points": ["未提到训练集和测试集划分。"],
      "confidence": 0.82
    }
  ],
  "comment_draft": "概念主线基本准确，但需要补充数据划分和评估指标。",
  "knowledge_point_mapping": ["监督学习", "模型评估"],
  "citations": ["kb_ml_supervised_001"],
  "risk_flags": [],
  "confidence": 0.78,
  "needs_teacher_review": true
}
```

### 4.3 Batch Insight Workflow

适用于教师查看班级批改和学情。

```text
班级提交完成
-> 后端聚合得分、错题、知识点、提交状态
-> AI 聚类同类错误
-> 生成班级共性问题摘要
-> 生成教学改进建议
-> 教师可一键转为反馈、资料或补救任务草稿
```

AI 接收聚合后的统计和少量脱敏样例，不一次性读取全班所有原始答案。

## 5. Agent 角色补充

新增教师端批改相关 agent：

| Agent | 职责 | 第一版状态 |
| --- | --- | --- |
| Rule Grader | 客观题、填空题、编程测试的确定性判分 | P0 |
| Rubric Grading Agent | 按评分标准对简答、报告、主观题生成预评分 | P0 |
| Evidence Extractor Agent | 从学生答案中抽取支持评分的证据与缺失点 | P0 |
| Feedback Draft Agent | 生成面向学生的评语草稿和改进建议 | P0 |
| Batch Misconception Agent | 聚类班级共性错因和薄弱知识点 | P1 |
| Grading Risk Guard Agent | 标记低置信度、答案配置异常、疑似抄袭或需教师复核 | P0 |

这些 agent 仍然通过 `AgentRun` / `AgentStep` 记录，不绕过后端权限和数据范围。

## 6. 数据模型建议

建议新增或扩展以下表。第一版如果不立刻迁表，也应按这个响应结构给前端预留字段。

### 6.1 grading_rubrics

保存任务或题目的评分标准。

```text
id
task_id
question_id nullable
title
rubric_version
dimensions_json
created_by
status
created_at
updated_at
```

`dimensions_json` 示例：

```json
[
  {
    "dimension_id": "concept_accuracy",
    "label": "概念准确性",
    "max_score": 4,
    "criteria": ["概念定义准确", "能区分相近概念"]
  }
]
```

### 6.2 ai_grading_results

保存 AI 预评结果。

```text
id
target_type
target_id
student_id
task_id
question_id nullable
rubric_id nullable
run_id
suggested_score
max_score
dimensions_json
comment_draft
knowledge_points_json
citations_json
risk_flags_json
confidence
needs_teacher_review
status
created_at
updated_at
```

状态建议：

```text
READY
LOW_CONFIDENCE
REVIEW_REQUIRED
ACCEPTED
MODIFIED
REJECTED
```

### 6.3 grading_reviews

保存教师对 AI 预评的审核，不覆盖原始 AI 输出。

```text
id
ai_grading_result_id
reviewer_id
action
final_score
final_comment
dimension_overrides_json
note
published_to_student
created_at
```

如果当前暂不新增表，可以先把教师最终分继续写入 `Grade`，AI 预评先放入 `AgentRun.output` 并在接口中透出。但长期建议单独建表，避免 AI 预评分和教师最终成绩混淆。

## 7. API 建议

### 7.1 学生交卷后自动触发

```http
POST /api/v1/student/assignments/{assignment_id}/submit-answers
```

保持现有规则判分，并在返回中增加：

```json
{
  "ai_feedback": {
    "status": "READY",
    "summary": "本次主要错在链表头节点更新和边界条件判断。",
    "wrong_question_explanations": [],
    "recommended_actions": []
  }
}
```

### 7.2 教师查看 AI 批改队列

```http
GET /api/v1/teacher/grading/ai-results?task_id=...
```

返回：

- 学生；
- 规则分；
- AI 预评分；
- 置信度；
- 待复核原因；
- 评语草稿；
- 是否已发布最终成绩。

### 7.3 教师审核 AI 预评

```http
POST /api/v1/teacher/grading/ai-results/{result_id}/accept
POST /api/v1/teacher/grading/ai-results/{result_id}/modify
POST /api/v1/teacher/grading/ai-results/{result_id}/reject
```

审核后：

- `accept` 可把 AI 建议转为教师成绩草稿；
- `modify` 保存教师调整后的分数和评语；
- `reject` 保留 AI 记录但不作为批改依据；
- `publish` 仍通过成绩发布接口完成，确保最终成绩来源清晰。

### 7.4 班级批改洞察

```http
GET /api/v1/teacher/grading/tasks/{task_id}/insights
```

返回：

- 批改进度；
- 平均规则分；
- 主观题 AI 预评分分布；
- 错题 Top N；
- 共性薄弱知识点；
- 同类错误聚类；
- 教学改进建议草稿。

## 8. 教师端页面落点

### 8.1 任务中心

任务创建时增加：

- 题型选择：客观题、填空题、简答题、报告题、编程题；
- Rubric 编辑器；
- AI 检查评分标准按钮；
- 是否允许 AI 预评开关；
- 低置信度自动进入复核队列开关。

### 8.2 任务监控 / 批改进度

批改表格增加：

- 规则分；
- AI 预评分；
- 置信度；
- 待复核原因；
- 共性错因标签；
- AI 评语草稿；
- 接受、修改、驳回。

### 8.3 学生提交详情

展示顺序：

```text
学生原始答案
-> 规则判分事实
-> AI 预评依据
-> 课程知识引用
-> 教师最终评分和反馈
```

页面需要明确标签：

- 系统判分；
- AI 预评；
- 教师最终结果。

### 8.4 学情诊断

接入批改结果后，学情诊断需要能展示：

- 哪些知识点来自客观题错题；
- 哪些来自主观题 rubric 缺失项；
- 哪些来自编程测试和 AI 诊断；
- 哪些结论经过教师确认；
- 哪些结论仍是低置信度 AI 建议。

## 9. 学生端展示落点

学生端不能看到教师内部审核信息，但应看到：

- 客观题得分和解析；
- AI 生成的错因解释；
- 经教师确认或发布的评语；
- 下一步复习建议；
- 可保存为错题总结或复习笔记的资料。

展示标签：

```text
系统判分
AI 建议
教师已确认
教师已修改
```

## 10. 安全与质量边界

- AI 预评分不能自动发布为最终成绩。
- 低置信度、引用不足、rubric 缺失、答案过短、疑似偏题或疑似抄袭必须进入教师复核。
- AI 不能凭空生成参考答案、教材来源或学生表现数据。
- AI 批改必须保存模型、提示词版本、输入摘要、输出结构、引用和置信度。
- 教师审核不能覆盖原始 AI 输出，只能追加审核记录。
- 对学生展示时不暴露隐藏测试、教师内部备注、全班对比排名和风险规则内部分。
- 抄袭检测只提示“高相似风险”，不能直接认定抄袭。

## 11. 第一版开发顺序

建议按以下顺序落地：

1. 复用现有客观题规则判分，给 `submit_question_answers()` 返回 AI 错因解释结构。
2. 新增 `ai_grading_results` 响应契约，先用规则兜底生成预评和评语草稿。
3. 教师批改进度页展示“规则分 + AI 建议 + 教师最终分”三列。
4. 新增教师 AI 预评审核接口，复用现有 AI 审核模式。
5. 增加主观题 / 简答题的 `Question.question_type` 与 rubric 配置。
6. 接入模型网关，按 rubric 输出结构化预评分。
7. 将批改结果写入画像事件和班级学情聚合。
8. 增加班级共性错因聚类和教学改进建议。

## 12. 演示验收链路

```text
教师创建测验
-> 配置客观题、填空题和一道简答题
-> 配置评分标准和 AI 预评开关
-> 发布到人工智能 1 班
-> 学生作答并提交
-> 系统规则判分客观题
-> AI 按 rubric 预评简答题
-> AI 生成错因解释和评语草稿
-> 教师在批改进度中审核并发布反馈
-> 学生查看系统判分、AI 建议和教师确认反馈
-> 学情诊断页展示班级薄弱知识点和共性错误
-> 教师生成补救任务或复习资料草稿
```

完成这条链路后，作业与试题批改就不再只是人工录分，而是形成：

```text
批改提效
+ 可解释评分
+ 学生改进建议
+ 学情精准诊断
+ 教学改进闭环
```
