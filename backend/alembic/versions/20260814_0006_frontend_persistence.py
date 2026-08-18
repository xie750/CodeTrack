"""Persist teacher frontend business data.

Revision ID: 20260814_0006
Revises: 20260812_0005
Create Date: 2026-08-14
"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260814_0006"
down_revision: str | None = "20260812_0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "teacher_credentials" not in existing:
        op.create_table(
            "teacher_credentials",
            sa.Column("user_id", sa.String(40), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("password_salt", sa.String(64), nullable=False),
            sa.Column("password_hash", sa.String(128), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    if "teacher_preferences" not in existing:
        op.create_table(
            "teacher_preferences",
            sa.Column("teacher_id", sa.String(40), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("notifications_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("ai_assistant_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("email_digest", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    if "course_drafts" not in existing:
        op.create_table(
            "course_drafts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("teacher_id", sa.String(40), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("saved_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_course_drafts_teacher_id", "course_drafts", ["teacher_id"], unique=True)
    if "course_announcements" not in existing:
        op.create_table(
            "course_announcements",
            sa.Column("id", sa.String(40), primary_key=True),
            sa.Column("course_id", sa.String(40), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
            sa.Column("author_id", sa.String(40), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("summary", sa.Text(), nullable=False, server_default=""),
            sa.Column("content_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("audience", sa.String(200), nullable=False, server_default="全部授课班级"),
            sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("published_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_course_announcements_course_id", "course_announcements", ["course_id"])
        op.create_index("ix_course_announcements_author_id", "course_announcements", ["author_id"])
        op.create_index("ix_course_announcements_published_at", "course_announcements", ["published_at"])
    if "announcement_reads" not in existing:
        op.create_table(
            "announcement_reads",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("announcement_id", sa.String(40), sa.ForeignKey("course_announcements.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.String(40), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("read_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("announcement_id", "user_id"),
        )
        op.create_index("ix_announcement_reads_announcement_id", "announcement_reads", ["announcement_id"])
        op.create_index("ix_announcement_reads_user_id", "announcement_reads", ["user_id"])


def downgrade() -> None:
    for table in ["announcement_reads", "course_announcements", "course_drafts", "teacher_preferences", "teacher_credentials"]:
        if table in sa.inspect(op.get_bind()).get_table_names():
            op.drop_table(table)
