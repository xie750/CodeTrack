# CodeTrack

将计算机课程实验从传统"做题交作业"升级为"任务闯关 + AI 导师陪练 + 能力画像 + 教师智能编排 + 科研训练衔接"的教学研一体化平台。

## 项目概述

CodeTrack Demo V0.1 实现了第一个文档驱动的垂直切片：

```text
任务详情 -> 代码提交 -> 不可变版本 -> 沙箱执行
-> 结构化测试结果 -> 版本历史 -> 完成总结
-> 教师时间线
```

实现范围遵循 `Dorc/第一阶段/CodeTrack_dev_docs_v0.1`。

## 当前范围

- 后端：FastAPI + SQLAlchemy。
- 沙箱：针对固定的 C++ `deleteAt` 任务提供的隔离本地执行适配器。
- 前端：学生和教师演示界面的 React + TypeScript + Vite 源码脚手架。
- 测试：针对链表 fixture、幂等提交、空代码和编译错误的 pytest 覆盖率。

AI/RAG 集成通过模型网关适配器进行。当配置了 `CODETRACK_MODEL_GATEWAY_URL` 时，后端仅将任务上下文、当前版本代码、失败的工具证据和预置知识源发送到该网关。返回的 JSON 在存储前必须通过 schema、引用、置信度和提示泄漏验证。如果网关缺失或无效，失败的链表提交会收到一个明确标记为 `RULE_FALLBACK` 的诊断，其中引用了真实的测试结果 ID 和预置课程源 ID，设置 `needs_teacher_review=true`，并提供受控的渐进式提示。

## 启动

**后端**（一个终端）：

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
cd ../scripts && python seed_demo.py && cd ../backend
uvicorn app.main:app --reload
```

**前端**（另一个终端）：

```bash
cd frontend
npm install
npm run dev
```

后端默认跑在 `http://localhost:8000`，前端默认跑在 `http://localhost:5173`。

如需 PostgreSQL，复制 `.env.example` 为 `.env`，修改 `CODETRACK_DATABASE_URL` 即可。

## 测试

```bash
python -m pytest
```

沙箱需要 `g++` 在 `PATH` 中。

## 演示账号

- 学生：`X-Demo-User-Id: user_student_001`
- 教师：`X-Demo-User-Id: user_teacher_001`

前端在演示界面中自动使用这些请求头。
