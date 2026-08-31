"""student practice projects

Revision ID: 20260831_0014
Revises: 20260829_0013
Create Date: 2026-08-31
"""

from alembic import op
import sqlalchemy as sa


revision = "20260831_0014"
down_revision = "20260829_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "practice_projects",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("course_id", sa.String(length=64), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("long_description", sa.Text(), nullable=False, server_default=""),
        sa.Column("project_type", sa.String(length=40), nullable=False, server_default="RESEARCH_PRACTICE"),
        sa.Column("difficulty", sa.String(length=20), nullable=False, server_default="MEDIUM"),
        sa.Column("direction", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("period_label", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("current_stage", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("total_stage_count", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("accent", sa.String(length=20), nullable=False, server_default="blue"),
        sa.Column("tags_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("member_names_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("capability_points_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("path_steps_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("task_sections_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("submission_requirements_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("acceptance_criteria_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("mentor_tips_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("resources_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="ACTIVE"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_practice_projects_course_status", "practice_projects", ["course_id", "status"])

    op.create_table(
        "practice_project_enrollments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("practice_projects.id"), nullable=False),
        sa.Column("student_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("class_id", sa.String(length=64), sa.ForeignKey("classes.id"), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="IN_PROGRESS"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_stage_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("experiment_record_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("submission_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("weekly_hours", sa.Float(), nullable=False, server_default="0"),
        sa.Column("last_activity_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_practice_project_student",
        "practice_project_enrollments",
        ["project_id", "student_id"],
    )
    op.create_index(
        "ix_practice_project_enrollments_student_status",
        "practice_project_enrollments",
        ["student_id", "status"],
    )

    op.create_table(
        "practice_project_submissions",
        sa.Column("id", sa.String(length=80), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("practice_projects.id"), nullable=False),
        sa.Column("student_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="SUBMITTED"),
        sa.Column("review_comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("content_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_practice_project_submissions_project_student",
        "practice_project_submissions",
        ["project_id", "student_id", "submitted_at"],
    )

    op.create_table(
        "practice_project_activities",
        sa.Column("id", sa.String(length=80), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("practice_projects.id"), nullable=True),
        sa.Column("student_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("activity_type", sa.String(length=40), nullable=False, server_default="PROJECT_UPDATED"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("time_label", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_practice_project_activities_student_created",
        "practice_project_activities",
        ["student_id", "created_at"],
    )
    op.create_index(
        "ix_practice_project_activities_project_student",
        "practice_project_activities",
        ["project_id", "student_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_practice_project_activities_project_student", table_name="practice_project_activities")
    op.drop_index("ix_practice_project_activities_student_created", table_name="practice_project_activities")
    op.drop_table("practice_project_activities")
    op.drop_index("ix_practice_project_submissions_project_student", table_name="practice_project_submissions")
    op.drop_table("practice_project_submissions")
    op.drop_index("ix_practice_project_enrollments_student_status", table_name="practice_project_enrollments")
    op.drop_constraint("uq_practice_project_student", "practice_project_enrollments", type_="unique")
    op.drop_table("practice_project_enrollments")
    op.drop_index("ix_practice_projects_course_status", table_name="practice_projects")
    op.drop_table("practice_projects")
