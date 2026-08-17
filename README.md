# CodeTrack

CodeTrack（知研序） 是一个面向高校学科教学与自主学习场景的垂直智能学习平台。项目围绕“学科知识库 + 垂直大模型 + 自主化智能体”构建，将课程资料、知识检索、AI问答、学习任务与学习画像等能力进行整合，为学生提供个性化学习支持，同时辅助教师完成教学资源组织与智能化教学管理。

项目重点探索 RAG知识增强、学科模型微调、多智能体协同与学习数据分析 等技术，实现从知识获取、学习交互到能力反馈的完整学习闭环。

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

总结：python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload

```

**前端**（另一个终端）：

```bash
cd frontend
npm install
npm run dev
```

后端默认跑在 `http://localhost:8000`，前端默认跑在 `http://localhost:5173`。

如需 PostgreSQL，复制 `.env.example` 为 `.env`，修改 `CODETRACK_DATABASE_URL` 即可。

## RAG 知识库后端验收

RAG 知识库后端使用 PostgreSQL + pgvector、Redis/Celery、MinIO、Parent-Child Chunk、Hybrid Retrieval 与可验证 citation。仓库根目录提供 `docker-compose.yml`，可按规格第 36 节直接启动：

```bash
docker compose up -d
alembic upgrade head
```

创建知识库：

```bash
curl -X POST http://localhost:8000/api/v1/knowledge-bases \
  -H "Content-Type: application/json" \
  -H "X-Demo-User-Id: user_student_001" \
  -d "{\"name\":\"RAG Test KB\",\"description\":\"test\"}"
```

上传文件会保存原文件、创建 Document/Version/Job、投递 Celery，API 返回 `202`，不会同步等待解析和 Embedding：

```bash
curl -X POST \
  -H "X-Demo-User-Id: user_student_001" \
  -F "file=@./tests/fixtures/simple.md" \
  http://localhost:8000/api/v1/knowledge-bases/<KB_ID>/documents
```

查询状态、检索测试和 RAG：

```bash
curl -H "X-Demo-User-Id: user_student_001" \
  http://localhost:8000/api/v1/documents/<DOCUMENT_ID>

curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Demo-User-Id: user_student_001" \
  -d "{\"query\":\"文档中的核心概念是什么？\",\"debug\":true}" \
  http://localhost:8000/api/v1/knowledge-bases/<KB_ID>/retrieve

curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Demo-User-Id: user_student_001" \
  -d "{\"query\":\"文档中的核心概念是什么？\",\"stream\":false}" \
  http://localhost:8000/api/v1/knowledge-bases/<KB_ID>/rag/query
```

数据库验收 SQL：

```sql
SELECT status, active_version_id FROM documents;
SELECT chunk_type, count(*) FROM chunks GROUP BY chunk_type;
SELECT vector_dims(embedding) FROM chunks WHERE embedding IS NOT NULL LIMIT 1;
```

自动化测试：

```bash
python -m pytest tests/test_rag_knowledge_base.py -q
python -m pytest
```

## 测试

```bash
python -m pytest
```

沙箱需要 `g++` 在 `PATH` 中。

## 演示账号

- 学生：`X-Demo-User-Id: user_student_001`
- 教师：`X-Demo-User-Id: user_teacher_001`

前端在演示界面中自动使用这些请求头。
