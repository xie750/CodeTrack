"""教师端任务中心接口（开发方案 §八 8.1 任务列表）。

本模块**全程只读**：不 commit、不写审计。原因是 §八 8.1 的行内写操作（新建、编辑、
复制、归档、发布）都缺少可写落点：

- `Task` 表没有 §14.1 的五态内容状态字段（种子数据里 `status` 只有 `OPEN` 一种取值），
  也没有章节、知识点、难度、创建时间。归档和复制一旦现在写，写进去的状态没有任何
  接口读得懂。
- 发布会批量初始化全班 `StudentTaskProgress`（§八 8.6「发布后必须初始化所有学生任务
  进度」），必须与写接口、二次确认和审计日志一起上线，不能先放一个能点的按钮。

所以列表页把这些动作按 `unavailable_actions` 渲染成不可用，并显示后端给出的原因 ——
理由文案放后端，前端只负责渲染，避免两边各编一套说辞。

**内容状态是推导出来的，不是存的**。见 `_derive_content_status`：现有数据只能可靠地区分
「已发布 / 已结束 / 可发布」，DRAFT 与 ARCHIVED 只在 `Task.status` 真的写了这两个值时
出现。响应里的 `status_derivation` 把这件事讲清楚，避免前端把「可发布」误读成教师手工
标过的状态。

范围口径按 §15.1：只统计当前教师 `ACTIVE` 教学安排覆盖的课程与班级，`class_id` 越界直接
403。选定班级后，发布记录与完成率都只按该班级口径计算。
"""

import json
from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError, ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import (
    AdministrativeClass,
    Capability,
    Course,
    Question,
    QuestionOption,
    StudentClassMembership,
    StudentTaskProgress,
    Submission,
    Task,
    TaskAssignment,
    TeachingAssignment,
    TestCase,
    User,
)
from backend.app.services.submissions import iso
from backend.app.services.teacher_scope import (
    SUBMITTED_PROGRESS_STATUSES,
    class_student_ids,
    derive_progress_status,
    teacher_assignments,
)
from backend.app.models.entities import utc_now

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-tasks"])


# workspace_type 是现有字段，任务类型只能从它推导。§八 8.1 的筛选器还列了「测验」和
# 「补救任务」，但那两个在数据里是 TaskAssignment.assignment_mode（发布模式），不是内容
# 类型 —— 同一份客观题既能按练习发也能按测验发。所以类型筛选只给这两项，发布模式在每行
# 的发布记录里显示，不混成一个筛选器。
WORKSPACE_TYPE_TO_TASK_TYPE = {
    "CODING": "PROGRAMMING",
    "QUESTION_SET": "QUESTION",
}

TASK_TYPE_OPTIONS = [
    {"value": "PROGRAMMING", "label": "编程任务"},
    {"value": "QUESTION", "label": "客观题"},
]

CONTENT_STATUS_ORDER = ["DRAFT", "READY", "PUBLISHED", "CLOSED", "ARCHIVED"]

# 视作「仍在下发中」的班级发布状态。PAUSED 也算已发布：任务已经在学生端出现过，
# 只是暂时不能提交，不能因为暂停就退回「可发布」。
ACTIVE_PUBLISH_STATUSES = {"PUBLISHED", "SCHEDULED", "PAUSED"}

STATUS_DERIVATION = (
    "内容状态由现有数据推导：有生效发布记录记为已发布，全部发布记录已关闭记为已结束，"
    "其余记为可发布。Task 表尚无 §14.1 的五态字段，草稿与已归档只在数据里确实写了这两个"
    "状态时才会出现。"
)

# 选定班级后口径会变窄，这件事必须说出来：一个已经发给软工班的任务，在计科班视角下
# 就是「还没下发」，会显示成可发布。不说明的话教师会以为状态自相矛盾。
CLASS_SCOPED_NOTE = (
    "当前已按班级口径统计：发布记录、完成率和内容状态都只看这个班，"
    "已发给其他班但未发给本班的任务会显示为可发布。"
)

# 六个行内动作背后的写接口都还没有。理由写在后端，前端按 action 找对应文案。
UNAVAILABLE_ACTIONS = [
    {
        "action": "EDIT_TASK",
        "reason": "客观题编辑器与编程任务编辑器（§八 8.3 / 8.4）尚未接入写接口，进去只能看到控件清单。",
        "target_route": None,
    },
    {
        "action": "DUPLICATE_TASK",
        "reason": "复制为新草稿需要任务写接口和 §14.1 的内容状态字段，当前 Task 表没有草稿态可落。",
        "target_route": None,
    },
    {
        "action": "ARCHIVE_TASK",
        "reason": "归档要写 Task.status，现有数据只有 OPEN 一种取值，写入前得先迁移五态枚举，否则写进去没人读得懂。",
        "target_route": None,
    },
    {
        "action": "STUDENT_PREVIEW",
        "reason": "学生视角预览需要一个教师可读的渲染接口；教师账号不能直接进入学生端路由。",
        "target_route": None,
    },
]


class QuestionOptionPayload(BaseModel):
    label: str = Field(min_length=1, max_length=8)
    content: str = Field(min_length=1, max_length=1000)
    is_correct: bool = False


class QuestionPayload(BaseModel):
    question_type: str = "SINGLE_CHOICE"
    stem: str = Field(min_length=1, max_length=4000)
    analysis: str = ""
    knowledge_points: list[str] = Field(default_factory=list)
    difficulty: str = "BASIC"
    score: float = Field(default=10, gt=0)
    error_type: str | None = None
    options: list[QuestionOptionPayload] = Field(min_length=2)

    @model_validator(mode="after")
    def validate_options(self):
        correct_count = len([item for item in self.options if item.is_correct])
        if correct_count == 0:
            raise ValueError("At least one option must be marked correct.")
        if self.question_type in {"SINGLE_CHOICE", "TRUE_FALSE"} and correct_count != 1:
            raise ValueError("Single choice and true/false questions must have exactly one correct option.")
        return self


class TestCasePayload(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    visibility: str = "PUBLIC"
    input_data: Any = Field(default_factory=dict)
    expected_output: Any = None
    expected_output_summary: str = ""
    hidden_failure_summary: str | None = None
    error_tag: str = "UNKNOWN_OR_LOW_CONFIDENCE"
    capability_id: str | None = None
    required: bool = True


class TeacherTaskCreateRequest(BaseModel):
    course_id: str
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=8000)
    workspace_type: str = "QUESTION_SET"
    language: str = "CPP"
    interface_spec: str = "ListNode* deleteAt(ListNode* head, int position);"
    learning_objectives: list[str] = Field(default_factory=list)
    capability_ids: list[str] = Field(default_factory=list)
    questions: list[QuestionPayload] = Field(default_factory=list)
    test_cases: list[TestCasePayload] = Field(default_factory=list)


class TeacherTaskPublishRequest(BaseModel):
    class_ids: list[str] = Field(min_length=1)
    assignment_mode: str = "QUIZ"
    allow_hint_level_3: bool = True
    deadline: datetime | None = None


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _teacher_course_assignments(
    db: Session, user: User, course_id: str
) -> list[TeachingAssignment]:
    assignments = teacher_assignments(db, user.id, course_id)
    if not assignments:
        raise ApiError(403, "AUTH_FORBIDDEN", "当前教师没有该课程的生效教学安排")
    return assignments


def _ensure_task_owned_by_teacher(db: Session, user: User, task_id: str) -> tuple[Task, list[TeachingAssignment]]:
    task = db.get(Task, task_id)
    if task is None:
        raise ApiError(404, "TASK_NOT_FOUND", "任务不存在")
    assignments = _teacher_course_assignments(db, user, task.course_id)
    return task, assignments


def _student_ids_for_class(db: Session, class_id: str) -> list[str]:
    return list(
        db.scalars(
            select(StudentClassMembership.student_id)
            .where(
                StudentClassMembership.class_id == class_id,
                StudentClassMembership.status == "ACTIVE",
            )
            .order_by(StudentClassMembership.student_id.asc())
        ).all()
    )


def _question_count_for_task(db: Session, task_id: str) -> int:
    return db.scalar(select(func.count(Question.id)).where(Question.task_id == task_id)) or 0


def _required_count_for_task(db: Session, task: Task) -> int:
    if task.workspace_type == "QUESTION_SET":
        return db.scalar(select(func.count(Question.id)).where(Question.task_id == task.id)) or 0
    return (
        db.scalar(
            select(func.count(TestCase.id)).where(
                TestCase.task_id == task.id, TestCase.required.is_(True)
            )
        )
        or 0
    )


def _add_questions(db: Session, task_id: str, questions: list[QuestionPayload]) -> None:
    for question_index, question in enumerate(questions, start=1):
        question_id = _new_id("q")
        db.add(
            Question(
                id=question_id,
                task_id=task_id,
                question_type=question.question_type,
                stem=question.stem.strip(),
                analysis=question.analysis.strip(),
                knowledge_points=json.dumps(question.knowledge_points, ensure_ascii=False),
                difficulty=question.difficulty,
                score=question.score,
                error_type=question.error_type,
                sort_order=question_index,
            )
        )
        for option_index, option in enumerate(question.options, start=1):
            db.add(
                QuestionOption(
                    id=_new_id("qopt"),
                    question_id=question_id,
                    label=option.label.strip(),
                    content=option.content.strip(),
                    is_correct=option.is_correct,
                    sort_order=option_index,
                )
            )


def _add_test_cases(db: Session, task: Task, test_cases: list[TestCasePayload]) -> None:
    capability_ids = _json_list(task.capability_ids)
    fallback_capability_id = capability_ids[0] if capability_ids else "cap_linked_list_boundary"
    for case_index, case in enumerate(test_cases, start=1):
        visibility = case.visibility.upper()
        if visibility not in {"PUBLIC", "HIDDEN"}:
            raise ApiError(422, "TEST_CASE_VISIBILITY_INVALID", "测试用例可见性只能是 PUBLIC 或 HIDDEN")
        capability_id = case.capability_id or fallback_capability_id
        if db.get(Capability, capability_id) is None:
            raise ApiError(422, "CAPABILITY_NOT_FOUND", f"能力不存在：{capability_id}")
        expected_summary = case.expected_output_summary.strip() or json.dumps(
            case.expected_output, ensure_ascii=False
        )
        db.add(
            TestCase(
                id=_new_id("tc"),
                task_id=task.id,
                name=case.name.strip(),
                visibility=visibility,
                input_data=json.dumps(case.input_data, ensure_ascii=False),
                expected_output=json.dumps(case.expected_output, ensure_ascii=False),
                expected_output_summary=expected_summary,
                hidden_failure_summary=case.hidden_failure_summary,
                error_tag=case.error_tag,
                capability_id=capability_id,
                required=case.required,
                sort_order=case_index,
            )
        )


def _publish_task(
    db: Session,
    task: Task,
    teacher: User,
    assignments: list[TeachingAssignment],
    payload: TeacherTaskPublishRequest,
) -> list[dict]:
    allowed_by_class = {item.class_id: item for item in assignments}
    unknown = [class_id for class_id in payload.class_ids if class_id not in allowed_by_class]
    if unknown:
        raise ApiError(403, "AUTH_FORBIDDEN", f"无权向这些班级发布任务：{', '.join(unknown)}")
    if task.workspace_type == "QUESTION_SET" and _required_count_for_task(db, task) == 0:
        raise ApiError(422, "QUESTION_SET_EMPTY", "客观题任务至少需要一道题目才能发布")

    total_required_count = _required_count_for_task(db, task)
    published_at = utc_now()
    rows = []
    for class_id in payload.class_ids:
        teaching = allowed_by_class[class_id]
        assignment = db.scalar(
            select(TaskAssignment).where(
                TaskAssignment.task_id == task.id,
                TaskAssignment.teaching_assignment_id == teaching.id,
            )
        )
        if assignment is None:
            assignment = TaskAssignment(
                id=_new_id("assign"),
                task_id=task.id,
                teaching_assignment_id=teaching.id,
                published_by=teacher.id,
            )
            db.add(assignment)
        assignment.publish_status = "PUBLISHED"
        assignment.assignment_mode = payload.assignment_mode
        assignment.allow_hint_level_3 = payload.allow_hint_level_3
        assignment.published_at = published_at
        assignment.deadline = payload.deadline
        db.flush()

        initialized = 0
        for student_id in _student_ids_for_class(db, class_id):
            progress = db.scalar(
                select(StudentTaskProgress).where(
                    StudentTaskProgress.assignment_id == assignment.id,
                    StudentTaskProgress.student_id == student_id,
                )
            )
            if progress is None:
                db.add(
                    StudentTaskProgress(
                        assignment_id=assignment.id,
                        student_id=student_id,
                        status="NOT_STARTED",
                        total_required_count=total_required_count,
                        updated_at=published_at,
                    )
                )
                initialized += 1
            else:
                progress.total_required_count = total_required_count
                progress.updated_at = published_at
        rows.append(
            {
                "assignment_id": assignment.id,
                "class_id": class_id,
                "teaching_assignment_id": teaching.id,
                "publish_status": assignment.publish_status,
                "assignment_mode": assignment.assignment_mode,
                "initialized_student_count": initialized,
            }
        )
    return rows


@router.post("/tasks", status_code=201)
def create_teacher_task(
    payload: TeacherTaskCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    _teacher_course_assignments(db, user, payload.course_id)
    workspace_type = payload.workspace_type.upper()
    if workspace_type not in {"QUESTION_SET", "CODING"}:
        raise ApiError(422, "TASK_TYPE_UNSUPPORTED", "当前只支持创建客观题任务和编程任务")
    if workspace_type == "QUESTION_SET" and not payload.questions:
        raise ApiError(422, "QUESTION_SET_EMPTY", "客观题任务至少需要一道题目")
    if workspace_type == "CODING" and not payload.test_cases:
        raise ApiError(422, "CODING_TEST_CASE_EMPTY", "编程任务至少需要一个测试用例")

    task = Task(
        id=_new_id("task"),
        course_id=payload.course_id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        workspace_type=workspace_type,
        language=payload.language or "CPP",
        interface_spec=payload.interface_spec or "ListNode* deleteAt(ListNode* head, int position);",
        learning_objectives=json.dumps(payload.learning_objectives, ensure_ascii=False),
        capability_ids=json.dumps(payload.capability_ids, ensure_ascii=False),
        status="OPEN",
    )
    db.add(task)
    db.flush()
    if workspace_type == "QUESTION_SET":
        _add_questions(db, task.id, payload.questions)
    else:
        _add_test_cases(db, task, payload.test_cases)
    db.commit()
    return ok(
        {
            "task_id": task.id,
            "course_id": task.course_id,
            "title": task.title,
            "workspace_type": task.workspace_type,
            "question_count": len(payload.questions),
            "status": task.status,
        }
    )


@router.post("/tasks/{task_id}/publish")
def publish_teacher_task(
    task_id: str,
    payload: TeacherTaskPublishRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require_role(user, "TEACHER")
    task, assignments = _ensure_task_owned_by_teacher(db, user, task_id)
    rows = _publish_task(db, task, user, assignments, payload)
    db.commit()
    return ok({"task_id": task.id, "publications": rows})


def _json_list(raw: str | None) -> list:
    """capability_ids / learning_objectives 都是 JSON 文本列，脏数据不该让整页 500。"""
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def _derive_content_status(task: Task, publications: list[TaskAssignment]) -> str:
    raw = (task.status or "").upper()
    if raw in {"DRAFT", "ARCHIVED"}:
        return raw
    if any(item.publish_status in ACTIVE_PUBLISH_STATUSES for item in publications):
        return "PUBLISHED"
    if publications and all(item.publish_status == "CLOSED" for item in publications):
        return "CLOSED"
    if raw == "CLOSED":
        return "CLOSED"
    return "READY"


@router.get("/tasks")
def teacher_task_list(
    course_id: str | None = Query(default=None),
    class_id: str | None = Query(default=None),
    task_type: str | None = Query(default=None),
    content_status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """任务列表。分页在后端做，`stats` 始终覆盖整个范围而不是当前页。

    `stats` 有意不受 `task_type` / `content_status` 影响：那两个筛选器的入口就是这些
    卡片和标签，如果计数跟着筛选走，切到「已发布」后其余卡片全变 0，教师就没法用它们
    对比了。`keyword` 会影响 `stats`，因为搜索改变的是「在看哪一批任务」。
    """
    require_role(user, "TEACHER")

    assignments = teacher_assignments(db, user.id, course_id)
    if course_id and not assignments:
        raise ApiError(403, "AUTH_FORBIDDEN", "当前教师在该课程没有生效的教学安排")
    if class_id:
        assignments = [item for item in assignments if item.class_id == class_id]
        if not assignments:
            raise ApiError(403, "AUTH_FORBIDDEN", "无权访问该班级的任务数据")

    # 课程与班级选项始终按教师全部教学安排列出，否则选了班就再也切不回别的班
    all_assignments = teacher_assignments(db, user.id)
    course_options = _course_options(db, all_assignments, course_id)
    class_options = _class_options(db, all_assignments, course_id, class_id)

    if not assignments:
        return ok(_empty_payload(course_id, class_id, course_options, class_options, page, page_size))

    scoped_course_ids = sorted({item.course_id for item in assignments})
    scoped_class_ids = sorted({item.class_id for item in assignments})
    assignment_by_id = {item.id: item for item in assignments}

    tasks = list(
        db.scalars(
            select(Task)
            .where(Task.course_id.in_(scoped_course_ids))
            .order_by(Task.course_id.asc(), Task.title.asc())
        ).all()
    )

    publications_by_task = _publications_by_task(db, list(assignment_by_id))
    courses = {
        course.id: course
        for course in db.scalars(select(Course).where(Course.id.in_(scoped_course_ids))).all()
    }
    class_names = _class_names(db, scoped_class_ids)

    keyword_text = (keyword or "").strip().lower()
    rows = []
    for task in tasks:
        if keyword_text and keyword_text not in task.title.lower():
            continue
        publications = publications_by_task.get(task.id, [])
        course = courses.get(task.course_id)
        rows.append(
            {
                "task_id": task.id,
                "title": task.title,
                "description": task.description,
                "course_id": task.course_id,
                "course_name": course.name if course else "",
                "task_type": WORKSPACE_TYPE_TO_TASK_TYPE.get(task.workspace_type, task.workspace_type),
                "workspace_type": task.workspace_type,
                "content_status": _derive_content_status(task, publications),
                "raw_status": task.status,
                "language": task.language,
                "interface_spec": task.interface_spec,
                "learning_objectives": _json_list(task.learning_objectives),
                "capability_ids": _json_list(task.capability_ids),
                "publications": [
                    {
                        "assignment_id": item.id,
                        "class_id": assignment_by_id[item.teaching_assignment_id].class_id,
                        "class_name": class_names.get(
                            assignment_by_id[item.teaching_assignment_id].class_id, ""
                        ),
                        "term": assignment_by_id[item.teaching_assignment_id].term,
                        "publish_status": item.publish_status,
                        "assignment_mode": item.assignment_mode,
                        "allow_hint_level_3": item.allow_hint_level_3,
                        "published_at": iso(item.published_at),
                        "deadline": iso(item.deadline),
                    }
                    for item in publications
                ],
            }
        )

    stats = {
        "total": len(rows),
        **{status.lower(): 0 for status in CONTENT_STATUS_ORDER},
        "programming": 0,
        "question": 0,
    }
    for row in rows:
        stats[row["content_status"].lower()] = stats.get(row["content_status"].lower(), 0) + 1
        if row["task_type"] == "PROGRAMMING":
            stats["programming"] += 1
        elif row["task_type"] == "QUESTION":
            stats["question"] += 1

    if task_type:
        rows = [row for row in rows if row["task_type"] == task_type]
    if content_status:
        rows = [row for row in rows if row["content_status"] == content_status]

    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]

    _attach_content_counts(db, page_rows)
    _attach_progress(db, page_rows, class_names)

    return ok(
        {
            "scope": {
                "course_id": course_id,
                "class_id": class_id,
                "course_ids": scoped_course_ids,
                "class_ids": scoped_class_ids,
            },
            "course_options": course_options,
            "class_options": class_options,
            "task_type_options": TASK_TYPE_OPTIONS,
            "content_status_order": CONTENT_STATUS_ORDER,
            "status_derivation": (
                f"{STATUS_DERIVATION}{CLASS_SCOPED_NOTE}" if class_id else STATUS_DERIVATION
            ),
            "stats": stats,
            "items": page_rows,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "unavailable_actions": UNAVAILABLE_ACTIONS,
        }
    )


def _empty_payload(
    course_id: str | None,
    class_id: str | None,
    course_options: list[dict],
    class_options: list[dict],
    page: int,
    page_size: int,
) -> dict:
    """教师没有任何生效教学安排时的空壳。空列表和「加载失败」是两回事，仍返回 200。"""
    return {
        "scope": {
            "course_id": course_id,
            "class_id": class_id,
            "course_ids": [],
            "class_ids": [],
        },
        "course_options": course_options,
        "class_options": class_options,
        "task_type_options": TASK_TYPE_OPTIONS,
        "content_status_order": CONTENT_STATUS_ORDER,
        "status_derivation": STATUS_DERIVATION,
        "stats": {
            "total": 0,
            **{status.lower(): 0 for status in CONTENT_STATUS_ORDER},
            "programming": 0,
            "question": 0,
        },
        "items": [],
        "page": page,
        "page_size": page_size,
        "total": 0,
        "total_pages": 1,
        "unavailable_actions": UNAVAILABLE_ACTIONS,
    }


def _course_options(
    db: Session, assignments: list[TeachingAssignment], current_course_id: str | None
) -> list[dict]:
    course_ids = sorted({item.course_id for item in assignments})
    if not course_ids:
        return []
    courses = {
        course.id: course
        for course in db.scalars(select(Course).where(Course.id.in_(course_ids))).all()
    }
    return [
        {
            "course_id": course_id,
            "name": courses[course_id].name if course_id in courses else course_id,
            "term": courses[course_id].term if course_id in courses else "",
            "is_current": course_id == current_course_id,
        }
        for course_id in course_ids
    ]


def _class_options(
    db: Session,
    assignments: list[TeachingAssignment],
    current_course_id: str | None,
    current_class_id: str | None,
) -> list[dict]:
    """班级选项跟着课程收窄：选了课程就只列该课程的班，避免选出跨课程的无效组合。"""
    scoped = [
        item
        for item in assignments
        if not current_course_id or item.course_id == current_course_id
    ]
    class_ids = sorted({item.class_id for item in scoped})
    names = _class_names(db, class_ids)
    return [
        {
            "class_id": class_id,
            "name": names.get(class_id, class_id),
            "is_current": class_id == current_class_id,
        }
        for class_id in class_ids
    ]


def _class_names(db: Session, class_ids: list[str]) -> dict[str, str]:
    if not class_ids:
        return {}
    return {
        row.id: row.name
        for row in db.scalars(
            select(AdministrativeClass).where(AdministrativeClass.id.in_(class_ids))
        ).all()
    }


def _publications_by_task(
    db: Session, teaching_assignment_ids: list[str]
) -> dict[str, list[TaskAssignment]]:
    """一次查完当前范围内所有发布记录，避免每行任务再查一次。

    注意不过滤 `publish_status`：已关闭的发布记录决定任务是否算「已结束」，
    过滤掉就会把结课任务算回「可发布」。
    """
    if not teaching_assignment_ids:
        return {}
    grouped: dict[str, list[TaskAssignment]] = {}
    rows = db.scalars(
        select(TaskAssignment)
        .where(TaskAssignment.teaching_assignment_id.in_(teaching_assignment_ids))
        .order_by(TaskAssignment.published_at.asc())
    ).all()
    for row in rows:
        grouped.setdefault(row.task_id, []).append(row)
    return grouped


def _attach_content_counts(db: Session, rows: list[dict]) -> None:
    """测试用例数与题目数。只查当前页的任务。"""
    task_ids = [row["task_id"] for row in rows]
    if not task_ids:
        return

    cases: dict[str, list[TestCase]] = {}
    for case in db.scalars(select(TestCase).where(TestCase.task_id.in_(task_ids))).all():
        cases.setdefault(case.task_id, []).append(case)

    questions: dict[str, list[Question]] = {}
    for question in db.scalars(select(Question).where(Question.task_id.in_(task_ids))).all():
        questions.setdefault(question.task_id, []).append(question)

    for row in rows:
        task_cases = cases.get(row["task_id"], [])
        task_questions = questions.get(row["task_id"], [])
        row["test_case_count"] = len(task_cases)
        # 学生端只看得到公开用例，这个数字是教师判断任务是否可自检的关键
        row["public_test_case_count"] = len(
            [item for item in task_cases if item.visibility == "PUBLIC"]
        )
        row["required_test_case_count"] = len([item for item in task_cases if item.required])
        row["question_count"] = len(task_questions)
        # 没题目时是 None 而不是 0：「没有题目」和「题目总分 0」是两件事
        row["question_total_score"] = (
            round(sum(item.score for item in task_questions), 2) if task_questions else None
        )


def _attach_progress(db: Session, rows: list[dict], class_names: dict[str, str]) -> None:
    """每行任务的完成情况，口径与任务监控（§九 9.1）一致：`derive_progress_status`。

    未发布的任务没有名册可算，`completion_rate` 给 null 而不是 0 —— 前端要能区分
    「还没发布」和「发布了但没人完成」。
    """
    task_ids = [row["task_id"] for row in rows]
    if not task_ids:
        return

    # 只有生效发布记录才带来学生名册；已关闭的班级仍要计入历史完成率，
    # 所以这里统一用「有发布记录的班级」，与内容状态推导保持一致
    roster_by_task: dict[str, set[str]] = {}
    assignment_ids_by_task: dict[str, list[str]] = {}
    for row in rows:
        row_class_ids = sorted({item["class_id"] for item in row["publications"]})
        roster_by_task[row["task_id"]] = class_student_ids(db, row_class_ids)
        assignment_ids_by_task[row["task_id"]] = [
            item["assignment_id"] for item in row["publications"]
        ]

    all_assignment_ids = sorted({aid for ids in assignment_ids_by_task.values() for aid in ids})
    progress_by_key: dict[tuple[str, str], StudentTaskProgress] = {}
    if all_assignment_ids:
        for progress in db.scalars(
            select(StudentTaskProgress).where(
                StudentTaskProgress.assignment_id.in_(all_assignment_ids)
            )
        ).all():
            progress_by_key[(progress.assignment_id, progress.student_id)] = progress

    submission_by_key: dict[tuple[str, str], Submission] = {}
    for submission in db.scalars(
        select(Submission).where(Submission.task_id.in_(task_ids))
    ).all():
        submission_by_key[(submission.task_id, submission.student_id)] = submission

    for row in rows:
        task_id = row["task_id"]
        roster = roster_by_task.get(task_id, set())
        assignment_ids = assignment_ids_by_task.get(task_id, [])
        statuses = []
        for student_id in roster:
            progress = next(
                (
                    progress_by_key[(assignment_id, student_id)]
                    for assignment_id in assignment_ids
                    if (assignment_id, student_id) in progress_by_key
                ),
                None,
            )
            statuses.append(
                derive_progress_status(progress, submission_by_key.get((task_id, student_id)))
            )

        completed = len([item for item in statuses if item == "COMPLETED"])
        row["roster_total"] = len(roster)
        row["submitted_count"] = len(
            [item for item in statuses if item in SUBMITTED_PROGRESS_STATUSES]
        )
        row["completed_count"] = completed
        row["not_started_count"] = len([item for item in statuses if item == "NOT_STARTED"])
        row["completion_rate"] = round(completed / len(roster), 4) if roster else None
        row["published_class_names"] = [
            class_names.get(item["class_id"], item["class_id"]) for item in row["publications"]
        ]
