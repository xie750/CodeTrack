"""Teacher resource center: knowledge_sources metadata + revision history.

开发方案 §七 资料中心。给 `knowledge_sources` 补齐资料中心需要的元数据列
（章节、知识点、正文、状态、AI 检索开关、共享范围、上传文件元数据、时间戳），
并新增只追加的 `knowledge_source_revisions` 表落地 §7.2 C「版本记录」与
§15.2「历史提交、成绩、AI 诊断和教师反馈不得物理覆盖」。

新列全部带 server_default，现有 4 条种子资料和 `guardrails.validate_reference`
的行为不变。

Revision ID: 20260801_0007
Revises: 20260801_0006
Create Date: 2026-08-01 00:00:00 UTC
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

from backend.app.models import KnowledgeSourceRevision

revision = "20260801_0007"
down_revision = "20260801_0006"
branch_labels = None
depends_on = None


# (列名, 列定义)。server_default 是必须的：SQLite 给已有行加 NOT NULL 列时
# 没有默认值会直接失败。
NEW_COLUMNS = [
    ("chapter", sa.Column("chapter", sa.String(length=120), nullable=False, server_default="")),
    ("knowledge_points", sa.Column("knowledge_points", sa.Text(), nullable=False, server_default="[]")),
    ("content", sa.Column("content", sa.Text(), nullable=False, server_default="")),
    ("status", sa.Column("status", sa.String(length=20), nullable=False, server_default="ACTIVE")),
    ("ai_retrievable", sa.Column("ai_retrievable", sa.Boolean(), nullable=False, server_default=sa.true())),
    ("share_scope", sa.Column("share_scope", sa.String(length=20), nullable=False, server_default="COURSE")),
    ("file_name", sa.Column("file_name", sa.String(length=255), nullable=True)),
    ("file_size", sa.Column("file_size", sa.Integer(), nullable=True)),
    ("mime_type", sa.Column("mime_type", sa.String(length=120), nullable=True)),
    ("storage_path", sa.Column("storage_path", sa.String(length=500), nullable=True)),
    ("created_by", sa.Column("created_by", sa.String(length=64), nullable=True)),
    ("created_at", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True)),
    ("updated_at", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True)),
]


def upgrade() -> None:
    bind = op.get_bind()
    existing = {column["name"] for column in inspect(bind).get_columns("knowledge_sources")}
    for name, column in NEW_COLUMNS:
        if name not in existing:
            op.add_column("knowledge_sources", column)

    # 时间戳列对已有行是 NULL（ALTER TABLE 不追认 ORM default），补一次当前时间
    bind.execute(
        text("UPDATE knowledge_sources SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
    )
    bind.execute(
        text("UPDATE knowledge_sources SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL")
    )

    KnowledgeSourceRevision.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    KnowledgeSourceRevision.__table__.drop(bind=bind, checkfirst=True)

    existing = {column["name"] for column in inspect(bind).get_columns("knowledge_sources")}
    for name, _ in reversed(NEW_COLUMNS):
        if name in existing:
            op.drop_column("knowledge_sources", name)
