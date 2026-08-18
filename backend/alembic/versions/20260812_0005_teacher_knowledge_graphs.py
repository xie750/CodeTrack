"""Add editable teacher knowledge graphs.

Revision ID: 20260812_0005
Revises: 20260812_0004
Create Date: 2026-08-12
"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260812_0005"
down_revision: str | None = "20260812_0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    if "teacher_knowledge_graphs" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "teacher_knowledge_graphs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(length=40), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("target_classes", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("source_files", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("source_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("nodes_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("edges_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_teacher_knowledge_graphs_user_id", "teacher_knowledge_graphs", ["user_id"])


def downgrade() -> None:
    op.drop_table("teacher_knowledge_graphs")
