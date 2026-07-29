import json
from datetime import datetime, timezone

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from backend.app.core.security import hash_password, verify_password
from backend.app.models import (
    AdministrativeClass,
    Capability,
    Course,
    Enrollment,
    KnowledgeSource,
    LearnerErrorStat,
    LearnerEvent,
    LearnerKnowledgeState,
    LearnerProfileSnapshot,
    Question,
    QuestionOption,
    Recommendation,
    StudentClassMembership,
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


def seed_demo_data(db: Session) -> None:
    ensure_auth_columns(db)
    ensure_task_workspace_columns(db)
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
        user = db.get(User, user_id)
        if user and not verify_password("codetrack123", user.password_hash):
            user.password_hash = hash_password("codetrack123")

    upsert(
        db,
        Course,
        "course_ds_001",
        {
            "name": "数据结构与程序设计基础",
            "description": "面向链表、栈队列、树和程序设计基础的助学课程",
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
            "name": "计算机网络",
            "description": "面向网络分层、IP 地址与子网划分的基础课程",
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
            "name": "计算机组成原理",
            "description": "面向计算机系统结构和组成原理的基础课程",
            "term": "2026-demo",
            "status": "ACTIVE",
            "owner_teacher_id": "user_teacher_001",
        },
    )

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
            "name": "软件工程 1 班",
            "grade": "2026",
            "major_name": "软件工程",
            "status": "ACTIVE",
        },
        "class_cs_001": {
            "name": "计科 1 班",
            "grade": "2026",
            "major_name": "计算机科学与技术",
            "status": "ACTIVE",
        },
    }
    for class_id, values in classes.items():
        upsert(db, AdministrativeClass, class_id, values)

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
        "task_subnet_mask_001",
        {
            "course_id": "course_network_001",
            "title": "IP 地址与子网划分练习",
            "description": "根据给定 IP 和掩码完成子网划分与可用主机数计算。",
            "workspace_type": "CODING",
            "language": "CPP",
            "interface_spec": "int analyzeSubnet(string ip, string mask);",
            "learning_objectives": json.dumps(
                ["理解 IP 地址结构", "掌握子网掩码计算", "识别网络号与主机号"],
                ensure_ascii=False,
            ),
            "capability_ids": json.dumps([], ensure_ascii=False),
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
            "language": "CPP",
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
        {"assignment_id": "assign_cs1_ds_linked_list_001", "student_id": "user_student_002"},
        {
            "status": "NEEDS_REVISION",
            "passed_count": 3,
            "total_required_count": 5,
            "highest_hint_level": 2,
            "score": None,
        },
    )

    sources = {
        "kb_linked_list_delete_basic": (
            "单链表删除基本规则",
            "删除链表节点时，需要找到目标节点并维护相邻节点之间的连接关系。",
            "HIGH",
        ),
        "kb_head_node_delete": (
            "删除头节点时的链表起点更新",
            "删除第一个节点时，没有前驱节点，需要更新代表链表起点的头指针或返回新的头节点。",
            "HIGH",
        ),
        "kb_empty_list_guard": (
            "空链表与非法位置保护",
            "空链表、负数位置和超过长度的位置都应先判断，避免空指针访问或错误修改。",
            "HIGH",
        ),
        "kb_boundary_test_reasoning": (
            "用边界测试验证链表删除",
            "链表删除不能只测试中间节点，还应覆盖头节点、尾节点、空链表和非法位置。",
            "MEDIUM",
        ),
    }
    for source_id, (title, summary, level) in sources.items():
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
            },
        )

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
            "summary_text": "计算机网络数据较少，子网划分需要通过后续练习继续确认。",
            "overall_progress": 34,
            "hint_dependency_level": "LOW",
            "compile_error_rate": 0,
            "logic_error_rate": 0.15,
            "recent_task_completion": 0.25,
            "recommendation_text": "建议完成一次 IP 地址与子网划分入门练习。",
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
            {"student_id": "user_student_001", "course_id": "course_network_001", "knowledge_point": "子网划分"},
            {
                "mastery_score": 46,
                "state": "WEAK",
                "evidence_count": 1,
                "last_evidence": "自学记录显示仍需练习掩码换算",
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
        LearnerEvent,
        "evt_user_student_001_ds_hint_viewed",
        {
            "student_id": "user_student_001",
            "course_id": "course_ds_001",
            "class_id": "class_se_001",
            "teaching_assignment_id": "ta_se1_ds_001",
            "assignment_id": "assign_se1_ds_linked_list_001",
            "task_id": "task_linked_list_delete_001",
            "event_type": "HINT_VIEWED",
            "knowledge_points": json.dumps(["链表", "边界处理"], ensure_ascii=False),
            "error_type": "HEAD_NODE_RETURN_MISSING",
            "payload": json.dumps({"hint_level": 1, "source": "seed"}, ensure_ascii=False),
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
        },
    )

    db.commit()

