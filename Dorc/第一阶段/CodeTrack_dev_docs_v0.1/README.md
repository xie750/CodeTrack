# CodeTrack 开发文档包 V0.1

## 1. 文档包用途

本目录用于把现有赛题分析和产品构想转换为可以指导团队与 AI 编码工具实施的软件工程文档。

本版只服务于第一阶段：

> 围绕数据结构课程中的“单链表删除头节点错误”，完成学生提交代码、代码执行、自动测试、AI 诊断、渐进提示、重新提交、能力证据记录和教师基础查看的首个纵向 Demo。

这不是最终产品的全部设计。科研训练、多课程扩展、完整游戏化、复杂管理端和大规模运营能力均不属于当前开发主线。

## 2. 推荐阅读顺序

1. `01_project_positioning_and_boundaries.md`
2. `02_mvp_scope.md`
3. `03_demo_v0.1_scope.md`
4. `99_open_decisions.md`
5. `product/00_demo_product_baseline.md`
6. `product/05_pre_development_detail_checklist.md`
7. `04_business_flow.md`
8. `05_roles_and_permissions.md`
9. `architecture/01_system_context.md`
10. `architecture/02_overall_architecture.md`
11. `architecture/03_module_boundaries.md`
12. `architecture/04_core_sequences.md`
13. `product/01_student_closed_loop.md`
14. `product/02_page_map_and_states.md`
15. `database/01_domain_model.md`
16. `database/03_seed_data.md`
17. `api/01_api_conventions.md`
18. `features/` 下各功能规格
19. `testing/` 下测试与验收文件
20. `standards/` 下开发规范

## 3. 当前开发原则

- 先闭环，后扩展。
- 先业务规则，后页面视觉。
- 先确定性代码工具，后大模型解释。
- 先一个任务和一种语言，后多个任务和多语言。
- 先建立可追溯过程数据，后生成能力画像和教师报告。
- 整体架构只定义全局边界；复杂模块在开发前补充模块设计；普通功能只需功能规格。
- AI 编码工具只能执行已批准文档，不得自行扩展产品范围。

## 4. 首次开发入口

首个推荐开发任务不是“完成整个学生端”，而是完成以下纵向切片：

```text
任务详情
→ 代码提交
→ 保存提交版本
→ 沙箱编译运行
→ 自动测试
→ 测试结果展示
→ RAG 检索课程资料
→ AI 错因诊断
→ 一级提示
→ 学生修改并重新提交
→ 再次验证
→ 形成能力证据
→ 教师查看过程记录
```

## 5. 文档状态说明

- `已冻结`：首个 Demo 开发期间原则上不修改。
- `推荐基线`：可以在正式编码前调整，但调整后必须同步修改相关文档。
- `待决策`：需要团队后续明确，不应由 AI 编码工具自行决定。

当前建议先审阅 `99_open_decisions.md`、`product/00_demo_product_baseline.md` 和 `product/05_pre_development_detail_checklist.md`，确认非部署产品基线和 P0 细节后再建立代码仓库。
