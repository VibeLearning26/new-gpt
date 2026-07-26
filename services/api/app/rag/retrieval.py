"""
VibeGPT - Document Retrieval Service
"""

import asyncio
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.document import Document, DocumentChunk, DocumentStatus
from app.rag.embedding import EmbeddingService

logger = logging.getLogger(__name__)

class RetrievalService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedding_service = EmbeddingService()

    async def search_chunks(
        self,
        query: str,
        subject_id: uuid.UUID,
        module_id: uuid.UUID | None = None,
        top_k: int = 5,
        threshold: float = 0.5
    ) -> list[DocumentChunk]:
        """
        Search for document chunks using vector cosine distance.
        """
        try:
            # 1. Embed query
            query_vector = await asyncio.to_thread(
                self.embedding_service.embed_query, query
            )

            # 2. Build base query with distance calculation
            distance_expr = DocumentChunk.embedding.cosine_distance(query_vector)

            stmt = (
                select(DocumentChunk)
                .join(Document)
                .where(
                    DocumentChunk.is_active.is_(True),
                    Document.is_active.is_(True),
                    Document.status == DocumentStatus.PUBLISHED,
                    Document.subject_id == subject_id
                )
            )

            if module_id:
                stmt = stmt.where(Document.module_id == module_id)

            # Filter by cosine distance threshold
            # pgvector's cosine distance is 0 for identical vectors, up to 2 for opposite.
            # A threshold of 0.5 distance means similarity > 0.5
            stmt = stmt.where(distance_expr < threshold)

            # Order by distance ascending (closest first)
            stmt = stmt.order_by(distance_expr)
            stmt = stmt.limit(top_k)

            result = await self.db.execute(stmt)
            chunks = result.scalars().all()

            return list(chunks)

        except Exception as e:
            logger.error(f"Error during vector retrieval: {e}")
            raise

    async def search_chunks_with_scores(
        self,
        query: str,
        subject_id: uuid.UUID,
        module_id: uuid.UUID | None = None,
        top_k: int = 5,
        threshold: float = 0.5,
    ) -> list[tuple[DocumentChunk, float]]:
        """
        Like search_chunks, but returns (chunk, relevance) pairs with the
        parent Document eager-loaded so callers can build citations.
        Relevance is cosine similarity in [0, 1] (1 - cosine distance,
        exact because embeddings are L2-normalized).
        """
        query_vector = await asyncio.to_thread(
            self.embedding_service.embed_query, query
        )
        distance_expr = DocumentChunk.embedding.cosine_distance(query_vector)

        stmt = (
            select(DocumentChunk, distance_expr.label("distance"))
            .join(Document, DocumentChunk.document_id == Document.id)
            .options(joinedload(DocumentChunk.document))
            .where(
                DocumentChunk.is_active.is_(True),
                DocumentChunk.embedding.is_not(None),
                Document.is_active.is_(True),
                # READY means indexed but awaiting admin approval.
                Document.status == DocumentStatus.PUBLISHED,
                Document.subject_id == subject_id,
            )
        )
        if module_id:
            stmt = stmt.where(Document.module_id == module_id)

        stmt = stmt.where(distance_expr < threshold).order_by(distance_expr).limit(top_k)

        result = await self.db.execute(stmt)
        rows = result.unique().all()

        scored: list[tuple[DocumentChunk, float]] = []
        seen_content: set[str] = set()
        for chunk, distance in rows:
            key = chunk.content.strip().lower()
            if key in seen_content:
                continue
            seen_content.add(key)
            scored.append((chunk, max(0.0, min(1.0, 1.0 - float(distance)))))
        return scored
