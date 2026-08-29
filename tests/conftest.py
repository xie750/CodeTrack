import os
from pathlib import Path

TEST_DB = Path(__file__).resolve().parents[1] / "backend" / "codetrack_test.db"
os.environ["CODETRACK_DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["CODETRACK_SANDBOX_TIMEOUT_SECONDS"] = "3"
os.environ["CODETRACK_SANDBOX_SERVICE_URL"] = ""
os.environ["CODETRACK_RAG_STORAGE_BACKEND"] = "local"
os.environ["CODETRACK_RAG_LOCAL_STORAGE_DIR"] = "./var/test-rag-objects"
os.environ["CODETRACK_RAG_CELERY_TASK_ALWAYS_EAGER"] = "true"
os.environ["CODETRACK_EMBEDDING_PROVIDER"] = "hash"
os.environ["CODETRACK_RERANK_PROVIDER"] = "lexical"
os.environ["CODETRACK_MIN_RERANK_SCORE"] = "0"

# test_sandbox_service.py 直接打独立沙箱服务（sandbox/app.py），那边按设计只读
# 环境变量、读不到 backend 的 .env。把 .env 里的 CODETRACK_CXX 透过去，免得本机
# 编译器路径要在 shell 里再 export 一遍。不写死路径，值仍然只有 .env 一个来源。
if not os.environ.get("CODETRACK_CXX"):
    from backend.app.core.config import Settings

    _cxx = Settings().cxx
    if _cxx:
        os.environ["CODETRACK_CXX"] = _cxx


def pytest_sessionstart(session):
    if TEST_DB.exists():
        TEST_DB.unlink()
