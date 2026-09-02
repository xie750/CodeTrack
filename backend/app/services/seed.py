import json
from datetime import datetime, timezone

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from backend.app.core.security import hash_password, verify_password
from backend.app.models import (
    AdministrativeClass,
    Capability,
    Course,
    CourseChapter,
    CourseKnowledgePoint,
    Enrollment,
    KnowledgeSource,
    LearnerErrorStat,
    LearnerEvent,
    LearnerKnowledgeState,
    LearnerProfileSnapshot,
    PracticeProject,
    PracticeProjectActivity,
    PracticeProjectEnrollment,
    PracticeProjectSubmission,
    Question,
    QuestionOption,
    Recommendation,
    StudentClassMembership,
    StudentKnowledgeGraph,
    StudentResourceFolder,
    StudentTaskProgress,
    Task,
    TaskAssignment,
    TeachingAssignment,
    TestCase,
    User,
)


STUDENT_TEMPLATE = """ListNode* deleteAt(ListNode* head, int position) {
    // 在这里实现删除指定位置节点的逻辑
    return head;
}"""

STANDARD_WRONG_CODE = """ListNode* deleteAt(ListNode* head, int position) {
    if (head == nullptr || position < 0) {
        return head;
    }

    ListNode* prev = nullptr;
    ListNode* cur = head;
    int index = 0;

    while (cur != nullptr && index < position) {
        prev = cur;
        cur = cur->next;
        index++;
    }

    if (cur == nullptr) {
        return head;
    }

    if (prev != nullptr) {
        prev->next = cur->next;
    }

    return head;
}"""

STANDARD_CORRECT_CODE = """ListNode* deleteAt(ListNode* head, int position) {
    if (head == nullptr || position < 0) {
        return head;
    }

    if (position == 0) {
        return head->next;
    }

    ListNode* prev = head;
    int index = 0;

    while (prev != nullptr && index < position - 1) {
        prev = prev->next;
        index++;
    }

    if (prev == nullptr || prev->next == nullptr) {
        return head;
    }

    prev->next = prev->next->next;
    return head;
}"""


def upsert(db: Session, model, key: str, values: dict) -> None:
    existing = db.get(model, key)
    if existing is None:
        db.add(model(id=key, **values))
        return
    for field, value in values.items():
        setattr(existing, field, value)


def upsert_one(db: Session, model, filters: dict, values: dict) -> None:
    existing = db.query(model).filter_by(**filters).one_or_none()
    if existing is None:
        db.add(model(**filters, **values))
        return
    for field, value in values.items():
        setattr(existing, field, value)


def ensure_auth_columns(db: Session) -> None:
    columns = {column["name"] for column in inspect(db.bind).get_columns("users")}
    if "username" not in columns:
        db.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(80)"))
    if "password_hash" not in columns:
        db.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(220)"))
    if "last_login_at" not in columns:
        db.execute(text("ALTER TABLE users ADD COLUMN last_login_at DATETIME"))
    db.commit()


def ensure_task_workspace_columns(db: Session) -> None:
    columns = {column["name"] for column in inspect(db.bind).get_columns("tasks")}
    if "workspace_type" not in columns:
        db.execute(text("ALTER TABLE tasks ADD COLUMN workspace_type VARCHAR(30) NOT NULL DEFAULT 'CODING'"))
    db.commit()


def ensure_knowledge_source_columns(db: Session) -> None:
    """资料中心（§七）给 knowledge_sources 补的列，在没跑 alembic 的库上兜底。

    `main.py` 的 lifespan 只跑 `create_all` + seed，而 `create_all` 对**已存在**的表
    不会补列。开发库和测试库里这张表早就建好了，少了这个兜底，任何 SELECT
    knowledge_sources 都会因为缺列直接报错。
    """
    columns = {column["name"] for column in inspect(db.bind).get_columns("knowledge_sources")}
    additions = [
        ("chapter", "VARCHAR(120) NOT NULL DEFAULT ''"),
        ("knowledge_points", "TEXT NOT NULL DEFAULT '[]'"),
        ("content", "TEXT NOT NULL DEFAULT ''"),
        ("status", "VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'"),
        ("ai_retrievable", "BOOLEAN NOT NULL DEFAULT 1"),
        ("share_scope", "VARCHAR(20) NOT NULL DEFAULT 'COURSE'"),
        ("file_name", "VARCHAR(255)"),
        ("file_size", "INTEGER"),
        ("mime_type", "VARCHAR(120)"),
        ("storage_path", "VARCHAR(500)"),
        ("created_by", "VARCHAR(64)"),
        ("created_at", "DATETIME"),
        ("updated_at", "DATETIME"),
    ]
    for name, ddl in additions:
        if name not in columns:
            db.execute(text(f"ALTER TABLE knowledge_sources ADD COLUMN {name} {ddl}"))
    # 新加的时间戳列对已有行是 NULL（ALTER TABLE 不会追认 ORM 的 default），
    # 补一次当前时间，免得资料中心列表里老资料的创建时间是空的
    db.execute(
        text(
            "UPDATE knowledge_sources SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
        )
    )
    db.execute(
        text(
            "UPDATE knowledge_sources SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"
        )
    )
    db.commit()


def ensure_student_knowledge_graph_table(db: Session) -> None:
    StudentKnowledgeGraph.__table__.create(bind=db.bind, checkfirst=True)


def ensure_practice_project_tables(db: Session) -> None:
    PracticeProject.__table__.create(bind=db.bind, checkfirst=True)
    PracticeProjectEnrollment.__table__.create(bind=db.bind, checkfirst=True)
    PracticeProjectSubmission.__table__.create(bind=db.bind, checkfirst=True)
    PracticeProjectActivity.__table__.create(bind=db.bind, checkfirst=True)
    columns = {column["name"] for column in inspect(db.bind).get_columns("practice_projects")}
    additions = [
        ("member_names_json", "TEXT NOT NULL DEFAULT '[]'"),
    ]
    for name, ddl in additions:
        if name not in columns:
            db.execute(text(f"ALTER TABLE practice_projects ADD COLUMN {name} {ddl}"))
    db.commit()


def ensure_student_resource_folder_table(db: Session) -> None:
    StudentResourceFolder.__table__.create(bind=db.bind, checkfirst=True)


def ensure_rag_profile_columns(db: Session) -> None:
    """补齐 RAG 文档策略字段，兜住本地开发库未跑 Alembic 的情况。"""
    inspector = inspect(db.bind)
    table_names = set(inspector.get_table_names())
    if "documents" in table_names:
        document_columns = {column["name"] for column in inspector.get_columns("documents")}
        if "file_profile" not in document_columns:
            db.execute(text("ALTER TABLE documents ADD COLUMN file_profile TEXT NOT NULL DEFAULT '{}'"))
    if "document_versions" in table_names:
        version_columns = {column["name"] for column in inspector.get_columns("document_versions")}
        additions = [
            ("content_profile", "TEXT NOT NULL DEFAULT '{}'"),
            ("cleaning_strategy", "VARCHAR(64) NOT NULL DEFAULT 'generic_clean'"),
            ("chunking_strategy", "VARCHAR(64) NOT NULL DEFAULT 'section_recursive'"),
        ]
        for name, ddl in additions:
            if name not in version_columns:
                db.execute(text(f"ALTER TABLE document_versions ADD COLUMN {name} {ddl}"))
    db.commit()


def seed_demo_data(db: Session) -> None:
    ensure_auth_columns(db)
    ensure_task_workspace_columns(db)
    ensure_knowledge_source_columns(db)
    ensure_student_knowledge_graph_table(db)
    ensure_practice_project_tables(db)
    ensure_student_resource_folder_table(db)
    ensure_rag_profile_columns(db)
    users = {
        "user_teacher_001": {
            "username": "teacher_wang",
            "display_name": "王老师",
            "role": "TEACHER",
            "status": "ACTIVE",
        },
        "user_teacher_002": {
            "username": "teacher_li",
            "display_name": "李老师",
            "role": "TEACHER",
            "status": "ACTIVE",
        },
        "user_student_001": {
            "username": "wang",
            "display_name": "王同学",
            "role": "STUDENT",
            "status": "ACTIVE",
        },
        "user_student_002": {
            "username": "liu",
            "display_name": "刘同学",
            "role": "STUDENT",
            "status": "ACTIVE",
        },
    }
    for user_id, values in users.items():
        upsert(db, User, user_id, values)
    db.flush()

    for user_id in users:
        user = db.get(User, user_id)
        if user and not verify_password("codetrack123", user.password_hash):
            user.password_hash = hash_password("codetrack123")
    db.flush()

    upsert(
        db,
        Course,
        "course_ds_001",
        {
            "name": "数据结构",
            "description": "人工智能专业基础支撑课程，面向链表、栈队列、树和算法结构能力。",
            "term": "2026-demo",
            "status": "ACTIVE",
            "owner_teacher_id": "user_teacher_001",
        },
    )
    upsert(
        db,
        Course,
        "course_network_001",
        {
            "name": "Python 程序设计",
            "description": "人工智能专业基础支撑课程，面向 Python 语法、数据处理和实验编程。",
            "term": "2026-demo",
            "status": "ACTIVE",
            "owner_teacher_id": "user_teacher_002",
        },
    )
    upsert(
        db,
        Course,
        "course_arch_001",
        {
            "name": "机器学习",
            "description": "人工智能专业核心课程，面向监督学习、模型评估、过拟合与正则化。",
            "term": "2026-demo",
            "status": "ACTIVE",
            "owner_teacher_id": "user_teacher_001",
        },
    )
    db.flush()

    enrollments = [
        ("course_ds_001", "user_teacher_001", "TEACHER"),
        ("course_ds_001", "user_student_001", "STUDENT"),
        ("course_ds_001", "user_student_002", "STUDENT"),
        ("course_network_001", "user_teacher_002", "TEACHER"),
        ("course_network_001", "user_student_001", "STUDENT"),
        ("course_arch_001", "user_teacher_001", "TEACHER"),
        ("course_arch_001", "user_student_001", "STUDENT"),
    ]
    for course_id, user_id, role in enrollments:
        existing = (
            db.query(Enrollment)
            .filter(Enrollment.course_id == course_id, Enrollment.user_id == user_id)
            .one_or_none()
        )
        if existing is None:
            db.add(Enrollment(course_id=course_id, user_id=user_id, role=role))
        else:
            existing.role = role

    classes = {
        "class_se_001": {
            "name": "人工智能 1 班",
            "grade": "2026",
            "major_name": "人工智能",
            "status": "ACTIVE",
        },
        "class_cs_001": {
            "name": "人工智能 2 班",
            "grade": "2026",
            "major_name": "人工智能",
            "status": "ACTIVE",
        },
    }
    for class_id, values in classes.items():
        upsert(db, AdministrativeClass, class_id, values)
    db.flush()

    memberships = [
        ("class_se_001", "user_student_001", "ACTIVE"),
        ("class_se_001", "user_student_002", "TRANSFERRED"),
        ("class_cs_001", "user_student_002", "ACTIVE"),
    ]
    for class_id, student_id, status in memberships:
        upsert_one(
            db,
            StudentClassMembership,
            {"class_id": class_id, "student_id": student_id},
            {"status": status},
        )

    teaching_assignments = {
        "ta_se1_ds_001": {
            "class_id": "class_se_001",
            "course_id": "course_ds_001",
            "teacher_id": "user_teacher_001",
            "term": "2026-demo",
            "status": "ACTIVE",
        },
        "ta_se1_network_001": {
            "class_id": "class_se_001",
            "course_id": "course_network_001",
            "teacher_id": "user_teacher_002",
            "term": "2026-demo",
            "status": "ACTIVE",
        },
        "ta_se1_ml_001": {
            "class_id": "class_se_001",
            "course_id": "course_arch_001",
            "teacher_id": "user_teacher_001",
            "term": "2026-demo",
            "status": "ACTIVE",
        },
        "ta_cs1_ds_001": {
            "class_id": "class_cs_001",
            "course_id": "course_ds_001",
            "teacher_id": "user_teacher_001",
            "term": "2026-demo",
            "status": "ACTIVE",
        },
    }
    for assignment_id, values in teaching_assignments.items():
        upsert(db, TeachingAssignment, assignment_id, values)
    db.flush()

    upsert(
        db,
        Capability,
        "cap_linked_list_boundary",
        {
            "code": "LINKED_LIST_BOUNDARY_HANDLING",
            "name": "链表边界处理",
            "description": "能够处理链表删除中的头节点、空链表、尾节点和非法位置等边界情况",
        },
    )
    upsert(
        db,
        Capability,
        "cap_array_hash_lookup",
        {
            "code": "ARRAY_HASH_LOOKUP",
            "name": "数组与哈希查找",
            "description": "能够使用哈希表记录已访问元素，并根据目标值查找互补元素。",
        },
    )
    upsert(
        db,
        Capability,
        "cap_subnet_host_count",
        {
            "code": "PYTHON_LIST_DICT_LOOKUP",
            "name": "Python 列表与字典查找",
            "description": "能够使用 Python 遍历列表并用字典记录已访问元素，完成目标值查找。",
        },
    )
    upsert(
        db,
        Capability,
        "cap_ml_model_evaluation",
        {
            "code": "ML_MODEL_EVALUATION",
            "name": "模型评估与过拟合判断",
            "description": "能够区分训练集、验证集和测试集，并解释过拟合与正则化的基本作用。",
        },
    )
    db.flush()

    learning_objectives = [
        "理解单链表删除操作",
        "处理空链表",
        "处理删除头节点",
        "正确维护前驱节点和后继节点",
        "通过测试验证边界情况",
    ]
    upsert(
        db,
        Task,
        "task_linked_list_delete_001",
        {
            "course_id": "course_ds_001",
            "title": "单链表指定位置节点删除",
            "description": "实现删除单链表指定位置节点的函数。",
            "workspace_type": "CODING",
            "language": "CPP",
            "interface_spec": "ListNode* deleteAt(ListNode* head, int position);",
            "learning_objectives": json.dumps(learning_objectives, ensure_ascii=False),
            "capability_ids": json.dumps(["cap_linked_list_boundary"], ensure_ascii=False),
            "status": "OPEN",
        },
    )
    upsert(
        db,
        Task,
        "task_two_sum_001",
        {
            "course_id": "course_ds_001",
            "title": "两数之和",
            "description": "给定整数数组 nums 和目标值 target，请返回两个数的下标，使它们相加等于 target。",
            "workspace_type": "CODING",
            "language": "PYTHON",
            "interface_spec": "twoSum(nums, target) -> indices",
            "learning_objectives": json.dumps(
                ["理解数组遍历", "使用哈希表查找补数", "区分元素值和下标", "通过样例验证边界输入"],
                ensure_ascii=False,
            ),
            "capability_ids": json.dumps(["cap_array_hash_lookup"], ensure_ascii=False),
            "status": "OPEN",
        },
    )
    upsert(
        db,
        Task,
        "task_subnet_mask_001",
        {
            "course_id": "course_network_001",
            "title": "Python 列表与字典查找练习",
            "description": "使用 Python 遍历列表并借助字典完成目标值查找。",
            "workspace_type": "CODING",
            "language": "PYTHON",
            "interface_spec": "twoSum(nums, target) -> indices",
            "learning_objectives": json.dumps(
                ["掌握 Python 函数定义", "遍历列表", "使用字典记录已访问元素", "区分元素值和下标"],
                ensure_ascii=False,
            ),
            "capability_ids": json.dumps(["cap_array_hash_lookup"], ensure_ascii=False),
            "status": "OPEN",
        },
    )
    upsert(
        db,
        Task,
        "task_ml_overfitting_quiz_001",
        {
            "course_id": "course_arch_001",
            "title": "过拟合与正则化概念测验",
            "description": "围绕机器学习中的训练集、验证集、测试集、过拟合和正则化完成概念辨析。",
            "workspace_type": "QUESTION_SET",
            "language": "PYTHON",
            "interface_spec": "Concept quiz: overfitting, regularization, dataset split",
            "learning_objectives": json.dumps(
                ["区分训练集、验证集和测试集", "解释过拟合现象", "理解正则化的基本作用"],
                ensure_ascii=False,
            ),
            "capability_ids": json.dumps(["cap_ml_model_evaluation"], ensure_ascii=False),
            "status": "OPEN",
        },
    )
    linked_list_review_objectives = [
        "复盘链表删除中的边界场景",
        "识别头节点、尾节点和非法位置的处理差异",
        "用公开样例先完成一次自检",
    ]
    upsert(
        db,
        Task,
        "task_linked_list_boundary_review_001",
        {
            "course_id": "course_ds_001",
            "title": "链表边界处理巩固练习",
            "description": "围绕单链表删除任务补充一组边界场景练习，重点检查头节点返回值和越界位置保护。",
            "workspace_type": "CODING",
            "language": "PYTHON",
            "interface_spec": "ListNode* deleteAt(ListNode* head, int position);",
            "learning_objectives": json.dumps(linked_list_review_objectives, ensure_ascii=False),
            "capability_ids": json.dumps(["cap_linked_list_boundary"], ensure_ascii=False),
            "status": "OPEN",
        },
    )
    upsert(
        db,
        Task,
        "task_linked_list_stage_quiz_001",
        {
            "course_id": "course_ds_001",
            "title": "链表删除阶段测验",
            "description": "教师用于检查链表节点删除理解程度的小测，覆盖普通位置、头节点和空链表三类判断。",
            "workspace_type": "QUESTION_SET",
            "language": "CPP",
            "interface_spec": "ListNode* deleteAt(ListNode* head, int position);",
            "learning_objectives": json.dumps(["解释链表删除过程", "判断边界用例", "定位指针更新错误"], ensure_ascii=False),
            "capability_ids": json.dumps(["cap_linked_list_boundary"], ensure_ascii=False),
            "status": "OPEN",
        },
    )
    upsert(
        db,
        Task,
        "task_stack_queue_preview_001",
        {
            "course_id": "course_ds_001",
            "title": "栈与队列预习任务",
            "description": "在进入栈与队列章节前，先用结构化题目梳理先进后出、先进先出和边界判空的差异。",
            "workspace_type": "QUESTION_SET",
            "language": "CPP",
            "interface_spec": "ListNode* deleteAt(ListNode* head, int position);",
            "learning_objectives": json.dumps(["区分栈与队列", "理解判空边界", "迁移链表指针经验"], ensure_ascii=False),
            "capability_ids": json.dumps(["cap_linked_list_boundary"], ensure_ascii=False),
            "status": "OPEN",
        },
    )
    db.flush()
    upsert(
        db,
        TaskAssignment,
        "assign_se1_ds_linked_list_001",
        {
            "task_id": "task_linked_list_delete_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "published_by": "user_teacher_001",
            "publish_status": "PUBLISHED",
            "assignment_mode": "PRACTICE",
            "allow_hint_level_3": True,
            "published_at": datetime(2026, 7, 20, 8, 0, tzinfo=timezone.utc),
            "deadline": datetime(2026, 8, 5, 23, 59, tzinfo=timezone.utc),
        },
    )
    upsert(
        db,
        TaskAssignment,
        "assign_se1_ds_two_sum_001",
        {
            "task_id": "task_two_sum_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "published_by": "user_teacher_001",
            "publish_status": "PUBLISHED",
            "assignment_mode": "PRACTICE",
            "allow_hint_level_3": True,
            "published_at": datetime(2026, 7, 21, 8, 0, tzinfo=timezone.utc),
            "deadline": datetime(2026, 8, 6, 23, 59, tzinfo=timezone.utc),
        },
    )
    upsert(
        db,
        TaskAssignment,
        "assign_se1_ds_boundary_review_001",
        {
            "task_id": "task_linked_list_boundary_review_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "published_by": "user_teacher_001",
            "publish_status": "PUBLISHED",
            "assignment_mode": "PRACTICE",
            "allow_hint_level_3": True,
            "published_at": datetime(2026, 7, 24, 8, 0, tzinfo=timezone.utc),
            "deadline": datetime(2026, 8, 7, 23, 59, tzinfo=timezone.utc),
        },
    )
    upsert(
        db,
        TaskAssignment,
        "assign_se1_ds_stage_quiz_001",
        {
            "task_id": "task_linked_list_stage_quiz_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "published_by": "user_teacher_001",
            "publish_status": "PUBLISHED",
            "assignment_mode": "QUIZ",
            "allow_hint_level_3": False,
            "published_at": datetime(2026, 7, 25, 8, 0, tzinfo=timezone.utc),
            "deadline": datetime(2026, 8, 10, 23, 59, tzinfo=timezone.utc),
        },
    )
    upsert(
        db,
        TaskAssignment,
        "assign_se1_ds_stack_queue_preview_001",
        {
            "task_id": "task_stack_queue_preview_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "published_by": "user_teacher_001",
            "publish_status": "PUBLISHED",
            "assignment_mode": "EXAM",
            "allow_hint_level_3": False,
            "published_at": datetime(2026, 7, 27, 8, 0, tzinfo=timezone.utc),
            "deadline": datetime(2026, 8, 12, 23, 59, tzinfo=timezone.utc),
        },
    )
    upsert(
        db,
        TaskAssignment,
        "assign_se1_network_subnet_001",
        {
            "task_id": "task_subnet_mask_001",
            "teaching_assignment_id": "ta_se1_network_001",
            "published_by": "user_teacher_002",
            "publish_status": "PUBLISHED",
            "assignment_mode": "PRACTICE",
            "allow_hint_level_3": True,
            "published_at": datetime(2026, 7, 22, 8, 0, tzinfo=timezone.utc),
            "deadline": datetime(2026, 8, 8, 23, 59, tzinfo=timezone.utc),
        },
    )
    upsert(
        db,
        TaskAssignment,
        "assign_se1_ml_overfitting_001",
        {
            "task_id": "task_ml_overfitting_quiz_001",
            "teaching_assignment_id": "ta_se1_ml_001",
            "published_by": "user_teacher_001",
            "publish_status": "PUBLISHED",
            "assignment_mode": "QUIZ",
            "allow_hint_level_3": False,
            "published_at": datetime(2026, 7, 23, 8, 0, tzinfo=timezone.utc),
            "deadline": datetime(2026, 8, 9, 23, 59, tzinfo=timezone.utc),
        },
    )
    upsert(
        db,
        TaskAssignment,
        "assign_cs1_ds_linked_list_001",
        {
            "task_id": "task_linked_list_delete_001",
            "teaching_assignment_id": "ta_cs1_ds_001",
            "published_by": "user_teacher_001",
            "publish_status": "PUBLISHED",
            "assignment_mode": "PRACTICE",
            "allow_hint_level_3": True,
            "published_at": datetime(2026, 7, 21, 8, 0, tzinfo=timezone.utc),
            "deadline": datetime(2026, 8, 6, 23, 59, tzinfo=timezone.utc),
        },
    )
    db.flush()

    test_cases = [
        (
            "tc_delete_middle",
            "删除中间节点",
            "PUBLIC",
            {"values": [1, 2, 3], "position": 1},
            [1, 3],
            "[1,3]",
            None,
            "NORMAL_DELETE",
            1,
        ),
        (
            "tc_delete_head",
            "删除头节点",
            "PUBLIC",
            {"values": [1, 2, 3], "position": 0},
            [2, 3],
            "[2,3]",
            None,
            "LINKED_LIST_HEAD_UPDATE_ERROR",
            2,
        ),
        (
            "tc_delete_empty",
            "空链表删除",
            "PUBLIC",
            {"values": [], "position": 0},
            [],
            "[]",
            None,
            "EMPTY_LIST_GUARD",
            3,
        ),
        (
            "tc_delete_tail",
            "删除尾节点",
            "HIDDEN",
            {"values": [1, 2, 3], "position": 2},
            [1, 2],
            "边界位置删除结果应正确",
            "边界位置删除结果不正确",
            "TAIL_DELETE",
            4,
        ),
        (
            "tc_invalid_position",
            "非法位置",
            "HIDDEN",
            {"values": [1, 2], "position": 5},
            [1, 2],
            "非法位置处理结果应正确",
            "非法位置处理结果不正确",
            "INVALID_POSITION",
            5,
        ),
    ]
    for case_id, name, visibility, input_data, expected, summary, hidden_summary, tag, order in test_cases:
        upsert(
            db,
            TestCase,
            case_id,
            {
                "task_id": "task_linked_list_delete_001",
                "name": name,
                "visibility": visibility,
                "input_data": json.dumps(input_data, ensure_ascii=False),
                "expected_output": json.dumps(expected, ensure_ascii=False),
                "expected_output_summary": summary,
                "hidden_failure_summary": hidden_summary,
                "error_tag": tag,
                "capability_id": "cap_linked_list_boundary",
                "required": True,
                "sort_order": order,
            },
        )
    two_sum_cases = [
        (
            "tc_two_sum_basic",
            "公开样例：基础补数",
            "PUBLIC",
            {"nums": [2, 7, 11, 15], "target": 9},
            [0, 1],
            "[0,1]",
            None,
            "TWO_SUM_BASIC_COMPLEMENT",
            1,
        ),
        (
            "tc_two_sum_reuse_guard",
            "公开样例：不能复用同一元素",
            "PUBLIC",
            {"nums": [3, 2, 4], "target": 6},
            [1, 2],
            "[1,2]",
            None,
            "TWO_SUM_REUSE_GUARD",
            2,
        ),
        (
            "tc_two_sum_duplicate",
            "重复元素",
            "HIDDEN",
            {"nums": [3, 3], "target": 6},
            [0, 1],
            "[0,1]",
            "重复元素场景未通过",
            "TWO_SUM_DUPLICATE_VALUES",
            3,
        ),
        (
            "tc_two_sum_negative",
            "负数与零",
            "HIDDEN",
            {"nums": [-1, 0, 4, 8], "target": 7},
            [0, 3],
            "[0,3]",
            "负数或零相关场景未通过",
            "TWO_SUM_NEGATIVE_VALUES",
            4,
        ),
    ]
    for case_id, name, visibility, input_data, expected, summary, hidden_summary, tag, order in two_sum_cases:
        upsert(
            db,
            TestCase,
            case_id,
            {
                "task_id": "task_two_sum_001",
                "name": name,
                "visibility": visibility,
                "input_data": json.dumps(input_data, ensure_ascii=False),
                "expected_output": json.dumps(expected, ensure_ascii=False),
                "expected_output_summary": summary,
                "hidden_failure_summary": hidden_summary,
                "error_tag": tag,
                "capability_id": "cap_array_hash_lookup",
                "required": True,
                "sort_order": order,
            },
        )
    python_lookup_cases = [
        (
            "tc_python_lookup_basic",
            "公开样例：基础补数",
            "PUBLIC",
            {"nums": [2, 7, 11, 15], "target": 9},
            [0, 1],
            "[0,1]",
            None,
            "PYTHON_LOOKUP_BASIC_COMPLEMENT",
            1,
        ),
        (
            "tc_python_lookup_reuse_guard",
            "公开样例：不能复用同一元素",
            "PUBLIC",
            {"nums": [3, 2, 4], "target": 6},
            [1, 2],
            "[1,2]",
            None,
            "PYTHON_LOOKUP_REUSE_GUARD",
            2,
        ),
        (
            "tc_python_lookup_duplicate",
            "隐藏样例：重复元素",
            "HIDDEN",
            {"nums": [3, 3], "target": 6},
            [0, 1],
            "重复元素场景应正确",
            "重复元素场景未通过",
            "PYTHON_LOOKUP_DUPLICATE_VALUES",
            3,
        ),
    ]
    for case_id, name, visibility, input_data, expected, summary, hidden_summary, tag, order in python_lookup_cases:
        upsert(
            db,
            TestCase,
            case_id,
            {
                "task_id": "task_subnet_mask_001",
                "name": name,
                "visibility": visibility,
                "input_data": json.dumps(input_data, ensure_ascii=False),
                "expected_output": json.dumps(expected, ensure_ascii=False),
                "expected_output_summary": summary,
                "hidden_failure_summary": hidden_summary,
                "error_tag": tag,
                "capability_id": "cap_array_hash_lookup",
                "required": True,
                "sort_order": order,
            },
        )
    extra_task_cases = {
        "task_linked_list_boundary_review_001": "boundary_review",
        "task_linked_list_stage_quiz_001": "stage_quiz",
        "task_stack_queue_preview_001": "stack_preview",
    }
    for task_id, prefix in extra_task_cases.items():
        for case_id, name, visibility, input_data, expected, summary, hidden_summary, tag, order in test_cases[:3]:
            upsert(
                db,
                TestCase,
                f"tc_{prefix}_{case_id.removeprefix('tc_')}",
                {
                    "task_id": task_id,
                    "name": name,
                    "visibility": visibility,
                    "input_data": json.dumps(input_data, ensure_ascii=False),
                    "expected_output": json.dumps(expected, ensure_ascii=False),
                    "expected_output_summary": summary,
                    "hidden_failure_summary": hidden_summary,
                    "error_tag": tag,
                    "capability_id": "cap_linked_list_boundary",
                    "required": True,
                    "sort_order": order,
                },
            )

    question_sets = {
        "task_linked_list_stage_quiz_001": [
            {
                "id": "q_linked_quiz_001",
                "question_type": "SINGLE_CHOICE",
                "stem": "在单链表删除第 0 个节点时，最需要优先更新的是哪一项？",
                "analysis": "删除头节点没有前驱节点，函数需要把新的头节点作为链表起点返回。",
                "knowledge_points": ["链表边界处理", "头节点删除"],
                "difficulty": "BASIC",
                "score": 10,
                "error_type": "HEAD_NODE_RETURN_MISSING",
                "options": [
                    ("A", "原头节点的 next 指针", True),
                    ("B", "尾节点的 next 指针", False),
                    ("C", "链表中所有节点的值", False),
                    ("D", "测试用例的输入顺序", False),
                ],
            },
            {
                "id": "q_linked_quiz_002",
                "question_type": "MULTIPLE_CHOICE",
                "stem": "为了验证单链表删除函数的边界处理，下面哪些场景应该纳入测试？",
                "analysis": "边界测试至少覆盖空链表、头节点、尾节点和非法位置，才能暴露常见指针更新问题。",
                "knowledge_points": ["链表边界处理", "边界测试"],
                "difficulty": "MEDIUM",
                "score": 15,
                "error_type": "BOUNDARY_CASE_MISSING",
                "options": [
                    ("A", "空链表删除", True),
                    ("B", "删除头节点", True),
                    ("C", "删除尾节点", True),
                    ("D", "只测试中间节点即可", False),
                ],
            },
            {
                "id": "q_linked_quiz_003",
                "question_type": "TRUE_FALSE",
                "stem": "如果 position 超过链表长度，合理处理方式通常是保持原链表不变。",
                "analysis": "非法位置不应改变链表结构，也不应触发空指针访问。",
                "knowledge_points": ["非法位置保护", "链表边界处理"],
                "difficulty": "BASIC",
                "score": 10,
                "error_type": "INVALID_POSITION_GUARD_MISSING",
                "options": [
                    ("A", "正确", True),
                    ("B", "错误", False),
                ],
            },
        ],
        "task_stack_queue_preview_001": [
            {
                "id": "q_stack_preview_001",
                "question_type": "SINGLE_CHOICE",
                "stem": "栈结构最典型的访问规则是什么？",
                "analysis": "栈是后进先出结构，最近压入的元素会最先被弹出。",
                "knowledge_points": ["栈与队列", "LIFO"],
                "difficulty": "BASIC",
                "score": 10,
                "error_type": "STACK_QUEUE_RULE_CONFUSION",
                "options": [
                    ("A", "先进先出", False),
                    ("B", "后进先出", True),
                    ("C", "按值从小到大访问", False),
                    ("D", "随机访问任意位置", False),
                ],
            },
            {
                "id": "q_stack_preview_002",
                "question_type": "MULTIPLE_CHOICE",
                "stem": "下面哪些操作前通常需要先判断结构是否为空？",
                "analysis": "出栈、出队和读取队首都依赖已有元素，空结构下直接访问会导致错误。",
                "knowledge_points": ["栈与队列", "判空边界"],
                "difficulty": "MEDIUM",
                "score": 15,
                "error_type": "EMPTY_GUARD_MISSING",
                "options": [
                    ("A", "pop 出栈", True),
                    ("B", "dequeue 出队", True),
                    ("C", "front 读取队首", True),
                    ("D", "push 入栈", False),
                ],
            },
            {
                "id": "q_stack_preview_003",
                "question_type": "TRUE_FALSE",
                "stem": "队列的典型访问顺序是先进先出。",
                "analysis": "队列模拟排队场景，先进入队列的元素通常先被处理。",
                "knowledge_points": ["栈与队列", "FIFO"],
                "difficulty": "BASIC",
                "score": 10,
                "error_type": "STACK_QUEUE_RULE_CONFUSION",
                "options": [
                    ("A", "正确", True),
                    ("B", "错误", False),
                ],
            },
        ],
        "task_ml_overfitting_quiz_001": [
            {
                "id": "q_ml_overfit_001",
                "question_type": "SINGLE_CHOICE",
                "stem": "如果模型在训练集上表现很好，但在测试集上表现明显变差，最可能的问题是什么？",
                "analysis": "训练集效果好但测试集泛化差，通常说明模型记住了训练数据中的噪声或偶然模式，属于过拟合风险。",
                "knowledge_points": ["过拟合", "模型评估"],
                "difficulty": "BASIC",
                "score": 10,
                "error_type": "OVERFITTING_REASONING_WEAK",
                "options": [
                    ("A", "过拟合", True),
                    ("B", "欠拟合", False),
                    ("C", "数据已完全清洗干净", False),
                    ("D", "测试集不再需要", False),
                ],
            },
            {
                "id": "q_ml_overfit_002",
                "question_type": "MULTIPLE_CHOICE",
                "stem": "下面哪些做法通常有助于缓解过拟合？",
                "analysis": "正则化、交叉验证、增加有效数据和降低模型复杂度都可能缓解过拟合；直接把测试集用于调参会污染评估。",
                "knowledge_points": ["正则化", "交叉验证", "模型复杂度"],
                "difficulty": "MEDIUM",
                "score": 15,
                "error_type": "REGULARIZATION_PURPOSE_CONFUSION",
                "options": [
                    ("A", "加入正则化项", True),
                    ("B", "使用交叉验证辅助选择模型", True),
                    ("C", "适当降低模型复杂度", True),
                    ("D", "反复用测试集调参直到分数最高", False),
                ],
            },
            {
                "id": "q_ml_overfit_003",
                "question_type": "TRUE_FALSE",
                "stem": "验证集可以用于模型选择和调参，测试集应尽量保留到最终评估阶段。",
                "analysis": "验证集用于开发过程中的模型选择，测试集用于估计最终泛化表现，二者职责不同。",
                "knowledge_points": ["训练集", "验证集", "测试集"],
                "difficulty": "BASIC",
                "score": 10,
                "error_type": "TRAIN_VALID_TEST_CONFUSION",
                "options": [
                    ("A", "正确", True),
                    ("B", "错误", False),
                ],
            },
        ],
    }
    for task_id, questions in question_sets.items():
        for index, question in enumerate(questions, start=1):
            upsert(
                db,
                Question,
                question["id"],
                {
                    "task_id": task_id,
                    "question_type": question["question_type"],
                    "stem": question["stem"],
                    "analysis": question["analysis"],
                    "knowledge_points": json.dumps(question["knowledge_points"], ensure_ascii=False),
                    "difficulty": question["difficulty"],
                    "score": question["score"],
                    "error_type": question["error_type"],
                    "sort_order": index,
                },
            )
            for option_index, (label, content, is_correct) in enumerate(question["options"], start=1):
                upsert(
                    db,
                    QuestionOption,
                    f"{question['id']}_{label.lower()}",
                    {
                        "question_id": question["id"],
                        "label": label,
                        "content": content,
                        "is_correct": is_correct,
                        "sort_order": option_index,
                    },
                )

    upsert_one(
        db,
        StudentTaskProgress,
        {"assignment_id": "assign_se1_ds_linked_list_001", "student_id": "user_student_001"},
        {
            "status": "IN_PROGRESS",
            "passed_count": 2,
            "total_required_count": 5,
            "highest_hint_level": 1,
            "score": None,
        },
    )
    upsert_one(
        db,
        StudentTaskProgress,
        {"assignment_id": "assign_se1_ds_boundary_review_001", "student_id": "user_student_001"},
        {
            "status": "NOT_STARTED",
            "passed_count": 0,
            "total_required_count": 3,
            "highest_hint_level": 0,
            "score": None,
        },
    )
    upsert_one(
        db,
        StudentTaskProgress,
        {"assignment_id": "assign_se1_ds_stage_quiz_001", "student_id": "user_student_001"},
        {
            "status": "SUBMITTED",
            "passed_count": 2,
            "total_required_count": 3,
            "highest_hint_level": 0,
            "score": 76,
        },
    )
    upsert_one(
        db,
        StudentTaskProgress,
        {"assignment_id": "assign_se1_ds_stack_queue_preview_001", "student_id": "user_student_001"},
        {
            "status": "NOT_STARTED",
            "passed_count": 0,
            "total_required_count": 3,
            "highest_hint_level": 0,
            "score": None,
        },
    )
    upsert_one(
        db,
        StudentTaskProgress,
        {"assignment_id": "assign_se1_network_subnet_001", "student_id": "user_student_001"},
        {
            "status": "NOT_STARTED",
            "passed_count": 0,
            "total_required_count": 3,
            "highest_hint_level": 0,
            "score": None,
        },
    )
    upsert_one(
        db,
        StudentTaskProgress,
        {"assignment_id": "assign_se1_ml_overfitting_001", "student_id": "user_student_001"},
        {
            "status": "IN_PROGRESS",
            "passed_count": 1,
            "total_required_count": 3,
            "highest_hint_level": 1,
            "score": None,
        },
    )
    upsert_one(
        db,
        StudentTaskProgress,
        {"assignment_id": "assign_cs1_ds_linked_list_001", "student_id": "user_student_002"},
        {
            "status": "NEEDS_REVISION",
            "passed_count": 3,
            "total_required_count": 5,
            "highest_hint_level": 2,
            "score": None,
        },
    )

    # 课程大纲种子（§六 6.2）。章节标题与下面资料中心的 `chapter` 字符串、知识点名称
    # 与资料和 LearnerKnowledgeState 里的名字**逐字对齐** —— 知识点是按名称软关联的，
    # 差一个字就对不上，删除保护也就测不出来。
    #
    # 「第四章 栈与队列」下面那个知识点故意不被任何资料、题目或画像引用，
    # 用来演示和测试「没有引用的知识点可以删」这条路径。
    chapters = {
        "chp_ds_linear_list": {
            "course_id": "course_ds_001",
            "title": "第三章 线性表",
            "summary": "顺序表与链表的存储结构、基本操作和边界情况。",
            "sort_order": 0,
            "status": "ACTIVE",
            "created_by": "user_teacher_001",
        },
        "chp_ds_stack_queue": {
            "course_id": "course_ds_001",
            "title": "第四章 栈与队列",
            "summary": "栈与队列的顺序实现、链式实现和典型应用。",
            "sort_order": 1,
            "status": "ACTIVE",
            "created_by": "user_teacher_001",
        },
    }
    for chapter_id, values in chapters.items():
        upsert(db, CourseChapter, chapter_id, values)

    knowledge_points = {
        "kp_ds_linked_list_boundary": ("chp_ds_linear_list", "链表边界处理", "SKILL", "INTERMEDIATE", 0),
        "kp_ds_head_node_delete": ("chp_ds_linear_list", "头节点删除", "SKILL", "INTERMEDIATE", 1),
        "kp_ds_illegal_position": ("chp_ds_linear_list", "非法位置保护", "SKILL", "BASIC", 2),
        "kp_ds_pointer_traverse": ("chp_ds_linear_list", "指针遍历", "CONCEPT", "BASIC", 3),
        "kp_ds_boundary_test": ("chp_ds_linear_list", "边界测试", "SKILL", "INTERMEDIATE", 4),
        "kp_ds_stack_basic": ("chp_ds_stack_queue", "栈的基本操作", "CONCEPT", "BASIC", 0),
    }
    for point_id, (chapter_id, name, point_type, difficulty, order) in knowledge_points.items():
        upsert(
            db,
            CourseKnowledgePoint,
            point_id,
            {
                "course_id": "course_ds_001",
                "chapter_id": chapter_id,
                "name": name,
                "summary": "",
                "point_type": point_type,
                "difficulty": difficulty,
                "sort_order": order,
                "status": "ACTIVE",
                "created_by": "user_teacher_001",
            },
        )

    # 资料中心种子（§七）。知识点沿用课程里已有的名字（见上面的 questions 和
    # LearnerKnowledgeState），这样资料中心的知识点筛选器和学情诊断的知识点维度
    # 指向同一批名称，不会出现两套叫法。
    sources = {
        "kb_linked_list_delete_basic": (
            "单链表删除基本规则",
            "删除链表节点时，需要找到目标节点并维护相邻节点之间的连接关系。",
            "HIGH",
            "第三章 线性表",
            ["链表边界处理", "指针遍历"],
            "单链表删除的三步：定位前驱节点、改写前驱的 next、释放目标节点。"
            "定位时要同时持有前驱指针和当前指针，只有当前指针无法完成改链。"
            "释放前必须先把 next 接好，否则后半段链表会丢失。",
        ),
        "kb_head_node_delete": (
            "删除头节点时的链表起点更新",
            "删除第一个节点时，没有前驱节点，需要更新代表链表起点的头指针或返回新的头节点。",
            "HIGH",
            "第三章 线性表",
            ["头节点删除", "链表边界处理"],
            "头节点没有前驱，通用的改链写法在 position == 0 时不成立。"
            "两种正确做法：一是函数返回新的头指针并要求调用方接收；"
            "二是使用带哨兵的头结点，让头节点也有前驱，从而与中间节点走同一条分支。",
        ),
        "kb_empty_list_guard": (
            "空链表与非法位置保护",
            "空链表、负数位置和超过长度的位置都应先判断，避免空指针访问或错误修改。",
            "HIGH",
            "第三章 线性表",
            ["非法位置保护", "链表边界处理"],
            "进入循环前先判断 head == nullptr；position < 0 直接拒绝；"
            "遍历过程中每次前进都要检查当前指针是否已经为空，"
            "position 超过链表长度时应当原样返回而不是继续解引用。",
        ),
        "kb_boundary_test_reasoning": (
            "用边界测试验证链表删除",
            "链表删除不能只测试中间节点，还应覆盖头节点、尾节点、空链表和非法位置。",
            "MEDIUM",
            "第三章 线性表",
            ["边界测试", "链表边界处理"],
            "一组最小但完整的用例：空链表、单节点删第 0 个、删头节点、删尾节点、"
            "删中间节点、position 等于长度、position 为负数。"
            "只测中间节点的代码几乎必然在头节点上出错，因为那是唯一没有前驱的位置。",
        ),
        "kb_queue_fifo_basic": (
            "队列的先进先出规则",
            "队列是一种先进先出的线性结构，常用于任务排队、广度优先搜索和缓冲区。",
            "HIGH",
            "第三章 线性表",
            ["栈与队列", "队列", "循环队列"],
            "队列只允许在队尾入队，在队头出队，访问顺序遵循 FIFO。"
            "顺序队列容易出现假溢出，因此常使用循环队列复用数组空间。"
            "实现循环队列时需要明确 front、rear 的含义，并区分队空和队满状态。"
            "常见处理方式包括保留一个空位，或额外记录元素数量。",
        ),
    }
    for source_id, (title, summary, level, chapter, points, content) in sources.items():
        upsert(
            db,
            KnowledgeSource,
            source_id,
            {
                "course_id": "course_ds_001",
                "title": title,
                "summary": summary,
                "source_type": "TEACHER_NOTE",
                "version": "v0.1",
                "authority_level": level,
                "student_visible": True,
                "chapter": chapter,
                "knowledge_points": json.dumps(points, ensure_ascii=False),
                "content": content,
                "status": "ACTIVE",
                "ai_retrievable": True,
                "share_scope": "COURSE",
                "created_by": "user_teacher_001",
            },
        )

    graph_nodes_se1_ds = [
        {
            "id": "node-ds-linked",
            "label": "链表边界处理",
            "type": "知识点",
            "description": "处理头节点、空链表、尾节点和非法位置。",
            "difficulty": 3,
            "x": 430,
            "y": 270,
            "color": "#2563eb",
            "source": "ai",
        },
        {
            "id": "node-ds-head",
            "label": "头节点删除",
            "type": "方法",
            "description": "删除首节点时返回新的链表起点。",
            "difficulty": 3,
            "x": 430,
            "y": 95,
            "color": "#0f766e",
            "source": "ai",
        },
        {
            "id": "node-ds-pointer",
            "label": "指针遍历",
            "type": "概念",
            "description": "维护前驱指针和当前指针，避免断链。",
            "difficulty": 2,
            "x": 660,
            "y": 210,
            "color": "#2563eb",
            "source": "ai",
        },
        {
            "id": "node-ds-guard",
            "label": "非法位置保护",
            "type": "能力",
            "description": "识别空链表、负数位置和越界位置。",
            "difficulty": 2,
            "x": 610,
            "y": 430,
            "color": "#dc2626",
            "source": "ai",
        },
        {
            "id": "node-ds-test",
            "label": "边界测试",
            "type": "案例",
            "description": "用最小样例覆盖头、尾、空链表和越界。",
            "difficulty": 4,
            "x": 250,
            "y": 430,
            "color": "#d97706",
            "source": "ai",
        },
        {
            "id": "node-ds-stack",
            "label": "栈与队列",
            "type": "知识点",
            "description": "理解先进后出和先进先出，为下一章预习。",
            "difficulty": 2,
            "x": 200,
            "y": 210,
            "color": "#2563eb",
            "source": "ai",
        },
    ]
    graph_edges_se1_ds = [
        {"id": "edge-ds-head-linked", "source": "node-ds-head", "target": "node-ds-linked", "type": "前驱", "label": "前驱"},
        {"id": "edge-ds-pointer-linked", "source": "node-ds-pointer", "target": "node-ds-linked", "type": "前驱", "label": "前驱"},
        {"id": "edge-ds-linked-guard", "source": "node-ds-linked", "target": "node-ds-guard", "type": "后继", "label": "后继"},
        {"id": "edge-ds-linked-test", "source": "node-ds-linked", "target": "node-ds-test", "type": "后继", "label": "后继"},
        {"id": "edge-ds-test-stack", "source": "node-ds-test", "target": "node-ds-stack", "type": "相关", "label": "相关"},
    ]
    graph_nodes_cs1_ds = [
        {
            "id": "node-cs-tree",
            "label": "二叉树递归出口",
            "type": "知识点",
            "description": "识别空节点返回条件，避免递归无法终止。",
            "difficulty": 4,
            "x": 430,
            "y": 270,
            "color": "#2563eb",
            "source": "ai",
        },
        {
            "id": "node-cs-recursion",
            "label": "递归调用栈",
            "type": "概念",
            "description": "用小树跟踪函数入栈和返回顺序。",
            "difficulty": 3,
            "x": 430,
            "y": 95,
            "color": "#2563eb",
            "source": "ai",
        },
        {
            "id": "node-cs-preorder",
            "label": "前序遍历",
            "type": "方法",
            "description": "按根、左、右顺序访问节点。",
            "difficulty": 3,
            "x": 660,
            "y": 250,
            "color": "#0f766e",
            "source": "ai",
        },
        {
            "id": "node-cs-stack",
            "label": "栈匹配边界",
            "type": "能力",
            "description": "处理空栈、右括号先出现和结束后剩余元素。",
            "difficulty": 3,
            "x": 275,
            "y": 420,
            "color": "#dc2626",
            "source": "ai",
        },
    ]
    graph_edges_cs1_ds = [
        {"id": "edge-cs-rec-tree", "source": "node-cs-recursion", "target": "node-cs-tree", "type": "前驱", "label": "前驱"},
        {"id": "edge-cs-tree-preorder", "source": "node-cs-tree", "target": "node-cs-preorder", "type": "后继", "label": "后继"},
        {"id": "edge-cs-tree-stack", "source": "node-cs-tree", "target": "node-cs-stack", "type": "相关", "label": "相关"},
    ]
    graph_nodes_network = [
        {
            "id": "node-py-function",
            "label": "Python 函数",
            "type": "概念",
            "description": "用函数封装可复用的数据处理逻辑。",
            "difficulty": 2,
            "x": 430,
            "y": 270,
            "color": "#2563eb",
            "source": "ai",
        },
        {
            "id": "node-py-list",
            "label": "列表遍历",
            "type": "知识点",
            "description": "按顺序访问样本并累计统计量。",
            "difficulty": 3,
            "x": 430,
            "y": 95,
            "color": "#2563eb",
            "source": "ai",
        },
        {
            "id": "node-py-stats",
            "label": "字典查找",
            "type": "方法",
            "description": "记录已访问元素并查找互补值。",
            "difficulty": 3,
            "x": 660,
            "y": 270,
            "color": "#7c3aed",
            "source": "ai",
        },
        {
            "id": "node-py-empty",
            "label": "重复元素处理",
            "type": "案例",
            "description": "区分元素值相同与下标不能复用。",
            "difficulty": 4,
            "x": 250,
            "y": 420,
            "color": "#d97706",
            "source": "ai",
        },
    ]
    graph_edges_network = [
        {"id": "edge-py-list-function", "source": "node-py-list", "target": "node-py-function", "type": "前驱", "label": "前驱"},
        {"id": "edge-py-function-stats", "source": "node-py-function", "target": "node-py-stats", "type": "后继", "label": "后继"},
        {"id": "edge-py-stats-empty", "source": "node-py-stats", "target": "node-py-empty", "type": "后继", "label": "后继"},
    ]
    graph_nodes_ml = [
        {
            "id": "node-ml-split",
            "label": "数据集划分",
            "type": "概念",
            "description": "区分训练集、验证集和测试集的用途。",
            "difficulty": 3,
            "x": 420,
            "y": 110,
            "color": "#2563eb",
            "source": "ai",
        },
        {
            "id": "node-ml-overfit",
            "label": "过拟合",
            "type": "知识点",
            "description": "训练表现好但泛化表现差的典型风险。",
            "difficulty": 4,
            "x": 430,
            "y": 285,
            "color": "#dc2626",
            "source": "ai",
        },
        {
            "id": "node-ml-regularization",
            "label": "正则化",
            "type": "方法",
            "description": "通过约束模型复杂度降低过拟合风险。",
            "difficulty": 4,
            "x": 660,
            "y": 300,
            "color": "#0f766e",
            "source": "ai",
        },
        {
            "id": "node-ml-evaluation",
            "label": "模型评估",
            "type": "能力",
            "description": "用合适的数据划分和指标判断泛化能力。",
            "difficulty": 3,
            "x": 245,
            "y": 360,
            "color": "#7c3aed",
            "source": "ai",
        },
    ]
    graph_edges_ml = [
        {"id": "edge-ml-split-eval", "source": "node-ml-split", "target": "node-ml-evaluation", "type": "前驱", "label": "前驱"},
        {"id": "edge-ml-eval-overfit", "source": "node-ml-evaluation", "target": "node-ml-overfit", "type": "后继", "label": "后继"},
        {"id": "edge-ml-overfit-regularization", "source": "node-ml-overfit", "target": "node-ml-regularization", "type": "后继", "label": "后继"},
    ]
    student_graphs = {
        "kg_ta_se1_ds_001": {
            "teaching_assignment_id": "ta_se1_ds_001",
            "class_id": "class_se_001",
            "course_id": "course_ds_001",
            "teacher_id": "user_teacher_001",
            "title": "数据结构知识图谱",
            "description": "人工智能 1 班当前围绕链表边界处理、测试验证和栈队列预习展开。",
            "status": "published",
            "target_classes": json.dumps(["人工智能 1 班"], ensure_ascii=False),
            "source_files": json.dumps(
                [
                    {"filename": "第三章线性表讲义.md", "mime_type": "text/markdown", "size_bytes": 18432},
                    {"filename": "链表删除边界用例.txt", "mime_type": "text/plain", "size_bytes": 8192},
                ],
                ensure_ascii=False,
            ),
            "source_summary": "本图谱来自第三章线性表资料和链表删除任务诊断，重点标出头节点删除、指针遍历和边界测试之间的依赖关系。",
            "nodes_json": json.dumps(graph_nodes_se1_ds, ensure_ascii=False),
            "edges_json": json.dumps(graph_edges_se1_ds, ensure_ascii=False),
            "published_at": datetime(2026, 8, 1, 9, 30, tzinfo=timezone.utc),
        },
        "kg_ta_cs1_ds_001": {
            "teaching_assignment_id": "ta_cs1_ds_001",
            "class_id": "class_cs_001",
            "course_id": "course_ds_001",
            "teacher_id": "user_teacher_001",
            "title": "数据结构递归与栈图谱",
            "description": "人工智能 2 班当前更关注二叉树递归出口和栈匹配边界。",
            "status": "published",
            "target_classes": json.dumps(["人工智能 2 班"], ensure_ascii=False),
            "source_files": json.dumps(
                [{"filename": "树与栈专项复盘.md", "mime_type": "text/markdown", "size_bytes": 12320}],
                ensure_ascii=False,
            ),
            "source_summary": "本图谱根据人工智能 2 班近期诊断结果调整，突出递归出口、前序遍历和栈匹配边界之间的关联。",
            "nodes_json": json.dumps(graph_nodes_cs1_ds, ensure_ascii=False),
            "edges_json": json.dumps(graph_edges_cs1_ds, ensure_ascii=False),
            "published_at": datetime(2026, 8, 2, 10, 0, tzinfo=timezone.utc),
        },
        "kg_ta_se1_network_001": {
            "teaching_assignment_id": "ta_se1_network_001",
            "class_id": "class_se_001",
            "course_id": "course_network_001",
            "teacher_id": "user_teacher_002",
            "title": "Python 程序设计数据处理知识图谱",
            "description": "人工智能 1 班 Python 程序设计课程的列表与字典查找学习路径。",
            "status": "published",
            "target_classes": json.dumps(["人工智能 1 班"], ensure_ascii=False),
            "source_files": json.dumps(
                [{"filename": "Python列表与字典查找讲义.pdf", "mime_type": "application/pdf", "size_bytes": 245760}],
                ensure_ascii=False,
            ),
            "source_summary": "本图谱来自 Python 列表与字典查找资料，帮助学生按函数封装、列表遍历、字典查找和重复元素处理的顺序复习。",
            "nodes_json": json.dumps(graph_nodes_network, ensure_ascii=False),
            "edges_json": json.dumps(graph_edges_network, ensure_ascii=False),
            "published_at": datetime(2026, 8, 3, 9, 0, tzinfo=timezone.utc),
        },
        "kg_ta_se1_ml_001": {
            "teaching_assignment_id": "ta_se1_ml_001",
            "class_id": "class_se_001",
            "course_id": "course_arch_001",
            "teacher_id": "user_teacher_001",
            "title": "机器学习模型评估知识图谱",
            "description": "人工智能 1 班机器学习课程的过拟合、正则化和数据集划分学习路径。",
            "status": "published",
            "target_classes": json.dumps(["人工智能 1 班"], ensure_ascii=False),
            "source_files": json.dumps(
                [{"filename": "机器学习模型评估讲义.md", "mime_type": "text/markdown", "size_bytes": 16384}],
                ensure_ascii=False,
            ),
            "source_summary": "本图谱来自机器学习模型评估资料，帮助学生先区分数据集用途，再理解过拟合和正则化之间的关系。",
            "nodes_json": json.dumps(graph_nodes_ml, ensure_ascii=False),
            "edges_json": json.dumps(graph_edges_ml, ensure_ascii=False),
            "published_at": datetime(2026, 8, 3, 10, 0, tzinfo=timezone.utc),
        },
    }
    for graph_id, values in student_graphs.items():
        upsert(db, StudentKnowledgeGraph, graph_id, values)

    profile_snapshots = {
        "profile_user_student_001_ds": {
            "student_id": "user_student_001",
            "course_id": "course_ds_001",
            "class_id": "class_se_001",
            "summary_text": "链表边界处理是当前主要薄弱点，建议先复盘删除头节点和非法位置两个场景。",
            "overall_progress": 62,
            "hint_dependency_level": "MEDIUM",
            "compile_error_rate": 0.18,
            "logic_error_rate": 0.42,
            "recent_task_completion": 0.67,
            "recommendation_text": "先完成链表边界专项复盘，再进入栈与队列练习。",
        },
        "profile_user_student_001_network": {
            "student_id": "user_student_001",
            "course_id": "course_network_001",
            "class_id": "class_se_001",
            "summary_text": "Python 程序设计数据较少，列表遍历和字典查找需要通过后续练习继续确认。",
            "overall_progress": 48,
            "hint_dependency_level": "LOW",
            "compile_error_rate": 0,
            "logic_error_rate": 0.22,
            "recent_task_completion": 0.35,
            "recommendation_text": "建议完成一次 Python 列表与字典查找练习，并重点检查不能复用同一元素的分支。",
        },
        "profile_user_student_001_ml": {
            "student_id": "user_student_001",
            "course_id": "course_arch_001",
            "class_id": "class_se_001",
            "summary_text": "机器学习中的过拟合与正则化仍是当前主要薄弱点，建议先复盘数据集划分和模型评估。",
            "overall_progress": 58,
            "hint_dependency_level": "MEDIUM",
            "compile_error_rate": 0,
            "logic_error_rate": 0.36,
            "recent_task_completion": 0.5,
            "recommendation_text": "先完成过拟合与正则化概念测验，再生成一份模型评估复习笔记。",
        },
        "profile_user_student_002_ds": {
            "student_id": "user_student_002",
            "course_id": "course_ds_001",
            "class_id": "class_cs_001",
            "summary_text": "刘同学的链表定位已经基本稳定，当前更需要巩固递归出口和栈匹配中的边界判断。",
            "overall_progress": 74,
            "hint_dependency_level": "HIGH",
            "compile_error_rate": 0.08,
            "logic_error_rate": 0.31,
            "recent_task_completion": 0.58,
            "recommendation_text": "先复盘二叉树递归出口，再完成括号匹配边界练习。",
        },
    }
    for profile_id, values in profile_snapshots.items():
        upsert(db, LearnerProfileSnapshot, profile_id, values)

    practice_path_steps = [
        {"title": "画像推理", "description": "读取课程表现、错因、资料保存和学习兴趣，自动判断科研入口方向"},
        {"title": "课题推荐", "description": "系统生成最适合课题和备选课题，学生无需手动选择研究方向"},
        {"title": "前沿追踪", "description": "归纳相关论文与研究动态，生成热点主题和发展趋势"},
        {"title": "写作辅助", "description": "生成综述脉络、论文框架、语言润色和格式检查建议"},
        {"title": "数据分析", "description": "处理实验数据、调查结果或文本资料，输出图表和研究洞察"},
        {"title": "成果沉淀", "description": "提交论文框架、分析报告、图表和过程记录，更新科研画像"},
    ]
    practice_projects = {
        "sales-cleaning": {
            "course_id": "course_arch_001",
            "title": "基于公开数据集的图像分类对比研究",
            "description": "系统根据机器学习画像自动匹配的科研课题，覆盖前沿追踪、实验对比、图表分析和论文框架。",
            "long_description": "围绕 CIFAR-10 图像分类任务，自动聚合近期轻量模型研究动态，完成 ResNet-18 与 EfficientNet-B0 的实验对比、指标可视化、结论提炼和论文框架沉淀。",
            "project_type": "RESEARCH_PRACTICE",
            "difficulty": "MEDIUM",
            "direction": "计算机视觉 + 画像自动推荐",
            "period_label": "2 周",
            "current_stage": "P3 实验分析",
            "total_stage_count": 6,
            "accent": "blue",
            "tags_json": json.dumps(["画像匹配", "前沿追踪", "数据分析"], ensure_ascii=False),
            "member_names_json": json.dumps(["AI", "王"], ensure_ascii=False),
            "capability_points_json": json.dumps(["论文阅读", "模型评估", "实验记录", "可视化表达", "论文写作"], ensure_ascii=False),
            "path_steps_json": json.dumps(practice_path_steps, ensure_ascii=False),
            "task_sections_json": json.dumps(
                [
                    {
                        "title": "画像推理结论",
                        "description": "画像显示你在机器学习模型评估、实验记录和图表解释上已有连续证据，适合进入计算机视觉方向科研训练。",
                        "icon": "target",
                    },
                    {
                        "title": "当前科研任务",
                        "description": "在 ResNet-18 与 EfficientNet-B0 上完成模型训练与对比，记录训练过程与关键实验指标，分析模型性能差异，并撰写对比分析结论。",
                        "icon": "bot",
                    },
                    {
                        "title": "研究对象 / 数据来源",
                        "description": "CIFAR-10 图像分类公开数据集，结合课程知识库中的实验指南和模型评估规范。",
                        "action": "查看前沿追踪",
                        "icon": "database",
                    },
                    {
                        "title": "方法要求",
                        "description": "使用深度学习框架实现训练模型，至少包含训练过程、验证指标、召回率、F1 等指标评估。",
                        "icon": "workflow",
                    },
                    {
                        "title": "成果要求",
                        "description": "完成前沿归纳、文献综述框架、实验数据分析、可视化图表、阶段研究结论和下一步计划。",
                        "icon": "file-check",
                    },
                ],
                ensure_ascii=False,
            ),
            "submission_requirements_json": json.dumps(
                ["文献综述 / 论文框架", "实验数据分析报告", "趋势图谱或指标图表", "阶段研究结论"],
                ensure_ascii=False,
            ),
            "acceptance_criteria_json": json.dumps(
                ["前沿追踪有来源", "论文框架结构完整", "数据分析图表可解释", "结论不脱离实验或资料证据"],
                ensure_ascii=False,
            ),
            "mentor_tips_json": json.dumps(
                ["EfficientNet-B0 的提升主要体现在动物类别召回率，但交通工具类别混淆仍明显。", "只报告 Accuracy 不足以支撑研究结论，需要补充 Macro F1 与混淆矩阵解释。", "下一步建议把数据增强作为消融实验，避免把性能提升全部归因于模型结构。"],
                ensure_ascii=False,
            ),
            "resources_json": json.dumps(
                [
                    {"title": "CIFAR-10 数据集说明", "meta": "课程知识库 · 数据集来源"},
                    {"title": "图像分类实验指南", "meta": "教师资料 · 实验规范"},
                    {"title": "轻量模型对比综述", "meta": "文献摘要样例 · 相关工作"},
                ],
                ensure_ascii=False,
            ),
            "status": "ACTIVE",
            "sort_order": 1,
        },
        "log-topk": {
            "course_id": "course_ds_001",
            "title": "面向日志异常检测的 Top-K 方法研究",
            "description": "面向数据结构薄弱点推荐的轻量研究课题，训练算法分析、文本资料处理和结果解释能力。",
            "long_description": "基于脱敏服务日志，比较哈希表、堆结构与排序策略在 Top-K 异常定位中的效果，形成方法对比、实验图表和研究报告。",
            "project_type": "RESEARCH_PRACTICE",
            "difficulty": "BASIC",
            "direction": "数据结构 + 科研入门",
            "period_label": "1 周",
            "current_stage": "P1 资料归纳",
            "total_stage_count": 6,
            "accent": "cyan",
            "tags_json": json.dumps(["文本资料", "Top-K", "方法对比"], ensure_ascii=False),
            "member_names_json": json.dumps(["AI", "陈"], ensure_ascii=False),
            "capability_points_json": json.dumps(["文献归纳", "复杂度分析", "文本处理", "图表解释"], ensure_ascii=False),
            "path_steps_json": json.dumps(practice_path_steps, ensure_ascii=False),
            "task_sections_json": json.dumps(
                [
                    {"title": "画像推理结论", "description": "画像显示你在链表和复杂度表达上仍需强化，Top-K 日志课题可以把数据结构知识转成科研分析证据。", "icon": "target"},
                    {"title": "当前科研任务", "description": "读取脱敏服务日志，比较 Top-K 方法在异常定位中的效果，并解释高频错误路径的研究意义。", "icon": "bot"},
                    {"title": "研究对象 / 数据来源", "description": "脱敏后的接口访问日志，包含路径、状态码、耗时和错误摘要。", "action": "查看前沿追踪", "icon": "database"},
                    {"title": "成果要求", "description": "完成方法对比、文本资料处理、趋势图表、复杂度说明和研究报告。", "icon": "file-check"},
                ],
                ensure_ascii=False,
            ),
            "submission_requirements_json": json.dumps(["文献综述 / 论文框架", "文本数据分析报告", "趋势图谱或指标图表", "阶段研究结论"], ensure_ascii=False),
            "acceptance_criteria_json": json.dumps(["前沿追踪有来源", "方法对比结构完整", "文本分析图表可解释", "结论有日志证据"], ensure_ascii=False),
            "mentor_tips_json": json.dumps(["异常高度集中在登录和提交接口，建议优先检查限流、超时与参数校验。", "堆维护方案适合增量日志，但首版报告需要先给出全量排序基线。", "文本错误摘要可作为后续语义聚类的扩展入口。"], ensure_ascii=False),
            "resources_json": json.dumps(
                [
                    {"title": "Top-K 问题实现指南", "meta": "课程知识库 · 算法方法"},
                    {"title": "服务日志字段说明", "meta": "项目资料 · 数据字典"},
                    {"title": "日志异常检测研究摘要", "meta": "文献摘要样例 · 前沿追踪"},
                ],
                ensure_ascii=False,
            ),
            "status": "ACTIVE",
            "sort_order": 2,
        },
        "retention-dashboard": {
            "course_id": "course_network_001",
            "title": "学习行为数据留存与影响因素分析",
            "description": "面向 Python 数据处理能力推荐的科研数据分析课题，输出调查数据分析和可视化结论。",
            "long_description": "围绕用户行为数据构建留存分析指标，完成趋势分析、图表表达和业务解释，沉淀可展示的产品分析成果。",
            "project_type": "RESEARCH_PRACTICE",
            "difficulty": "MEDIUM",
            "direction": "教育数据分析 + 画像推荐",
            "period_label": "3 周",
            "current_stage": "P4 结论提炼",
            "total_stage_count": 6,
            "accent": "violet",
            "tags_json": json.dumps(["调查数据", "可视化", "结论洞察"], ensure_ascii=False),
            "member_names_json": json.dumps(["AI", "周"], ensure_ascii=False),
            "capability_points_json": json.dumps(["指标口径", "Python 分析", "趋势图表", "研究结论"], ensure_ascii=False),
            "path_steps_json": json.dumps(practice_path_steps, ensure_ascii=False),
            "task_sections_json": json.dumps(
                [
                    {"title": "画像推理结论", "description": "画像显示你在 Python 数据处理和图表表达上已有基础，适合进入调查/行为数据分析型科研任务。", "icon": "target"},
                    {"title": "当前科研任务", "description": "构建次日和 7 日留存指标，解释不同学习行为对后续提交质量的影响。", "icon": "bot"},
                    {"title": "研究对象 / 数据来源", "description": "模拟学习行为明细，包含注册、访问、学习、资料保存和提交事件。", "action": "查看前沿追踪", "icon": "database"},
                    {"title": "成果要求", "description": "完成指标口径、趋势分析、可视化图表、影响因素解释和研究结论。", "icon": "file-check"},
                ],
                ensure_ascii=False,
            ),
            "submission_requirements_json": json.dumps(["文献综述 / 论文框架", "调查数据分析报告", "趋势图谱或指标图表", "阶段研究结论"], ensure_ascii=False),
            "acceptance_criteria_json": json.dumps(["前沿追踪有来源", "研究问题清晰", "数据分析图表可解释", "结论不脱离指标证据"], ensure_ascii=False),
            "mentor_tips_json": json.dumps(["保存学习资料与 7 日留存存在正相关，但不能直接解释为因果关系。", "任务难度是主要混杂因素，报告中需要按课程或难度分组呈现。", "下一步适合补充一张分组趋势图，说明不同学习行为的留存差异。"], ensure_ascii=False),
            "resources_json": json.dumps(
                [
                    {"title": "留存指标口径说明", "meta": "项目资料 · 指标定义"},
                    {"title": "Python 分组聚合示例", "meta": "课程知识库 · 分析方法"},
                    {"title": "学习分析研究摘要", "meta": "文献摘要样例 · 前沿追踪"},
                ],
                ensure_ascii=False,
            ),
            "status": "ACTIVE",
            "sort_order": 3,
        },
    }
    for project_id, values in practice_projects.items():
        upsert(db, PracticeProject, project_id, values)

    practice_enrollments = [
        (
            {"project_id": "sales-cleaning", "student_id": "user_student_001"},
            {
                "class_id": "class_se_001",
                "status": "IN_PROGRESS",
                "progress": 62,
                "completed_stage_count": 3,
                "experiment_record_count": 8,
                "submission_count": 2,
                "weekly_hours": 6.2,
                "last_activity_summary": "AI 已生成实验对比图与论文框架建议",
            },
        ),
        (
            {"project_id": "log-topk", "student_id": "user_student_001"},
            {
                "class_id": "class_se_001",
                "status": "NOT_STARTED",
                "progress": 12,
                "completed_stage_count": 0,
                "experiment_record_count": 0,
                "submission_count": 0,
                "weekly_hours": 1.1,
                "last_activity_summary": "系统判断可作为第二推荐课题",
            },
        ),
        (
            {"project_id": "retention-dashboard", "student_id": "user_student_001"},
            {
                "class_id": "class_se_001",
                "status": "IN_PROGRESS",
                "progress": 86,
                "completed_stage_count": 5,
                "experiment_record_count": 11,
                "submission_count": 4,
                "weekly_hours": 7.3,
                "last_activity_summary": "AI 已完成关键波动解释草稿",
            },
        ),
    ]
    for filters, values in practice_enrollments:
        upsert_one(db, PracticeProjectEnrollment, filters, values)

    practice_submissions = {
        "practice_submit_sales_001": {
            "project_id": "sales-cleaning",
            "student_id": "user_student_001",
            "title": "v1.1 模型训练与前沿摘录",
            "description": "提交内容：ResNet-18 基线训练代码、初步日志和轻量模型前沿摘录。",
            "status": "APPROVED",
            "review_comment": "训练流程完整，建议补充模型对比维度和论文框架。",
            "content_json": json.dumps({"items": ["代码", "训练日志", "前沿摘录"]}, ensure_ascii=False),
            "submitted_at": datetime(2026, 5, 16, 18, 20, tzinfo=timezone.utc),
        },
        "practice_submit_sales_002": {
            "project_id": "sales-cleaning",
            "student_id": "user_student_001",
            "title": "v1.2 实验分析记录",
            "description": "提交内容：模型对比表、学习曲线、结论草稿；评审意见：建议补充前沿综述引用和消融实验说明。",
            "status": "APPROVED",
            "review_comment": "指标达标，建议补充前沿综述引用和消融实验说明。",
            "content_json": json.dumps({"items": ["实验记录", "学习曲线", "论文框架"]}, ensure_ascii=False),
            "submitted_at": datetime(2026, 5, 17, 14, 32, tzinfo=timezone.utc),
        },
    }
    for submission_id, values in practice_submissions.items():
        upsert(db, PracticeProjectSubmission, submission_id, values)

    practice_activities = {
        "practice_activity_sales_submit": {
            "project_id": "sales-cleaning",
            "student_id": "user_student_001",
            "activity_type": "submit",
            "text": "你提交了 v1.2 实验分析记录",
            "time_label": "今天 16:42",
            "created_at": datetime(2026, 5, 17, 16, 42, tzinfo=timezone.utc),
        },
        "practice_activity_sales_ai": {
            "project_id": "sales-cleaning",
            "student_id": "user_student_001",
            "activity_type": "success",
            "text": "AI 助研生成了模型对比图与结论草稿",
            "time_label": "今天 15:30",
            "created_at": datetime(2026, 5, 17, 15, 30, tzinfo=timezone.utc),
        },
        "practice_activity_retention_comment": {
            "project_id": "retention-dashboard",
            "student_id": "user_student_001",
            "activity_type": "comment",
            "text": "系统更新了留存分析的关键波动解释",
            "time_label": "昨天 18:37",
            "created_at": datetime(2026, 5, 16, 18, 37, tzinfo=timezone.utc),
        },
        "practice_activity_log_join": {
            "project_id": "log-topk",
            "student_id": "user_student_001",
            "activity_type": "join",
            "text": "AI 将 Top-K 日志研究列为备选课题",
            "time_label": "05-16 15:42",
            "created_at": datetime(2026, 5, 16, 15, 42, tzinfo=timezone.utc),
        },
    }
    for activity_id, values in practice_activities.items():
        upsert(db, PracticeProjectActivity, activity_id, values)

    knowledge_states = [
        (
            {"student_id": "user_student_001", "course_id": "course_ds_001", "knowledge_point": "链表边界处理"},
            {
                "mastery_score": 52,
                "state": "WEAK",
                "evidence_count": 3,
                "last_evidence": "单链表删除任务中头节点用例失败",
            },
        ),
        (
            {"student_id": "user_student_001", "course_id": "course_ds_001", "knowledge_point": "指针遍历"},
            {
                "mastery_score": 78,
                "state": "STABLE",
                "evidence_count": 2,
                "last_evidence": "中间节点删除公开用例通过",
            },
        ),
        (
            {"student_id": "user_student_001", "course_id": "course_network_001", "knowledge_point": "Python 列表与字典查找"},
            {
                "mastery_score": 54,
                "state": "WEAK",
                "evidence_count": 1,
                "last_evidence": "自学记录显示仍需练习字典记录和重复元素分支",
            },
        ),
        (
            {"student_id": "user_student_001", "course_id": "course_arch_001", "knowledge_point": "过拟合与正则化"},
            {
                "mastery_score": 52,
                "state": "WEAK",
                "evidence_count": 2,
                "last_evidence": "机器学习概念测验中正则化作用解释不完整",
            },
        ),
        (
            {"student_id": "user_student_001", "course_id": "course_arch_001", "knowledge_point": "数据集划分"},
            {
                "mastery_score": 60,
                "state": "STABLE",
                "evidence_count": 2,
                "last_evidence": "能够基本区分训练集、验证集和测试集用途",
            },
        ),
        (
            {"student_id": "user_student_002", "course_id": "course_ds_001", "knowledge_point": "链表定位"},
            {
                "mastery_score": 82,
                "state": "STABLE",
                "evidence_count": 4,
                "last_evidence": "单链表删除任务中普通位置和尾节点用例通过",
            },
        ),
        (
            {"student_id": "user_student_002", "course_id": "course_ds_001", "knowledge_point": "二叉树递归出口"},
            {
                "mastery_score": 49,
                "state": "WEAK",
                "evidence_count": 2,
                "last_evidence": "前序遍历练习中空节点返回条件遗漏",
            },
        ),
        (
            {"student_id": "user_student_002", "course_id": "course_ds_001", "knowledge_point": "栈匹配边界"},
            {
                "mastery_score": 57,
                "state": "WEAK",
                "evidence_count": 2,
                "last_evidence": "括号匹配中右括号先出现的用例处理不稳定",
            },
        ),
    ]
    for filters, values in knowledge_states:
        upsert_one(db, LearnerKnowledgeState, filters, values)

    error_stats = [
        (
            {"student_id": "user_student_001", "course_id": "course_ds_001", "error_type": "HEAD_NODE_RETURN_MISSING"},
            {
                "label": "头节点返回值遗漏",
                "count": 3,
                "severity": "HIGH",
                "related_knowledge_points": json.dumps(["链表", "边界处理"], ensure_ascii=False),
            },
        ),
        (
            {"student_id": "user_student_001", "course_id": "course_ds_001", "error_type": "BOUNDARY_CASE_MISSING"},
            {
                "label": "边界用例覆盖不足",
                "count": 2,
                "severity": "MEDIUM",
                "related_knowledge_points": json.dumps(["链表边界处理"], ensure_ascii=False),
            },
        ),
        (
            {"student_id": "user_student_001", "course_id": "course_network_001", "error_type": "PYTHON_REUSE_GUARD_MISSING"},
            {
                "label": "复用同一元素判断不足",
                "count": 2,
                "severity": "MEDIUM",
                "related_knowledge_points": json.dumps(["Python 列表与字典查找", "下标判断"], ensure_ascii=False),
            },
        ),
        (
            {"student_id": "user_student_001", "course_id": "course_arch_001", "error_type": "TRAIN_VALID_TEST_CONFUSION"},
            {
                "label": "训练集、验证集、测试集混淆",
                "count": 3,
                "severity": "HIGH",
                "related_knowledge_points": json.dumps(["数据集划分", "模型评估"], ensure_ascii=False),
            },
        ),
        (
            {"student_id": "user_student_001", "course_id": "course_arch_001", "error_type": "REGULARIZATION_PURPOSE_CONFUSION"},
            {
                "label": "正则化作用理解不清",
                "count": 2,
                "severity": "MEDIUM",
                "related_knowledge_points": json.dumps(["过拟合与正则化"], ensure_ascii=False),
            },
        ),
        (
            {"student_id": "user_student_002", "course_id": "course_ds_001", "error_type": "RECURSION_BASE_CASE_MISSING"},
            {
                "label": "递归出口遗漏",
                "count": 4,
                "severity": "HIGH",
                "related_knowledge_points": json.dumps(["二叉树", "递归"], ensure_ascii=False),
            },
        ),
        (
            {"student_id": "user_student_002", "course_id": "course_ds_001", "error_type": "STACK_EMPTY_GUARD_MISSING"},
            {
                "label": "栈空判断不足",
                "count": 2,
                "severity": "MEDIUM",
                "related_knowledge_points": json.dumps(["栈与队列", "括号匹配"], ensure_ascii=False),
            },
        ),
    ]
    for filters, values in error_stats:
        upsert_one(db, LearnerErrorStat, filters, values)

    upsert(
        db,
        Recommendation,
        "rec_user_student_001_ds_boundary",
        {
            "student_id": "user_student_001",
            "course_id": "course_ds_001",
            "recommendation_type": "REVIEW",
            "title": "完成链表边界专项复盘",
            "reason": "最近提交暴露删除头节点时链表起点未更新的问题。",
            "priority": 10,
            "related_task_id": "task_linked_list_delete_001",
            "related_knowledge_points": json.dumps(["链表", "边界处理"], ensure_ascii=False),
            "suggested_action": "OPEN_SELF_STUDY",
            "status": "ACTIVE",
        },
    )
    upsert(
        db,
        Recommendation,
        "rec_user_student_002_ds_tree_recursion",
        {
            "student_id": "user_student_002",
            "course_id": "course_ds_001",
            "recommendation_type": "SELF_STUDY",
            "title": "复盘二叉树递归出口",
            "reason": "最近练习暴露空节点返回条件遗漏，建议先用小树手动画调用栈。",
            "priority": 10,
            "related_task_id": "task_linked_list_delete_001",
            "related_knowledge_points": json.dumps(["二叉树", "递归"], ensure_ascii=False),
            "suggested_action": "OPEN_SELF_STUDY",
            "status": "ACTIVE",
        },
    )
    upsert(
        db,
        Recommendation,
        "rec_user_student_002_ds_stack_match",
        {
            "student_id": "user_student_002",
            "course_id": "course_ds_001",
            "recommendation_type": "REVIEW",
            "title": "补一组栈匹配边界用例",
            "reason": "右括号先出现和空栈匹配需要单独验证，避免只通过普通嵌套样例。",
            "priority": 8,
            "related_task_id": "task_linked_list_delete_001",
            "related_knowledge_points": json.dumps(["栈与队列", "边界处理"], ensure_ascii=False),
            "suggested_action": "GENERATE_EXERCISE",
            "status": "ACTIVE",
        },
    )
    upsert(
        db,
        Recommendation,
        "rec_user_student_001_ml_overfitting",
        {
            "student_id": "user_student_001",
            "course_id": "course_arch_001",
            "recommendation_type": "REVIEW",
            "title": "完成过拟合与正则化专项复盘",
            "reason": "最近回答暴露训练集、验证集、测试集用途混淆，正则化作用解释不完整。",
            "priority": 10,
            "related_task_id": "task_ml_overfitting_quiz_001",
            "related_knowledge_points": json.dumps(["过拟合与正则化", "模型评估"], ensure_ascii=False),
            "suggested_action": "OPEN_SELF_STUDY",
            "status": "ACTIVE",
        },
    )
    upsert(
        db,
        Recommendation,
        "rec_user_student_001_python_stats",
        {
            "student_id": "user_student_001",
            "course_id": "course_network_001",
            "recommendation_type": "TASK",
            "title": "完成 Python 列表与字典查找练习",
            "reason": "字典记录和不能复用同一元素的分支还不稳定，建议先做一组小样本查找。",
            "priority": 8,
            "related_task_id": "task_subnet_mask_001",
            "related_knowledge_points": json.dumps(["Python 列表与字典查找", "下标判断"], ensure_ascii=False),
            "suggested_action": "OPEN_TASK",
            "status": "ACTIVE",
        },
    )

    student_behavior_events = {
        "evt_user_student_001_ds_hint_viewed": {
            "student_id": "user_student_001",
            "course_id": "course_ds_001",
            "class_id": "class_se_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "assignment_id": "assign_se1_ds_linked_list_001",
            "task_id": "task_linked_list_delete_001",
            "event_type": "HINT_VIEWED",
            "knowledge_points": ["链表", "边界处理"],
            "error_type": "HEAD_NODE_RETURN_MISSING",
            "payload": {"hint_level": 1, "source": "seed", "duration_minutes": 18},
            "created_at": datetime(2026, 8, 26, 12, 35, tzinfo=timezone.utc),
        },
        "evt_user_student_001_ds_execution_finished": {
            "student_id": "user_student_001",
            "course_id": "course_ds_001",
            "class_id": "class_se_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "assignment_id": "assign_se1_ds_linked_list_001",
            "task_id": "task_linked_list_delete_001",
            "event_type": "EXECUTION_FINISHED",
            "knowledge_points": ["链表", "指针更新"],
            "error_type": "BOUNDARY_CASE_MISSING",
            "payload": {"passed_count": 2, "total_count": 5, "duration_minutes": 34, "source": "seed"},
            "created_at": datetime(2026, 8, 27, 13, 12, tzinfo=timezone.utc),
        },
        "evt_user_student_001_ds_question_set": {
            "student_id": "user_student_001",
            "course_id": "course_ds_001",
            "class_id": "class_se_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "assignment_id": "assign_se1_ds_stage_quiz_001",
            "task_id": "task_linked_list_stage_quiz_001",
            "event_type": "QUESTION_SET_SUBMITTED",
            "knowledge_points": ["边界测试", "链表"],
            "error_type": None,
            "payload": {"score_percent": 76, "duration_minutes": 28, "source": "seed"},
            "created_at": datetime(2026, 8, 28, 11, 48, tzinfo=timezone.utc),
        },
        "evt_user_student_001_ds_artifact_saved": {
            "student_id": "user_student_001",
            "course_id": "course_ds_001",
            "class_id": "class_se_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "assignment_id": None,
            "task_id": None,
            "event_type": "artifact_saved",
            "knowledge_points": ["链表", "边界处理"],
            "error_type": None,
            "payload": {"resource_title": "链表删除边界复习卡", "duration_minutes": 22, "source": "seed"},
            "created_at": datetime(2026, 8, 29, 8, 20, tzinfo=timezone.utc),
        },
        "evt_user_student_001_ds_practice_submitted": {
            "student_id": "user_student_001",
            "course_id": "course_ds_001",
            "class_id": "class_se_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "assignment_id": None,
            "task_id": None,
            "event_type": "GENERATED_PRACTICE_SUBMITTED",
            "knowledge_points": ["栈与队列", "括号匹配"],
            "error_type": "generated_practice_misunderstanding",
            "payload": {"resource_title": "栈与队列专项练习", "score_percent": 82, "duration_minutes": 38, "source": "seed"},
            "created_at": datetime(2026, 8, 30, 12, 54, tzinfo=timezone.utc),
        },
        "evt_user_student_001_ds_podcast_listened": {
            "student_id": "user_student_001",
            "course_id": "course_ds_001",
            "class_id": "class_se_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "assignment_id": None,
            "task_id": None,
            "event_type": "PODCAST_LISTENED",
            "knowledge_points": ["二叉树", "递归"],
            "error_type": None,
            "payload": {"resource_title": "二叉树递归遍历讲解", "completion_ratio": 0.86, "duration_minutes": 26, "source": "seed"},
            "created_at": datetime(2026, 8, 31, 14, 8, tzinfo=timezone.utc),
        },
        "evt_user_student_001_ml_hint_viewed": {
            "student_id": "user_student_001",
            "course_id": "course_arch_001",
            "class_id": "class_se_001",
            "teaching_assignment_id": "ta_se1_ml_001",
            "assignment_id": "assign_se1_ml_overfitting_001",
            "task_id": "task_ml_overfitting_quiz_001",
            "event_type": "HINT_VIEWED",
            "knowledge_points": ["过拟合", "模型评估"],
            "error_type": "MODEL_EVALUATION_CONFUSION",
            "payload": {"hint_level": 1, "duration_minutes": 20, "source": "seed"},
            "created_at": datetime(2026, 8, 30, 13, 25, tzinfo=timezone.utc),
        },
        "evt_user_student_001_ml_artifact_saved": {
            "student_id": "user_student_001",
            "course_id": "course_arch_001",
            "class_id": "class_se_001",
            "teaching_assignment_id": "ta_se1_ml_001",
            "assignment_id": None,
            "task_id": None,
            "event_type": "artifact_saved",
            "knowledge_points": ["正则化", "训练集与验证集"],
            "error_type": None,
            "payload": {"resource_title": "模型评估复习笔记", "duration_minutes": 24, "source": "seed"},
            "created_at": datetime(2026, 8, 31, 11, 36, tzinfo=timezone.utc),
        },
        "evt_user_student_001_python_practice": {
            "student_id": "user_student_001",
            "course_id": "course_network_001",
            "class_id": "class_se_001",
            "teaching_assignment_id": "ta_se1_network_001",
            "assignment_id": "assign_se1_network_subnet_001",
            "task_id": "task_subnet_mask_001",
            "event_type": "QUESTION_SET_SUBMITTED",
            "knowledge_points": ["Python 列表与字典查找", "下标判断"],
            "error_type": None,
            "payload": {"score_percent": 68, "duration_minutes": 31, "source": "seed"},
            "created_at": datetime(2026, 8, 29, 12, 10, tzinfo=timezone.utc),
        },
    }
    for event_id, values in student_behavior_events.items():
        upsert(
            db,
            LearnerEvent,
            event_id,
            {
                **values,
                "knowledge_points": json.dumps(values["knowledge_points"], ensure_ascii=False),
                "payload": json.dumps(values["payload"], ensure_ascii=False),
            },
        )
    upsert(
        db,
        LearnerEvent,
        "evt_user_student_002_ds_hint_viewed",
        {
            "student_id": "user_student_002",
            "course_id": "course_ds_001",
            "class_id": "class_cs_001",
            "teaching_assignment_id": "ta_cs1_ds_001",
            "assignment_id": "assign_cs1_ds_linked_list_001",
            "task_id": "task_linked_list_delete_001",
            "event_type": "HINT_VIEWED",
            "knowledge_points": json.dumps(["二叉树", "递归"], ensure_ascii=False),
            "error_type": "RECURSION_BASE_CASE_MISSING",
            "payload": json.dumps({"hint_level": 2, "source": "seed"}, ensure_ascii=False),
            "created_at": datetime(2026, 8, 30, 13, 0, tzinfo=timezone.utc),
        },
    )

    db.commit()

