"""教师端教学改进接口（开发方案 §十二 12.1 教学策略优化）。

**为什么直接 import `teacher_analytics` 的私有助手**：学情诊断（§十）已经把班级层面的
知识点掌握、错误分布、提示分布、成绩趋势全算好了，教学改进要的就是同一批数字加一层
规则解读。再写一套聚合会出现两个口径，违背 §15.2「教师端和学生端必须读取同一份数据」
的同源原则。本轮 `teacher_analytics.py` 尚未提交且正在并行开发，所以只做只读引用、
不动那个文件。

TODO（等 `teacher_analytics.py` 落定后）：把 `_class_roster` / `_class_ability` /
`_score_trend` / `_knowledge_matrix` / `_error_distribution` / `_hint_distribution`
下沉到 `services/class_analytics.py`，两个 router 共用，去掉这里的跨模块私有引用。

刻意没有实现的：

- `POST /improvement/suggestions/{id}/adopt` 和 `/ignore`。采纳和忽略都需要一张教学计划
  留存表，没有表就只能存在前端内存里，刷新即丢 —— 那是会延迟暴露的假成功，比一个
  禁用按钮更糟。前端按 `unavailable_actions` 显示为不可用。
- `GET /improvement/effect`（§12.3 教学效果评估）。见下面 `NO_PROFILE_HISTORY`。
- 任何写操作。本模块全程只读，不 commit、不记审计。
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.api.teacher_analytics import (
    _class_ability,
    _class_roster,
    _error_distribution,
    _hint_distribution,
    _knowledge_matrix,
    _score_trend,
)
from backend.app.core.api_response import ok
from backend.app.core.database import get_db
from backend.app.core.security import current_user, require_role
from backend.app.models import AdministrativeClass, Course, User
from backend.app.services import teaching_improvement as rules
from backend.app.services.submissions import iso
from backend.app.services.teacher_scope import DiagnosisScope, resolve_diagnosis_scope

router = APIRouter(prefix="/api/v1/teacher", tags=["teacher-improvement"])


# 采纳 / 忽略 / 生成资料三个动作背后的模块都还没有写接口。理由文案放后端，
# 前端只负责渲染，避免两边各编一套说辞、后端改了前端还在说旧理由。
UNAVAILABLE_ACTIONS = [
    {
        "action": "ADOPT_SUGGESTION",
        "reason": "采纳需要一张教学计划留存表，当前只提供只读聚合接口，没有可写入的落点。",
        "target_route": None,
    },
    {
        "action": "IGNORE_SUGGESTION",
        "reason": "忽略状态同样需要留存表，否则刷新后就会丢失，这里不做本地假记录。",
        "target_route": None,
    },
    {
        "action": "GENERATE_MATERIAL",
        "reason": "资料中心（§三）尚未接入资料创建接口，暂时只能手动前往该模块。",
        "target_route": "/teacher/resources",
    },
    {
        "action": "CREATE_REMEDIAL_TASK",
        "reason": "可以跳转到任务创建入口，但任务中心（§四）的创建与发布接口尚未实现，跳转后仍是框架页。",
        "target_route": "/teacher/tasks/new",
    },
]


def _window(days: int) -> dict:
    """时间窗口。days=0 表示全部。

    默认取全部是有意的：seed 里 `published_at` 是硬编码的 2026-07，任何相对窗口都会
    随着时间推移变空，默认「全部」才不会出现与代码无关的空页面。
    """
    now = datetime.now(timezone.utc)
    if days <= 0:
        return {"days": 0, "label": "全部", "from": None, "to": iso(now)}
    start = now - timedelta(days=days)
    return {"days": days, "label": f"近 {days} 天", "from": iso(start), "to": iso(now)}


def _filter_trend(trend: list[dict], window: dict) -> list[dict]:
    """按发布时间过滤任务。

    `published_at` 和窗口边界都由 `iso()` 生成（UTC + Z 后缀，等宽），所以字符串比较
    等价于时间比较，不需要再解析回 datetime。发布时间为空的任务一律保留。
    """
    start = window.get("from")
    if not start:
        return trend
    return [row for row in trend if not row.get("published_at") or row["published_at"] >= start]


def _class_names(db: Session, class_ids: list[str]) -> dict[str, str]:
    if not class_ids:
        return {}
    return {
        row.id: row.name
        for row in db.scalars(
            select(AdministrativeClass).where(AdministrativeClass.id.in_(class_ids))
        ).all()
    }


def _aggregate(db: Session, scope: DiagnosisScope, window: dict) -> dict:
    """把学情诊断那套聚合组合成教学改进要的一组数字。"""
    roster, profiles = _class_roster(db, scope)
    ability = _class_ability(profiles)
    trend = _filter_trend(_score_trend(db, scope, None), window)
    knowledge = _knowledge_matrix(db, scope)
    errors = _error_distribution(db, scope)
    hint_levels = _hint_distribution(db, scope)

    weak_points = rules.build_weak_knowledge_points(knowledge)
    summary = rules.build_summary(roster, ability, trend, weak_points, errors, hint_levels)
    return {
        "summary": summary,
        "weak_knowledge_points": weak_points,
        "frequent_errors": errors,
        "hint_levels": hint_levels,
        "trend": rules.split_trend(trend),
    }


def _data_gaps(scope: DiagnosisScope, aggregate: dict) -> list[dict]:
    """把「为什么这里是空的」写清楚，而不是让教师看着空面板猜。"""
    summary = aggregate["summary"]
    gaps: list[dict] = []

    if not summary["active_student_count"]:
        gaps.append(
            {"code": "NO_ACTIVE_STUDENT", "message": "所选班级没有在册学生，本页所有指标都无法计算。"}
        )
    elif summary["active_student_count"] <= 1:
        gaps.append(
            {
                "code": "SMALL_SAMPLE",
                "message": f"所选范围只有 {summary['active_student_count']} 名在册学生，"
                "下列比例都是小样本结果，不宜直接作为班级结论。",
            }
        )
    if not summary["published_task_count"]:
        gaps.append(
            {
                "code": "NO_PUBLISHED_TASK",
                "message": "当前时间窗口内没有已发布任务，完成率和成绩类指标不可用。",
            }
        )
    if not summary["scored_count"]:
        gaps.append(
            {
                "code": "NO_SCORED_PROGRESS",
                "message": "窗口内没有任何已评分的任务进度，平均成绩显示为「—」而不是 0 分。",
            }
        )
    if not aggregate["weak_knowledge_points"]:
        gaps.append(
            {
                "code": "NO_KNOWLEDGE_STATE",
                "message": "所选范围还没有知识点掌握记录，学生完成客观题任务后会自动生成。",
            }
        )
    if not aggregate["frequent_errors"]:
        gaps.append(
            {"code": "NO_ERROR_STAT", "message": "所选范围还没有累计错误统计，高频错误排行为空。"}
        )
    if not summary["with_profile"]:
        gaps.append(
            {
                "code": "NO_PROFILE_SNAPSHOT",
                "message": "所选范围内没有学生生成过学习画像，编译/逻辑错误率显示为「—」。",
            }
        )

    # 恒定存在：这是 §12.3 做不了改进前后对比的根本原因，每次都要说清楚
    gaps.append(
        {
            "code": "NO_PROFILE_HISTORY",
            "message": "learner_profile_snapshots 按 (student_id, course_id) 唯一、更新时原地覆盖，"
            "系统没有画像历史快照，因此本页不提供画像维度的改进前后对比；"
            "「较早/较近任务」对比来自任务发布时间，是任务维度的真实历史。",
        }
    )
    return gaps


@router.get("/improvement/strategy")
def improvement_strategy(
    course_id: str = Query(..., description="课程 ID"),
    class_id: str | None = Query(None, description="不传则聚合该课程下当前教师的全部班级"),
    compare_class_id: str | None = Query(None, description="班级对比，与 class_id 相同则忽略"),
    window_days: int = Query(0, ge=0, le=365, description="0 表示全部；只筛任务发布时间"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    """教学策略优化（§12.1）。

    只读。建议由 `services/teaching_improvement.py` 的规则从聚合统计推导，不调大模型，
    不改成绩，也不改学习画像分数（§15.3）。
    """
    require_role(user, "TEACHER")

    scope = resolve_diagnosis_scope(db, user.id, course_id, class_id)
    window = _window(window_days)
    aggregate = _aggregate(db, scope, window)

    suggestions = rules.build_suggestions(
        aggregate["summary"],
        aggregate["weak_knowledge_points"],
        aggregate["frequent_errors"],
        aggregate["trend"],
    )

    # 对比班级必须单独 resolve 一次。只校验 class_id 而放过 compare_class_id，
    # 对比选择器就成了一个跨教师数据泄漏口子。
    compare = None
    if compare_class_id and compare_class_id != class_id:
        compare_scope = resolve_diagnosis_scope(db, user.id, course_id, compare_class_id)
        compare_aggregate = _aggregate(db, compare_scope, window)
        compare = {
            "class_ids": compare_scope.class_ids,
            "summary": compare_aggregate["summary"],
            "weak_knowledge_points": compare_aggregate["weak_knowledge_points"],
            "frequent_errors": compare_aggregate["frequent_errors"],
            "deltas": rules.deltas(aggregate["summary"], compare_aggregate["summary"]),
        }

    course = db.get(Course, course_id)
    # 选项列表覆盖该教师在本课程下的全部班级，前端不用再单独打一次教学安排接口
    all_class_ids = sorted({item.class_id for item in resolve_diagnosis_scope(db, user.id, course_id).assignments})
    names = _class_names(db, all_class_ids + scope.class_ids)

    return ok(
        {
            "scope": {
                "course_id": course_id,
                "course_name": course.name if course else course_id,
                "class_ids": scope.class_ids,
                "class_names": [names.get(item, item) for item in scope.class_ids],
                "active_student_count": aggregate["summary"]["active_student_count"],
                "with_profile": aggregate["summary"]["with_profile"],
                "without_profile": aggregate["summary"]["without_profile"],
                "small_sample": aggregate["summary"]["active_student_count"] <= 1,
            },
            "class_options": [
                {
                    "class_id": item,
                    "class_name": names.get(item, item),
                    "is_current": item in scope.class_ids,
                    "is_compare": bool(compare) and item == compare_class_id,
                }
                for item in all_class_ids
            ],
            "window": window,
            "window_options": list(rules.WINDOW_OPTIONS),
            "window_scope_note": rules.WINDOW_SCOPE_NOTE,
            "summary": aggregate["summary"],
            "weak_knowledge_points": aggregate["weak_knowledge_points"],
            "frequent_errors": aggregate["frequent_errors"],
            "hint_levels": aggregate["hint_levels"],
            "trend": aggregate["trend"],
            "suggestions": suggestions,
            "suggestion_meta": rules.suggestion_meta(len(suggestions)),
            "compare": compare,
            "data_gaps": _data_gaps(scope, aggregate),
            "unavailable_actions": UNAVAILABLE_ACTIONS,
        },
        meta={"generator": rules.GENERATOR, "window_days": window["days"]},
    )
