from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="CODETRACK_",
        protected_namespaces=("settings_",),
    )

    database_url: str = Field(default="sqlite:///./codetrack_dev.db")
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
