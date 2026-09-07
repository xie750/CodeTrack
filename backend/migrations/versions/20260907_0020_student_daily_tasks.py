"""student daily self-recorded tasks

Revision ID: 20260907_0020
Revises: 20260907_0019
Create Date: 2026-09-07 23:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260907_0020"
down_revision = "20260907_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_daily_tasks",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("student_id", sa.String(length=64), nullable=False),
        sa.Column("task_date", sa.String(length=10), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_student_daily_tasks_student_date",
        "student_daily_tasks",
        ["student_id", "task_date", "sort_order"],
    )


def downgrade() -> None:
    op.drop_index("ix_student_daily_tasks_student_date", table_name="student_daily_tasks")
    op.drop_table("student_daily_tasks")
