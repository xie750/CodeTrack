import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.models import (
    Course,
    Enrollment,
    PracticeProject,
    PracticeProjectActivity,
    PracticeProjectEnrollment,
    PracticeProjectSubmission,
    User,
)
from backend.app.models.entities import utc_now
from backend.app.services.submissions import iso, prefixed_id


DEFAULT_PATH_STEPS = [
    {"title": "画像推理", "description": "读取课程表现、错因、资料保存和学习兴趣，自动判断科研入口方向"},
    {"title": "课题推荐", "description": "系统生成最适合课题和备选课题，学生无需手动选择研究方向"},
    {"title": "前沿追踪", "description": "归纳相关论文与研究动态，生成热点主题和发展趋势"},
    {"title": "写作辅助", "description": "生成综述脉络、论文框架、语言润色和格式检查建议"},
    {"title": "数据分析", "description": "处理实验数据、调查结果或文本资料，输出图表和研究洞察"},
    {"title": "成果沉淀", "description": "提交论文框架、分析报告、图表和过程记录，更新科研画像"},
]

RESEARCH_BRIEF_LIBRARY = {
    "sales-cleaning": {
        "profile_fit": "画像显示你在机器学习模型评估、实验记录和图表解释上已有连续证据，适合进入计算机视觉方向科研训练。",
        "recommendation_reason": "优先推荐该课题，是因为它同时覆盖赛题要求的前沿追踪、学术写作辅助和科研数据分析三个关键环节。",
        "research_stage": "当前处于实验分析与论文框架搭建阶段",
        "frontier_topics": [
            {
                "title": "轻量卷积网络与高效图像分类",
                "source": "课程知识库 + 近三年论文摘要样例",
                "heat": 92,
                "summary": "研究热点从单纯提升准确率转向参数量、推理成本与部署约束的综合平衡。",
            },
            {
                "title": "数据增强对小样本分类稳定性的影响",
                "source": "实验指南 + 综述片段",
                "heat": 78,
                "summary": "增强策略常被作为基线改进项，需要在实验表中单独记录。",
            },
            {
                "title": "模型可解释性与错误类别分析",
                "source": "教师资料库",
                "heat": 71,
                "summary": "分类错误不只看总准确率，还要分析混淆类别、召回率和失败样本分布。",
            },
        ],
        "writing_blocks": [
            {
                "title": "研究背景",
                "content": "CIFAR-10 图像分类适合作为人工智能专业本科科研训练入口，可连接模型结构、训练策略和评估指标。",
                "status": "已生成",
            },
            {
                "title": "相关工作",
                "content": "围绕 ResNet、EfficientNet 与轻量模型改进路线组织综述，突出准确率、参数量和推理效率的取舍。",
                "status": "待补引用",
            },
            {
                "title": "实验设计",
                "content": "固定数据集划分、训练轮次和评价指标，对比不同模型的 Accuracy、Recall、F1 与混淆矩阵表现。",
                "status": "可提交",
            },
            {
                "title": "结论表达",
                "content": "先给出总体指标，再解释差异来源，最后说明局限与下一步优化方向。",
                "status": "待润色",
            },
        ],
        "writing_checks": [
            {"label": "文献综述结构", "result": "已形成主题归纳，但需补充 2 条代表性引用"},
            {"label": "论文框架完整性", "result": "摘要、引言、方法、实验、结论均已覆盖"},
            {"label": "格式规范", "result": "图表编号和指标缩写需要统一"},
        ],
        "data_metrics": [
            {"label": "ResNet-18 Accuracy", "value": "82.4%", "note": "达到验收阈值"},
            {"label": "EfficientNet-B0 Accuracy", "value": "84.1%", "note": "较基线 +1.7%"},
            {"label": "Macro F1", "value": "0.831", "note": "部分类别仍需分析召回率"},
        ],
        "chart_series": [
            {"label": "ResNet-18", "value": 82},
            {"label": "EfficientNet-B0", "value": 84},
            {"label": "增强策略", "value": 86},
            {"label": "错误分析后", "value": 88},
        ],
        "data_insights": [
            "EfficientNet-B0 的提升主要体现在动物类别召回率，但交通工具类别混淆仍明显。",
            "只报告 Accuracy 不足以支撑研究结论，需要补充 Macro F1 与混淆矩阵解释。",
            "下一步建议把数据增强作为消融实验，避免把性能提升全部归因于模型结构。",
        ],
        "next_actions": ["补充两条代表性引用", "生成混淆矩阵解释", "提交实验分析阶段成果包"],
    },
    "log-topk": {
        "profile_fit": "画像显示你在链表和复杂度表达上仍需强化，Top-K 日志课题可以把数据结构知识转成科研分析证据。",
        "recommendation_reason": "该课题适合作为备选，因为它把文本资料处理、算法比较和异常趋势解释压缩到一个轻量研究任务里。",
        "research_stage": "当前处于资料归纳与方法选择阶段",
        "frontier_topics": [
            {
                "title": "日志异常检测中的高频模式挖掘",
                "source": "项目资料库",
                "heat": 81,
                "summary": "高频错误路径是异常检测入门任务，适合比较统计结构与排序策略。",
            },
            {
                "title": "Top-K 算法在流式数据中的应用",
                "source": "课程知识库",
                "heat": 74,
                "summary": "研究关注从离线排序转向增量维护与空间开销控制。",
            },
            {
                "title": "文本日志语义归类",
                "source": "AI 归纳样例",
                "heat": 66,
                "summary": "后续可引入文本聚类，但首版先用规则字段保证可解释。",
            },
        ],
        "writing_blocks": [
            {"title": "问题定义", "content": "从服务日志中定位高频异常接口，比较不同 Top-K 统计方法的准确性和复杂度。", "status": "已生成"},
            {"title": "方法对比", "content": "对比哈希计数、堆维护和全量排序三种方案，说明各自适用的数据规模。", "status": "可提交"},
            {"title": "结果讨论", "content": "结合异常接口分布解释系统风险，避免只列统计结果。", "status": "待润色"},
        ],
        "writing_checks": [
            {"label": "综述覆盖", "result": "需要增加流式 Top-K 的研究背景"},
            {"label": "方法描述", "result": "复杂度表达清晰"},
            {"label": "格式规范", "result": "表格字段命名需要统一"},
        ],
        "data_metrics": [
            {"label": "日志记录数", "value": "12,480", "note": "脱敏样例数据"},
            {"label": "异常路径数", "value": "37", "note": "需聚合相似路径"},
            {"label": "Top-5 覆盖率", "value": "68%", "note": "异常集中度较高"},
        ],
        "chart_series": [
            {"label": "/api/login", "value": 88},
            {"label": "/api/submit", "value": 74},
            {"label": "/api/report", "value": 52},
            {"label": "/api/search", "value": 39},
        ],
        "data_insights": [
            "异常高度集中在登录和提交接口，建议优先检查限流、超时与参数校验。",
            "堆维护方案适合增量日志，但首版报告需要先给出全量排序基线。",
            "文本错误摘要可作为后续语义聚类的扩展入口。",
        ],
        "next_actions": ["补充流式 Top-K 背景", "生成方法复杂度对比表", "提交资料归纳阶段成果"],
    },
    "retention-dashboard": {
        "profile_fit": "画像显示你在 Python 数据处理和图表表达上已有基础，适合进入调查/行为数据分析型科研任务。",
        "recommendation_reason": "该课题可强化科研数据分析产出，特别是指标口径、趋势可视化和结论解释。",
        "research_stage": "当前处于结论提炼与图表规范检查阶段",
        "frontier_topics": [
            {
                "title": "学习分析中的行为序列建模",
                "source": "资料库摘要",
                "heat": 84,
                "summary": "研究从单一完成率转向学习路径、停留时间和任务重试行为的综合解释。",
            },
            {
                "title": "在线学习留存影响因素",
                "source": "调查数据说明",
                "heat": 79,
                "summary": "留存分析需要控制任务难度、反馈及时性和学习基础差异。",
            },
            {
                "title": "教育数据可视化表达",
                "source": "教师资料库",
                "heat": 72,
                "summary": "趋势图与分组柱状图适合展示阶段变化，结论必须绑定指标口径。",
            },
        ],
        "writing_blocks": [
            {"title": "研究问题", "content": "不同学习行为是否会影响课程任务留存和后续提交质量。", "status": "已生成"},
            {"title": "数据方法", "content": "用 Python 汇总注册、访问、学习、提交事件，计算次日和 7 日留存。", "status": "可提交"},
            {"title": "结论草稿", "content": "高频查看诊断和保存资料的学生，后续任务完成稳定性更高。", "status": "待补统计检验"},
        ],
        "writing_checks": [
            {"label": "研究问题清晰度", "result": "变量关系明确"},
            {"label": "数据分析规范", "result": "建议补充缺失值处理说明"},
            {"label": "图表格式", "result": "纵轴单位和样本量需要标注"},
        ],
        "data_metrics": [
            {"label": "次日留存", "value": "71.3%", "note": "较低互动组 +12.6%"},
            {"label": "7 日留存", "value": "48.9%", "note": "受任务难度影响"},
            {"label": "有效样本", "value": "1,286", "note": "已排除缺失记录"},
        ],
        "chart_series": [
            {"label": "低互动", "value": 43},
            {"label": "看诊断", "value": 56},
            {"label": "保存资料", "value": 63},
            {"label": "完成复盘", "value": 71},
        ],
        "data_insights": [
            "保存学习资料与 7 日留存存在正相关，但不能直接解释为因果关系。",
            "任务难度是主要混杂因素，报告中需要按课程或难度分组呈现。",
            "下一步适合补充一张分组趋势图，说明不同学习行为的留存差异。",
        ],
        "next_actions": ["补充缺失值处理说明", "生成分组趋势图", "提交结论提炼阶段成果"],
    },
}


def safe_json_list(raw: str | None) -> list:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return value if isinstance(value, list) else []


def safe_json_object(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def status_label(status: str) -> str:
    return {
        "NOT_STARTED": "待开始",
        "IN_PROGRESS": "进行中",
        "SUBMITTED": "待审核",
        "APPROVED": "已通过",
        "NEEDS_REVISION": "待修正",
        "COMPLETED": "已完成",
    }.get(status, status)


def serialize_project_summary(
    project: PracticeProject,
    enrollment: PracticeProjectEnrollment | None,
    course: Course | None,
) -> dict:
    progress = enrollment.progress if enrollment else 0
    status = enrollment.status if enrollment else "NOT_STARTED"
    return {
        "id": project.id,
        "course_id": project.course_id,
        "course_name": course.name if course else "",
        "title": project.title,
        "status": status,
        "status_label": status_label(status),
        "description": project.description,
        "long_description": project.long_description,
        "progress": progress,
        "accent": project.accent,
        "tags": safe_json_list(project.tags_json),
        "members": safe_json_list(project.member_names_json),
        "period": project.period_label,
        "stage": project.current_stage,
        "direction": project.direction,
        "capability_points": safe_json_list(project.capability_points_json),
        "last_activity_summary": enrollment.last_activity_summary if enrollment else "",
        "weekly_hours": enrollment.weekly_hours if enrollment else 0,
    }


def serialize_activity(activity: PracticeProjectActivity) -> dict:
    return {
        "id": activity.id,
        "project_id": activity.project_id,
        "type": activity.activity_type,
        "text": activity.text,
        "time": activity.time_label,
        "created_at": iso(activity.created_at),
    }


def serialize_submission(submission: PracticeProjectSubmission) -> dict:
    return {
        "id": submission.id,
        "project_id": submission.project_id,
        "title": submission.title,
        "description": submission.description,
        "status": submission.status,
        "status_label": status_label(submission.status),
        "review_comment": submission.review_comment,
        "content": safe_json_object(submission.content_json),
        "submitted_at": iso(submission.submitted_at),
        "created_at": iso(submission.created_at),
    }


def research_brief_for_project(project: PracticeProject, resources: list[dict] | None = None) -> dict:
    resources = resources or safe_json_list(project.resources_json)
    base = RESEARCH_BRIEF_LIBRARY.get(project.id)
    if base is None:
        base = {
            "profile_fit": f"系统根据课程表现和学习画像，将「{project.title}」判断为当前可进入的科研训练课题。",
            "recommendation_reason": "该课题能够覆盖领域前沿追踪、学术写作辅助和科研数据分析，适合作为助研入口的阶段产出。",
            "research_stage": f"当前处于{project.current_stage}阶段",
            "frontier_topics": [
                {
                    "title": project.direction or "专业方向前沿追踪",
                    "source": "课程知识库 + 项目资料",
                    "heat": 72,
                    "summary": project.long_description or project.description,
                }
            ],
            "writing_blocks": [
                {"title": "研究问题", "content": project.description, "status": "已生成"},
                {"title": "阶段框架", "content": project.long_description or project.description, "status": "待完善"},
            ],
            "writing_checks": [
                {"label": "论文框架", "result": "已生成初版结构"},
                {"label": "引用依据", "result": "需要继续补充来源"},
            ],
            "data_metrics": [
                {"label": "助研完成度", "value": "0%", "note": "启动课题后将随提交更新"},
            ],
            "chart_series": [
                {"label": "启动", "value": 20},
                {"label": "分析", "value": 40},
                {"label": "提交", "value": 60},
            ],
            "data_insights": safe_json_list(project.mentor_tips_json) or ["下一步建议先补齐资料来源，再提交阶段成果。"],
            "next_actions": ["查看前沿追踪", "完善论文框架", "提交阶段助研成果"],
        }
    brief = dict(base)
    brief["citations"] = resources
    brief["generated_at"] = iso(utc_now())
    brief["confidence"] = 0.86 if project.id in RESEARCH_BRIEF_LIBRARY else 0.72
    return brief


def research_recommendation_for_project(projects: list[dict], recommended_project_id: str | None) -> dict | None:
    if not projects or recommended_project_id is None:
        return None
    project = next((item for item in projects if item["id"] == recommended_project_id), projects[0])
    brief = RESEARCH_BRIEF_LIBRARY.get(project["id"], {})
    return {
        "project_id": project["id"],
        "profile_fit": brief.get(
            "profile_fit",
            f"系统根据课程表现和学习画像，将「{project['title']}」判断为当前最适合课题。",
        ),
        "recommendation_reason": brief.get(
            "recommendation_reason",
            "该课题能够覆盖前沿追踪、写作辅助和数据分析，适合作为阶段助研成果。",
        ),
        "signals": [
            {
                "label": "研究方向",
                "value": project.get("direction") or "人工智能专业方向",
                "note": "由课程表现、资料保存和阶段提交记录推断",
            },
            {
                "label": "能力短板",
                "value": "文献综述、图表解释",
                "note": "来自 AI 问答、实验记录和成果提交质量",
            },
            {
                "label": "推荐策略",
                "value": "先做小课题，再沉淀论文框架",
                "note": "匹配赛题助研关键环节",
            },
        ],
        "confidence": 0.86,
    }


def project_scope_query(student_id: str, class_id: str):
    return (
        select(PracticeProject, PracticeProjectEnrollment, Course)
        .join(Course, PracticeProject.course_id == Course.id)
        .join(
            PracticeProjectEnrollment,
            (PracticeProjectEnrollment.project_id == PracticeProject.id)
            & (PracticeProjectEnrollment.student_id == student_id)
            & (PracticeProjectEnrollment.class_id == class_id),
        )
        .join(
            Enrollment,
            (Enrollment.course_id == PracticeProject.course_id)
            & (Enrollment.user_id == student_id)
            & (Enrollment.role == "STUDENT"),
        )
        .where(PracticeProject.status == "ACTIVE")
        .order_by(PracticeProject.sort_order.asc(), PracticeProject.id.asc())
    )


def starter_project_query(student_id: str):
    return (
        select(PracticeProject, Course)
        .join(Course, PracticeProject.course_id == Course.id)
        .join(
            Enrollment,
            (Enrollment.course_id == PracticeProject.course_id)
            & (Enrollment.user_id == student_id)
            & (Enrollment.role == "STUDENT"),
        )
        .outerjoin(
            PracticeProjectEnrollment,
            (PracticeProjectEnrollment.project_id == PracticeProject.id)
            & (PracticeProjectEnrollment.student_id == student_id),
        )
        .where(
            PracticeProject.status == "ACTIVE",
            PracticeProjectEnrollment.id.is_(None),
        )
        .order_by(PracticeProject.sort_order.asc(), PracticeProject.id.asc())
    )


def home_readiness(projects: list[dict]) -> dict:
    if projects:
        return {
            "status": "ACTIVE",
            "title": "AI 已为你生成科研项目推荐",
            "description": "平台已根据学习画像、课程表现和能力短板完成底层推理，自动给出最适合的科研训练课题。",
            "primary_action_label": "进入最适合课题",
            "secondary_action_label": "查看推理路径",
        }
    return {
        "status": "PREPARING",
        "title": "科研项目实践尚未开启",
        "description": "当课程任务、自主学习和资料沉淀产生足够画像信号后，系统会自动生成最适合的科研课题。",
        "primary_action_label": "生成科研课题",
        "secondary_action_label": "先完成课程任务",
    }


def list_practice_projects(db: Session, student_id: str, class_id: str) -> dict:
    rows = db.execute(project_scope_query(student_id, class_id)).all()
    projects = [serialize_project_summary(project, enrollment, course) for project, enrollment, course in rows]
    active_projects = [project for project in projects if project["status"] == "IN_PROGRESS"]
    completed_projects = [project for project in projects if project["status"] in {"COMPLETED", "APPROVED"}]
    weekly_hours = round(sum(float(project.get("weekly_hours") or 0) for project in projects), 1)
    project_ids = [project["id"] for project in projects]
    activities = (
        db.scalars(
            select(PracticeProjectActivity)
            .where(
                PracticeProjectActivity.student_id == student_id,
                PracticeProjectActivity.project_id.in_(project_ids),
            )
            .order_by(PracticeProjectActivity.created_at.desc())
            .limit(6)
        ).all()
        if project_ids
        else []
    )
    recommended_project_id = active_projects[0]["id"] if active_projects else (projects[0]["id"] if projects else None)
    return {
        "projects": projects,
        "recommended_project_id": recommended_project_id,
        "research_recommendation": research_recommendation_for_project(projects, recommended_project_id),
        "stats": {
            "project_count": len(projects),
            "in_progress_count": len(active_projects),
            "completed_count": len(completed_projects),
            "weekly_hours": weekly_hours,
            "project_delta": 1,
            "completed_delta": 1,
            "weekly_hours_delta": 2.3,
        },
        "activities": [serialize_activity(activity) for activity in activities],
        "path_steps": (
            safe_json_list(rows[0][0].path_steps_json)
            if rows
            else DEFAULT_PATH_STEPS
        ),
        "readiness": home_readiness(projects),
        "proof_items": [
            {"title": "画像驱动推荐", "description": "不让学生先选方向，平台基于画像自动匹配课题。", "icon": "target"},
            {"title": "前沿追踪", "description": "归纳论文、研究动态、热点主题和趋势判断。", "icon": "search"},
            {"title": "写作辅助", "description": "支持综述生成、论文框架、润色和格式规范检查。", "icon": "file-check"},
            {"title": "数据分析", "description": "处理实验、调查和文本资料，输出图表与研究洞察。", "icon": "database"},
        ],
    }


def start_first_practice_project(db: Session, student: User, class_id: str) -> dict:
    existing = db.execute(project_scope_query(student.id, class_id)).first()
    if existing is not None:
        project, _, _ = existing
        return {
            "started": False,
            "detail": get_practice_project_detail(db, project.id, student.id, class_id),
        }

    row = db.execute(starter_project_query(student.id)).first()
    if row is None:
        raise ApiError(404, "PRACTICE_STARTER_NOT_AVAILABLE", "当前还没有足够画像信号生成科研课题，请先完成课程任务后再回来尝试。")

    project, _ = row
    now = utc_now()
    enrollment = PracticeProjectEnrollment(
        project_id=project.id,
        student_id=student.id,
        class_id=class_id,
        status="IN_PROGRESS",
        progress=1,
        completed_stage_count=0,
        experiment_record_count=0,
        submission_count=0,
        weekly_hours=0,
        last_activity_summary="开启第一个科研课题",
        joined_at=now,
        updated_at=now,
    )
    db.add(enrollment)
    activity = PracticeProjectActivity(
        id=prefixed_id("practice_activity"),
        project_id=project.id,
        student_id=student.id,
        activity_type="join",
        text=f"开启第一个科研课题「{project.title}」",
        time_label="刚刚",
        created_at=now,
    )
    db.add(activity)
    db.flush()
    return {
        "started": True,
        "detail": get_practice_project_detail(db, project.id, student.id, class_id),
    }


def get_practice_project_detail(db: Session, project_id: str, student_id: str, class_id: str) -> dict:
    row = db.execute(
        project_scope_query(student_id, class_id).where(PracticeProject.id == project_id)
    ).first()
    if row is None:
        raise ApiError(404, "PRACTICE_PROJECT_NOT_FOUND", "科研项目实践不存在或当前学生无权访问。")
    project, enrollment, course = row
    summary = serialize_project_summary(project, enrollment, course)
    submissions = db.scalars(
        select(PracticeProjectSubmission)
        .where(
            PracticeProjectSubmission.project_id == project.id,
            PracticeProjectSubmission.student_id == student_id,
        )
        .order_by(PracticeProjectSubmission.submitted_at.desc())
        .limit(8)
    ).all()
    activities = db.scalars(
        select(PracticeProjectActivity)
        .where(
            PracticeProjectActivity.project_id == project.id,
            PracticeProjectActivity.student_id == student_id,
        )
        .order_by(PracticeProjectActivity.created_at.desc())
        .limit(8)
    ).all()
    return {
        "project": summary,
        "metrics": {
            "completed_stage_count": enrollment.completed_stage_count if enrollment else 0,
            "total_stage_count": project.total_stage_count,
            "experiment_record_count": enrollment.experiment_record_count if enrollment else 0,
            "submission_count": enrollment.submission_count if enrollment else 0,
        },
        "task_sections": safe_json_list(project.task_sections_json),
        "submission_requirements": safe_json_list(project.submission_requirements_json),
        "acceptance_criteria": safe_json_list(project.acceptance_criteria_json),
        "mentor_tips": safe_json_list(project.mentor_tips_json),
        "resources": safe_json_list(project.resources_json),
        "research_brief": research_brief_for_project(project),
        "submissions": [serialize_submission(submission) for submission in submissions],
        "activities": [serialize_activity(activity) for activity in activities],
    }


def create_practice_submission(
    db: Session,
    project_id: str,
    student: User,
    class_id: str,
    title: str,
    description: str,
    materials: list[str],
) -> dict:
    row = db.execute(
        project_scope_query(student.id, class_id).where(PracticeProject.id == project_id)
    ).first()
    if row is None:
        raise ApiError(404, "PRACTICE_PROJECT_NOT_FOUND", "科研项目实践不存在或当前学生无权访问。")
    project, enrollment, _ = row
    now = utc_now()
    submission = PracticeProjectSubmission(
        id=prefixed_id("practice_submit"),
        project_id=project.id,
        student_id=student.id,
        title=title.strip() or f"{project.current_stage} 阶段助研成果",
        description=description.strip() or f"提交内容：{project.current_stage} 阶段科研材料。",
        status="SUBMITTED",
        review_comment="已进入阶段助研成果审核队列，平台将结合前沿追踪、写作规范、数据分析和验收标准生成反馈。",
        content_json=json.dumps({"materials": materials}, ensure_ascii=False),
        submitted_at=now,
        created_at=now,
    )
    db.add(submission)
    enrollment.status = "SUBMITTED"
    enrollment.submission_count += 1
    enrollment.experiment_record_count += 1 if materials else 0
    enrollment.last_activity_summary = f"提交了 {submission.title}"
    enrollment.updated_at = now
    activity = PracticeProjectActivity(
        id=prefixed_id("practice_activity"),
        project_id=project.id,
        student_id=student.id,
        activity_type="submit",
        text=f"你提交了 {submission.title}",
        time_label="刚刚",
        created_at=now,
    )
    db.add(activity)
    db.flush()
    return {
        "submission": serialize_submission(submission),
        "detail": get_practice_project_detail(db, project.id, student.id, class_id),
    }
