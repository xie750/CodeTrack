"""学习画像序列化。

学生端 `GET /api/v1/student/profile` 和教师端 `GET /api/v1/teacher/analytics/student`
必须返回同一套口径的画像数据 —— 开发方案 §10.2 要求「教师端与学生端学习画像共用同一套
数据，不另算一套」，迁移执行清单 §11.7 的验收项也写明「班级数据与学生个人数据口径一致」。

所以这里是唯一的序列化入口：两端都调这个函数，谁也不自己再查一遍 Learner* 表。
教师端在此基础上追加证据、提示明细和行为轨迹（见 api/teacher_analytics.py），
但六个公共键的字段名和取值必须完全一致。
"""

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import (
    AdministrativeClass,
    Course,
    LearnerErrorStat,
    LearnerKnowledgeState,
    LearnerProfileSnapshot,
    Recommendation,
    TeachingAssignment,
    User,
)
from backend.app.services.submissions import iso


def loads_list(value: str) -> list:
    """JSON 文本列存的数组字段，解析失败时退化为空列表而不是抛错。"""
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def find_profile_snapshot(
    db: Session,
    student_id: str,
    course_id: str | None = None,
    class_id: str | None = None,
) -> LearnerProfileSnapshot | None:
    """取该学生最新的画像快照，可按课程和班级收窄。"""
    query = select(LearnerProfileSnapshot).where(
        LearnerProfileSnapshot.student_id == student_id
    )
    if class_id:
        query = query.where(LearnerProfileSnapshot.class_id == class_id)
    if course_id:
        query = query.where(LearnerProfileSnapshot.course_id == course_id)
    return db.scalar(query.order_by(LearnerProfileSnapshot.updated_at.desc()))


def serialize_learner_profile(
    db: Session,
    student_id: str,
    course_id: str | None = None,
    class_id: str | None = None,
) -> dict | None:
    """画像六件套：student / course / overview / knowledge_states / frequent_errors / recommendations。

    没有画像快照时返回 None，由调用方决定是 404 还是空状态 —— 学生端抛
    LEARNER_PROFILE_NOT_FOUND，教师端要区分「真实零值」和「无数据」，不能一律 404。
    """
    profile = find_profile_snapshot(db, student_id, course_id, class_id)
    if profile is None:
        return None

    student = db.get(User, student_id)
    administrative_class = db.get(AdministrativeClass, profile.class_id)
    course = db.get(Course, profile.course_id)
    teaching = db.scalar(
        select(TeachingAssignment).where(
            TeachingAssignment.class_id == profile.class_id,
            TeachingAssignment.course_id == profile.course_id,
            TeachingAssignment.status == "ACTIVE",
        )
    )
    teacher = db.get(User, teaching.teacher_id) if teaching else None

    knowledge_states = db.scalars(
        select(LearnerKnowledgeState)
        .where(
            LearnerKnowledgeState.student_id == student_id,
            LearnerKnowledgeState.course_id == profile.course_id,
        )
        .order_by(LearnerKnowledgeState.mastery_score.asc())
    ).all()
    error_stats = db.scalars(
        select(LearnerErrorStat)
        .where(
            LearnerErrorStat.student_id == student_id,
            LearnerErrorStat.course_id == profile.course_id,
        )
        .order_by(LearnerErrorStat.count.desc())
    ).all()
    recommendations = db.scalars(
        select(Recommendation)
        .where(
            Recommendation.student_id == student_id,
            Recommendation.course_id == profile.course_id,
            Recommendation.status == "ACTIVE",
        )
        .order_by(Recommendation.priority.desc())
    ).all()

    return {
        "student": {
            "id": student_id,
            "name": student.display_name if student else "",
            "class_id": profile.class_id,
            "class_name": administrative_class.name if administrative_class else "",
        },
        "course": {
            "id": course.id if course else profile.course_id,
            "name": course.name if course else "",
            "teacher_name": teacher.display_name if teacher else "",
        },
        "overview": {
            "overall_progress": profile.overall_progress,
            "hint_dependency_level": profile.hint_dependency_level,
            "compile_error_rate": profile.compile_error_rate,
            "logic_error_rate": profile.logic_error_rate,
            "recent_task_completion": profile.recent_task_completion,
            "summary": profile.summary_text,
            "recommendation": profile.recommendation_text,
            "updated_at": iso(profile.updated_at),
        },
        "knowledge_states": [
            {
                "knowledge_point": item.knowledge_point,
                "mastery_score": item.mastery_score,
                "state": item.state,
                "evidence_count": item.evidence_count,
                "last_evidence": item.last_evidence,
            }
            for item in knowledge_states
        ],
        "frequent_errors": [
            {
                "error_type": item.error_type,
                "label": item.label,
                "count": item.count,
                "severity": item.severity,
                "related_knowledge_points": loads_list(item.related_knowledge_points),
            }
            for item in error_stats
        ],
        "recommendations": [
            {
                "id": item.id,
                "title": item.title,
                "reason": item.reason,
                "priority": item.priority,
                "related_task_id": item.related_task_id,
                "related_knowledge_points": loads_list(item.related_knowledge_points),
                "suggested_action": item.suggested_action,
            }
            for item in recommendations
        ],
    }
