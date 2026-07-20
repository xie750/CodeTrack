# API 设计规范

## 1. 风格

- REST 风格；
- 前缀 `/api/v1`；
- JSON；
- OpenAPI 自动生成文档；
- 资源名使用复数和小写短横线；
- 时间使用 ISO 8601；
- ID 使用字符串。

## 2. 响应结构

成功：

```json
{
  "data": {},
  "meta": {
    "request_id": "req_xxx"
  }
}
```

失败：

```json
{
  "error": {
    "code": "SUBMISSION_CODE_EMPTY",
    "message": "代码不能为空",
    "details": {}
  },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

## 3. HTTP 状态

- 200：查询或更新成功；
- 201：创建成功；
- 202：异步任务已接收；
- 400：输入错误；
- 401：未登录；
- 403：无权限；
- 404：资源不存在；
- 409：状态冲突或重复操作；
- 422：业务校验失败；
- 429：频率限制；
- 500：内部错误；
- 503：依赖服务不可用。

## 4. 异步接口

提交代码返回 202 或 201，并提供：

- submission_id；
- version_id；
- execution_id；
- status；
- status_url。

前端查询状态，不保持长连接等待完整诊断。

## 5. 幂等

代码提交接口支持 `Idempotency-Key`：

- 同一用户、同一任务、同一键重复请求返回同一结果；
- 防止重复点击创建多个版本；
- 键保存有限时间。

## 6. 分页

列表参数：

- page；
- page_size；
- sort；
- filter。

MVP 默认 page_size 不超过 50。

## 7. 权限

每个接口后端校验：

- 当前角色；
- 课程成员关系；
- 资源所有权；
- 任务状态。

不能只依赖前端路由保护。

## 8. 错误码前缀

- AUTH_*；
- COURSE_*；
- TASK_*；
- SUBMISSION_*；
- EXECUTION_*；
- DIAGNOSIS_*；
- HINT_*；
- CAPABILITY_*；
- SYSTEM_*。

## 9. 版本兼容

首个 Demo 开发期间避免随意修改响应字段。必须修改时：

1. 更新 API 文档；
2. 更新前端类型；
3. 更新测试；
4. 在架构决策或变更记录中说明。
