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

        await self._recover_interrupted_jobs()
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

    async def _recover_interrupted_jobs(self) -> None:
        """Return jobs left RUNNING by a stopped/crashed worker to the queue."""
        async with async_session_factory() as session, session.begin():
            result = await session.execute(
                select(DocumentProcessingJob, Document)
                .join(Document, Document.id == DocumentProcessingJob.document_id)
                .where(DocumentProcessingJob.status == ProcessingJobStatus.RUNNING)
                .with_for_update(skip_locked=True)
            )
            rows = result.all()
            for job, doc in rows:
                job.status = ProcessingJobStatus.PENDING
                job.error_message = "Recovered after an interrupted worker run"
                doc.status = DocumentStatus.UPLOADED
            if rows:
                logger.warning("Recovered %d interrupted document job(s)", len(rows))

    async def _process_job(self, job: DocumentProcessingJob) -> None:
        """Process a single document job using the new processing pipeline."""
        logger.info(f"Processing job {job.id} for document {job.document_id}")
        job_id = job.id
        document_id = job.document_id

        try:
            # Keep database work short. Parsing and the first model load can take
            # minutes, so no connection or transaction may remain checked out.
            async with async_session_factory() as session, session.begin():
                result = await session.execute(
                    select(DocumentProcessingJob, Document)
                    .join(Document, Document.id == DocumentProcessingJob.document_id)
                    .where(DocumentProcessingJob.id == job_id)
                )
                row = result.one_or_none()
                if not row:
                    logger.error("Job %s not found", job_id)
                    return
                db_job, doc = row
                db_job.status = ProcessingJobStatus.RUNNING
                db_job.started_at = datetime.now(UTC)
                if doc.source_type == SourceType.OTHER:
                    doc.source_type = infer_source_type_from_filename(doc.original_filename)
                storage_path = doc.storage_path
                mime_type = doc.mime_type

            file_bytes = await storage.get(storage_path)
            elements = await asyncio.to_thread(parse_document, file_bytes, mime_type)
            if not elements:
                raise ValueError("No text content extracted from document")

            chunks = chunk_elements(elements, max_tokens=500, overlap=50)
            if not chunks:
                raise ValueError("No chunks created from document")

            embedding_service = EmbeddingService()
            embeddings = await asyncio.to_thread(
                embedding_service.embed_batch, [chunk.content for chunk in chunks]
            )
            if len(embeddings) != len(chunks):
                raise ValueError("Embedding count does not match chunk count")

            async with async_session_factory() as session, session.begin():
                result = await session.execute(
                    select(DocumentProcessingJob, Document)
                    .join(Document, Document.id == DocumentProcessingJob.document_id)
                    .where(DocumentProcessingJob.id == job_id)
                    .with_for_update()
                )
                row = result.one_or_none()
                if not row:
                    raise ValueError(f"Job {job_id} disappeared before results were saved")
                db_job, doc = row
                await session.execute(
                    delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
                )
                for chunk, embedding in zip(chunks, embeddings, strict=False):
                    session.add(
                        DocumentChunk(
                            document_id=document_id,
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
                    )
                doc.total_chunks = len(chunks)
                doc.status = DocumentStatus.READY
                doc.processing_error = None
                db_job.status = ProcessingJobStatus.COMPLETED
                db_job.completed_at = datetime.now(UTC)
                db_job.chunks_created = len(chunks)
                db_job.error_message = None
                db_job.error_details = None

            logger.info("Job %s completed: %d chunks created", job_id, len(chunks))
        except Exception as exc:
            logger.exception("Error processing job %s", job_id)
            await self._record_failure(job_id, str(exc))

    async def _record_failure(self, job_id, error: str) -> None:
        """Record failure in a fresh transaction, never the failed transaction."""
        async with async_session_factory() as session, session.begin():
            result = await session.execute(
                select(DocumentProcessingJob, Document)
                .join(Document, Document.id == DocumentProcessingJob.document_id)
                .where(DocumentProcessingJob.id == job_id)
                .with_for_update()
            )
            row = result.one_or_none()
            if not row:
                logger.error("Cannot record failure: job %s not found", job_id)
                return
            job, doc = row
            if job.retry_count < self.max_retries:
                job.retry_count += 1
                job.status = ProcessingJobStatus.PENDING
                job.error_message = error
                job.error_details = {"error": error, "retry": job.retry_count}
                doc.status = DocumentStatus.UPLOADED
                logger.warning(
                    "Job %s failed (retry %d/%d): %s",
                    job.id,
                    job.retry_count,
                    self.max_retries,
                    error,
                )
            else:
                job.status = ProcessingJobStatus.FAILED
                job.error_message = error
                job.error_details = {"error": error, "max_retries_exceeded": True}
                doc.status = DocumentStatus.FAILED
                doc.processing_error = error
                logger.error(
                    "Job %s failed permanently after %d retries: %s",
                    job.id,
                    self.max_retries,
                    error,
                )
            job.completed_at = datetime.now(UTC)


async def main():
    """Entry point for running the worker."""
    worker = DocumentWorker()
    await worker.start()


if __name__ == "__main__":
    asyncio.run(main())
