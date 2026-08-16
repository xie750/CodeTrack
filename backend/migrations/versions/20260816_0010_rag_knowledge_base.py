"""RAG knowledge base backend.

Revision ID: 20260816_0010
Revises: 20260813_0009
Create Date: 2026-08-16 00:00:00 UTC
"""
from alembic import op

from backend.app.models import (
    RagChunk,
    RagDocument,
    RagDocumentElement,
    RagDocumentVersion,
    RagIngestJob,
    RagKnowledgeBase,
)

revision = "20260816_0010"
down_revision = "20260813_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    for table in [
        RagKnowledgeBase.__table__,
        RagDocument.__table__,
        RagDocumentVersion.__table__,
        RagDocumentElement.__table__,
        RagChunk.__table__,
        RagIngestJob.__table__,
    ]:
        table.create(bind=bind, checkfirst=True)

    if bind.dialect.name == "postgresql":
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
            ON chunks USING hnsw (embedding vector_cosine_ops)
            WHERE chunk_type = 'child' AND enabled = true AND embedding IS NOT NULL
            """
        )
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chunks_search_vector_gin
            ON chunks USING GIN(search_vector)
            WHERE chunk_type = 'child' AND enabled = true
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS idx_chunks_search_vector_gin")
        op.execute("DROP INDEX IF EXISTS idx_chunks_embedding_hnsw")
    for table in [
        RagIngestJob.__table__,
        RagChunk.__table__,
        RagDocumentElement.__table__,
        RagDocumentVersion.__table__,
        RagDocument.__table__,
        RagKnowledgeBase.__table__,
    ]:
        table.drop(bind=bind, checkfirst=True)
