"""teacher research project workspace

Revision ID: 20260907_0019
Revises: 20260907_0018
Create Date: 2026-09-07 23:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260907_0019"
down_revision = "20260907_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "teacher_research_projects",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("teacher_id", sa.String(length=64), nullable=False),
        sa.Column("course_id", sa.String(length=64), nullable=True),
        sa.Column("student_project_id", sa.String(length=64), nullable=True),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("direction", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("stage", sa.String(length=80), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("tags_json", sa.Text(), nullable=False),
        sa.Column("milestones_json", sa.Text(), nullable=False),
        sa.Column("frontier_topics_json", sa.Text(), nullable=False),
        sa.Column("external_sources_json", sa.Text(), nullable=False),
        sa.Column("harness_state_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.ForeignKeyConstraint(["student_project_id"], ["practice_projects.id"]),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_teacher_research_projects_teacher_status",
        "teacher_research_projects",
        ["teacher_id", "status", "updated_at"],
    )
    op.create_index(
        "ix_teacher_research_projects_course_status",
        "teacher_research_projects",
        ["course_id", "status"],
    )

    op.create_table(
        "teacher_research_materials",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("project_id", sa.String(length=80), nullable=False),
        sa.Column("teacher_id", sa.String(length=64), nullable=False),
        sa.Column("material_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.String(length=120), nullable=True),
        sa.Column("storage_path", sa.String(length=500), nullable=True),
        sa.Column("external_url", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["teacher_research_projects.id"]),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_teacher_research_materials_project_created",
        "teacher_research_materials",
        ["project_id", "created_at"],
    )
    op.create_index(
        "ix_teacher_research_materials_teacher_created",
        "teacher_research_materials",
        ["teacher_id", "created_at"],
    )

    op.create_table(
        "teacher_research_activities",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("project_id", sa.String(length=80), nullable=True),
        sa.Column("teacher_id", sa.String(length=64), nullable=False),
        sa.Column("activity_type", sa.String(length=40), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["teacher_research_projects.id"]),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_teacher_research_activities_project_created",
        "teacher_research_activities",
        ["project_id", "created_at"],
    )
    op.create_index(
        "ix_teacher_research_activities_teacher_created",
        "teacher_research_activities",
        ["teacher_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_teacher_research_activities_teacher_created", table_name="teacher_research_activities")
    op.drop_index("ix_teacher_research_activities_project_created", table_name="teacher_research_activities")
    op.drop_table("teacher_research_activities")
    op.drop_index("ix_teacher_research_materials_teacher_created", table_name="teacher_research_materials")
    op.drop_index("ix_teacher_research_materials_project_created", table_name="teacher_research_materials")
    op.drop_table("teacher_research_materials")
    op.drop_index("ix_teacher_research_projects_course_status", table_name="teacher_research_projects")
    op.drop_index("ix_teacher_research_projects_teacher_status", table_name="teacher_research_projects")
    op.drop_table("teacher_research_projects")
