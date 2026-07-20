# 开发直接相关细节锁定清单

**状态：编码前按需确认**

本文档只保留会直接影响代码结构、接口、页面、沙箱执行和 AI/RAG 逻辑的细节。部署环境、演示材料、发布截图、验收报告等暂不处理。

## P0：第一根纵向链路开始前必须明确

### 1. C++ 任务协议

已在 `testing/02_linked_list_test_cases.md` 冻结。开发时以该文档为准。

已明确：

- `ListNode` 结构定义；
- 学生可编辑代码模板；
- 平台测试驱动模板；
- 编译命令模板；
- `deleteAt` 的返回值语义；
- 空链表处理规则；
- 非法位置处理规则；
- 是否要求释放被删除节点；
- 是否允许学生引入额外头文件；
- 代码大小上限。

### 2. 判题夹具和最小测试数据

这里的“测试”不是最后发布验收测试，而是沙箱判题必须使用的输入和期望结果。没有这部分，F003 代码执行与测试结果无法开发。

已在 `testing/02_linked_list_test_cases.md` 给出最小集合：

- 标准错误代码；
- 标准正确代码；
- 删除中间节点、删除头节点、空链表删除的输入与期望输出；
- 公开测试与隐藏测试划分；
- 每个测试关联的 `error_tag` 和 `capability_id`；
- 编译错误样例；
- 超时样例。

首个 Demo 必须保证标准错误代码在“删除头节点”测试失败，正确代码通过全部必要测试。

### 3. 种子数据

已在 `database/03_seed_data.md` 给出固定种子数据：

- 一个课程；
- 一个任务；
- 一个教师账号；
- 一个或两个学生账号；
- 一个能力点 `LINKED_LIST_BOUNDARY_HANDLING`；
- 一组测试用例；
- 一组课程知识来源；
- 标准错误代码和正确代码；
- 初始角色和课程成员关系。

### 4. API 响应字段

已在 `api/02_demo_v0.1_api.md` 补齐完整 JSON 示例：

- `GET /api/v1/tasks`；
- `GET /api/v1/tasks/{task_id}`；
- `POST /api/v1/tasks/{task_id}/submissions`；
- `GET /api/v1/executions/{execution_id}`；
- `GET /api/v1/submission-versions/{version_id}/results`；
- `GET /api/v1/submission-versions/{version_id}/diagnosis`；
- `POST /api/v1/diagnoses/{diagnosis_id}/hints`；
- `GET /api/v1/submissions/{submission_id}/versions`；
- `GET /api/v1/submissions/{submission_id}/summary`；
- `GET /api/v1/teacher/courses/{course_id}/submissions`；
- `GET /api/v1/teacher/submissions/{submission_id}/timeline`。

### 5. 状态流转表

已在 `04_business_flow.md` 的“执行结果到提交状态映射”中补齐：

- 提交状态如何从 `QUEUED` 到 `PASSED` 或 `FAILED`；
- 编译失败时提交状态如何展示；
- 测试失败但 AI 成功时如何展示；
- 测试失败且 AI 失败时如何展示；
- RAG 无结果时是否进入 `REVIEW_REQUIRED`；
- 重复点击提交如何返回同一结果；
- 新版本提交后旧诊断如何标记。

## P1：接入对应模块前补齐

### 6. AI 输出 Schema

必须从“建议 JSON Schema”升级为固定 Schema。

至少冻结：

- `diagnosis_type` 枚举；
- `confidence` 阈值；
- `verified_evidence_ids` 的来源规则；
- `knowledge_source_ids` 的来源规则；
- `hint_level` 允许值；
- `needs_teacher_review` 触发条件；
- 格式错误重试次数；
- 降级文案。

首个错误类型至少包含：

```text
LINKED_LIST_HEAD_UPDATE_ERROR
BOUNDARY_CASE_MISSING
COMPILE_ERROR_EXPLANATION
UNKNOWN_OR_LOW_CONFIDENCE
```

### 7. RAG 知识条目

必须准备可引用的最小知识库：

- `kb_linked_list_delete_basic`；
- `kb_head_node_delete`；
- `kb_empty_list_guard`；
- `kb_boundary_test_reasoning`。

每条包含：

- `source_id`；
- 标题；
- 正文摘要；
- 来源类型；
- 版本；
- 权威等级；
- 是否学生可见。

### 8. 提示解锁规则

必须明确：

- 一级是自动生成还是首次查看时生成；
- 二级主动申请是否必须先重新提交一次；
- 三级是否必须二级后再次失败；
- 同一层级重复查看返回旧内容还是新内容；
- 参考答案入口首版是否隐藏；
- 泄露检查失败时给学生展示什么。

### 9. 能力证据算法

必须把规则写成可测试条件：

- 版本 1 全部必要测试通过：强正向证据；
- 使用一级提示后通过：中等正向证据；
- 使用二级或三级后通过：弱正向证据；
- 查看参考答案后通过：中性完成证据；
- 多次同类失败仍未通过：负向证据。

同时明确首个 Demo 是否更新 `CapabilityState`，以及从证据到“初步掌握”的阈值。

### 10. 页面线框和交互细节

必须补齐低保真线框或页面结构说明：

- 学生任务工作台布局；
- 工具事实、课程来源、AI 分析的视觉分区；
- 执行中轮询反馈；
- 编译失败展示；
- 测试失败展示；
- 提示申请按钮状态；
- 版本历史抽屉或列表；
- 完成总结卡片；
- 教师时间线事件样式。

## 暂不进入当前开发准备

以下内容有价值，但不影响第一根纵向链路的开发启动，先不展开：

- 完整错误码表；
- 发布验收证据模板；
- 演示截图和演示脚本；
- 完整审计字段；
- 部署和运维细节。

## 开发启动条件

可以开始第一根“不接 AI 的纵向链路”的最低条件：

- P0 中的 C++ 任务协议、判题夹具、种子数据、核心 API 响应和状态流转已经具备开发基线；
- AI/RAG、提示、能力证据和教师统计可以在沙箱真实执行链路跑通后补齐；
- 教师端统计和教学建议不阻塞第一根纵向链路；
- 部署环境继续延期。
