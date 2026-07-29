"""auth login schema

Revision ID: 20260729_0003
Revises: 20260729_0002
Create Date: 2026-07-29 00:03:00 UTC
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260729_0003"
down_revision = "20260729_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("users")}
    if "username" not in columns:
        op.add_column("users", sa.Column("username", sa.String(length=80), nullable=True))
    if "password_hash" not in columns:
        op.add_column("users", sa.Column("password_hash", sa.String(length=220), nullable=True))
    if "last_login_at" not in columns:
        op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))

    indexes = {index["name"] for index in inspect(bind).get_indexes("users")}
    unique_constraints = {constraint["name"] for constraint in inspect(bind).get_unique_constraints("users")}
    if "uq_users_username" not in indexes and "uq_users_username" not in unique_constraints:
        with op.batch_alter_table("users") as batch_op:
            batch_op.create_unique_constraint("uq_users_username", ["username"])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("uq_users_username", type_="unique")
        batch_op.drop_column("last_login_at")
        batch_op.drop_column("password_hash")
        batch_op.drop_column("username")
