from datetime import datetime, timedelta
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    Chapter,
    ClassGroup,
    Course,
    DiagnosisResult,
    DiagnosisReview,
    Enrollment,
    EvaluationResult,
    Grade,
    KnowledgePoint,
    Material,
    Notification,
    Submission,
    Task,
    TestCase,
    User,
)


def seed_database(db: Session) -> None:
    if db.scalar(select(User.id).limit(1)):
        return

    teacher = User(
        id="teacher-01",
        name="王老师",
        role="teacher",
        number="T2024001",
        email="wang.teacher@university.edu.cn",
        department="计算机科学与技术学院",
    )
    teacher_lin = User(
        id="teacher-02",
        name="林老师",
        role="teacher",
        number="T2024002",
        email="lin.teacher@university.edu.cn",
        department="软件学院",
    )
    student_rows = [
        ("student-01", "赵明宇", "2024121001"),
        ("student-02", "李思雨", "2024121008"),
        ("student-03", "王子轩", "2024121014"),
        ("student-04", "陈佳怡", "2024121021"),
        ("student-05", "周昊然", "2024121029"),
        ("student-06", "林若曦", "2024121036"),
    ]
    student_users = [
        User(id=user_id, name=name, number=number, role="student")
        for user_id, name, number in student_rows
    ]
    db.add_all([teacher, teacher_lin, *student_users])
    db.flush()

    course = Course(
        id="course-ds",
        teacher_id=teacher.id,
        name="数据结构与程序设计基础",
        code="CST1024",
        term="2024-2025 学年春季",
        description="面向计算机类专业的核心课程，覆盖线性表、树、图、排序与算法分析。",
        status="active",
        student_visible=True,
        progress=62,
    )
    other_courses = [
        Course(id="course-java", teacher_id=teacher.id, name="Java Web 开发技术", code="CST2031", term=course.term, description="Spring Boot Web 应用开发实践。", status="active", student_visible=True, progress=48),
        Course(id="course-db", teacher_id=teacher.id, name="数据库系统原理", code="CST2042", term=course.term, description="关系数据库、SQL 与数据库设计。", status="active", student_visible=True, progress=74),
        Course(id="course-se", teacher_id=teacher.id, name="软件系统测试", code="CST3050", term="2024-2025 学年秋季", description="软件质量保障与自动化测试。", status="preparing", progress=18),
        Course(id="course-cpp", teacher_id=teacher.id, name="C++ 程序设计", code="CST1018", term=course.term, description="C++ 语言基础与面向对象程序设计。", status="preparing", progress=12),
        Course(id="course-network", teacher_id=teacher.id, name="计算机网络", code="CST2060", term="2023-2024 学年秋季", description="计算机网络体系结构与协议。", status="archived", student_visible=True, progress=100),
        # 林老师的课程
        Course(id="course-py", teacher_id=teacher_lin.id, name="Python 数据分析", code="CST3105", term="2024-2025 学年春季", description="使用 Python 进行数据清洗、分析与可视化。", status="active", student_visible=True, progress=55),
        Course(id="course-ml", teacher_id=teacher_lin.id, name="机器学习导论", code="CST3208", term="2024-2025 学年春季", description="监督学习、无监督学习与深度学习基础。", status="active", student_visible=True, progress=38),
        Course(id="course-os", teacher_id=teacher_lin.id, name="操作系统原理", code="CST2075", term="2024-2025 学年秋季", description="进程管理、内存管理与文件系统。", status="preparing", progress=10),
    ]
    db.add_all([course, *other_courses])

    class_groups = [
        ClassGroup(id="class-se1", course_id=course.id, name="软件工程 1 班", schedule="周二 3-4 节", mentor="王老师", join_code="SE12-34G7"),
        ClassGroup(id="class-se2", course_id=course.id, name="软件工程 2 班", schedule="周四 1-2 节", mentor="王老师", join_code="SE22-61K8"),
        ClassGroup(id="class-cs1", course_id=course.id, name="计算机科学 1 班", schedule="周三 5-6 节", mentor="陈老师", join_code="CS11-77M2"),
        ClassGroup(id="class-se3", course_id="course-db", name="软件工程 3 班", schedule="周五 3-4 节", mentor="刘老师", join_code="SE33-92P4"),
    ]
    db.add_all(class_groups)
    db.flush()
    db.add_all([Enrollment(class_id="class-se1", student_id=user.id) for user in student_users])

    chapter_titles = [
        "第 1 章 课程与算法基础",
        "第 2 章 线性表",
        "第 3 章 栈与队列",
        "第 4 章 串",
        "第 5 章 树与二叉树",
        "第 6 章 图",
    ]
    chapters = [
        Chapter(
            id=f"chapter-{index}",
            course_id=course.id,
            title=title,
            position=index,
            teaching_mode=["理论讲授", "案例教学", "混合式教学", "翻转课堂", "实验实训", "项目制教学"][index - 1],
            status="published" if index <= 3 else "draft",
        )
        for index, title in enumerate(chapter_titles, 1)
    ]
    db.add_all(chapters)
    db.flush()
    knowledge_rows = [
        ("kp-linked", "chapter-2", "链表", "核心线性数据结构", "基础", 76, 50, 50),
        ("kp-pointer", "chapter-2", "指针基础", "节点之间通过指针关联", "基础", 68, 25, 18),
        ("kp-edit", "chapter-2", "插入与删除", "链表的关键操作", "进阶", 72, 78, 22),
        ("kp-stack", "chapter-3", "栈", "后进先出的线性结构", "基础", 76, 16, 66),
        ("kp-tree", "chapter-5", "二叉树", "层次化非线性结构", "进阶", 58, 48, 82),
        ("kp-sort", "chapter-1", "排序算法", "典型算法设计", "进阶", 46, 82, 69),
    ]
    db.add_all([
        KnowledgePoint(
            id=row[0],
            chapter_id=row[1],
            name=row[2],
            description=row[3],
            difficulty=row[4],
            mastery=row[5],
            position_x=row[6],
            position_y=row[7],
        )
        for row in knowledge_rows
    ])

    materials = [
        Material(id="mat-01", course_id=course.id, title="链表关键点图解讲义", type="pdf", chapter_label="第 2 章 线性表", size="4.5 MB", visibility="students", status="ready", citations=18),
        Material(id="mat-02", course_id=course.id, title="指针与内存操作.pptx", type="slides", chapter_label="第 2 章 线性表", size="8.1 MB", visibility="students", status="ready", citations=11),
        Material(id="mat-03", course_id=course.id, title="单链表操作演示视频", type="video", chapter_label="第 2 章 线性表", size="126 MB", visibility="students", status="ready", citations=7),
        Material(id="mat-04", course_id=course.id, title="C 语言指针深度解析", type="link", chapter_label="补充资料", size="外部链接", visibility="teacher", status="ready", citations=23),
        Material(id="mat-05", course_id=course.id, title="栈与队列实验指导书", type="doc", chapter_label="第 3 章 栈与队列", size="2.7 MB", visibility="students", status="parsing", citations=0),
    ]
    db.add_all(materials)

    due = datetime.now().replace(microsecond=0) + timedelta(days=7)
    tasks = [
        Task(id="task-01", course_id=course.id, class_id="class-se1", title="单链表指定位置节点删除", type="programming", chapter_label="第 2 章 线性表", description="实现单链表中指定位置节点的删除。", starter_code="ListNode* removeAt(ListNode* head, int index) {\n  return head;\n}", status="published", difficulty="进阶", publish_at=datetime.now() - timedelta(days=4), due_at=due),
        Task(id="task-02", course_id=course.id, class_id="class-se1", title="栈实现括号匹配", type="programming", chapter_label="第 3 章 栈与队列", description="使用栈判断括号序列是否合法。", starter_code="bool isValid(string input) {\n  return false;\n}", status="published", difficulty="基础", publish_at=datetime.now() - timedelta(days=2), due_at=due + timedelta(days=4)),
        Task(id="task-03", course_id=course.id, title="二叉树的遍历", type="quiz", chapter_label="第 5 章 树", description="前中后序遍历测验。", status="scheduled", difficulty="进阶", publish_at=due, due_at=due + timedelta(days=10)),
        Task(id="task-04", course_id=course.id, title="图的最短路径综合实验", type="project", chapter_label="第 6 章 图", description="实现最短路径算法。", status="draft", difficulty="挑战", due_at=due + timedelta(days=17)),
    ]
    db.add_all(tasks)
    db.flush()
    test_names = ["头节点删除", "中间节点删除", "尾节点删除", "越界输入", "空链表", "重复删除"]
    db.add_all([
        TestCase(
            id=f"tc-01-{index}",
            task_id="task-01",
            name=name,
            hidden=index >= 3,
            weight=15 if index < 4 else 20,
        )
        for index, name in enumerate(test_names, 1)
    ])
    db.add_all([
        TestCase(id=f"tc-02-{index}", task_id="task-02", name=name, hidden=index > 2, weight=25)
        for index, name in enumerate(["普通括号", "多层嵌套", "错误闭合", "空字符串"], 1)
    ])

    submission_specs = [
        ("submission-01", "student-01", 6, 6, 92, 1),
        ("submission-02", "student-02", 5, 6, 82, 2),
        ("submission-03", "student-03", 3, 6, 61, 3),
        ("submission-04", "student-04", 6, 6, 91, 0),
        ("submission-05", "student-05", 4, 6, 67, 3),
        ("submission-06", "student-06", 6, 6, 94, 0),
    ]
    for index, (submission_id, student_id, passed, total, score, hint_level) in enumerate(submission_specs, 1):
        source = "ListNode* removeAt(ListNode* head, int index) {\n  if (!head) return head;\n  return head;\n}"
        submission = Submission(id=submission_id, task_id="task-01", student_id=student_id, version=index, source_code=source, hint_level=hint_level)
        evaluation = EvaluationResult(id=f"evaluation-{index}", submission_id=submission_id, passed_tests=passed, total_tests=total, runtime_ms=35 + index, score=score, details_json=json.dumps([{"name": name, "passed": test_index <= passed} for test_index, name in enumerate(test_names, 1)], ensure_ascii=False))
        confidence = 0.62 if student_id == "student-03" else 0.48 if student_id == "student-05" else 0.86
        diagnosis = DiagnosisResult(id=f"diagnosis-{index}", submission_id=submission_id, type="逻辑错误诊断" if passed < total else "代码质量建议", explanation="循环终止条件未覆盖删除尾节点的情况，建议检查 current->next 的边界。" if passed < total else "实现通过全部测试，可进一步封装节点释放逻辑。", confidence=confidence, source="链表关键点图解讲义 · 第 4 页", fallback=student_id == "student-05", needs_teacher_review=confidence < 0.7)
        db.add_all([submission, evaluation, diagnosis])
        db.flush()
        if diagnosis.needs_teacher_review:
            db.add(DiagnosisReview(id=f"review-{index}", diagnosis_id=diagnosis.id, teacher_id=teacher.id, status="pending"))
        if student_id in {"student-01", "student-04", "student-06"}:
            db.add(Grade(id=f"grade-{index}", submission_id=submission_id, teacher_id=teacher.id, score=score, status="grade_published", comment="已通过教师复核。", published_at=datetime.now()))

    db.add_all([
        Notification(id="notice-01", user_id=teacher.id, type="task", title="任务提醒", content="栈实现括号匹配将在 3 天后截止"),
        Notification(id="notice-02", user_id=teacher.id, type="ai", title="AI 审核", content="2 条低置信度诊断等待确认"),
        Notification(id="notice-03", user_id=teacher.id, type="risk", title="学生预警", content="王子轩连续 2 个任务未完成"),
    ])
    db.commit()


