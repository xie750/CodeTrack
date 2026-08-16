from __future__ import annotations

from pathlib import Path
from typing import Protocol

from backend.app.core.config import get_settings


class ObjectStorage(Protocol):
    def put_bytes(self, key: str, content: bytes, content_type: str | None = None) -> None:
        ...

    def get_bytes(self, key: str) -> bytes:
        ...

    def delete(self, key: str) -> None:
        ...


class S3ObjectStorage:
    def __init__(self):
        try:
            import boto3
            from botocore.config import Config
            from botocore.exceptions import ClientError
        except ImportError as exc:
            raise RuntimeError("boto3 is required for S3/MinIO object storage") from exc
        settings = get_settings()
        self.bucket = settings.s3_bucket
        self._client_error = ClientError
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            use_ssl=settings.s3_secure,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        try:
            self._client.head_bucket(Bucket=self.bucket)
        except self._client_error:
            self._client.create_bucket(Bucket=self.bucket)

    def put_bytes(self, key: str, content: bytes, content_type: str | None = None) -> None:
        extra = {"ContentType": content_type} if content_type else {}
        self._client.put_object(Bucket=self.bucket, Key=key, Body=content, **extra)

    def get_bytes(self, key: str) -> bytes:
        body = self._client.get_object(Bucket=self.bucket, Key=key)["Body"]
        return body.read()

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self.bucket, Key=key)


class LocalObjectStorage:
    def __init__(self):
        self.root = Path(get_settings().rag_local_storage_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        root = self.root.resolve()
        if root not in path.parents and path != root:
            raise ValueError("object key escapes storage root")
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def put_bytes(self, key: str, content: bytes, content_type: str | None = None) -> None:
        self._path(key).write_bytes(content)

    def get_bytes(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()


def get_object_storage() -> ObjectStorage:
    backend = get_settings().rag_storage_backend.lower()
    if backend == "local":
        return LocalObjectStorage()
    if backend == "s3":
        return S3ObjectStorage()
    raise ValueError(f"unknown object storage backend: {backend}")
