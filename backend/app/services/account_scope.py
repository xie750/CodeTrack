"""Personal learning never grants membership of a teaching class."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import (
    AdministrativeClass, Course, Enrollment, LearnerEvent,
    LearnerProfileSnapshot, PracticeProjectEnrollment, StudentClassMembership,
    StudentGeneratedResource, TeachingAssignment, User,
)
from backend.app.services.audit import record_audit

PERSONAL_LEARNING_CLASS_ID = "class_personal_learning"
PERSONAL_COURSE_IDS = ("course_ds_001", "course_network_001", "course_arch_001")


def repair_registration_scope(db: Session) -> None:
    # Existing event/resource schemas require a class FK. This context has no
    # members or teaching assignments; ownership remains the student's ID.
    if db.get(AdministrativeClass, PERSONAL_LEARNING_CLASS_ID) is None:
        db.add(AdministrativeClass(
            id=PERSONAL_LEARNING_CLASS_ID, name="自主学习", grade="",
            major_name="人工智能", status="SYSTEM",
        ))
        db.flush()

    users = db.scalars(select(User).where(User.id.like("user_student_%") | User.id.like("user_teacher_%"))).all()
    for user in users:
        # Registration IDs use twelve random hex digits; seeded accounts do not.
        suffix = user.id.rsplit("_", 1)[-1]
        if len(suffix) != 12 or any(c not in "0123456789abcdef" for c in suffix):
            continue
        rows = list(db.scalars(select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.origin == "LEGACY")).all())
        if not rows:
            continue
        if user.role == "STUDENT":
            has_membership = db.scalar(select(StudentClassMembership.id).where(
                StudentClassMembership.student_id == user.id,
                StudentClassMembership.status == "ACTIVE",
            ))
            # Only the complete old registration signature is repaired. Partial
            # or non-demo enrollments are left for explicit review.
            demo_rows = [r for r in rows if r.course_id in PERSONAL_COURSE_IDS]
            if has_membership or len(demo_rows) != len(PERSONAL_COURSE_IDS):
                continue
            teachings = [db.get(TeachingAssignment, r.teaching_assignment_id) if r.teaching_assignment_id else None for r in demo_rows]
            if not all(t and t.class_id == "class_se_001" for t in teachings):
                continue
            for row in demo_rows:
                record_audit(db, "registration_scope_repaired", "scope_repair_v1", "SUCCEEDED",
                             user_id=user.id, details={"course_id": row.course_id, "resource_id": row.teaching_assignment_id})
                row.teaching_assignment_id = None
                row.origin = "PERSONAL"
            # Preserve personal records, but remove the borrowed demo-class context.
            for model in (LearnerProfileSnapshot, LearnerEvent, StudentGeneratedResource, PracticeProjectEnrollment):
                for record in db.scalars(select(model).where(model.student_id == user.id, model.class_id == "class_se_001")).all():
                    record.class_id = PERSONAL_LEARNING_CLASS_ID
        elif user.role == "TEACHER":
            for row in rows:
                course = db.get(Course, row.course_id)
                teaching = db.scalar(select(TeachingAssignment.id).where(
                    TeachingAssignment.course_id == row.course_id, TeachingAssignment.teacher_id == user.id,
                ))
                if course and course.owner_teacher_id != user.id and teaching is None and row.course_id in PERSONAL_COURSE_IDS:
                    record_audit(db, "registration_scope_repaired", "scope_repair_v1", "SUCCEEDED",
                                 user_id=user.id, details={"course_id": row.course_id})
                    db.delete(row)
    db.commit()
