# 整体业务流程与状态规则

## 1. 核心业务对象

- 课程；
- 实验任务；
- 学生提交；
- 提交版本；
- 执行记录；
- 测试结果；
- AI 诊断；
- 提示记录；
- 能力证据；
- 教师复核。

## 2. 正常业务流程

```text
教师准备课程资料、任务和测试用例
→ 学生进入任务
→ 学生提交代码
→ 系统生成提交和版本记录
→ 系统创建执行任务
→ 沙箱编译、运行和测试
→ 系统保存确定性证据
→ RAG 检索课程知识
→ AI 生成结构化诊断和一级提示
→ 学生查看结果并修改代码
→ 学生重新提交
→ 系统生成新版本并重新验证
→ 测试通过
→ 系统根据规则生成能力证据
→ 教师查看个人过程和班级聚合信息
```

## 3. 提交状态机

首个 Demo 使用以下提交状态：

```text
DRAFT 草稿
SUBMITTED 已提交
QUEUED 等待执行
RUNNING 正在执行
EXECUTION_FINISHED 执行结束
DIAGNOSING 诊断中
FEEDBACK_READY 反馈已就绪
PASSED 已通过
FAILED 未通过
REVIEW_REQUIRED 需要教师复核
CANCELLED 已取消
```

状态规则：

- 每次重新提交必须生成新的 `SubmissionVersion`；
- 旧版本不可覆盖；
- `PASSED` 由全部必要测试通过触发，不由 AI 决定；
- 诊断失败不改变测试事实；
- AI 失败时仍然允许学生查看编译和测试结果；
- 教师复核不能修改原始工具证据，只能补充或更正解释标签。

### 3.1 执行结果到提交状态映射

|场景|执行状态|诊断状态|提交状态|页面主提示|
|---|---|---|---|---|
|提交成功，等待执行|PENDING/PREPARING|NOT_STARTED|QUEUED|代码已提交，正在等待执行|
|正在编译或测试|COMPILING/RUNNING_TESTS|NOT_STARTED|RUNNING|正在编译或运行测试|
|编译失败|COMPILE_ERROR|NOT_STARTED 或 READY|FAILED|编译失败，请先根据编译信息修改|
|运行时错误|RUNTIME_ERROR|NOT_STARTED 或 READY|FAILED|运行时发生错误|
|运行超时|TIMEOUT|NOT_STARTED 或 READY|FAILED|运行超时，请检查循环或复杂度|
|资源超限|RESOURCE_LIMIT|NOT_STARTED 或 READY|FAILED|资源使用超出限制|
|安全拒绝|SECURITY_REJECTED|NOT_STARTED|REVIEW_REQUIRED|代码触发安全限制|
|基础设施错误|INFRASTRUCTURE_ERROR|NOT_STARTED|FAILED|执行服务暂时不可用，可重试|
|测试完成且全部必要测试通过|SUCCEEDED|NOT_STARTED|PASSED|全部必要测试通过|
|测试完成但存在必要测试失败|SUCCEEDED|RETRIEVING_KNOWLEDGE/GENERATING/VALIDATING_OUTPUT|DIAGNOSING|测试已完成，正在生成诊断|
|测试失败且诊断成功|SUCCEEDED|READY|FEEDBACK_READY|诊断和提示已生成|
|测试失败且无课程资料|SUCCEEDED|NO_KNOWLEDGE_FOUND|REVIEW_REQUIRED|暂无课程资料依据，需要复核或降级提示|
|测试失败且模型失败|SUCCEEDED|MODEL_ERROR/INVALID_OUTPUT|FAILED|测试结果可查看，AI 诊断暂不可用|
|低置信度诊断|SUCCEEDED|LOW_CONFIDENCE|REVIEW_REQUIRED|诊断置信度低，需要教师复核|

说明：

- `PASSED` 只由全部必要测试通过触发；
- `FEEDBACK_READY` 表示测试未通过但学生可查看诊断和提示；
- AI/RAG 尚未接入时，测试失败可直接进入 `FAILED`，页面只展示工具结果；
- 新版本提交后，旧版本状态不变，新版本重新从 `QUEUED` 开始；
- 旧诊断只关联旧版本，不自动适用于新版本。

### 3.2 重复提交和幂等

- 同一用户、同一任务、同一 `Idempotency-Key` 的重复请求返回原 `submission_id`、`version_id` 和 `execution_id`；
- 如果同一版本已有执行在 `PENDING`、`PREPARING`、`COMPILING` 或 `RUNNING_TESTS`，不得再次创建相同执行；
- 如果学生修改代码后重新提交，必须使用新的幂等键并生成新的 `SubmissionVersion`；
- 相同代码内容仍可形成新版本，但应保存 `code_hash` 便于后续分析。

## 4. 执行状态机

```text
PENDING
→ PREPARING
→ COMPILING
→ RUNNING_TESTS
→ SUCCEEDED
```

异常终态：

- COMPILE_ERROR；
- RUNTIME_ERROR；
- TIMEOUT；
- RESOURCE_LIMIT；
- SECURITY_REJECTED；
- INFRASTRUCTURE_ERROR。

## 5. 诊断状态机

```text
NOT_STARTED
→ RETRIEVING_KNOWLEDGE
→ GENERATING
→ VALIDATING_OUTPUT
→ READY
```

异常状态：

- NO_KNOWLEDGE_FOUND；
- MODEL_ERROR；
- INVALID_OUTPUT；
- LOW_CONFIDENCE；
- REVIEW_REQUIRED。

## 6. 提示升级规则

MVP 默认支持三级：

- 一级：指出现象和排查方向；
- 二级：提示知识点和可能出错区域；
- 三级：给出修正步骤或伪代码，但不默认提供完整实现。

建议升级条件：

- 初次失败默认一级；
- 学生再次失败或主动申请，可进入二级；
- 再次失败、停留超时或主动确认后，可进入三级；
- 完整参考实现作为教师可配置的独立操作，不计入普通提示层级；
- 查看完整答案后，只记录任务完成，不产生强能力掌握证据。

## 7. 能力证据生成时机

只在有确定性结果时生成：

- 任务首次独立通过；
- 提示后通过；
- 同类错误重复出现；
- 后续相似任务独立通过；
- 教师复核确认。

大模型可以建议“可能关联能力点”，但最终证据类型与强度由规则服务确定。

## 8. 关键异常分支

### 8.1 编译失败

直接展示编译器错误；AI 可以解释，但不得伪造测试结果。

### 8.2 运行超时

停止容器，展示超时事实；AI 可以提示检查循环或复杂度。

### 8.3 知识库无结果

显示“暂无课程资料依据”；允许 AI 仅基于工具证据提供低置信度方向，并标记需要复核。

### 8.4 模型失败

展示工具结果和通用故障说明；提供重试，不阻塞重新提交。

### 8.5 工具与 AI 冲突

工具事实优先；诊断标记为需要复核，不允许 AI 覆盖测试结果。

### 8.6 恶意代码

沙箱拒绝执行，记录安全事件，不进入普通 AI 学习诊断。
