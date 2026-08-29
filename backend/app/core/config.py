from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_URL = f"sqlite:///{(BACKEND_DIR / 'codetrack_dev.db').as_posix()}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="CODETRACK_",
        protected_namespaces=("settings_",),
    )

    database_url: str = Field(default=DEFAULT_DATABASE_URL)
    demo_user_id: str = Field(default="user_student_001")
    sandbox_timeout_seconds: int = Field(default=3)
    sandbox_service_url: str | None = Field(default=None)
    piston_base_url: str | None = Field(default=None)
    # 本机 g++ 的绝对路径，留空则用 PATH 上的 g++。见 .env 里的说明。
    cxx: str | None = Field(default=None)
    model_gateway_url: str | None = Field(default=None)
    model_api_key: str | None = Field(default=None)
    model_api_base_url: str = Field(default="https://api.openai.com/v1")
    model_name: str | None = Field(default=None)
    auth_secret_key: str = Field(default="codetrack-demo-secret-change-me")
    auth_access_token_minutes: int = Field(default=30)
    auth_allow_demo_header: bool = Field(default=True)
    # 教师端资料中心上传目录（§七）。第一版只落盘 + 记元数据，不做解析和切片。
    resource_storage_dir: str = Field(default="./var/resources")
    # 单个上传资料的大小上限，超过直接拒绝而不是写坏磁盘
    resource_max_upload_mb: int = Field(default=20)
    api_prefix: str = Field(default="/api/v1")

    # Optional external PPT renderer. When disabled or unavailable, student
    # resource generation falls back to the local PPTX renderer.
    # auto: Presenton when configured, otherwise local. Other values:
    # presenton, ppt_master, local.
    ppt_renderer: str = Field(default="auto")
    presenton_enabled: bool = Field(default=False)
    presenton_base_url: str | None = Field(default=None)
    presenton_public_base_url: str | None = Field(default=None)
    presenton_api_key: str | None = Field(default=None)
    presenton_auth_type: str = Field(default="bearer")
    presenton_username: str | None = Field(default=None)
    presenton_password: str | None = Field(default=None)
    presenton_template: str | None = Field(default=None)
    presenton_language: str = Field(default="Chinese")
    presenton_slide_count: int = Field(default=6)
    presenton_timeout_seconds: int = Field(default=180)
    # PPT Master is an agent workflow rather than an HTTP API. Configure a
    # wrapper command that accepts a JSON request path and output PPTX path.
    ppt_master_enabled: bool = Field(default=False)
    ppt_master_command: str | None = Field(default=None)
    ppt_master_home: str | None = Field(default=None)
    ppt_master_workspace_dir: str | None = Field(default=None)
    ppt_master_timeout_seconds: int = Field(default=300)
    # Local lightweight PPT preview renderer. When LibreOffice is available,
    # generated PPTX files are converted to PDF for browser preview.
    ppt_preview_enabled: bool = Field(default=True)
    # auto: local PowerPoint on Windows when available, then LibreOffice.
    # Other values: powerpoint, libreoffice.
    ppt_preview_renderer: str = Field(default="auto")
    libreoffice_command: str | None = Field(default=None)
    ppt_preview_timeout_seconds: int = Field(default=90)

    redis_url: str = Field(default="redis://localhost:6379/0")
    s3_endpoint: str = Field(default="http://localhost:9000")
    s3_access_key: str = Field(default="minioadmin")
    s3_secret_key: str = Field(default="minioadmin")
    s3_bucket: str = Field(default="codetrack-knowledge")
    s3_secure: bool = Field(default=False)
    rag_storage_backend: str = Field(default="local")
    rag_local_storage_dir: str = Field(default="./var/rag-objects")

    max_upload_mb: int = Field(default=100)

    embedding_provider: str = Field(default="bge_m3")
    embedding_model: str = Field(default="BAAI/bge-m3")
    embedding_dim: int = Field(default=1024)
    embedding_batch_size: int = Field(default=16)

    rerank_provider: str = Field(default="bge")
    rerank_model: str = Field(default="BAAI/bge-reranker-v2-m3")

    parent_target_chars: int = Field(default=1800)
    parent_max_chars: int = Field(default=2600)
    child_target_chars: int = Field(default=450)
    child_max_chars: int = Field(default=650)
    child_overlap_chars: int = Field(default=50)

    dense_top_k: int = Field(default=20)
    lexical_top_k: int = Field(default=20)
    rerank_candidates: int = Field(default=30)
    rerank_top_n: int = Field(default=6)
    min_rerank_score: float | None = Field(default=0.15)
    rrf_k: int = Field(default=60)
    max_context_tokens: int = Field(default=6000)
    max_parent_chunks: int = Field(default=6)
    rag_auto_process_uploads: bool = Field(default=False)
    rag_celery_task_always_eager: bool = Field(default=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
