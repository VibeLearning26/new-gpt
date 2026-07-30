"""
VibeGPT API – Answer Service

Coordinates the entire RAG pipeline:
1. Retrieval of source chunks via RetrievalService.
2. Resolution of AnswerRules.
3. Grounded Prompt Construction.
4. Ollama Generation.
5. Metric Calculation, Validation Checking, and Database Persistence.
"""

from __future__ import annotations

import time
import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.academic import Subject
from app.models.answer_rule import AnswerRule
from app.models.question import AnswerStatus, QuestionLog, QuestionSource
from app.rag.ollama_client import OllamaClient
from app.rag.prompt_builder import PromptBuilder
from app.rag.retrieval import RetrievalService
from app.schemas.question import AnswerResponse, SourceInfo, ValidationResult


class AnswerService:
    """Orchestration service to generate grounded study answers using RAG."""

    def __init__(
        self,
        ollama_client: OllamaClient | None = None,
        retrieval_service: RetrievalService | None = None,
        prompt_builder: PromptBuilder | None = None,
    ):
        self.ollama = ollama_client or OllamaClient()
        self.retrieval = retrieval_service or RetrievalService()
        self.prompt_builder = prompt_builder or PromptBuilder()

    async def generate_answer(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        subject_id: uuid.UUID,
        module_id: uuid.UUID | None,
        marks: int,
        question: str,
    ) -> AnswerResponse:
        """
        Orchestrate the RAG pipeline to generate a grounded answer.

        Args:
            db: SQLAlchemy AsyncSession.
            user_id: ID of the student submitting the question.
            subject_id: ID of the subject.
            module_id: Optional ID of the module.
            marks: Maximum marks / length rule target.
            question: Student's prompt/question text.

        Returns:
            AnswerResponse object matching schemas.
        """
        start_time = time.time()

        # 1. Fetch matching rule
        rule = await self._get_rule(db, subject_id, marks)

        # Resolve the subject's display name for the response payload
        subject_name = await self._get_subject_name(db, subject_id)

        # 2. Retrieve relevant context chunks
        relevant_chunks = await self.retrieval.retrieve(
            db=db,
            question=question,
            subject_id=subject_id,
            module_id=module_id,
        )

        # 3. Check for sufficiency
        if not relevant_chunks:
            processing_time = int((time.time() - start_time) * 1000)
            validation_data = {
                "word_count_valid": False,
                "required_sections_valid": False,
                "citations_valid": False,
                "details": {
                    "reason": "No relevant context chunks found above similarity threshold (0.35)."
                },
            }

            log = QuestionLog(
                user_id=user_id,
                subject_id=subject_id,
                module_id=module_id,
                marks=marks,
                question=question,
                answer="Insufficient context to answer the question based on the provided study materials.",
                answer_status=AnswerStatus.INSUFFICIENT_SOURCES,
                word_count=0,
                model_name=self.ollama.model,
                prompt_version="v2",
                retrieved_chunk_ids=[],
                processing_time_ms=processing_time,
                validation_result=validation_data,
            )
            db.add(log)
            await db.flush()
            await db.refresh(log)

            return AnswerResponse(
                id=log.id,
                status=log.answer_status.value if hasattr(log.answer_status, "value") else log.answer_status,
                answer=log.answer,
                word_count=0,
                marks=marks,
                question=question,
                subject_id=subject_id,
                subject_name=subject_name,
                sources=[],
                model=log.model_name,
                processing_ms=log.processing_time_ms,
                validation=ValidationResult(**validation_data),
                created_at=log.created_at,
            )

        # Extract only chunks for formatting
        chunks = [item[0] for item in relevant_chunks]

        # 4. Construct prompts
        system_prompt = self.prompt_builder.build_system_prompt()
        user_prompt = self.prompt_builder.build_user_prompt(question, chunks, rule)

        # 5. Call Ollama LLM
        try:
            answer = await self.ollama.generate(prompt=user_prompt, system_prompt=system_prompt)
        except Exception as e:
            # Log failure in database and raise exception
            processing_time = int((time.time() - start_time) * 1000)
            log = QuestionLog(
                user_id=user_id,
                subject_id=subject_id,
                module_id=module_id,
                marks=marks,
                question=question,
                answer=f"Generation failed: {str(e)}",
                answer_status=AnswerStatus.GENERATION_FAILED,
                word_count=0,
                model_name=self.ollama.model,
                prompt_version="v2",
                retrieved_chunk_ids=[c.id for c in chunks],
                processing_time_ms=processing_time,
            )
            db.add(log)
            await db.flush()
            raise e

        # 6. Parse and Validate the generated answer
        is_insufficient = (
            "Insufficient context to answer the question" in answer
            or "insufficient context" in answer.lower()
        )

        if is_insufficient:
            status = AnswerStatus.INSUFFICIENT_SOURCES
            word_count_valid = False
            citations_valid = False
            required_sections_valid = False
            word_count = len(answer.split())
            sections_present = []
        else:
            word_count = len(answer.split())
            word_count_valid = rule.min_words <= word_count <= rule.max_words

            # Citations validation
            if rule.require_citations:
                citations_valid = any(f"[S{i}]" in answer for i in range(1, len(chunks) + 1))
            else:
                citations_valid = True

            # Sections validation
            sections_present = []
            if rule.required_sections:
                for sec in rule.required_sections:
                    if sec.lower() in answer.lower():
                        sections_present.append(sec)
                required_sections_valid = len(sections_present) == len(rule.required_sections)
            else:
                required_sections_valid = True

            # Final status resolution
            validation_ok = word_count_valid and citations_valid and required_sections_valid
            status = AnswerStatus.COMPLETED if validation_ok else AnswerStatus.VALIDATION_FAILED

        validation_data = {
            "word_count_valid": word_count_valid,
            "required_sections_valid": required_sections_valid,
            "citations_valid": citations_valid,
            "details": {
                "word_count": word_count,
                "word_count_range": [rule.min_words, rule.max_words],
                "expected_citations": [f"[S{i}]" for i in range(1, len(chunks) + 1)],
                "citations_found": [f"[S{i}]" for i in range(1, len(chunks) + 1) if f"[S{i}]" in answer],
                "required_sections": rule.required_sections or [],
                "sections_found": sections_present,
            },
        }

        # 7. Write QuestionLog to DB
        processing_time = int((time.time() - start_time) * 1000)
        log = QuestionLog(
            user_id=user_id,
            subject_id=subject_id,
            module_id=module_id,
            marks=marks,
            question=question,
            answer=answer,
            answer_status=status,
            word_count=word_count,
            model_name=self.ollama.model,
            prompt_version="v2",
            retrieved_chunk_ids=[c.id for c in chunks],
            processing_time_ms=processing_time,
            validation_result=validation_data,
        )
        db.add(log)
        await db.flush()

        # 8. Save QuestionSources for citations lookup
        sources = []
        source_infos = []
        for idx, (chunk, relevance_score) in enumerate(relevant_chunks, 1):
            source = QuestionSource(
                question_log_id=log.id,
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                label=f"S{idx}",
                relevance_score=relevance_score,
                page_number=chunk.page_number,
                slide_number=chunk.slide_number,
                preview=chunk.content[:200],
            )
            db.add(source)
            sources.append(source)

            doc_name = chunk.document.document_name if (chunk.document and chunk.document.document_name) else "Study Material"
            source_infos.append(
                SourceInfo(
                    label=f"S{idx}",
                    document_id=chunk.document_id,
                    document_name=doc_name,
                    page_number=chunk.page_number,
                    slide_number=chunk.slide_number,
                    preview=chunk.content[:200],
                    relevance_score=relevance_score,
                )
            )

        await db.flush()
        await db.refresh(log)

        return AnswerResponse(
            id=log.id,
            status=log.answer_status.value if hasattr(log.answer_status, "value") else log.answer_status,
            answer=log.answer,
            word_count=log.word_count,
            marks=marks,
            question=question,
            subject_id=subject_id,
            subject_name=subject_name,
            sources=source_infos,
            model=log.model_name,
            processing_ms=log.processing_time_ms,
            validation=ValidationResult(**validation_data),
            created_at=log.created_at,
        )

    async def _get_rule(self, db: AsyncSession, subject_id: uuid.UUID, marks: int) -> AnswerRule:
        """Fetch active subject-specific rule or default fallback rule for marks."""
        # Check active subject specific rule
        result = await db.execute(
            select(AnswerRule).where(
                and_(
                    AnswerRule.subject_id == subject_id,
                    AnswerRule.marks == marks,
                    AnswerRule.is_active,
                )
            )
        )
        rule = result.scalar_one_or_none()
        if rule:
            return rule

        # Check active default rule
        result = await db.execute(
            select(AnswerRule).where(
                and_(
                    AnswerRule.is_default,
                    AnswerRule.marks == marks,
                    AnswerRule.is_active,
                )
            )
        )
        rule = result.scalar_one_or_none()
        if rule:
            return rule

        # Create virtual fallback rule if none configured
        if marks <= 2:
            return AnswerRule(
                marks=marks,
                name="Fallback 2-Mark Rule",
                min_words=35,
                max_words=60,
                use_bullet_points=False,
                require_citations=True,
            )
        elif marks <= 5:
            return AnswerRule(
                marks=marks,
                name="Fallback 5-Mark Rule",
                min_words=120,
                max_words=180,
                required_sections=["introduction", "explanation", "key_points"],
                use_bullet_points=True,
                require_citations=True,
            )
        else:
            return AnswerRule(
                marks=marks,
                name="Fallback 10-Mark Rule",
                min_words=250,
                max_words=350,
                required_sections=["introduction", "explanation", "key_points", "conclusion"],
                use_bullet_points=True,
                require_citations=True,
                require_example=True,
                require_conclusion=True,
            )

    async def _get_subject_name(self, db: AsyncSession, subject_id: uuid.UUID) -> str:
        """Resolve the subject's display name for the response payload."""
        result = await db.execute(select(Subject).where(Subject.id == subject_id))
        subject = result.scalar_one_or_none()
        return subject.name if subject else "Study Material"
