"""teacher grades and feedback

Revision ID: 20260829_0013
Revises: 20260817_0012
Create Date: 2026-08-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260829_0013"
down_revision = "20260817_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "grades",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("submission_id", sa.String(length=64), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("teacher_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("dimensions_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("submission_id", name="uq_grade_submission"),
    )
    op.create_table(
        "teacher_feedback",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("submission_id", sa.String(length=64), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("teacher_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
        sa.Column("student_visible", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_teacher_feedback_submission",
        "teacher_feedback",
        ["submission_id", "student_visible", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_teacher_feedback_submission", table_name="teacher_feedback")
    op.drop_table("teacher_feedback")
    op.drop_table("grades")
