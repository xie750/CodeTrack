import json

from sqlalchemy.orm import Session

from backend.app.models import Capability, Course, Enrollment, KnowledgeSource, Task, TestCase, User


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


def seed_demo_data(db: Session) -> None:
    users = {
        "user_teacher_001": {"display_name": "王老师", "role": "TEACHER", "status": "ACTIVE"},
        "user_student_001": {"display_name": "学生一", "role": "STUDENT", "status": "ACTIVE"},
        "user_student_002": {"display_name": "学生二", "role": "STUDENT", "status": "ACTIVE"},
    }
    for user_id, values in users.items():
        upsert(db, User, user_id, values)

    upsert(
        db,
        Course,
        "course_ds_001",
        {
            "name": "数据结构",
            "description": "面向链表、树和排序等基础数据结构的实验课程",
            "term": "2026-demo",
            "status": "ACTIVE",
            "owner_teacher_id": "user_teacher_001",
        },
    )

    enrollments = [
        ("course_ds_001", "user_teacher_001", "TEACHER"),
        ("course_ds_001", "user_student_001", "STUDENT"),
        ("course_ds_001", "user_student_002", "STUDENT"),
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
            "language": "CPP",
            "interface_spec": "ListNode* deleteAt(ListNode* head, int position);",
            "learning_objectives": json.dumps(learning_objectives, ensure_ascii=False),
            "capability_ids": json.dumps(["cap_linked_list_boundary"], ensure_ascii=False),
            "status": "OPEN",
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

    db.commit()

