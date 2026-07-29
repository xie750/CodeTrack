"""student data design schema

Revision ID: 20260729_0002
Revises: 20260715_0001
Create Date: 2026-07-29 00:00:00 UTC
"""
from alembic import op

from backend.app.models import (
    AdministrativeClass,
    LearnerErrorStat,
    LearnerEvent,
    LearnerKnowledgeState,
    LearnerProfileSnapshot,
    Recommendation,
    StudentClassMembership,
    StudentTaskProgress,
    TaskAssignment,
    TeachingAssignment,
)

revision = "20260729_0002"
down_revision = "20260715_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = [
        AdministrativeClass.__table__,
        StudentClassMembership.__table__,
        TeachingAssignment.__table__,
        TaskAssignment.__table__,
        StudentTaskProgress.__table__,
        LearnerEvent.__table__,
        LearnerProfileSnapshot.__table__,
        LearnerKnowledgeState.__table__,
        LearnerErrorStat.__table__,
        Recommendation.__table__,
    ]
    for table in tables:
        table.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    tables = [
        Recommendation.__table__,
        LearnerErrorStat.__table__,
        LearnerKnowledgeState.__table__,
        LearnerProfileSnapshot.__table__,
        LearnerEvent.__table__,
        StudentTaskProgress.__table__,
        TaskAssignment.__table__,
        TeachingAssignment.__table__,
        StudentClassMembership.__table__,
        AdministrativeClass.__table__,
    ]
    for table in tables:
        table.drop(bind=bind, checkfirst=True)
