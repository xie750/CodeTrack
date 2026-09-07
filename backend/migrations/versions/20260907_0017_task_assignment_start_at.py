"""Add task assignment start time.

Revision ID: 20260907_0017
Revises: 20260907_0016
Create Date: 2026-09-07 00:00:00 UTC
"""

import sqlalchemy as sa
from alembic import op


revision = "20260907_0017"
down_revision = "20260907_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("task_assignments") as batch_op:
        batch_op.add_column(sa.Column("start_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE task_assignments SET start_at = COALESCE(start_at, published_at)")
    with op.batch_alter_table("task_assignments") as batch_op:
        batch_op.alter_column("start_at", existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("task_assignments") as batch_op:
        batch_op.drop_column("start_at")
