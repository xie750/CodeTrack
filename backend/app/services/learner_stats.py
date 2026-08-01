"""班级学习统计的共用读模型。

原来 `_error_distribution` 和 `_knowledge_matrix` 私有在 `api/teacher_analytics.py` 里。
教学首页（§五 5.2 E 班级学情摘要）要展示的「高频错误排行」和「薄弱知识点列表」必须
和学情诊断页（§十 10.1）是同一个口径 —— 首页给的摘要点进去就是诊断页的完整分析，
两处各算一份必然对不上账。所以提到这里，两个模块共用同一份实现。

本模块只读，不写库，也不产生任何解释性文本（§10.1「原始指标由后端计算，AI 只负责
解释和总结」）。
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import LearnerErrorStat, LearnerKnowledgeState, User
from backend.app.services.learner_profile import loads_list
from backend.app.services.teacher_scope import DiagnosisScope


def round1(value: float, digits: int = 1) -> float:
    return round(value, digits)


def mean(values: list[float]) -> float:
    return round1(sum(values) / len(values)) if values else 0.0


def class_error_distribution(db: Session, scope: DiagnosisScope) -> list[dict]:
    """班级高频错误，按影响人数排序。"""
    if not scope.student_ids:
        return []
    rows = db.scalars(
        select(LearnerErrorStat).where(
            LearnerErrorStat.student_id.in_(scope.student_ids),
            LearnerErrorStat.course_id == scope.course_id,
        )
    ).all()

    merged: dict[str, dict] = {}
    for item in rows:
        bucket = merged.setdefault(
            item.error_type,
            {
                "error_type": item.error_type,
                "label": item.label,
                "student_count": 0,
                "total_count": 0,
                "severity": item.severity,
                "related_knowledge_points": [],
            },
        )
        bucket["student_count"] += 1
        bucket["total_count"] += item.count
        if item.severity == "HIGH":
            bucket["severity"] = "HIGH"
        for point in loads_list(item.related_knowledge_points):
            if point not in bucket["related_knowledge_points"]:
                bucket["related_knowledge_points"].append(point)

    data = list(merged.values())
    data.sort(key=lambda row: (-row["student_count"], -row["total_count"], row["error_type"]))
    return data


def class_knowledge_matrix(db: Session, scope: DiagnosisScope) -> dict:
    """知识点掌握热力图：行是学生，列是知识点。"""
    if not scope.student_ids:
        return {"points": [], "rows": [], "point_averages": []}

    states = list(
        db.scalars(
            select(LearnerKnowledgeState).where(
                LearnerKnowledgeState.student_id.in_(scope.student_ids),
                LearnerKnowledgeState.course_id == scope.course_id,
            )
        ).all()
    )
    if not states:
        return {"points": [], "rows": [], "point_averages": []}

    points = sorted({item.knowledge_point for item in states})
    names = {
        row.id: row.display_name
        for row in db.scalars(select(User).where(User.id.in_(scope.student_ids))).all()
    }
    by_student: dict[str, dict[str, LearnerKnowledgeState]] = {}
    for item in states:
        by_student.setdefault(item.student_id, {})[item.knowledge_point] = item

    rows = []
    for student_id in sorted(by_student):
        cells = []
        for point in points:
            state = by_student[student_id].get(point)
            cells.append(
                {
                    "knowledge_point": point,
                    # None 表示该学生这个知识点没有证据，热力图要画成空格而不是 0 分
                    "mastery_score": state.mastery_score if state else None,
                    "state": state.state if state else None,
                    "evidence_count": state.evidence_count if state else 0,
                }
            )
        rows.append(
            {
                "student_id": student_id,
                "student_name": names.get(student_id, ""),
                "cells": cells,
            }
        )

    averages = []
    for index, point in enumerate(points):
        scores = [
            row["cells"][index]["mastery_score"]
            for row in rows
            if row["cells"][index]["mastery_score"] is not None
        ]
        averages.append(
            {
                "knowledge_point": point,
                "avg_mastery": mean(scores) if scores else None,
                "covered_students": len(scores),
            }
        )

    return {"points": points, "rows": rows, "point_averages": averages}
