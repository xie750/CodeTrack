"""practice project materials

Revision ID: 20260907_0018
Revises: 20260907_0017
Create Date: 2026-09-07
"""

from alembic import op
import sqlalchemy as sa


revision = "20260907_0018"
down_revision = "20260907_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "practice_project_materials",
        sa.Column("id", sa.String(length=80), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("practice_projects.id"), nullable=False),
        sa.Column("student_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("material_type", sa.String(length=40), nullable=False, server_default="NOTE"),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("storage_path", sa.String(length=500), nullable=True),
        sa.Column("external_url", sa.Text(), nullable=False, server_default=""),
        sa.Column("source", sa.String(length=40), nullable=False, server_default="student_upload"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="READY"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_practice_project_materials_project_student",
        "practice_project_materials",
        ["project_id", "student_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_practice_project_materials_project_student", table_name="practice_project_materials")
    op.drop_table("practice_project_materials")
