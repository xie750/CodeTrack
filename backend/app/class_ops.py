import secrets
import string

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuditLog, ClassGroup, Course, Enrollment, User


router = APIRouter(prefix="/api/v1/teacher/classes")


class StudentImportRow(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    number: str = Field(min_length=3, max_length=40)


class StudentImportPayload(BaseModel):
    students: list[StudentImportRow]


def teacher_user(
    x_user_id: str = Header(default="teacher-01"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=403, detail="Teacher permission required")
    return user


def owned_class(db: Session, teacher: User, class_id: str) -> ClassGroup:
    group = db.get(ClassGroup, class_id)
    course = db.get(Course, group.course_id) if group else None
    if not group or not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Class not found")
    return group


@router.post("/{class_id}/join-code")
def regenerate_join_code(
    class_id: str,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    group = owned_class(db, teacher, class_id)
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(8))
        if not db.scalar(select(ClassGroup).where(ClassGroup.join_code == code)):
            break
    group.join_code = code
    db.add(AuditLog(actor_id=teacher.id, action="class.join_code.regenerate", resource_type="class_group", resource_id=class_id, detail=code))
    db.commit()
    return {"data": {"class_id": class_id, "join_code": code}}


@router.post("/{class_id}/students/import")
def import_students(
    class_id: str,
    payload: StudentImportPayload,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    group = owned_class(db, teacher, class_id)
    created = 0
    enrolled = 0
    skipped = 0
    errors = []
    seen_numbers = set()
    for index, row in enumerate(payload.students, 1):
        if row.number in seen_numbers:
            errors.append({"row": index, "number": row.number, "reason": "duplicate_in_file"})
            skipped += 1
            continue
        seen_numbers.add(row.number)
        student = db.scalar(select(User).where(User.number == row.number))
        if student and student.role != "student":
            errors.append({"row": index, "number": row.number, "reason": "number_belongs_to_non_student"})
            skipped += 1
            continue
        if not student:
            student = User(id=f"student-{secrets.token_hex(5)}", name=row.name, number=row.number, role="student")
            db.add(student)
            db.flush()
            created += 1
        exists = db.scalar(select(Enrollment).where(Enrollment.class_id == class_id, Enrollment.student_id == student.id))
        if exists:
            skipped += 1
            continue
        db.add(Enrollment(class_id=class_id, student_id=student.id))
        enrolled += 1
    db.add(AuditLog(actor_id=teacher.id, action="class.students.import", resource_type="class_group", resource_id=group.id, detail=f"created={created},enrolled={enrolled},skipped={skipped}"))
    db.commit()
    return {"data": {"created": created, "enrolled": enrolled, "skipped": skipped, "errors": errors}}
