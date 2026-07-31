"""AI run records, per-task hint denylist, one-diagnosis-per-version index.

Revision ID: 20260731_0005
Revises: 20260729_0004
Create Date: 2026-07-31 00:00:00 UTC
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

from backend.app.models import AgentRun, AgentStep

revision = "20260731_0005"
down_revision = "20260729_0004"
branch_labels = None
depends_on = None

DIAGNOSIS_UNIQUE_INDEX = "uq_diagnoses_submission_version_id"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    task_columns = {column["name"] for column in inspector.get_columns("tasks")}
    if "hint_forbidden_fragments" not in task_columns:
        op.add_column("tasks", sa.Column("hint_forbidden_fragments", sa.Text(), nullable=True))

    for table in [AgentRun.__table__, AgentStep.__table__]:
        table.create(bind=bind, checkfirst=True)

    # Diagnosis.submission_version_id 一直没有唯一约束，但 create_diagnosis_for_version
    # 和标量 relationship 都假设一对一。用唯一索引而非 UniqueConstraint：env.py 没开
    # render_as_batch，SQLite 加约束要 batch 模式，加唯一索引则原生支持。
    existing_indexes = {index["name"] for index in inspector.get_indexes("diagnoses")}
    if DIAGNOSIS_UNIQUE_INDEX not in existing_indexes:
        duplicates = bind.execute(
            text(
                "SELECT submission_version_id, COUNT(*) AS c FROM diagnoses "
                "GROUP BY submission_version_id HAVING c > 1"
            )
        ).all()
        if duplicates:
            offenders = ", ".join(row[0] for row in duplicates[:10])
            raise RuntimeError(
                "diagnoses 表里存在同一 submission_version_id 的多条记录，无法建唯一索引。"
                f"需要先人工清理这些版本：{offenders}"
            )
        op.create_index(
            DIAGNOSIS_UNIQUE_INDEX,
            "diagnoses",
            ["submission_version_id"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    existing_indexes = {index["name"] for index in inspector.get_indexes("diagnoses")}
    if DIAGNOSIS_UNIQUE_INDEX in existing_indexes:
        op.drop_index(DIAGNOSIS_UNIQUE_INDEX, table_name="diagnoses")

    for table in [AgentStep.__table__, AgentRun.__table__]:
        table.drop(bind=bind, checkfirst=True)

    task_columns = {column["name"] for column in inspector.get_columns("tasks")}
    if "hint_forbidden_fragments" in task_columns:
        # SQLite 删列需要 batch 模式重建表，直接在迁移里用 batch_alter_table 即可，
        # 与 env.py 是否开 render_as_batch 无关（那只影响 autogenerate 的产出）。
        with op.batch_alter_table("tasks") as batch_op:
            batch_op.drop_column("hint_forbidden_fragments")
