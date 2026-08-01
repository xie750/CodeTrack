"""教学改进的统计组合与规则建议（开发方案 §十二 12.1）。

这个模块只做两件事：把 `api/teacher_analytics.py` 已经算好的班级聚合**组合**成一页
需要的摘要，再从摘要里**按规则**推导教学建议。

刻意没做的：

- 不写库。教学计划 / 建议采纳状态没有留存表，本轮也不加表，所以「采纳」「忽略」在
  接口层不存在，前端显示为不可用而不是给一个假成功。
- 不调大模型。方案原文把这张卡叫「AI 教学建议卡片」，但本轮建议全部来自下面这组
  确定性阈值，每条都带触发它的统计证据。输出里 `generator` 恒为 `"RULE"`，
  界面也必须照实标注，不要包装成 AI。
- 不做改进前后对比。`learner_profile_snapshots` 按 (student_id, course_id) 唯一、
  更新时原地覆盖，系统没有画像历史快照，所以画像维度的「改进前」取不到。
  这里的 `split_trend` 是**任务维度**的前后分段，来自 `task_assignments.published_at`
  这份真实历史，两者不要混为一谈。

贯穿全文的一条规则：`None` 表示「无数据」，`0.0` 表示「实测为零」。任何分母为空一律
返回 `None`，绝不塌缩成 0 —— 「没人评分」和「都是 0 分」是相反的事实，混淆会让
`LOW_AVG_SCORE` 对着空数据报「班级不及格」。
"""

from backend.app.services.question_workflow import mastery_state

GENERATOR = "RULE"
GENERATOR_VERSION = "improvement-rule-v1"

# 建议排序用。INFO 类只解释现状，不要求教师动作
SEVERITY_RANK = {"HIGH": 2, "MEDIUM": 1, "INFO": 0}

# 与 question_workflow.mastery_state() 的分界保持一致，不另立一套阈值
WEAK_MASTERY_MAX = 60.0
DEVELOPING_MASTERY_MAX = 75.0
HIGH_FREQUENCY_ERROR_MIN = 3
LOW_COMPLETION_MAX = 60.0
HINT_DEPENDENCY_MIN = 30.0
LOGIC_ERROR_MIN = 35.0
LOW_SCORE_MAX = 70.0
TREND_REGRESSION_MIN = 5.0

WINDOW_OPTIONS = (
    {"days": 0, "label": "全部"},
    {"days": 7, "label": "近 7 天"},
    {"days": 30, "label": "近 30 天"},
    {"days": 90, "label": "近 90 天"},
)

WINDOW_SCOPE_NOTE = (
    "时间窗口只筛选任务的发布时间，因此只影响完成率、平均成绩和提示相关指标。"
    "知识点掌握度和错误统计在库里只有当前值、没有历史快照，不随窗口变化。"
)

TREND_NOTE = (
    "前后两段按任务发布时间切分，来自 task_assignments.published_at 这份真实历史，"
    "不是学习画像的历史快照。"
)

SUGGESTION_NOTE = (
    "建议由后端规则直接从聚合统计推导，未调用任何大模型。每条建议都附带触发它的统计证据，"
    "教师应结合课堂观察判断后再决定是否采用。"
)


def _mean(values: list[float]) -> float | None:
    """空列表返回 None 而不是 0.0，这是本模块与 `_mean` 的关键区别。"""
    return round(sum(values) / len(values), 1) if values else None


def _rate(part: int, whole: int) -> float | None:
    return round(part * 100 / whole, 1) if whole else None


def _ability_value(ability: dict, key: str, with_profile: int) -> float | None:
    """`_class_ability()` 对空 profile 列表返回 0.0，这里还原成 None。

    不还原的话，一个班只要没人有画像，`LOGIC_OVER_COMPILE` 和 `LOW_AVG_SCORE`
    就会对着「无数据」误报。
    """
    if not with_profile:
        return None
    return ability.get(key)


def build_weak_knowledge_points(knowledge: dict) -> list[dict]:
    """薄弱知识点排行：按班级平均掌握度升序，升序本身就是排行。

    `_knowledge_matrix()` 给的 `point_averages` 只有均值和覆盖人数，掌握状态和
    WEAK 人数要在这里补：状态用统一的 `mastery_state()`，WEAK 人数从热力图单元格数。
    """
    rows = knowledge.get("rows") or []
    weak_counts: dict[str, int] = {}
    for row in rows:
        for cell in row.get("cells") or []:
            if cell.get("state") == "WEAK":
                point = cell.get("knowledge_point")
                weak_counts[point] = weak_counts.get(point, 0) + 1

    items = []
    for item in knowledge.get("point_averages") or []:
        average = item.get("avg_mastery")
        covered = item.get("covered_students") or 0
        weak_count = weak_counts.get(item.get("knowledge_point"), 0)
        items.append(
            {
                "knowledge_point": item.get("knowledge_point"),
                "avg_mastery": average,
                # 没有任何学生有证据时不硬给一个状态
                "state": mastery_state(average) if average is not None else None,
                "covered_students": covered,
                "weak_student_count": weak_count,
                "weak_ratio": _rate(weak_count, covered),
            }
        )

    # None 排在最后：没有证据的知识点不该被当成最薄弱的那个
    items.sort(key=lambda row: (row["avg_mastery"] is None, row["avg_mastery"] or 0.0))
    return items


def build_summary(
    roster: dict,
    ability: dict,
    trend: list[dict],
    weak_points: list[dict],
    errors: list[dict],
    hint_levels: dict,
) -> dict:
    """一页要用的全部标量指标。每个比率都可能是 None。"""
    with_profile = roster.get("with_profile") or 0
    active_students = roster.get("total") or 0

    # 完成率和平均成绩都从 `_score_trend()` 的任务桶聚合，不另写进度查询：
    # 它已经用 derive_progress_status 处理过「编码类任务不写进度表」的回退。
    pass_rates = [row["pass_rate"] for row in trend if row.get("pass_rate") is not None]
    scored_total = sum(row.get("scored_count") or 0 for row in trend)
    score_sum = sum(
        (row["avg_score"] or 0.0) * (row.get("scored_count") or 0)
        for row in trend
        if row.get("avg_score") is not None
    )

    masteries = [row["avg_mastery"] for row in weak_points if row["avg_mastery"] is not None]
    hint_total = sum(hint_levels.get(key) or 0 for key in ("none", "level_1", "level_2", "level_3"))
    hint_high = (hint_levels.get("level_2") or 0) + (hint_levels.get("level_3") or 0)

    return {
        "published_task_count": len(trend),
        "active_student_count": active_students,
        "with_profile": with_profile,
        "without_profile": roster.get("without_profile") or 0,
        "completion_rate": _mean(pass_rates),
        "avg_score": round(score_sum / scored_total, 1) if scored_total else None,
        "scored_count": scored_total,
        "avg_mastery": _mean(masteries),
        "knowledge_point_count": len(weak_points),
        "weak_knowledge_point_count": sum(1 for row in weak_points if row["state"] == "WEAK"),
        "error_total_count": sum(row.get("total_count") or 0 for row in errors),
        "error_type_count": len(errors),
        "hint_level_2_plus_count": hint_high,
        "hint_ratio": _rate(hint_high, hint_total),
        "avg_overall_progress": _ability_value(ability, "overall_progress", with_profile),
        "avg_compile_error_rate": _ability_value(ability, "compile_error_rate", with_profile),
        "avg_logic_error_rate": _ability_value(ability, "logic_error_rate", with_profile),
        "hint_dependency": ability.get("hint_dependency") or {},
    }


def _trend_segment(rows: list[dict], label: str) -> dict:
    scored = sum(row.get("scored_count") or 0 for row in rows)
    score_sum = sum(
        (row["avg_score"] or 0.0) * (row.get("scored_count") or 0)
        for row in rows
        if row.get("avg_score") is not None
    )
    return {
        "label": label,
        "task_count": len(rows),
        "avg_score": round(score_sum / scored, 1) if scored else None,
        "scored_count": scored,
        "pass_rate": _mean([row["pass_rate"] for row in rows if row.get("pass_rate") is not None]),
    }


def split_trend(trend: list[dict]) -> dict:
    """把已发布任务按发布时间切成前后两段，供时间对比使用。

    少于 2 个任务时不切：一个任务分不出「前后」，硬切只会得到一段空的。
    """
    if len(trend) < 2:
        return {"early": None, "late": None, "note": TREND_NOTE}
    middle = len(trend) // 2
    return {
        "early": _trend_segment(trend[:middle], "较早任务"),
        "late": _trend_segment(trend[middle:], "较近任务"),
        "note": TREND_NOTE,
    }


def _suggestion(
    rule_id: str,
    severity: str,
    title: str,
    detail: str,
    evidence: list[dict],
    suggested_action: str = "NONE",
    subject: str = "",
) -> dict:
    return {
        # rule_id + subject，保证前端可稳定 key，将来加留存表也有个稳定句柄
        "id": f"sug_{rule_id}_{subject}" if subject else f"sug_{rule_id}",
        "rule_id": rule_id,
        "generator": GENERATOR,
        "generator_version": GENERATOR_VERSION,
        "severity": severity,
        "title": title,
        "detail": detail,
        "evidence": evidence,
        "suggested_action": suggested_action,
    }


def _evidence(metric: str, value, source_table: str, subject: str = "") -> dict:
    return {"metric": metric, "subject": subject, "value": value, "source_table": source_table}


def build_suggestions(
    summary: dict,
    weak_points: list[dict],
    errors: list[dict],
    trend_split: dict,
) -> list[dict]:
    """规则建议。纯函数，不接 db，因此阈值边界可以脱离数据库单测。

    末尾三条 INFO 规则（数据不足 / 小样本 / 一切正常）的作用是保证列表永不为空、
    且空数据时说的是实话。看着「没用」也不要删。
    """
    items: list[dict] = []

    active = summary.get("active_student_count") or 0
    if active <= 1:
        items.append(
            _suggestion(
                "SMALL_SAMPLE",
                "INFO",
                "本班样本过小，指标仅供参考",
                f"本班在册学生只有 {active} 名，下面所有比例都是小样本结果，"
                "不宜直接作为班级结论，请结合课堂观察判断。",
                [_evidence("active_student_count", active, "student_class_memberships")],
            )
        )

    # 薄弱知识点：WEAK 和 DEVELOPING 互斥，只对最薄弱的那个出建议，避免一次刷十条
    lowest = next((row for row in weak_points if row["avg_mastery"] is not None), None)
    if lowest is not None:
        point = lowest["knowledge_point"]
        value = lowest["avg_mastery"]
        evidence = [
            _evidence("kp_avg_mastery", value, "learner_knowledge_states", point),
            _evidence(
                "kp_weak_student_count",
                lowest["weak_student_count"],
                "learner_knowledge_states",
                point,
            ),
        ]
        if value < WEAK_MASTERY_MAX:
            items.append(
                _suggestion(
                    "WEAK_KNOWLEDGE_POINT",
                    "HIGH",
                    f"{point} 需要专项重讲",
                    f"{point} 班级平均掌握度 {value}%，低于 60% 及格线"
                    f"（{lowest['weak_student_count']}/{lowest['covered_students']} 名学生处于 WEAK）。"
                    "建议安排一次专项重讲，并把该知识点作为下一次任务的必考点。",
                    evidence,
                    "CREATE_REMEDIAL_TASK",
                    point,
                )
            )
        elif value < DEVELOPING_MASTERY_MAX:
            items.append(
                _suggestion(
                    "DEVELOPING_KNOWLEDGE_POINT",
                    "MEDIUM",
                    f"{point} 尚未进入稳定区间",
                    f"{point} 班级平均掌握度 {value}%，还没到 75% 的稳定线。"
                    "建议下次课用 10 分钟做一次快速回顾，并补一份复习资料。",
                    evidence,
                    "GENERATE_MATERIAL",
                    point,
                )
            )

    top_error = errors[0] if errors else None
    if top_error and (top_error.get("total_count") or 0) >= HIGH_FREQUENCY_ERROR_MIN:
        label = top_error.get("label") or top_error.get("error_type")
        points = top_error.get("related_knowledge_points") or []
        items.append(
            _suggestion(
                "HIGH_FREQUENCY_ERROR",
                "HIGH",
                f"{label} 是当前最高频错误",
                f"{label} 在本班累计出现 {top_error['total_count']} 次、影响 "
                f"{top_error.get('student_count', 0)} 名学生"
                + (f"，关联知识点：{'、'.join(points)}" if points else "")
                + "。建议在下次课集中讲解，并配一组针对该错误的测试用例。",
                [
                    _evidence(
                        "error_total_count",
                        top_error["total_count"],
                        "learner_error_stats",
                        label,
                    )
                ],
                "GENERATE_MATERIAL",
                top_error.get("error_type", ""),
            )
        )

    completion = summary.get("completion_rate")
    if completion is not None and completion < LOW_COMPLETION_MAX:
        items.append(
            _suggestion(
                "LOW_COMPLETION",
                "HIGH",
                "任务完成率偏低",
                f"窗口内共 {summary['published_task_count']} 个已发布任务，班级平均完成率 "
                f"{completion}%，低于 60%。建议放宽节奏，或把任务拆成更小的步骤后再下发。",
                [_evidence("completion_rate", completion, "student_task_progress")],
            )
        )

    hint_ratio = summary.get("hint_ratio")
    if hint_ratio is not None and hint_ratio >= HINT_DEPENDENCY_MIN:
        items.append(
            _suggestion(
                "HINT_DEPENDENCY",
                "MEDIUM",
                "提示依赖偏高",
                f"{summary['hint_level_2_plus_count']} 名学生用到过第 2 级及以上提示"
                f"（占 {hint_ratio}%）。建议下次任务先讲解思路再开放提示，"
                "或把第 3 级提示改为需要申请。",
                [_evidence("hint_ratio", hint_ratio, "submission_versions/student_task_progress")],
            )
        )

    logic = summary.get("avg_logic_error_rate")
    compile_rate = summary.get("avg_compile_error_rate")
    if (
        logic is not None
        and compile_rate is not None
        and logic >= LOGIC_ERROR_MIN
        and logic >= compile_rate
    ):
        items.append(
            _suggestion(
                "LOGIC_OVER_COMPILE",
                "MEDIUM",
                "问题集中在思路而不是语法",
                f"班级平均逻辑错误率 {logic}%，高于编译错误率 {compile_rate}%。"
                "建议把讲解重点放在算法流程和边界枚举上，而不是语法细节。",
                [
                    _evidence("avg_logic_error_rate", logic, "learner_profile_snapshots"),
                    _evidence("avg_compile_error_rate", compile_rate, "learner_profile_snapshots"),
                ],
                "GENERATE_MATERIAL",
            )
        )

    avg_score = summary.get("avg_score")
    if avg_score is not None and avg_score < LOW_SCORE_MAX:
        items.append(
            _suggestion(
                "LOW_AVG_SCORE",
                "MEDIUM",
                "已评分记录平均分偏低",
                f"窗口内已评分记录平均 {avg_score} 分（覆盖 {summary['scored_count']} 条），"
                "低于 70 分。建议先补一次讲评再进入下一单元。",
                [_evidence("avg_score", avg_score, "student_task_progress")],
            )
        )

    early = trend_split.get("early")
    late = trend_split.get("late")
    if (
        early
        and late
        and early.get("avg_score") is not None
        and late.get("avg_score") is not None
        and early["avg_score"] - late["avg_score"] >= TREND_REGRESSION_MIN
    ):
        items.append(
            _suggestion(
                "TREND_REGRESSION",
                "MEDIUM",
                "较近任务的平均分出现回落",
                f"较早任务平均 {early['avg_score']} 分，较近任务平均 {late['avg_score']} 分，"
                "下降超过 5 分。建议复盘最近这几次任务的难度和前置知识是否衔接。",
                [
                    _evidence("early_avg_score", early["avg_score"], "student_task_progress"),
                    _evidence("late_avg_score", late["avg_score"], "student_task_progress"),
                ],
            )
        )

    if not summary.get("scored_count"):
        items.append(
            _suggestion(
                "INSUFFICIENT_SCORE_DATA",
                "INFO",
                "暂无已评分记录，成绩类建议不可用",
                "窗口内没有任何已评分的任务进度，因此成绩相关的建议无法生成。"
                "学生完成一次评分任务后，本卡片会自动补上。",
                [_evidence("scored_count", 0, "student_task_progress")],
            )
        )

    if not any(item["severity"] in ("HIGH", "MEDIUM") for item in items):
        items.append(
            _suggestion(
                "STEADY",
                "INFO",
                "当前统计未触发需要干预的阈值",
                "本窗口内的完成率、掌握度、错误分布和提示使用都没有越过预警阈值，"
                "建议保持现有教学节奏，下一次任务结束后再复核。",
                [],
            )
        )

    items.sort(key=lambda item: -SEVERITY_RANK.get(item["severity"], 0))
    return items


def deltas(current: dict, other: dict) -> dict:
    """两个班（或两个时间段）的标量差值。任一侧为 None 时结果就是 None，不填 0。"""
    keys = (
        "completion_rate",
        "avg_score",
        "avg_mastery",
        "error_total_count",
        "hint_ratio",
        "avg_overall_progress",
        "avg_compile_error_rate",
        "avg_logic_error_rate",
        "weak_knowledge_point_count",
    )
    result: dict[str, float | None] = {}
    for key in keys:
        left = current.get(key)
        right = other.get(key)
        if left is None or right is None:
            result[key] = None
        else:
            result[key] = round(left - right, 1)
    return result


def suggestion_meta(rule_count: int) -> dict:
    return {
        "generator": GENERATOR,
        "generator_version": GENERATOR_VERSION,
        "llm_used": False,
        "rule_count": rule_count,
        "note": SUGGESTION_NOTE,
    }
