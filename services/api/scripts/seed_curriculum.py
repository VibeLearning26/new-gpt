"""Seed the academic database from docs/btech_curriculum (1).json.

Clears existing subjects and departments, reuses semesters 1-8, and creates
every department (branch) and subject from the curriculum's actual course
codes. Re-runnable: it wipes and rebuilds the academic structure each time.
"""
import asyncio
import json
from pathlib import Path

from sqlalchemy import delete, select

from app.database.session import async_session_factory
from app.models.academic import Department, Semester, Subject

CURRICULUM_PATH = Path(__file__).resolve().parents[3] / "docs" / "btech_curriculum (1).json"


async def main() -> None:
    curriculum = json.loads(CURRICULUM_PATH.read_text(encoding="utf-8"))["curriculum"]
    branches = curriculum["branches"]

    async with async_session_factory() as session:
        # 1. Clear existing subjects, then departments. Subjects reference
        #    departments, so delete the children first. (Verified safe: no
        #    documents, modules, or permissions reference the subjects, and
        #    answer rules carry NULL subject_id.)
        subj_result = await session.execute(delete(Subject))
        dept_result = await session.execute(delete(Department))
        await session.flush()
        print(f"Cleared {subj_result.rowcount} subjects, {dept_result.rowcount} departments")

        # 2. Reuse / create semesters 1-8.
        semesters: dict[int, Semester] = {
            s.number: s
            for s in (await session.execute(select(Semester))).scalars().all()
        }
        for number in range(1, curriculum["total_semesters"] + 1):
            if number not in semesters:
                sem = Semester(number=number, name=f"Semester {number}", is_active=True)
                session.add(sem)
                semesters[number] = sem
        await session.flush()
        print(f"Semesters ready: {len(semesters)}")

        # 3. Create a department per branch, then its subjects.
        total_subjects = 0
        for branch in branches:
            dept = Department(
                code=branch["branch_code"],
                name=branch["branch_name"],
                is_active=True,
            )
            session.add(dept)
            await session.flush()

            for sem_data in branch["semesters"]:
                semester = semesters[sem_data["semester"]]
                for subj in sem_data["subjects"]:
                    exists = (
                        await session.execute(
                            select(Subject.id).where(
                                Subject.code == subj["code"],
                                Subject.department_id == dept.id,
                                Subject.semester_id == semester.id,
                            )
                        )
                    ).scalar_one_or_none()
                    if exists is not None:
                        continue
                    session.add(
                        Subject(
                            code=subj["code"],
                            name=subj["name"],
                            department_id=dept.id,
                            semester_id=semester.id,
                            credits=subj.get("credits"),
                            description=subj.get("type"),
                            is_active=True,
                        )
                    )
                    total_subjects += 1
            await session.flush()
            print(f"  {dept.code}: {dept.name} -> {sum(len(s['subjects']) for s in branch['semesters'])} subjects")

        await session.commit()
        print(f"\nDone: {len(branches)} departments, {total_subjects} subjects created.")


if __name__ == "__main__":
    asyncio.run(main())
