"""Track personal learning versus explicit teaching-course enrollment."""
from alembic import op
import sqlalchemy as sa

revision = "20260916_0022"
down_revision = "20260911_0021"
branch_labels = None
depends_on = None


def upgrade():
    if "origin" not in {c["name"] for c in sa.inspect(op.get_bind()).get_columns("enrollments")}:
        op.add_column("enrollments", sa.Column("origin", sa.String(20), nullable=False, server_default="LEGACY"))


def downgrade():
    op.drop_column("enrollments", "origin")
