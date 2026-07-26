"""
VibeGPT – Document Worker

Background worker that processes document jobs.
Run with: python -m app.workers.document_worker
"""

from __future__ import annotations

import asyncio
import logging
import signal
from datetime import UTC, datetime

from sqlalchemy import delete, select

from app.core.config import get_settings
from app.database.session import async_session_factory
from app.document_processing.chunker import chunk_elements
from app.document_processing.parsers import parse_document
from app.models.document import (
    Document,
    DocumentChunk,
    DocumentProcessingJob,
    DocumentStatus,
    ProcessingJobStatus,
    SourceType,
)
from app.rag.embedding import EmbeddingService
from app.storage import get_document_storage

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()
storage = get_document_storage()


def infer_source_type_from_filename(filename: str) -> SourceType:
    """
    Infer SourceType from file extension.
    Defaults to PDF_NOTES for unknown extensions.
    """
    if not filename:
        return SourceType.PDF_NOTES

    ext = filename.lower().split(".")[-1] if "." in filename else ""

    mapping = {
        "pdf": SourceType.PDF_NOTES,
        "pptx": SourceType.PPTX_PRESENTATION,
        "ppt": SourceType.PPTX_PRESENTATION,
        "docx": SourceType.DOCX_NOTES,
        "doc": SourceType.DOCX_NOTES,
        "xlsx": SourceType.XLSX_QUESTION_BANK,
        "xls": SourceType.XLSX_QUESTION_BANK,
    }

    return mapping.get(ext, SourceType.PDF_NOTES)


class DocumentWorker:
    """
    Background worker for document processing jobs.

    Features:
    - Atomic job claiming with SELECT FOR UPDATE SKIP LOCKED
    - Configurable poll interval and max retries
    - Graceful shutdown on SIGTERM/SIGINT
    - Error handling with exponential backoff
    """

    def __init__(self):
        self.running = False
        self._shutdown_event = asyncio.Event()
        self.poll_interval = settings.WORKER_POLL_INTERVAL_SECONDS
        self.max_retries = settings.WORKER_MAX_RETRIES

    async def start(self):
        """Start the worker loop."""
        self.running = True
        logger.info(
            f"Document worker started "
            f"(poll_interval={self.poll_interval}s, max_retries={self.max_retries})"
        )

        # Set up signal handlers for graceful shutdown (Unix only)
        try:
            loop = asyncio.get_running_loop()
            for sig in (signal.SIGTERM, signal.SIGINT):
                loop.add_signal_handler(sig, self._shutdown)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

        await self._run_loop()

    def _shutdown(self):
        """Signal shutdown."""
        logger.info("Shutdown signal received")
        self.running = False
        self._shutdown_event.set()

    async def _run_loop(self):
        """Main worker loop."""
        while self.running:
            try:
                job = await self._claim_job()
                if job:
                    await self._process_job(job)
                else:
                    # No jobs available, wait for poll interval or shutdown
                    try:
                        await asyncio.wait_for(
                            self._shutdown_event.wait(), timeout=self.poll_interval
                        )
                        break  # Shutdown signaled
                    except TimeoutError:
                        continue  # Normal poll interval elapsed
            except Exception:
                logger.exception("Worker loop error")
                await asyncio.sleep(5)  # Back off on error

        logger.info("Document worker stopped")

    async def _claim_job(self) -> DocumentProcessingJob | None:
        """
        Atomically claim a pending job.
        Uses SELECT FOR UPDATE SKIP LOCKED to avoid race conditions.
        """
        async with async_session_factory() as session, session.begin():
            # Lock the job row, skip if already locked by another worker
            result = await session.execute(
                select(DocumentProcessingJob)
                .where(DocumentProcessingJob.status == ProcessingJobStatus.PENDING)
                .order_by(DocumentProcessingJob.created_at)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            job = result.scalar_one_or_none()
            logger.debug("_claim_job: found job = %s", job.id if job else None)
            if job:
                # Update job status to RUNNING immediately
                job.status = ProcessingJobStatus.RUNNING
                job.started_at = datetime.now(UTC)
                await session.flush()
                # Refresh to get updated state
                await session.refresh(job)
            return job

    async def _process_job(self, job: DocumentProcessingJob) -> None:
        """Process a single document job using the new processing pipeline."""
        logger.info(f"Processing job {job.id} for document {job.document_id}")

        async with async_session_factory() as session, session.begin():
            # Reload job with document
            result = await session.execute(
                select(DocumentProcessingJob, Document)
                .join(Document, Document.id == DocumentProcessingJob.document_id)
                .where(DocumentProcessingJob.id == job.id)
            )
            row = result.one_or_none()
            if not row:
                logger.error(f"Job {job.id} not found")
                return

            job, doc = row

            try:
                # Update job status
                job.status = ProcessingJobStatus.RUNNING
                job.started_at = datetime.now(UTC)
                await session.flush()

                # Read file
                file_bytes = await storage.get(doc.storage_path)

                # Keep the admin's semantic category, but parse using the
                # verified MIME type so teacher-answer and paper categories work.
                if doc.source_type == SourceType.OTHER:
                    doc.source_type = infer_source_type_from_filename(doc.original_filename)
                    await session.flush()

                # Parse document
                elements = await asyncio.to_thread(parse_document, file_bytes, doc.mime_type)
                if not elements:
                    raise ValueError("No text content extracted from document")

                # Chunk elements
                chunks = chunk_elements(elements, max_tokens=500, overlap=50)
                if not chunks:
                    raise ValueError("No chunks created from document")

                # Generate embeddings
                embedding_service = EmbeddingService()
                chunk_texts = [c.content for c in chunks]
                embeddings = await asyncio.to_thread(
                    embedding_service.embed_batch, chunk_texts
                )
                if len(embeddings) != len(chunks):
                    raise ValueError("Embedding count does not match chunk count")

                # Retries replace any partial prior output.
                await session.execute(
                    delete(DocumentChunk).where(DocumentChunk.document_id == doc.id)
                )

                # Save chunks to database
                for _i, (chunk, embedding) in enumerate(zip(chunks, embeddings, strict=False)):
                    db_chunk = DocumentChunk(
                        document_id=doc.id,
                        content=chunk.content,
                        page_number=chunk.page_number,
                        slide_number=chunk.slide_number,
                        sheet_name=chunk.sheet_name,
                        heading=chunk.heading,
                        chunk_index=chunk.chunk_index,
                        token_count=chunk.token_count,
                        metadata_json=chunk.metadata,
                        embedding=embedding,
                        is_active=True,
                    )
                    session.add(db_chunk)

                # Update document
                doc.total_chunks = len(chunks)
                doc.status = DocumentStatus.READY
                doc.processing_error = None

                # Update job
                job.status = ProcessingJobStatus.COMPLETED
                job.completed_at = datetime.now(UTC)
                job.chunks_created = len(chunks)

                await session.flush()
                logger.info(f"Job {job.id} completed: {len(chunks)} chunks created")

            except Exception as e:
                logger.exception(f"Error processing job {job.id}")
                await self._handle_failure(session, job, doc, str(e))

    async def _handle_failure(
        self, session, job: DocumentProcessingJob, doc: Document, error: str
    ) -> None:
        """Handle processing failure with retry logic."""
        max_retries = self.max_retries

        if job.retry_count < max_retries:
            # Schedule retry
            job.retry_count += 1
            job.status = ProcessingJobStatus.PENDING
            job.error_message = error
            job.error_details = {"error": error, "retry": job.retry_count}
            doc.status = DocumentStatus.UPLOADED
            logger.warning(f"Job {job.id} failed (retry {job.retry_count}/{max_retries}): {error}")
        else:
            # Max retries exceeded
            job.status = ProcessingJobStatus.FAILED
            job.error_message = error
            job.error_details = {"error": error, "max_retries_exceeded": True}
            doc.status = DocumentStatus.FAILED
            doc.processing_error = error
            logger.error(f"Job {job.id} failed permanently after {max_retries} retries: {error}")

        job.completed_at = datetime.now(UTC)
        await session.flush()


async def main():
    """Entry point for running the worker."""
    worker = DocumentWorker()
    await worker.start()


if __name__ == "__main__":
    asyncio.run(main())
