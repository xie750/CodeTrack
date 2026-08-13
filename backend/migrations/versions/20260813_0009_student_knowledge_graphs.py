"""Student course knowledge graphs.

Revision ID: 20260813_0009
Revises: 20260801_0008
Create Date: 2026-08-13 00:00:00 UTC
"""
from alembic import op

from backend.app.models import StudentKnowledgeGraph

revision = "20260813_0009"
down_revision = "20260801_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    StudentKnowledgeGraph.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    StudentKnowledgeGraph.__table__.drop(bind=op.get_bind(), checkfirst=True)
