# CodeTrack

将计算机课程实验从传统"做题交作业"升级为"任务闯关 + AI 导师陪练 + 能力画像 + 教师智能编排 + 科研训练衔接"的教学研一体化平台。

## Project Overview

CodeTrack Demo V0.1 implements the first document-driven vertical slice:

```text
task detail -> code submission -> immutable version -> sandbox execution
-> structured test results -> version history -> completion summary
-> teacher timeline
```

The scope follows `Dorc/第一阶段/CodeTrack_dev_docs_v0.1`.

## Current Scope

- Backend: FastAPI + SQLAlchemy.
- Sandbox: isolated local execution adapter for the fixed C++ `deleteAt` task.
- Frontend: React + TypeScript + Vite source scaffold for the student and teacher demo screens.
- Tests: pytest coverage for the linked-list fixture, idempotent submissions, empty code, and compile errors.

AI/RAG integration is kept behind a model gateway adapter. When `CODETRACK_MODEL_GATEWAY_URL` is configured, the backend sends only task context, current version code, failed tool evidence and seeded knowledge sources to that gateway. Returned JSON must pass schema, reference, confidence and hint-leakage validation before it is stored. If the gateway is missing or invalid, failed linked-list submissions receive a clearly marked `RULE_FALLBACK` diagnosis that cites real test-result IDs and seeded course-source IDs, sets `needs_teacher_review=true`, and exposes controlled progressive hints.

## Local Backend

```bash
python -m pip install -r backend/requirements.txt
alembic upgrade head
python scripts/seed_demo.py
uvicorn backend.app.main:app --reload
```

The local default database is SQLite for quick development. `.env.example` shows the PostgreSQL URL expected for the documented Demo environment.

For a clean local restore, point `CODETRACK_DATABASE_URL` at an empty database, run `alembic upgrade head`, then run `python scripts/seed_demo.py`.

## Tests

```bash
python -m pytest
```

The sandbox requires `g++` on `PATH`.

## Demo Accounts

- Student: `X-Demo-User-Id: user_student_001`
- Teacher: `X-Demo-User-Id: user_teacher_001`

The frontend uses these headers automatically for the Demo screens.
