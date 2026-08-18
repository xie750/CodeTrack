from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditLog, Chapter, Material


DEFAULT_CHAPTER_MODES = {
    "chapter-1": ("理论讲授", "published"),
    "chapter-2": ("案例教学", "published"),
    "chapter-3": ("混合式教学", "published"),
    "chapter-4": ("翻转课堂", "draft"),
    "chapter-5": ("实验实训", "draft"),
    "chapter-6": ("项目制教学", "draft"),
}


def ensure_chapter_content_seed(db: Session) -> None:
    seeded = db.scalar(select(AuditLog.id).where(AuditLog.action == "chapter.content.seed").limit(1))
    if seeded:
        return
    chapters = db.scalars(
        select(Chapter).where(Chapter.course_id == "course-ds").order_by(Chapter.position)
    ).all()
    for chapter in chapters:
        default = DEFAULT_CHAPTER_MODES.get(chapter.id)
        if not default:
            continue
        teaching_mode, status = default
        chapter.teaching_mode = teaching_mode
        chapter.status = status

    published_titles = {chapter.title for chapter in chapters if chapter.status == "published"}
    materials = db.scalars(select(Material).where(Material.course_id == "course-ds")).all()
    for material in materials:
        if material.status != "ready":
            continue
        if material.chapter_label in published_titles:
            material.visibility = "students"
    db.add(AuditLog(
        actor_id="teacher-01",
        action="chapter.content.seed",
        resource_type="course",
        resource_id="course-ds",
        detail="Initialized chapter teaching modes and publication states",
    ))
    db.commit()
