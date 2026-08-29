from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import ClassGroup, Course, Enrollment, User


CLASS_PROTOTYPE = {
    "class-se1": {
        "name": "人工智能1班",
        "grade": "2024级",
        "major": "人工智能",
        "students": 52,
        "status": "active",
        "schedule": "周二 3-4 节",
        "mentor": "李明阳",
        "completion": 82,
        "active_rate": 76,
        "risk_count": 8,
    },
    "class-se2": {
        "name": "人工智能2班",
        "grade": "2024级",
        "major": "人工智能",
        "students": 41,
        "status": "active",
        "schedule": "周四 1-2 节",
        "mentor": "张子豪",
        "completion": 70,
        "active_rate": 71,
        "risk_count": 6,
    },
    "class-cs1": {
        "name": "人工智能实验班",
        "grade": "2025级",
        "major": "人工智能",
        "students": 38,
        "status": "preparing",
        "schedule": "尚未开始",
        "mentor": "张三",
        "completion": 0,
        "active_rate": 0,
        "risk_count": 0,
    },
    "class-se3": {
        "name": "人工智能3班",
        "grade": "2025级",
        "major": "人工智能",
        "students": 32,
        "status": "preparing",
        "schedule": "尚未开始",
        "mentor": "陈浩然",
        "completion": 0,
        "active_rate": 0,
        "risk_count": 0,
    },
    "class-ds1": {
        "name": "人工智能实践班",
        "grade": "2023级",
        "major": "人工智能",
        "students": 12,
        "status": "closed",
        "schedule": "2024-06-18 发布作业",
        "mentor": "刘宇轩",
        "completion": 100,
        "active_rate": 0,
        "risk_count": 0,
    },
}

DEMO_JOIN_CODES = {
    "class-se1": "AI12-34G7",
    "class-se2": "AI22-61K8",
    "class-cs1": "AI11-77M2",
    "class-se3": "AI33-92P4",
    "class-ds1": "AI1-0005",
}

LEGACY_JOIN_CODES = {
    "class-se1": "SE12-34G7",
    "class-se2": "SE22-61K8",
    "class-cs1": "CS11-77M2",
    "class-se3": "SE33-92P4",
    "class-ds1": "DS1-0005",
}


def prototype_class_metrics(class_id: str, enrollment_count: int):
    config = CLASS_PROTOTYPE.get(class_id, {})
    return {
        "completion": config.get("completion", 0),
        "active_rate": config.get("active_rate", 0),
        "risk_count": config.get("risk_count", 0),
        "capacity": 60 if class_id == "class-se1" else max(enrollment_count, config.get("students", 0)),
    }


def ensure_class_prototype_data(db: Session) -> None:
    course_id = "course-ds"
    course = db.get(Course, course_id)
    if course and course.description.startswith("面向计算机类专业"):
        course.description = "面向人工智能专业的核心课程，覆盖线性表、树、图、排序与算法分析。"

    test_student = db.get(User, "student-03")
    if not test_student:
        test_student = User(
            id="student-03",
            name="王子轩",
            role="student",
            number="2024121014",
        )
        db.add(test_student)
        db.flush()

    known_students = db.scalars(select(User).where(User.role == "student").order_by(User.id)).all()
    student_cursor = len(known_students)

    for class_id, config in CLASS_PROTOTYPE.items():
        group = db.get(ClassGroup, class_id)
        if not group:
            group = ClassGroup(
                id=class_id,
                course_id=course_id,
                name=config["name"],
                grade=config["grade"],
                major=config["major"],
                schedule=config["schedule"],
                mentor=config["mentor"],
                join_code=DEMO_JOIN_CODES.get(class_id, f"{class_id[-3:].upper()}-{len(CLASS_PROTOTYPE):04d}"),
                status=config["status"],
            )
            db.add(group)
            db.flush()
        else:
            group.course_id = course_id
            group.name = config["name"]
            group.grade = config["grade"]
            group.major = config["major"]
            group.schedule = config["schedule"]
            group.mentor = config["mentor"]
            group.status = config["status"]
            if group.join_code == LEGACY_JOIN_CODES.get(class_id):
                group.join_code = DEMO_JOIN_CODES[class_id]

        existing_count = db.scalar(
            select(func.count()).select_from(Enrollment).where(Enrollment.class_id == class_id)
        ) or 0
        needed = max(0, config["students"] - existing_count)
        for offset in range(needed):
            if class_id == "class-se1" and student_cursor < len(known_students):
                student = known_students[student_cursor]
                student_cursor += 1
            else:
                serial = f"{class_id.replace('class-', '').upper()}{existing_count + offset + 1:03d}"
                number = f"2024{abs(hash(serial)) % 1000000:06d}"
                student = db.scalar(select(User).where(User.number == number))
                if not student:
                    student = User(
                        id=f"student-prototype-{class_id}-{existing_count + offset + 1}",
                        name=f"{config['name']}学生{existing_count + offset + 1:02d}",
                        role="student",
                        number=number,
                    )
                    db.add(student)
                    db.flush()
            enrollment = db.scalar(
                select(Enrollment).where(
                    Enrollment.class_id == class_id,
                    Enrollment.student_id == student.id,
                )
            )
            if not enrollment:
                db.add(Enrollment(class_id=class_id, student_id=student.id))

    # Keep the default demo account in the class used by the teacher task flow.
    primary_enrollment = db.scalar(
        select(Enrollment).where(
            Enrollment.class_id == "class-se1",
            Enrollment.student_id == test_student.id,
        )
    )
    if not primary_enrollment:
        db.add(Enrollment(class_id="class-se1", student_id=test_student.id))
    db.commit()


