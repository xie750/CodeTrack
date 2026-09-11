"""bind course enrollments to teaching assignments

Revision ID: 20260911_0021
Revises: 20260907_0020
Create Date: 2026-09-11 00:00:00 UTC
"""
from alembic import op
import sqlalchemy as sa


revision = "20260911_0021"
down_revision = "20260907_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("enrollments", sa.Column("teaching_assignment_id", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("enrollments", "teaching_assignment_id")
