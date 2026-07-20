import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.core.database import SessionLocal, engine
from backend.app.models import Base
from backend.app.services.seed import seed_demo_data


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_demo_data(db)
    finally:
        db.close()
    print("CodeTrack demo seed data is ready.")


if __name__ == "__main__":
    main()
