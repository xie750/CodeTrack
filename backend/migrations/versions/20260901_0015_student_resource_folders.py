"""student resource folders

Revision ID: 20260901_0015
Revises: 20260831_0014
Create Date: 2026-09-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260901_0015"
down_revision = "20260831_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "student_resource_folders",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("student_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_student_resource_folder_name",
        "student_resource_folders",
        ["student_id", "name"],
    )
    op.create_index(
        "ix_student_resource_folders_student_status",
        "student_resource_folders",
        ["student_id", "status", "sort_order"],
    )


def downgrade() -> None:
    op.drop_index("ix_student_resource_folders_student_status", table_name="student_resource_folders")
    op.drop_constraint("uq_student_resource_folder_name", "student_resource_folders", type_="unique")
    op.drop_table("student_resource_folders")
