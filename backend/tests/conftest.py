import os
from pathlib import Path


TEST_DB = Path(__file__).resolve().parents[1] / "test_codetrack.db"
if TEST_DB.exists():
    TEST_DB.unlink()
os.environ["CODETRACK_DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
