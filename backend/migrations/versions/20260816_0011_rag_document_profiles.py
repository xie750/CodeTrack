"""RAG document processing profiles.

Revision ID: 20260816_0011
Revises: 20260816_0010
Create Date: 2026-08-16 12:00:00 UTC
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260816_0011"
down_revision = "20260816_0010"
branch_labels = None
depends_on = None


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    bind = op.get_bind()
    existing = {item["name"] for item in inspect(bind).get_columns(table_name)}
    if column.name not in existing:
        op.add_column(table_name, column)


def upgrade() -> None:
    _add_column_if_missing(
        "documents",
        sa.Column("file_profile", sa.Text(), nullable=False, server_default="{}"),
    )
    _add_column_if_missing(
        "document_versions",
        sa.Column("content_profile", sa.Text(), nullable=False, server_default="{}"),
    )
    _add_column_if_missing(
        "document_versions",
        sa.Column("cleaning_strategy", sa.String(length=64), nullable=False, server_default="generic_clean"),
    )
    _add_column_if_missing(
        "document_versions",
        sa.Column("chunking_strategy", sa.String(length=64), nullable=False, server_default="section_recursive"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    existing = {item["name"] for item in inspect(bind).get_columns("document_versions")}
    with op.batch_alter_table("document_versions") as batch_op:
        for name in ["chunking_strategy", "cleaning_strategy", "content_profile"]:
            if name in existing:
                batch_op.drop_column(name)
    existing_documents = {item["name"] for item in inspect(bind).get_columns("documents")}
    with op.batch_alter_table("documents") as batch_op:
        if "file_profile" in existing_documents:
            batch_op.drop_column("file_profile")
