"""Persist teacher-adjusted grade dimensions.

Revision ID: 20260812_0003
Revises: 20260810_0002
Create Date: 2026-08-12
"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260812_0003"
down_revision: str | None = "20260810_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns("grades")}
    if "dimensions_json" not in columns:
        op.add_column("grades", sa.Column("dimensions_json", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns("grades")}
    if "dimensions_json" in columns:
        op.drop_column("grades", "dimensions_json")


