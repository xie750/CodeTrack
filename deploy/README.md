# CodeTrack Demo Deployment

This compose file follows the Demo V0.1 architecture baseline:

- modular FastAPI backend;
- independent sandbox service;
- PostgreSQL;
- Redis placeholder for the documented queue boundary;
- Vite frontend.

## Start

```bash
docker compose -f deploy/docker-compose.yml up --build
```

In another shell, initialize the backend database:

```bash
docker compose -f deploy/docker-compose.yml exec backend alembic upgrade head
docker compose -f deploy/docker-compose.yml exec backend python scripts/seed_demo.py
```

## Model Gateway

The backend supports two real model integration paths:

- Set `CODETRACK_MODEL_GATEWAY_URL` to call an internal diagnosis gateway that returns the documented JSON schema.
- Or set `CODETRACK_MODEL_API_KEY`, optionally `CODETRACK_MODEL_API_BASE_URL`, and `CODETRACK_MODEL_NAME` to call an OpenAI-compatible `/chat/completions` endpoint directly.

In both cases, model output is validated against the Demo V0.1 diagnosis schema before it is stored. Invalid model output falls back to the rule-based diagnosis without changing compile or test evidence.

## Sandbox Limits

The sandbox service is configured as an internal service with:

- no host port exposure;
- an internal Docker network shared only with the backend and frontend services;
- Docker CLI access for the control service, so it can create one-time execution containers;
- per-run execution containers use non-root `10001:10001`;
- read-only root filesystem;
- tmpfs work area;
- `no-new-privileges`;
- all capabilities dropped;
- PID, CPU and memory limits.

Docker is still not an absolute security boundary. The sandbox service creates one-time execution containers with `--network none`, `--user 10001:10001`, read-only root filesystem, no new privileges, all Linux capabilities dropped, PID limit, memory limit and CPU limit. This path requires Docker availability on the target machine.
