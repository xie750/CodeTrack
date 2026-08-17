"""student generated resources

Revision ID: 20260817_0012
Revises: 20260816_0011
Create Date: 2026-08-17
"""

from alembic import op
import sqlalchemy as sa


revision = "20260817_0012"
down_revision = "20260816_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_generated_resources",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("student_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("course_id", sa.String(length=64), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("class_id", sa.String(length=64), sa.ForeignKey("classes.id"), nullable=False),
        sa.Column("run_id", sa.String(length=64), sa.ForeignKey("agent_runs.id"), nullable=True),
        sa.Column("session_id", sa.String(length=64), sa.ForeignKey("ai_tutor_sessions.id"), nullable=True),
        sa.Column("resource_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("knowledge_point", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="READY"),
        sa.Column("render_payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("citations_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("file_format", sa.String(length=20), nullable=False, server_default="PPTX"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.72"),
        sa.Column("saved_to_resource_center", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_student_generated_resources_student_saved",
        "student_generated_resources",
        ["student_id", "saved_to_resource_center", "updated_at"],
    )
    op.create_index(
        "ix_student_generated_resources_student_course",
        "student_generated_resources",
        ["student_id", "course_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_student_generated_resources_student_course", table_name="student_generated_resources")
    op.drop_index("ix_student_generated_resources_student_saved", table_name="student_generated_resources")
    op.drop_table("student_generated_resources")
