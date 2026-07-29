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
    Recommendation,
    StudentTaskProgress,
    Task,
    TaskAssignment,
    TeachingAssignment,
    User,
)
from backend.app.models.entities import utc_now
from backend.app.services.submissions import iso


ERROR_LABELS = {
    "HEAD_NODE_RETURN_MISSING": "头节点返回遗漏",
    "BOUNDARY_CASE_MISSING": "边界场景覆盖不足",
    "INVALID_POSITION_GUARD_MISSING": "非法位置保护不足",
    "STACK_QUEUE_RULE_CONFUSION": "栈队列规则混淆",
    "EMPTY_GUARD_MISSING": "判空保护不足",
}


def loads_json(value: str, fallback):
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return fallback
    return parsed


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def load_assignment_for_student(db: Session, assignment_id: str, class_id: str) -> tuple[TaskAssignment, Task, TeachingAssignment, Course]:
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


def serialize_question(question: Question, include_correct: bool = False, answer: list[str] | None = None, result: dict | None = None) -> dict:
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
        "options": [
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
    return payload


def question_workspace_payload(
    db: Session,
    assignment_id: str,
    class_id: str,
    user: User,
) -> dict:
    assignment, task, teaching, course = load_assignment_for_student(db, assignment_id, class_id)
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
    }


def save_question_draft(db: Session, assignment_id: str, class_id: str, user: User, answers: list[dict]) -> dict:
    assignment, task, _, _ = load_assignment_for_student(db, assignment_id, class_id)
    if task.workspace_type != "QUESTION_SET":
        raise ApiError(400, "NOT_QUESTION_WORKSPACE", "当前任务不是题目作答任务")
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
        selected = set(answer_map.get(question.id, []))
        correct = {option.id for option in question.options if option.is_correct}
        is_correct = selected == correct
        score = question.score if is_correct else 0
        earned_score += score
        correct_count += 1 if is_correct else 0
        results[question.id] = {
            "is_correct": is_correct,
            "score": score,
            "analysis": question.analysis,
            "correct_option_ids": sorted(correct),
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
        evidence_text = f"{task.title} 作答正确率 {round((correct_count / max(len(questions), 1)) * 100)}%"
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
            event_type="QUESTION_SET_SUBMITTED",
            knowledge_points=json.dumps(sorted(set(all_points)), ensure_ascii=False),
            error_type=wrong_questions[0].error_type if wrong_questions and wrong_questions[0].error_type else None,
            payload=json.dumps(
                {
                    "score": earned_score,
                    "max_score": total_score,
                    "accuracy": correct_count / max(len(questions), 1),
                    "wrong_question_ids": [question.id for question in wrong_questions],
                    "basis": "mastery_score = 70% history + 30% current topic performance",
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
            summary_text="已开始基于做题记录生成学习画像。",
        )
        db.add(profile)
    profile.overall_progress = overall
    profile.logic_error_rate = round((profile.logic_error_rate * 0.75) + (wrong_rate * 0.25), 2)
    profile.recent_task_completion = round(completed_count / max(total_assignments, 1), 2)
    profile.summary_text = (
        f"{task.title} 得分 {round((earned_score / max(total_score, 1)) * 100)}%，"
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
                recommendation_type="REVIEW",
                title=f"复盘 {weak.knowledge_point}",
                reason=profile.recommendation_text,
                priority=1,
                related_task_id=task.id,
                related_knowledge_points=json.dumps([weak.knowledge_point], ensure_ascii=False),
                suggested_action="REVIEW_WRONG_QUESTIONS",
                status="ACTIVE",
            )
            db.add(recommendation)
        else:
            recommendation.title = f"复盘 {weak.knowledge_point}"
            recommendation.reason = profile.recommendation_text
            recommendation.related_task_id = task.id
            recommendation.related_knowledge_points = json.dumps([weak.knowledge_point], ensure_ascii=False)
            recommendation.status = "ACTIVE"
            recommendation.created_at = now

    return {
        "overall_progress": profile.overall_progress,
        "logic_error_rate": profile.logic_error_rate,
        "recent_task_completion": profile.recent_task_completion,
        "summary": profile.summary_text,
        "recommendation": profile.recommendation_text,
    }


def submit_question_answers(db: Session, assignment_id: str, class_id: str, user: User, answers: list[dict]) -> dict:
    assignment, task, teaching, _ = load_assignment_for_student(db, assignment_id, class_id)
    if task.workspace_type != "QUESTION_SET":
        raise ApiError(400, "NOT_QUESTION_WORKSPACE", "当前任务不是题目作答任务")
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
        "profile_signal": profile_signal,
    }
