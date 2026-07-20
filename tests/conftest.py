import os
from pathlib import Path

os.environ["CODETRACK_DATABASE_URL"] = "sqlite:///./codetrack_test.db"
os.environ["CODETRACK_SANDBOX_TIMEOUT_SECONDS"] = "3"


def pytest_sessionstart(session):
    db_path = Path("codetrack_test.db")
    if db_path.exists():
        db_path.unlink()

