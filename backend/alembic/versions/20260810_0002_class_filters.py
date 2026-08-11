"""Add grade and major fields for class filtering.

Revision ID: 20260810_0002
Revises: 20260806_0001
Create Date: 2026-08-10
"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260810_0002"
down_revision: str | None = "20260806_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns("class_groups")}
    if "grade" not in columns:
        op.add_column("class_groups", sa.Column("grade", sa.String(length=40), nullable=False, server_default="2024级"))
    if "major" not in columns:
        op.add_column("class_groups", sa.Column("major", sa.String(length=120), nullable=False, server_default="软件工程"))


def downgrade() -> None:
    columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns("class_groups")}
    if "major" in columns:
        op.drop_column("class_groups", "major")
    if "grade" in columns:
        op.drop_column("class_groups", "grade")
