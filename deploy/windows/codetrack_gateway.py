from __future__ import annotations

from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask
from starlette.exceptions import HTTPException as StarletteHTTPException


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = PROJECT_ROOT / "dist"
UNIFIED_BACKEND = "http://127.0.0.1:8002"
TEACHER_BACKEND = "http://127.0.0.1:8001"

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}

app = FastAPI(title="CodeTrack Production Gateway", version="1.0.0")
client = httpx.AsyncClient(timeout=None, trust_env=False)


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: dict):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if (
                exc.status_code == 404
                and scope.get("method") in {"GET", "HEAD"}
                and not path.startswith(("api/", "health", "ready", "docs", "redoc", "openapi.json"))
            ):
                return await super().get_response("index.html", scope)
            raise


def _proxy_headers(headers: httpx.Headers) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in headers.items():
        lowered = key.lower()
        if lowered in HOP_BY_HOP_HEADERS or lowered == "content-length":
            continue
        result[key] = value
    return result


def _request_headers(request: Request) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in request.headers.items():
        lowered = key.lower()
        if lowered in HOP_BY_HOP_HEADERS or lowered in {"host", "content-length"}:
            continue
        result[key] = value
    return result


def _target_for(path: str) -> tuple[str, str]:
    if path == "/api/unified" or path.startswith("/api/unified/"):
        return UNIFIED_BACKEND, path.replace("/api/unified", "/api/v1", 1)
    if (
        path == "/api/v1/health"
        or path.startswith("/api/v1/teacher")
        or path.startswith("/api/v1/material-files")
        or path.startswith("/api/v1/classes")
    ):
        return TEACHER_BACKEND, path
    if path.startswith("/api/") or path in {"/health", "/ready"}:
        return UNIFIED_BACKEND, path
    return UNIFIED_BACKEND, path


async def _proxy(request: Request, path: str):
    path = "/" + path
    base_url, upstream_path = _target_for(path)
    upstream_url = f"{base_url}{upstream_path}"
    if request.url.query:
        upstream_url = f"{upstream_url}?{request.url.query}"
    upstream_request = client.build_request(
        request.method,
        upstream_url,
        headers=_request_headers(request),
        content=await request.body(),
    )
    upstream_response = await client.send(upstream_request, stream=True)

    return StreamingResponse(
        upstream_response.aiter_raw(),
        status_code=upstream_response.status_code,
        headers=_proxy_headers(upstream_response.headers),
        background=BackgroundTask(upstream_response.aclose),
    )


@app.on_event("shutdown")
async def shutdown_client():
    await client.aclose()


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_api(path: str, request: Request):
    return await _proxy(request, f"api/{path}")


@app.api_route("/health", methods=["GET", "HEAD"])
async def proxy_health(request: Request):
    return await _proxy(request, "health")


@app.api_route("/ready", methods=["GET", "HEAD"])
async def proxy_ready(request: Request):
    return await _proxy(request, "ready")


if FRONTEND_DIST.exists():
    app.mount("/", SPAStaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/{path:path}")
    def frontend_missing(path: str = ""):
        return Response("Frontend dist directory is missing.", status_code=503)
