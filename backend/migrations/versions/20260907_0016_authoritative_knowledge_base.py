"""Admin authoritative subject knowledge base.

Revision ID: 20260907_0016
Revises: 20260901_0015
Create Date: 2026-09-07 00:00:00 UTC
"""

from alembic import op

from backend.app.models import AuthoritativeKnowledgeBase, AuthoritativeKnowledgeSource


revision = "20260907_0016"
down_revision = "20260901_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    AuthoritativeKnowledgeBase.__table__.create(bind=bind, checkfirst=True)
    AuthoritativeKnowledgeSource.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    AuthoritativeKnowledgeSource.__table__.drop(bind=bind, checkfirst=True)
    AuthoritativeKnowledgeBase.__table__.drop(bind=bind, checkfirst=True)
