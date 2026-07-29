"""Add question workspace tables.

Revision ID: 20260729_0004
Revises: 20260729_0003
Create Date: 2026-07-29 00:00:00 UTC
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

from backend.app.models import Question, QuestionAnswer, QuestionAttempt, QuestionOption

revision = "20260729_0004"
down_revision = "20260729_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    task_columns = {column["name"] for column in inspect(bind).get_columns("tasks")}
    if "workspace_type" not in task_columns:
        op.add_column("tasks", sa.Column("workspace_type", sa.String(length=30), nullable=False, server_default="CODING"))
        bind.execute(text("UPDATE tasks SET workspace_type = 'CODING' WHERE workspace_type IS NULL"))

    for table in [
        Question.__table__,
        QuestionOption.__table__,
        QuestionAttempt.__table__,
        QuestionAnswer.__table__,
    ]:
        table.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for table in [
        QuestionAnswer.__table__,
        QuestionAttempt.__table__,
        QuestionOption.__table__,
        Question.__table__,
    ]:
        table.drop(bind=bind, checkfirst=True)
