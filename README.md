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

### AI 讲解课堂集成启动

AI 讲解课堂现在使用项目内的 OpenMAIC 运行时，源码位于：

```text
third_party/openmaic
```

本地联调需要同时启动三个服务：

1. OpenMAIC 课堂运行时，端口 `3100`。
2. CodeTrack 学生后端，端口 `8000`。
3. CodeTrack 前端，端口 `5173`。

课堂内容生成直接调用项目内 `@openmaic/generation` 的原生大纲、逐页课件和讲解动作生成器。
首次运行或更新 OpenMAIC 后，先安装并构建其工作区依赖（Node.js 22.19+）：

```bash
cd third_party/openmaic
pnpm install
```

在根目录 `.env` 配置 `CODETRACK_MODEL_API_KEY`、`CODETRACK_MODEL_API_BASE_URL` 和
`CODETRACK_MODEL_NAME`。后端通过本地 Node 子进程调用生成包，密钥只经标准输入传入，
不会发给浏览器。生成过程包含多次真实模型调用，需要等待数分钟；默认总超时为 1200 秒，
单次模型请求超时为 180 秒，可分别用 `CODETRACK_OPENMAIC_GENERATION_TIMEOUT_SECONDS` 和
`CODETRACK_OPENMAIC_MODEL_TIMEOUT_SECONDS` 调整。Node 不在 PATH 时设置
`CODETRACK_OPENMAIC_NODE_COMMAND` 为其可执行文件绝对路径。

生成器校验课件元素、画布边界、高亮引用、讲解长度和测验答案，失败时不再保存固定模板。
新课堂完整保留 OpenMAIC 原生元素和动作。资源中心入口与保存流程不变。
已有课堂属于之前保存的快照，不会自动改写；需要重新生成，才能使用新版内容链路。

OpenMAIC 需要允许被 CodeTrack 前端 iframe 嵌入。确认 `third_party/openmaic/.env.local` 至少包含：

```env
ALLOWED_FRAME_ANCESTORS=http://127.0.0.1:5173 http://localhost:5173
```

CodeTrack 前端需要知道 OpenMAIC bridge 地址。确认 `frontend/.env.local` 至少包含：

```env
VITE_OPENMAIC_RUNTIME_URL=http://127.0.0.1:3100/codetrack-bridge
```

**终端 1：启动 OpenMAIC**

```bash
cd D:\shy\CodeTrack\third_party\openmaic
pnpm exec next dev -p 3100
```

**终端 2：启动 CodeTrack 后端**

```bash
cd D:\shy\CodeTrack
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

**终端 3：启动 CodeTrack 前端**

```bash
cd D:\shy\CodeTrack\frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

启动后访问：

```text
http://127.0.0.1:5173/
```

AI 课堂测试资源示例：

```text
http://127.0.0.1:5173/self-study/library/classroom/res_4d0ff718e6c9
```

如果页面中间显示“拒绝访问”图标，通常不是服务没部署，而是浏览器阻止了跨端口 iframe：

- CodeTrack 前端是 `http://127.0.0.1:5173`。
- OpenMAIC 运行时是 `http://127.0.0.1:3100`。
- 浏览器会把不同端口视为不同源。
- OpenMAIC 默认响应头包含 `X-Frame-Options: SAMEORIGIN` 和 `Content-Security-Policy: frame-ancestors 'self'`，会禁止被 `5173` 页面嵌入。

处理方式：

1. 设置 `third_party/openmaic/.env.local` 中的 `ALLOWED_FRAME_ANCESTORS`。
2. 重启 OpenMAIC 服务。
3. 刷新 CodeTrack AI 课堂页面。

**后端**（一个终端）：

```bash
cd backend
pip install -r requirements.txt
alembic -c backend/alembic.ini upgrade head
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
alembic -c backend/alembic.ini upgrade head
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
