"""initial CodeTrack demo schema

Revision ID: 20260715_0001
Revises:
Create Date: 2026-07-15 00:00:00 UTC
"""
from alembic import op

from backend.app.models import Base

revision = "20260715_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)

