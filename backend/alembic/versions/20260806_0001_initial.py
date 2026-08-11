"""Initial unified teacher and student teaching schema.

Revision ID: 20260806_0001
Revises:
Create Date: 2026-08-06
"""
from typing import Sequence

from alembic import op

from backend.app.database import Base
from backend.app import models  # noqa: F401


revision: str = "20260806_0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
