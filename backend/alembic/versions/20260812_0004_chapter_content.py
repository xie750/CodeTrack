"""Add chapter teaching mode and publication status.

Revision ID: 20260812_0004
Revises: 20260812_0003
Create Date: 2026-08-12
"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260812_0004"
down_revision: str | None = "20260812_0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns("chapters")}
    if "teaching_mode" not in columns:
        op.add_column("chapters", sa.Column("teaching_mode", sa.String(length=40), nullable=False, server_default="理论讲授"))
    if "status" not in columns:
        op.add_column("chapters", sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"))


def downgrade() -> None:
    columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns("chapters")}
    if "status" in columns:
        op.drop_column("chapters", "status")
    if "teaching_mode" in columns:
        op.drop_column("chapters", "teaching_mode")
