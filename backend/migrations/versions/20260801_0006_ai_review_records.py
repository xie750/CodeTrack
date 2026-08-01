"""Teacher AI review records (diagnosis_reviews).

开发方案 §十一 AI 审核 / §14.4 审核状态。审核结论单独一张只追加的表，
`diagnoses` 表不加任何列、不被审核流程改写（§11.4「原始 AI 输出不能覆盖」）。

Revision ID: 20260801_0006
Revises: 20260731_0005
Create Date: 2026-08-01 00:00:00 UTC
"""
from alembic import op

from backend.app.models import DiagnosisReview

revision = "20260801_0006"
down_revision = "20260731_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    DiagnosisReview.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    DiagnosisReview.__table__.drop(bind=op.get_bind(), checkfirst=True)
