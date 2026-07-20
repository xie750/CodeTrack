from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


def request_id() -> str:
    return f"req_{uuid4().hex[:12]}"


def ok(data: Any, rid: str | None = None, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    payload_meta = {"request_id": rid or request_id()}
    if meta:
        payload_meta.update(meta)
    return {"data": data, "meta": payload_meta}


class ApiError(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            status_code=status_code,
            detail={"code": code, "message": message, "details": details or {}},
        )


async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "meta": {"request_id": request_id()},
        },
    )

