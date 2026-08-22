from datetime import datetime, timedelta
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    DiagnosisResult,
    EvaluationResult,
    Grade,
    Submission,
    Task,
    TestCase,
    User,
)


TASK_ID = "task-grade-fixture-01"
TEST_CASES = [
    ("grade-case-01", "空链表输入", False, 15),
    ("grade-case-02", "删除头节点", False, 15),
    ("grade-case-03", "删除中间节点", False, 20),
    ("grade-case-04", "删除尾节点", True, 20),
    ("grade-case-05", "下标越界", True, 15),
    ("grade-case-06", "连续删除", True, 15),
]
SUBMISSION_SPECS = [
    ("student-01", 6, 96, 0, "grade_published", "边界处理完整，代码结构清晰。"),
    ("student-02", 5, 86, 1, "grade_published", "尾节点处理正确，可进一步减少重复判断。"),
    ("student-03", 4, 72, 2, "graded", "请检查下标越界时的返回逻辑。"),
    ("student-04", 6, 93, 0, "grade_published", "全部测试通过，注意补充复杂度说明。"),
    ("student-05", 3, 61, 3, "graded", "连续删除后链表连接存在问题，请重新检查指针更新。"),
    ("student-06", 5, 84, 1, "grade_published", "实现基本正确，空链表分支可以更简洁。"),
]


def ensure_task_grade_fixture(db: Session) -> None:
    """Create an idempotent published task with submissions for grade-view acceptance."""
    task = db.get(Task, TASK_ID)
    if not task:
        task = Task(
            id=TASK_ID,
            course_id="course-ds",
            class_id="class-se1",
            title="链表边界条件专项练习（成绩测试）",
            type="programming",
            chapter_label="第 2 章 线性表",
            description="用于验收“查看成绩”流程：覆盖空链表、头尾节点、越界和连续删除场景。",
            starter_code=(
                "ListNode* removeAt(ListNode* head, int index) {\n"
                "  // 请完成边界检查与节点删除\n"
                "  return head;\n"
                "}"
            ),
            status="published",
            difficulty="进阶",
            total_score=100,
            publish_at=datetime.now().replace(microsecond=0) - timedelta(days=3),
            due_at=datetime.now().replace(microsecond=0) + timedelta(days=5),
            allow_hints=True,
        )
        db.add(task)
        db.flush()
    else:
        task.status = "published"
        task.class_id = "class-se1"

    for case_id, name, hidden, weight in TEST_CASES:
        if not db.get(TestCase, case_id):
            db.add(TestCase(
                id=case_id,
                task_id=TASK_ID,
                name=name,
                hidden=hidden,
                weight=weight,
            ))

    for index, (student_id, passed, score, hint_level, grade_status, comment) in enumerate(SUBMISSION_SPECS, 1):
        if not db.get(User, student_id):
            continue
        submission_id = f"grade-fixture-submission-{index:02d}"
        submission = db.get(Submission, submission_id)
        if not submission:
            submission = Submission(
                id=submission_id,
                task_id=TASK_ID,
                student_id=student_id,
                version=index + 1,
                source_code=(
                    "ListNode* removeAt(ListNode* head, int index) {\n"
                    "  if (!head || index < 0) return head;\n"
                    "  if (index == 0) return head->next;\n"
                    "  ListNode* current = head;\n"
                    "  for (int i = 0; current && i < index - 1; ++i) current = current->next;\n"
                    "  if (current && current->next) current->next = current->next->next;\n"
                    "  return head;\n"
                    "}"
                ),
                status="submitted",
                hint_level=hint_level,
                submitted_at=datetime.now().replace(microsecond=0) - timedelta(hours=8 - index),
            )
            db.add(submission)
            db.flush()

        evaluation_id = f"grade-fixture-evaluation-{index:02d}"
        if not db.get(EvaluationResult, evaluation_id):
            details = [
                {"name": name, "passed": case_index <= passed}
                for case_index, (_, name, _, _) in enumerate(TEST_CASES, 1)
            ]
            db.add(EvaluationResult(
                id=evaluation_id,
                submission_id=submission_id,
                passed_tests=passed,
                total_tests=len(TEST_CASES),
                runtime_ms=28 + index * 4,
                compile_output="编译成功",
                score=score,
                details_json=json.dumps(details, ensure_ascii=False),
            ))

        grade_id = f"grade-fixture-grade-{index:02d}"
        if not db.get(Grade, grade_id):
            db.add(Grade(
                id=grade_id,
                submission_id=submission_id,
                teacher_id="teacher-01",
                score=score,
                status=grade_status,
                comment=comment,
                published_at=datetime.now().replace(microsecond=0) if grade_status == "grade_published" else None,
            ))

        diagnosis_id = f"grade-fixture-diagnosis-{index:02d}"
        if not db.get(DiagnosisResult, diagnosis_id):
            passed_all = passed == len(TEST_CASES)
            db.add(DiagnosisResult(
                id=diagnosis_id,
                submission_id=submission_id,
                type="代码质量建议" if passed_all else "边界条件错误",
                explanation=(
                    "全部测试通过，建议进一步封装节点释放逻辑。"
                    if passed_all else "未通过的用例集中在越界或连续删除场景，请检查指针移动边界。"
                ),
                confidence=0.9 if passed_all else 0.78,
                source="第 2 章 线性表 · 专项练习评测规则",
                fallback=False,
                needs_teacher_review=False,
            ))

    db.commit()


