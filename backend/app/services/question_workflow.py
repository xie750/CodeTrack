import json
from datetime import timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.models import (
    Course,
    LearnerErrorStat,
    LearnerEvent,
    LearnerKnowledgeState,
    LearnerProfileSnapshot,
    Question,
    QuestionAnswer,
    QuestionAttempt,
    QuestionOption,
    Recommendation,
    StudentTaskProgress,
    Task,
    TaskAssignment,
    TeachingAssignment,
    User,
)
from backend.app.models.entities import utc_now
from backend.app.services.assignment_schedule import (
    assignment_schedule_status,
    assert_assignment_started,
    assignment_start_at,
)
from backend.app.services.recommendation import sync_learning_recommendations
from backend.app.services.submissions import iso


ERROR_LABELS = {
    "HEAD_NODE_RETURN_MISSING": "头节点返回遗漏",
    "BOUNDARY_CASE_MISSING": "边界场景覆盖不足",
    "INVALID_POSITION_GUARD_MISSING": "非法位置保护不足",
    "STACK_QUEUE_RULE_CONFUSION": "栈队列规则混淆",
    "EMPTY_GUARD_MISSING": "判空保护不足",
    "RECURSION_BASE_CASE_MISSING": "递归出口遗漏",
    "PYTHON_RETURN_PRINT_CONFUSION": "返回值与输出混淆",
    "PYTHON_INDEX_VALUE_CONFUSION": "下标和值混淆",
    "PYTHON_REUSE_GUARD_MISSING": "复用同一元素判断不足",
    "TRAIN_VALID_TEST_CONFUSION": "训练集、验证集、测试集混淆",
    "OVERFITTING_SYMPTOM_CONFUSION": "过拟合现象判断不清",
    "MODEL_METRIC_CONFUSION": "模型评估指标混淆",
}

FILL_QUESTION_TYPES = {"FILL_BLANK", "FILL_IN_BLANK"}


PROFILE_BOOTSTRAP_QUESTION_BANK = {
    "PYTHON": [
        {
            "question_type": "SINGLE_CHOICE",
            "stem": "你希望先从 Python 程序设计基础建立摸底。如果函数需要把计算结果交给后续代码继续使用，最合适的做法是什么？",
            "analysis": "画像建档选择了 Python 方向，因此先验证函数返回值这一类基础概念。return 会把结果交给调用方，print 只负责输出展示。",
            "knowledge_points": ["Python 函数", "返回值"],
            "difficulty": "BASIC",
            "score": 10,
            "error_type": "PYTHON_RETURN_PRINT_CONFUSION",
            "options": [("A", "使用 print 输出即可", False), ("B", "使用 return 返回结果", True), ("C", "只写注释说明结果", False), ("D", "把结果写在函数名里", False)],
        },
        {
            "question_type": "SINGLE_CHOICE",
            "stem": "你提到希望找出学习起点。遍历列表 nums 时，如果既要元素下标又要元素值，哪种写法更适合作为起点掌握？",
            "analysis": "enumerate(nums) 能同时拿到下标和值，是 Python 列表遍历的高频基础能力。",
            "knowledge_points": ["列表遍历", "下标和值"],
            "difficulty": "BASIC",
            "score": 10,
            "error_type": "PYTHON_INDEX_VALUE_CONFUSION",
            "options": [("A", "for i, value in enumerate(nums)", True), ("B", "for value in range(nums)", False), ("C", "for nums in value", False), ("D", "while enumerate", False)],
        },
        {
            "question_type": "TRUE_FALSE",
            "stem": "做两数之和这类题时，可以用字典记录已经访问过的元素及下标，从而减少重复查找。",
            "analysis": "字典查找可以把补数定位从重复遍历优化为快速查询，是两数之和的关键思路。",
            "knowledge_points": ["字典查找", "两数之和"],
            "difficulty": "MEDIUM",
            "score": 10,
            "error_type": "PYTHON_REUSE_GUARD_MISSING",
            "options": [("A", "正确", True), ("B", "错误", False)],
        },
        {
            "question_type": "MULTIPLE_CHOICE",
            "stem": "如果你想准备课程作业，写 Python 循环处理列表前，哪些习惯更能减少基础错误？",
            "analysis": "课程作业更看重可运行和边界稳定。先确认输入类型、遍历目标和返回值，能减少常见低级错误。",
            "knowledge_points": ["Python 基础调试", "列表遍历"],
            "difficulty": "MEDIUM",
            "score": 15,
            "error_type": "PYTHON_INDEX_VALUE_CONFUSION",
            "options": [("A", "确认遍历的是列表本身还是下标范围", True), ("B", "函数需要结果时明确 return", True), ("C", "把 print 当作所有函数结果", False), ("D", "完全不处理空列表场景", False)],
        },
    ],
    "DATA_STRUCTURE": [
        {
            "question_type": "SINGLE_CHOICE",
            "stem": "你选择了数据结构刷题方向。删除单链表头节点时，函数最应该返回什么？",
            "analysis": "删除头节点后，链表新的起点是原 head->next，因此函数应返回新的 head。",
            "knowledge_points": ["链表边界处理", "头节点删除"],
            "difficulty": "BASIC",
            "score": 10,
            "error_type": "HEAD_NODE_RETURN_MISSING",
            "options": [("A", "原 head", False), ("B", "原 head->next", True), ("C", "尾节点", False), ("D", "nullptr", False)],
        },
        {
            "question_type": "SINGLE_CHOICE",
            "stem": "如果本次摸底要帮你找到刷题起点，栈和队列最核心的访问差异是什么？",
            "analysis": "栈是后进先出，队列是先进先出，这是判断结构适用场景的基础。",
            "knowledge_points": ["栈与队列", "LIFO/FIFO"],
            "difficulty": "BASIC",
            "score": 10,
            "error_type": "STACK_QUEUE_RULE_CONFUSION",
            "options": [("A", "栈先进先出，队列后进先出", False), ("B", "栈后进先出，队列先进先出", True), ("C", "二者都只能随机访问", False), ("D", "二者都按数值大小访问", False)],
        },
        {
            "question_type": "MULTIPLE_CHOICE",
            "stem": "你希望题量短一点，所以这题合并检查递归出口。递归遍历二叉树时，哪些情况通常应作为出口或保护条件？",
            "analysis": "空节点和不存在的左右子节点都需要出口保护，否则会继续访问不存在的节点。",
            "knowledge_points": ["二叉树递归出口", "边界保护"],
            "difficulty": "MEDIUM",
            "score": 15,
            "error_type": "RECURSION_BASE_CASE_MISSING",
            "options": [("A", "当前节点为空", True), ("B", "递归到不存在的左右子节点", True), ("C", "节点值等于 0 就必须停止", False), ("D", "只要树高度超过 1 就停止", False)],
        },
        {
            "question_type": "TRUE_FALSE",
            "stem": "准备课程作业时，链表删除操作只要普通位置能通过，就可以不单独考虑空链表和头节点。",
            "analysis": "这是常见边界错误。空链表、头节点、尾节点都应单独保护或验证。",
            "knowledge_points": ["链表边界处理", "边界保护"],
            "difficulty": "MEDIUM",
            "score": 10,
            "error_type": "BOUNDARY_CASE_MISSING",
            "options": [("A", "正确", False), ("B", "错误", True)],
        },
    ],
    "MACHINE_LEARNING": [
        {
            "question_type": "SINGLE_CHOICE",
            "stem": "你选择了机器学习核心概念。验证集最主要的作用是什么？",
            "analysis": "验证集用于调参和模型选择，测试集应保留到最终评估阶段使用。",
            "knowledge_points": ["数据集划分", "验证集"],
            "difficulty": "BASIC",
            "score": 10,
            "error_type": "TRAIN_VALID_TEST_CONFUSION",
            "options": [("A", "训练模型参数", False), ("B", "辅助调参与模型选择", True), ("C", "替代所有测试数据", False), ("D", "保存模型文件", False)],
        },
        {
            "question_type": "SINGLE_CHOICE",
            "stem": "如果模型训练集表现很好、验证集表现明显变差，最可能是什么问题？",
            "analysis": "训练集好但验证集差通常说明模型过度拟合训练数据，泛化能力不足。",
            "knowledge_points": ["过拟合与正则化", "泛化能力"],
            "difficulty": "BASIC",
            "score": 10,
            "error_type": "OVERFITTING_SYMPTOM_CONFUSION",
            "options": [("A", "过拟合", True), ("B", "欠拟合且完全不能学习", False), ("C", "数据已经完美", False), ("D", "不需要验证集", False)],
        },
        {
            "question_type": "MULTIPLE_CHOICE",
            "stem": "为了验证最近自学效果，评估分类模型时，哪些指标或观察能帮助判断模型效果？",
            "analysis": "准确率、混淆矩阵和不同类别错误分布都能提供评估依据；只看训练耗时不能说明分类质量。",
            "knowledge_points": ["模型评估", "分类指标"],
            "difficulty": "MEDIUM",
            "score": 15,
            "error_type": "MODEL_METRIC_CONFUSION",
            "options": [("A", "验证集准确率", True), ("B", "混淆矩阵", True), ("C", "只看训练耗时", False), ("D", "不同类别上的错误分布", True)],
        },
        {
            "question_type": "TRUE_FALSE",
            "stem": "期末查漏补缺时，只要训练集准确率很高，就可以直接判断模型已经学得很好。",
            "analysis": "训练集高分不代表泛化稳定，还需要看验证集或测试集表现。",
            "knowledge_points": ["过拟合与正则化", "模型评估"],
            "difficulty": "MEDIUM",
            "score": 10,
            "error_type": "OVERFITTING_SYMPTOM_CONFUSION",
            "options": [("A", "正确", False), ("B", "错误", True)],
        },
    ],
}


def loads_json(value: str, fallback):
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return fallback
    return parsed


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _profile_bootstrap_focus(direction: str) -> str:
    normalized = direction.lower()
    if "python" in normalized or "程序" in direction:
        return "PYTHON"
    if "机器学习" in direction or "模型" in direction or "ml" in normalized:
        return "MACHINE_LEARNING"
    if "综合" in direction or "不确定" in direction:
        return "MIXED"
    return "DATA_STRUCTURE"


def _rotate(items: list[dict], seed_text: str) -> list[dict]:
    if not items:
        return []
    offset = sum(ord(char) for char in seed_text) % len(items)
    return [items[(offset + index) % len(items)] for index in range(len(items))]


def _profile_bootstrap_question_specs(direction: str, goal: str, habit: str, nonce: str) -> list[dict]:
    focus = _profile_bootstrap_focus(direction)
    seed_text = f"{direction}|{goal}|{habit}|{nonce}"
    if focus == "MIXED":
        specs = [
            _rotate(PROFILE_BOOTSTRAP_QUESTION_BANK["PYTHON"], seed_text)[0],
            _rotate(PROFILE_BOOTSTRAP_QUESTION_BANK["DATA_STRUCTURE"], seed_text)[0],
            _rotate(PROFILE_BOOTSTRAP_QUESTION_BANK["MACHINE_LEARNING"], seed_text)[0],
        ]
    else:
        specs = _rotate(PROFILE_BOOTSTRAP_QUESTION_BANK[focus], seed_text)[:3]

    if "解析" in habit and specs:
        specs = [dict(spec) for spec in specs]
        specs[0]["analysis"] = f"{specs[0]['analysis']} 本题会在提交后展示解析，用来帮助你确认当前画像证据的来源。"
    if "期末" in goal and len(specs) >= 3:
        specs = [dict(spec) for spec in specs]
        specs[-1]["difficulty"] = "MEDIUM"
        specs[-1]["stem"] = f"期末查漏补缺场景：{specs[-1]['stem']}"
    if "课程作业" in goal and len(specs) >= 2:
        specs = [dict(spec) for spec in specs]
        specs[1]["stem"] = f"课程作业准备场景：{specs[1]['stem']}"
    return specs


def create_personalized_profile_bootstrap(
    db: Session,
    *,
    base_assignment_id: str,
    class_id: str,
    user: User,
    direction: str,
    goal: str,
    habit: str,
) -> dict:
    base_assignment, base_task, teaching, course = load_assignment_for_student(db, base_assignment_id, class_id)
    if base_assignment.assignment_mode != "PROFILE_BOOTSTRAP":
        raise ApiError(400, "NOT_PROFILE_BOOTSTRAP", "当前任务不是画像摸底任务")
    if base_task.workspace_type != "QUESTION_SET":
        raise ApiError(400, "NOT_QUESTION_WORKSPACE", "当前画像摸底不是题目任务")

    now = utc_now()
    suffix = uuid4().hex[:12]
    task_id = f"task_profile_bootstrap_custom_{suffix}"
    assignment_id = f"assign_profile_bootstrap_custom_{suffix}"
    direction_text = direction.strip() or "综合摸底"
    goal_text = goal.strip() or "建立初始画像"
    habit_text = habit.strip() or "短题量、即时反馈"
    specs = _profile_bootstrap_question_specs(direction_text, goal_text, habit_text, suffix)
    knowledge_points = sorted(
        {
            point
            for spec in specs
            for point in spec.get("knowledge_points", [])
            if point
        }
    )

    task = Task(
        id=task_id,
        course_id=course.id,
        title=f"{course.name}个性化画像摸底",
        description=(
            "基于建档对话实时生成："
            f"方向「{direction_text}」，目标「{goal_text}」，偏好「{habit_text}」。"
            "本次题目只用于形成低置信初始画像。"
        ),
        workspace_type="QUESTION_SET",
        language=base_task.language,
        interface_spec=base_task.interface_spec,
        learning_objectives=json.dumps(
            [
                f"围绕{direction_text}生成可验证摸底题",
                f"服务目标：{goal_text}",
                f"作答节奏：{habit_text}",
            ],
            ensure_ascii=False,
        ),
        hint_forbidden_fragments=base_task.hint_forbidden_fragments,
        capability_ids=base_task.capability_ids,
        status="PUBLISHED",
    )
    db.add(task)
    assignment = TaskAssignment(
        id=assignment_id,
        task_id=task.id,
        teaching_assignment_id=teaching.id,
        published_by=base_assignment.published_by,
        publish_status="PUBLISHED",
        assignment_mode="PROFILE_BOOTSTRAP",
        allow_hint_level_3=base_assignment.allow_hint_level_3,
        published_at=now,
        start_at=now,
        deadline=base_assignment.deadline,
    )
    db.add(assignment)

    for question_index, spec in enumerate(specs, start=1):
        question_id = f"q_profile_bootstrap_{suffix}_{question_index}"
        question = Question(
            id=question_id,
            task_id=task.id,
            question_type=spec["question_type"],
            stem=spec["stem"],
            analysis=spec["analysis"],
            knowledge_points=json.dumps(spec.get("knowledge_points", []), ensure_ascii=False),
            difficulty=spec.get("difficulty", "BASIC"),
            score=spec.get("score", 10),
            error_type=spec.get("error_type"),
            sort_order=question_index,
        )
        db.add(question)
        for option_index, (label, content, is_correct) in enumerate(spec.get("options", []), start=1):
            db.add(
                QuestionOption(
                    id=f"{question_id}_{label.lower()}",
                    question_id=question.id,
                    label=label,
                    content=content,
                    is_correct=bool(is_correct),
                    sort_order=option_index,
                )
            )

    db.add(
        StudentTaskProgress(
            assignment_id=assignment.id,
            student_id=user.id,
            status="NOT_STARTED",
            passed_count=0,
            total_required_count=len(specs),
            updated_at=now,
        )
    )
    db.flush()
    db.add(
        LearnerEvent(
            id=new_id("levent"),
            student_id=user.id,
            course_id=course.id,
            class_id=class_id,
            teaching_assignment_id=teaching.id,
            assignment_id=assignment.id,
            task_id=task.id,
            event_type="PROFILE_BOOTSTRAP_GENERATED",
            knowledge_points=json.dumps(knowledge_points, ensure_ascii=False),
            payload=json.dumps(
                {
                    "direction": direction_text,
                    "goal": goal_text,
                    "habit": habit_text,
                    "base_assignment_id": base_assignment.id,
                    "question_count": len(specs),
                    "generation_mode": "rule_personalized",
                },
                ensure_ascii=False,
            ),
            created_at=now,
        )
    )
    db.commit()
    return {
        "assignment_id": assignment.id,
        "task_id": task.id,
        "course_id": course.id,
        "course_name": course.name,
        "class_id": teaching.class_id,
        "title": task.title,
        "description": task.description,
        "question_count": len(specs),
        "knowledge_points": knowledge_points,
        "intake": {
            "direction": direction_text,
            "goal": goal_text,
            "habit": habit_text,
        },
    }


def load_assignment_for_student(
    db: Session,
    assignment_id: str,
    class_id: str,
    *,
    student_id: str | None = None,
) -> tuple[TaskAssignment, Task, TeachingAssignment, Course]:
    row = db.execute(
        select(TaskAssignment, Task, TeachingAssignment, Course)
        .join(Task, TaskAssignment.task_id == Task.id)
        .join(TeachingAssignment, TaskAssignment.teaching_assignment_id == TeachingAssignment.id)
        .join(Course, TeachingAssignment.course_id == Course.id)
        .where(
            TaskAssignment.id == assignment_id,
            TeachingAssignment.class_id == class_id,
            TeachingAssignment.status == "ACTIVE",
            TaskAssignment.publish_status == "PUBLISHED",
        )
    ).one_or_none()
    if row is None:
        raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "任务不存在或当前学生无权限")
    assignment, task, _, _ = row
    if task.id.startswith("task_profile_bootstrap_custom_") and student_id:
        progress = db.scalar(
            select(StudentTaskProgress).where(
                StudentTaskProgress.assignment_id == assignment.id,
                StudentTaskProgress.student_id == student_id,
            )
        )
        if progress is None:
            raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "任务不存在或当前学生无权限")
    return row


def latest_attempt(db: Session, assignment_id: str, student_id: str) -> QuestionAttempt | None:
    return db.scalar(
        select(QuestionAttempt)
        .where(QuestionAttempt.assignment_id == assignment_id, QuestionAttempt.student_id == student_id)
        .order_by(QuestionAttempt.created_at.desc())
    )


def draft_attempt(db: Session, assignment: TaskAssignment, student_id: str) -> QuestionAttempt:
    attempt = db.scalar(
        select(QuestionAttempt)
        .where(
            QuestionAttempt.assignment_id == assignment.id,
            QuestionAttempt.student_id == student_id,
            QuestionAttempt.status == "DRAFT",
        )
        .order_by(QuestionAttempt.created_at.desc())
    )
    if attempt is not None:
        return attempt
    attempt = QuestionAttempt(
        id=new_id("qattempt"),
        assignment_id=assignment.id,
        task_id=assignment.task_id,
        student_id=student_id,
        status="DRAFT",
    )
    db.add(attempt)
    return attempt


def selected_answer_map(answers: list[dict]) -> dict[str, list[str]]:
    answer_map: dict[str, list[str]] = {}
    for answer in answers:
        question_id = str(answer.get("question_id", ""))
        selected = answer.get("selected_option_ids", [])
        if not question_id or not isinstance(selected, list):
            continue
        answer_map[question_id] = sorted({str(option_id) for option_id in selected})
    return answer_map


def _normalized_text_answer(value: str) -> str:
    return " ".join(value.strip().lower().split())


def serialize_question(question: Question, include_correct: bool = False, answer: list[str] | None = None, result: dict | None = None) -> dict:
    is_fill_question = question.question_type in FILL_QUESTION_TYPES
    payload = {
        "question_id": question.id,
        "question_type": question.question_type,
        "stem": question.stem,
        "analysis": result.get("analysis") if result else "",
        "knowledge_points": loads_json(question.knowledge_points, []),
        "difficulty": question.difficulty,
        "score": question.score,
        "selected_option_ids": answer or [],
        "is_correct": result.get("is_correct") if result else None,
        "earned_score": result.get("score") if result else None,
        "options": [] if is_fill_question else [
            {
                "option_id": option.id,
                "label": option.label,
                "content": option.content,
                **({"is_correct": option.is_correct} if include_correct else {}),
            }
            for option in question.options
        ],
    }
    if include_correct:
        payload["correct_option_ids"] = [option.id for option in question.options if option.is_correct]
        if is_fill_question:
            payload["correct_answers"] = [option.content for option in question.options if option.is_correct]
    return payload


def question_workspace_payload(
    db: Session,
    assignment_id: str,
    class_id: str,
    user: User,
) -> dict:
    assignment, task, teaching, course = load_assignment_for_student(db, assignment_id, class_id, student_id=user.id)
    if task.workspace_type != "QUESTION_SET":
        raise ApiError(400, "NOT_QUESTION_WORKSPACE", "当前任务不是题目作答任务")
    questions = db.scalars(
        select(Question).where(Question.task_id == task.id).order_by(Question.sort_order.asc())
    ).all()
    attempt = latest_attempt(db, assignment.id, user.id)
    answers = loads_json(attempt.answers_json, {}) if attempt else {}
    results = loads_json(attempt.result_json, {}) if attempt else {}
    progress = db.scalar(
        select(StudentTaskProgress).where(
            StudentTaskProgress.assignment_id == assignment.id,
            StudentTaskProgress.student_id == user.id,
        )
    )
    return {
        "assignment": {
            "assignment_id": assignment.id,
            "assignment_mode": assignment.assignment_mode,
            "allow_hint_level_3": assignment.allow_hint_level_3,
            "published_at": iso(assignment.published_at),
            "start_at": iso(assignment_start_at(assignment)),
            "schedule_status": assignment_schedule_status(assignment),
            "deadline": iso(assignment.deadline),
        },
        "task": {
            "task_id": task.id,
            "course_id": course.id,
            "course_name": course.name,
            "teacher_name": teaching.teacher.display_name if teaching.teacher else "",
            "title": task.title,
            "description": task.description,
            "workspace_type": task.workspace_type,
            "learning_objectives": loads_json(task.learning_objectives, []),
        },
        "progress": {
            "status": progress.status if progress else "NOT_STARTED",
            "score": progress.score if progress else None,
            "passed_count": progress.passed_count if progress else 0,
            "total_required_count": progress.total_required_count if progress else len(questions),
        },
        "attempt": {
            "attempt_id": attempt.id if attempt else None,
            "status": attempt.status if attempt else "NOT_STARTED",
            "score": attempt.score if attempt else None,
            "max_score": attempt.max_score if attempt else sum(question.score for question in questions),
            "correct_count": attempt.correct_count if attempt else 0,
            "total_count": attempt.total_count if attempt else len(questions),
            "submitted_at": iso(attempt.submitted_at) if attempt else None,
        },
        "questions": [
            serialize_question(
                question,
                include_correct=bool(attempt and attempt.status == "SUBMITTED"),
                answer=answers.get(question.id, []),
                result=results.get(question.id),
            )
            for question in questions
        ],
        "ai_feedback": (
            build_question_ai_feedback(
                task,
                questions,
                results,
                attempt.score or 0,
                attempt.max_score,
                attempt.correct_count,
            )
            if attempt and attempt.status == "SUBMITTED"
            else None
        ),
    }


def save_question_draft(db: Session, assignment_id: str, class_id: str, user: User, answers: list[dict]) -> dict:
    assignment, task, _, _ = load_assignment_for_student(db, assignment_id, class_id, student_id=user.id)
    if task.workspace_type != "QUESTION_SET":
        raise ApiError(400, "NOT_QUESTION_WORKSPACE", "当前任务不是题目作答任务")
    assert_assignment_started(assignment)
    attempt = draft_attempt(db, assignment, user.id)
    attempt.answers_json = json.dumps(selected_answer_map(answers), ensure_ascii=False, sort_keys=True)
    progress = db.scalar(
        select(StudentTaskProgress).where(
            StudentTaskProgress.assignment_id == assignment.id,
            StudentTaskProgress.student_id == user.id,
        )
    )
    if progress is None:
        progress = StudentTaskProgress(
            assignment_id=assignment.id,
            student_id=user.id,
            status="IN_PROGRESS",
            started_at=utc_now(),
        )
        db.add(progress)
    elif progress.status == "NOT_STARTED":
        progress.status = "IN_PROGRESS"
        progress.started_at = progress.started_at or utc_now()
    progress.updated_at = utc_now()
    db.commit()
    return {"attempt_id": attempt.id, "status": attempt.status, "saved_at": iso(utc_now())}


def evaluate_questions(questions: list[Question], answer_map: dict[str, list[str]]) -> tuple[dict, float, int, float]:
    results = {}
    total_score = sum(question.score for question in questions)
    earned_score = 0.0
    correct_count = 0
    for question in questions:
        selected_values = answer_map.get(question.id, [])
        selected = set(selected_values)
        correct = {option.id for option in question.options if option.is_correct}
        if question.question_type in FILL_QUESTION_TYPES:
            normalized_selected = {
                _normalized_text_answer(value)
                for value in selected_values
                if _normalized_text_answer(value)
            }
            normalized_correct = {
                _normalized_text_answer(option.content)
                for option in question.options
                if option.is_correct and _normalized_text_answer(option.content)
            }
            is_correct = bool(normalized_selected) and not normalized_selected.isdisjoint(normalized_correct)
        else:
            is_correct = selected == correct
        score = question.score if is_correct else 0
        earned_score += score
        correct_count += 1 if is_correct else 0
        results[question.id] = {
            "is_correct": is_correct,
            "score": score,
            "analysis": question.analysis,
            "correct_option_ids": [] if question.question_type in FILL_QUESTION_TYPES else sorted(correct),
            "selected_option_ids": sorted(selected),
        }
    return results, earned_score, correct_count, total_score


def mastery_state(score: float) -> str:
    if score >= 90:
        return "STRONG"
    if score >= 75:
        return "STABLE"
    if score >= 60:
        return "DEVELOPING"
    return "WEAK"


def _question_error_label(question: Question) -> str:
    if question.error_type:
        return ERROR_LABELS.get(question.error_type, question.error_type)
    if question.question_type in FILL_QUESTION_TYPES:
        return "标准答案匹配不足"
    if question.question_type == "MULTIPLE_CHOICE":
        return "多选项组合判断有误"
    return "关键概念判断有误"


def _question_feedback_text(question: Question, result: dict) -> str:
    points = loads_json(question.knowledge_points, [])
    point_text = "、".join(points[:2]) if points else "本题相关知识点"
    analysis = str(result.get("analysis") or "").strip()
    if question.question_type in FILL_QUESTION_TYPES:
        return (
            f"这道填空题按标准答案匹配未通过，建议先复盘 {point_text} 的定义、关键词和表达方式。"
            + (f" 题目解析提示：{analysis}" if analysis else "")
        )
    if question.question_type == "MULTIPLE_CHOICE":
        return (
            f"这道多选题需要完整选中所有正确项且不能多选，当前错误通常说明 {point_text} 的边界或包含关系还不够稳定。"
            + (f" 题目解析提示：{analysis}" if analysis else "")
        )
    return (
        f"这道题反映出 {point_text} 的判断还需要巩固。建议对照题干关键词，先说明概念，再判断选项。"
        + (f" 题目解析提示：{analysis}" if analysis else "")
    )


def build_question_ai_feedback(
    task: Task,
    questions: list[Question],
    results: dict,
    earned_score: float,
    total_score: float,
    correct_count: int,
) -> dict:
    """客观题批改的第一版 AI 反馈契约。

    规则判分仍是事实来源；这里先用确定性兜底产出错因解释、知识点映射和下一步动作。
    """
    wrong_questions = [question for question in questions if not results.get(question.id, {}).get("is_correct")]
    score_percent = round((earned_score / max(total_score, 1)) * 100, 1)
    weak_points = sorted(
        {
            point
            for question in wrong_questions
            for point in loads_json(question.knowledge_points, [])
            if point
        }
    )
    risk_flags = []
    if any(question.question_type in FILL_QUESTION_TYPES for question in wrong_questions):
        risk_flags.append("FILL_BLANK_TEXT_MATCH_REVIEW_SUGGESTED")
    if total_score and score_percent < 60:
        risk_flags.append("LOW_SCORE_NEEDS_TARGETED_REVIEW")

    explanations = []
    for index, question in enumerate(questions, start=1):
        result = results.get(question.id, {})
        if result.get("is_correct"):
            continue
        points = loads_json(question.knowledge_points, [])
        explanations.append(
            {
                "question_id": question.id,
                "question_index": index,
                "error_type": question.error_type or "QUESTION_MISCONCEPTION",
                "error_label": _question_error_label(question),
                "knowledge_points": points,
                "explanation": _question_feedback_text(question, result),
                "next_step": (
                    f"先复盘 {points[0]}，再完成 1 道同类巩固题。"
                    if points
                    else "先复盘本题解析，再完成 1 道同类巩固题。"
                ),
                "confidence": 0.72 if question.error_type else 0.64,
            }
        )

    if not wrong_questions:
        summary = f"本次《{task.title}》规则判分显示全部答对，可以进入下一组迁移练习。"
        confidence = 0.86
    elif weak_points:
        summary = f"本次《{task.title}》得分 {score_percent}%，AI 反馈建议优先复盘：{'、'.join(weak_points[:3])}。"
        confidence = 0.72
    else:
        summary = f"本次《{task.title}》得分 {score_percent}%，建议先查看错题解析，再做同类巩固题。"
        confidence = 0.66

    recommended_actions = []
    if wrong_questions:
        recommended_actions.append(
            {
                "action": "REVIEW_WRONG_QUESTIONS",
                "label": "复盘错题解析",
                "reason": "优先处理本次规则判分未通过的题目。",
            }
        )
    if weak_points:
        recommended_actions.append(
            {
                "action": "GENERATE_SIMILAR_PRACTICE",
                "label": f"生成 {weak_points[0]} 巩固题",
                "reason": "围绕最低掌握知识点做短练习。",
            }
        )
    recommended_actions.append(
        {
            "action": "SAVE_WRONG_NOTE",
            "label": "保存错题总结",
            "reason": "把本次错因沉淀到资料库，便于后续复习。",
        }
    )

    return {
        "status": "READY",
        "workflow_type": "objective_grading_feedback",
        "source": "RULE_FALLBACK",
        "summary": summary,
        "score_basis": "客观题和标准填空先由规则判分，AI 反馈只解释错因和下一步建议。",
        "weak_knowledge_points": weak_points,
        "wrong_question_explanations": explanations,
        "recommended_actions": recommended_actions,
        "risk_flags": risk_flags,
        "confidence": confidence,
        "needs_teacher_review": bool(risk_flags),
    }


def update_learner_profile(
    db: Session,
    user: User,
    class_id: str,
    assignment: TaskAssignment,
    task: Task,
    teaching: TeachingAssignment,
    questions: list[Question],
    results: dict,
    earned_score: float,
    total_score: float,
    correct_count: int,
) -> dict:
    now = utc_now()
    is_bootstrap = assignment.assignment_mode == "PROFILE_BOOTSTRAP"
    all_points: list[str] = []
    performance_by_point: dict[str, list[float]] = {}
    wrong_questions = []
    for question in questions:
        points = loads_json(question.knowledge_points, [])
        all_points.extend(points)
        question_result = results.get(question.id, {})
        ratio = (question_result.get("score", 0) / question.score) if question.score else 0
        for point in points:
            performance_by_point.setdefault(point, []).append(ratio)
        if not question_result.get("is_correct"):
            wrong_questions.append(question)

    for point, ratios in performance_by_point.items():
        performance = sum(ratios) / max(len(ratios), 1)
        state = db.scalar(
            select(LearnerKnowledgeState).where(
                LearnerKnowledgeState.student_id == user.id,
                LearnerKnowledgeState.course_id == task.course_id,
                LearnerKnowledgeState.knowledge_point == point,
            )
        )
        evidence_text = (
            f"画像摸底「{task.title}」作答正确率 {round((correct_count / max(len(questions), 1)) * 100)}%"
            if is_bootstrap
            else f"{task.title} 作答正确率 {round((correct_count / max(len(questions), 1)) * 100)}%"
        )
        if state is None:
            state = LearnerKnowledgeState(
                student_id=user.id,
                course_id=task.course_id,
                knowledge_point=point,
                mastery_score=round(performance * 100, 1),
                state=mastery_state(performance * 100),
                evidence_count=1,
                last_evidence=evidence_text,
                updated_at=now,
            )
            db.add(state)
        else:
            next_score = round((state.mastery_score * 0.7) + (performance * 100 * 0.3), 1)
            state.mastery_score = next_score
            state.state = mastery_state(next_score)
            state.evidence_count += 1
            state.last_evidence = evidence_text
            state.updated_at = now

    for question in wrong_questions:
        if not question.error_type:
            continue
        stat = db.scalar(
            select(LearnerErrorStat).where(
                LearnerErrorStat.student_id == user.id,
                LearnerErrorStat.course_id == task.course_id,
                LearnerErrorStat.error_type == question.error_type,
            )
        )
        points = loads_json(question.knowledge_points, [])
        if stat is None:
            stat = LearnerErrorStat(
                student_id=user.id,
                course_id=task.course_id,
                error_type=question.error_type,
                label=ERROR_LABELS.get(question.error_type, question.error_type),
                count=1,
                severity="MEDIUM",
                related_knowledge_points=json.dumps(points, ensure_ascii=False),
                updated_at=now,
            )
            db.add(stat)
        else:
            stat.count += 1
            stat.severity = "HIGH" if stat.count >= 3 else "MEDIUM"
            stat.related_knowledge_points = json.dumps(sorted(set(loads_json(stat.related_knowledge_points, []) + points)), ensure_ascii=False)
            stat.updated_at = now

    db.add(
        LearnerEvent(
            id=new_id("levent"),
            student_id=user.id,
            course_id=task.course_id,
            class_id=class_id,
            teaching_assignment_id=teaching.id,
            assignment_id=assignment.id,
            task_id=task.id,
            event_type="PROFILE_BOOTSTRAP_SUBMITTED" if is_bootstrap else "QUESTION_SET_SUBMITTED",
            knowledge_points=json.dumps(sorted(set(all_points)), ensure_ascii=False),
            error_type=wrong_questions[0].error_type if wrong_questions and wrong_questions[0].error_type else None,
            payload=json.dumps(
                {
                    "score": earned_score,
                    "max_score": total_score,
                    "accuracy": correct_count / max(len(questions), 1),
                    "wrong_question_ids": [question.id for question in wrong_questions],
                    "basis": (
                        "cold_start_profile = first diagnostic question set"
                        if is_bootstrap
                        else "mastery_score = 70% history + 30% current topic performance"
                    ),
                    "profile_confidence": "LOW" if is_bootstrap else "MEDIUM",
                },
                ensure_ascii=False,
            ),
            created_at=now,
        )
    )

    completed_count = db.scalar(
        select(func.count(StudentTaskProgress.id))
        .join(TaskAssignment, StudentTaskProgress.assignment_id == TaskAssignment.id)
        .join(TeachingAssignment, TaskAssignment.teaching_assignment_id == TeachingAssignment.id)
        .where(
            TeachingAssignment.class_id == class_id,
            TeachingAssignment.course_id == task.course_id,
            StudentTaskProgress.student_id == user.id,
            StudentTaskProgress.status == "COMPLETED",
        )
    ) or 0
    total_assignments = db.scalar(
        select(func.count(TaskAssignment.id)).join(TeachingAssignment).where(
            TeachingAssignment.class_id == class_id,
            TeachingAssignment.course_id == task.course_id,
            TaskAssignment.publish_status == "PUBLISHED",
        )
    ) or 1
    knowledge_states = db.scalars(
        select(LearnerKnowledgeState).where(
            LearnerKnowledgeState.student_id == user.id,
            LearnerKnowledgeState.course_id == task.course_id,
        )
    ).all()
    overall = round(sum(item.mastery_score for item in knowledge_states) / max(len(knowledge_states), 1), 1)
    weak = min(knowledge_states, key=lambda item: item.mastery_score, default=None)
    wrong_rate = 1 - (correct_count / max(len(questions), 1))
    profile = db.scalar(
        select(LearnerProfileSnapshot).where(
            LearnerProfileSnapshot.student_id == user.id,
            LearnerProfileSnapshot.course_id == task.course_id,
        )
    )
    if profile is None:
        profile = LearnerProfileSnapshot(
            id=f"profile_{user.id}_{task.course_id}",
            student_id=user.id,
            course_id=task.course_id,
            class_id=class_id,
            summary_text="已根据画像摸底题生成低置信初始画像。" if is_bootstrap else "已开始基于做题记录生成学习画像。",
            overall_progress=0,
            hint_dependency_level="LOW",
            compile_error_rate=0,
            logic_error_rate=0,
            recent_task_completion=0,
            recommendation_text="",
        )
        db.add(profile)
    profile.overall_progress = overall
    profile.logic_error_rate = round((profile.logic_error_rate * 0.75) + (wrong_rate * 0.25), 2)
    profile.recent_task_completion = round(completed_count / max(total_assignments, 1), 2)
    score_percent = round((earned_score / max(total_score, 1)) * 100)
    if is_bootstrap:
        profile.summary_text = (
            f"已完成画像摸底「{task.title}」，初始得分 {score_percent}%。"
            f"{' 当前最需要确认 ' + weak.knowledge_point if weak and weak.mastery_score < 70 else ' 当前基础表现较稳定'}。"
        )
        profile.recommendation_text = (
            f"先围绕 {weak.knowledge_point} 完成一组入门巩固，再用课程任务验证画像判断。"
            if weak and weak.mastery_score < 70
            else "建议进入课程任务，用真实作业继续验证这份初始画像。"
        )
    else:
        profile.summary_text = (
            f"{task.title} 得分 {score_percent}%，"
            f"{'需要继续巩固' + weak.knowledge_point if weak and weak.mastery_score < 70 else '当前知识掌握趋于稳定'}。"
        )
        profile.recommendation_text = (
            f"优先复盘 {weak.knowledge_point}，再做同类巩固题。"
            if weak and weak.mastery_score < 70
            else "建议进入下一组任务，观察能否迁移到新场景。"
        )
    profile.updated_at = now

    if weak:
        recommendation = db.get(Recommendation, f"rec_{user.id}_{task.course_id}_question_review")
        if recommendation is None:
            recommendation = Recommendation(
                id=f"rec_{user.id}_{task.course_id}_question_review",
                student_id=user.id,
                course_id=task.course_id,
                recommendation_type="PROFILE_BOOTSTRAP" if is_bootstrap else "REVIEW",
                title=f"完成 {weak.knowledge_point} 入门巩固" if is_bootstrap else f"复盘 {weak.knowledge_point}",
                reason=profile.recommendation_text,
                priority=1,
                related_task_id=task.id,
                related_knowledge_points=json.dumps([weak.knowledge_point], ensure_ascii=False),
                suggested_action="OPEN_TASK" if is_bootstrap else "REVIEW_WRONG_QUESTIONS",
                status="ACTIVE",
            )
            db.add(recommendation)
        else:
            recommendation.recommendation_type = "PROFILE_BOOTSTRAP" if is_bootstrap else "REVIEW"
            recommendation.title = f"完成 {weak.knowledge_point} 入门巩固" if is_bootstrap else f"复盘 {weak.knowledge_point}"
            recommendation.reason = profile.recommendation_text
            recommendation.related_task_id = task.id
            recommendation.related_knowledge_points = json.dumps([weak.knowledge_point], ensure_ascii=False)
            recommendation.suggested_action = "OPEN_TASK" if is_bootstrap else "REVIEW_WRONG_QUESTIONS"
            recommendation.status = "ACTIVE"
            recommendation.created_at = now

    sync_learning_recommendations(
        db,
        student_id=user.id,
        class_id=class_id,
        course_id=task.course_id,
    )

    return {
        "profile_status": "INITIAL" if is_bootstrap else "READY",
        "profile_confidence": "LOW" if is_bootstrap else "MEDIUM",
        "overall_progress": profile.overall_progress,
        "logic_error_rate": profile.logic_error_rate,
        "recent_task_completion": profile.recent_task_completion,
        "summary": profile.summary_text,
        "recommendation": profile.recommendation_text,
    }


def submit_question_answers(db: Session, assignment_id: str, class_id: str, user: User, answers: list[dict]) -> dict:
    assignment, task, teaching, _ = load_assignment_for_student(db, assignment_id, class_id, student_id=user.id)
    if task.workspace_type != "QUESTION_SET":
        raise ApiError(400, "NOT_QUESTION_WORKSPACE", "当前任务不是题目作答任务")
    assert_assignment_started(assignment)
    questions = db.scalars(
        select(Question).where(Question.task_id == task.id).order_by(Question.sort_order.asc())
    ).all()
    if not questions:
        raise ApiError(422, "QUESTION_SET_EMPTY", "当前任务还没有配置题目")
    answer_map = selected_answer_map(answers)
    attempt = draft_attempt(db, assignment, user.id)
    results, earned_score, correct_count, total_score = evaluate_questions(questions, answer_map)
    now = utc_now()
    attempt.status = "SUBMITTED"
    attempt.answers_json = json.dumps(answer_map, ensure_ascii=False, sort_keys=True)
    attempt.score = earned_score
    attempt.max_score = total_score
    attempt.correct_count = correct_count
    attempt.total_count = len(questions)
    attempt.result_json = json.dumps(results, ensure_ascii=False, sort_keys=True)
    attempt.submitted_at = now
    db.flush()

    for question in questions:
        answer = db.scalar(
            select(QuestionAnswer).where(
                QuestionAnswer.attempt_id == attempt.id,
                QuestionAnswer.question_id == question.id,
            )
        )
        result = results[question.id]
        if answer is None:
            answer = QuestionAnswer(
                id=new_id("qanswer"),
                attempt_id=attempt.id,
                question_id=question.id,
            )
            db.add(answer)
        answer.selected_option_ids = json.dumps(answer_map.get(question.id, []), ensure_ascii=False)
        answer.is_correct = bool(result["is_correct"])
        answer.score = result["score"]
        answer.answered_at = now

    progress = db.scalar(
        select(StudentTaskProgress).where(
            StudentTaskProgress.assignment_id == assignment.id,
            StudentTaskProgress.student_id == user.id,
        )
    )
    if progress is None:
        progress = StudentTaskProgress(assignment_id=assignment.id, student_id=user.id)
        db.add(progress)
    progress.status = "COMPLETED"
    progress.passed_count = correct_count
    progress.total_required_count = len(questions)
    progress.score = round((earned_score / max(total_score, 1)) * 100, 1)
    progress.started_at = progress.started_at or attempt.created_at
    progress.last_submitted_at = now
    progress.completed_at = now
    progress.updated_at = now

    profile_signal = update_learner_profile(
        db,
        user=user,
        class_id=class_id,
        assignment=assignment,
        task=task,
        teaching=teaching,
        questions=questions,
        results=results,
        earned_score=earned_score,
        total_score=total_score,
        correct_count=correct_count,
    )
    db.commit()
    return {
        "attempt_id": attempt.id,
        "status": attempt.status,
        "score": attempt.score,
        "max_score": attempt.max_score,
        "score_percent": progress.score,
        "correct_count": correct_count,
        "total_count": len(questions),
        "submitted_at": iso(attempt.submitted_at.replace(tzinfo=timezone.utc) if attempt.submitted_at and attempt.submitted_at.tzinfo is None else attempt.submitted_at),
        "questions": [
            serialize_question(
                question,
                include_correct=True,
                answer=answer_map.get(question.id, []),
                result=results[question.id],
            )
            for question in questions
        ],
        "ai_feedback": build_question_ai_feedback(
            task,
            questions,
            results,
            earned_score,
            total_score,
            correct_count,
        ),
        "profile_signal": profile_signal,
    }
