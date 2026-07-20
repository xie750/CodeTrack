# 开发规范 V0.1

## 1. 文档驱动

开发前必须具备：功能规格、数据影响、接口合同、验收用例。

需求变化顺序：

1. 修改并评审文档；
2. 更新接口和数据设计；
3. 修改代码；
4. 更新测试；
5. 保存变更记录。

## 2. 仓库结构

```text
CodeTrack/
├── docs/
├── frontend/
├── backend/
├── sandbox/
├── tests/
├── deploy/
├── scripts/
├── .env.example
└── README.md
```

## 3. 分支

- main：可演示版本；
- develop：集成版本；
- feature/Fxxx-name；
- fix/description。

不建议长期存在大量分支。

## 4. 提交信息

- feat；
- fix；
- docs；
- test；
- refactor；
- chore。

示例：`feat: add submission version creation`。

## 5. 后端规范

- 模块边界清晰；
- 路由不直接写复杂业务；
- 业务规则进入 service/domain 层；
- 数据访问集中；
- 外部服务通过 adapter；
- 所有外部调用设置超时；
- 状态使用枚举；
- 对重复任务实现幂等。

## 6. 前端规范

- TypeScript 严格类型；
- API 类型由合同生成或统一维护；
- 页面组件与业务状态分离；
- 必须设计加载、错误和空状态；
- 不在前端写死测试通过或诊断结果；
- 权限隐藏不替代后端校验。

## 7. 配置和密钥

- 使用环境变量；
- 提供 `.env.example`；
- 不提交真实密钥；
- 沙箱不注入业务密钥；
- 日志屏蔽敏感配置。

## 8. 日志

结构化日志至少包含：request_id、user_id 的受控标识、submission_id、version_id、execution_id、状态、耗时和错误码。

## 9. 测试

每个功能至少包含：正常、错误、权限、重复操作。核心规则必须有单元测试，关键链路必须有集成或端到端测试。

## 10. 完成标准

代码完成不等于功能完成。必须同时：

- 测试通过；
- 文档更新；
- 日志可追踪；
- 异常处理完成；
- 验收用例通过；
- 能在演示环境运行。
