import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from .material_folder_ops import MaterialFolder


DEFAULT_FOLDERS = [
    "第1章 算法基础",
    "第2章 线性表",
    "2.1 顺序表",
    "2.2 链表",
    "第3章 栈与队列",
    "实验指导",
    "参考资料",
]


def ensure_default_material_folders(db: Session) -> None:
    course_id = "course-ds"
    existing = db.scalars(
        select(MaterialFolder).where(MaterialFolder.course_id == course_id)
    ).all()
    if existing:
        return
    db.add_all([
        MaterialFolder(
            id=f"folder-seed-{uuid.uuid4().hex[:8]}",
            course_id=course_id,
            name=name,
            position=index,
            source="seed_confirmed",
        )
        for index, name in enumerate(DEFAULT_FOLDERS, 1)
    ])
    db.commit()


