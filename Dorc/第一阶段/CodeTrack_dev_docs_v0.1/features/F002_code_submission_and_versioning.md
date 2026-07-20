# F002 代码提交与版本管理

## 目标

安全保存每次学生代码状态，并为执行、诊断和能力证据提供不可变来源。

## 输入

任务 ID、语言、代码、幂等键。

## 规则

- 代码不能为空；
- MVP 只允许 C++；
- 代码大小受限；
- 每次有效提交创建新版本；
- 同一幂等键不重复创建；
- 版本号在同一 Submission 内递增；
- 旧版本不可覆盖。

## 数据

Submission、SubmissionVersion、AuditLog。

## 接口

`POST /tasks/{id}/submissions`；`GET /submissions/{id}/versions`。

## 异常

无权限、任务关闭、空代码、过大、重复请求、数据库失败。

## 验收

- 首次提交创建 Submission 和 Version 1；
- 再次提交创建 Version 2；
- 重复请求不会创建额外版本；
- 历史代码可读取且不变；
- 提交成功后创建执行任务。
