"""
VibeGPT – Academic Metadata Models

Tables: departments, semesters, academic_years, subjects, modules, student_subject_permissions
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.answer_rule import AnswerRule
    from app.models.document import Document
    from app.models.user import StudentSubjectPermission, User


class Department(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    subjects: Mapped[list[Subject]] = relationship(back_populates="department")

    def __repr__(self) -> str:
        return f"<Department {self.code}: {self.name}>"


class Semester(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "semesters"

    number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("number", name="uq_semester_number"),)

    # Relationships
    subjects: Mapped[list[Subject]] = relationship(back_populates="semester")

    def __repr__(self) -> str:
        return f"<Semester {self.number}: {self.name}>"


class AcademicYear(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "academic_years"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)  # e.g., "2025-2026"
    start_year: Mapped[int] = mapped_column(Integer, nullable=False)
    end_year: Mapped[int] = mapped_column(Integer, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    documents: Mapped[list[Document]] = relationship(back_populates="academic_year")

    def __repr__(self) -> str:
        return f"<AcademicYear {self.name}>"


class Subject(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "subjects"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False, index=True
    )
    semester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("semesters.id"), nullable=False, index=True
    )
    credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("code", "department_id", "semester_id", name="uq_subject_dept_sem"),
    )

    # Relationships
    department: Mapped[Department] = relationship(back_populates="subjects")
    semester: Mapped[Semester] = relationship(back_populates="subjects")
    modules: Mapped[list[Module]] = relationship(
        back_populates="subject", cascade="all, delete-orphan"
    )
    documents: Mapped[list[Document]] = relationship(back_populates="subject")
    answer_rules: Mapped[list[AnswerRule]] = relationship(back_populates="subject")
    student_permissions: Mapped[list[StudentSubjectPermission]] = relationship(
        back_populates="subject"
    )

    def __repr__(self) -> str:
        return f"<Subject {self.code}: {self.name}>"


class Module(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "modules"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("subject_id", "number", name="uq_module_subject_number"),)

    # Relationships
    subject: Mapped[Subject] = relationship(back_populates="modules")

    def __repr__(self) -> str:
        return f"<Module {self.number}: {self.name}>"


class StudentSubjectPermission(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "student_subject_permissions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "subject_id", name="uq_student_subject"),)

    # Relationships
    user: Mapped[User] = relationship(back_populates="subject_permissions")
    subject: Mapped[Subject] = relationship(back_populates="student_permissions")
