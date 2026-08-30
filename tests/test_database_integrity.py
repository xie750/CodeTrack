from sqlalchemy import text
from fastapi.testclient import TestClient

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import AdministrativeClass, Course


def test_sqlite_foreign_keys_are_enabled():
    db = SessionLocal()
    try:
        assert db.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
    finally:
        db.close()


def test_demo_data_is_scoped_to_ai_major_and_three_courses():
    with TestClient(app):
        db = SessionLocal()
        try:
            courses = db.query(Course).filter(Course.term == "2026-demo").order_by(Course.name).all()
            classes = db.query(AdministrativeClass).all()
            assert {course.name for course in courses} == {"Python 程序设计", "数据结构", "机器学习"}
            assert {class_.major_name for class_ in classes} == {"人工智能"}
        finally:
            db.close()
