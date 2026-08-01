"""Course syllabus: course_chapters + course_knowledge_points.

开发方案 §六 6.2 课程大纲。第一版只做「章节 — 知识点」两层结构，不做知识图谱。

这一版**只做加法**：新增两张表，不动任何既有列。资料中心、题目、学习画像里的
自由文本知识点（`knowledge_sources.chapter` / `.knowledge_points`、
`questions.knowledge_points`、`learner_knowledge_states.knowledge_point` 等）
行为完全不变，需要关联时按知识点**名称**软关联。把那些列迁成外键是后续独立一轮的事，
所以这里没有任何数据回填，downgrade 也就能干净地把两张表删掉。

Revision ID: 20260801_0008
Revises: 20260801_0007
Create Date: 2026-08-01 00:00:00 UTC
"""
from alembic import op

from backend.app.models import CourseChapter, CourseKnowledgePoint

revision = "20260801_0008"
down_revision = "20260801_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    # 先建章节：course_knowledge_points.chapter_id 外键指向它
    CourseChapter.__table__.create(bind=bind, checkfirst=True)
    CourseKnowledgePoint.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    CourseKnowledgePoint.__table__.drop(bind=bind, checkfirst=True)
    CourseChapter.__table__.drop(bind=bind, checkfirst=True)
