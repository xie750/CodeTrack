import json
import re
from pathlib import Path
from urllib.parse import quote_plus

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings
from backend.app.models import (
    Course,
    Enrollment,
    LearnerEvent,
    PracticeProject,
    PracticeProjectActivity,
    PracticeProjectEnrollment,
    PracticeProjectMaterial,
    PracticeProjectSubmission,
    StudentGeneratedResource,
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

PAPER_SEARCH_BASES = {
    "arxiv": "https://arxiv.org/search/?query={query}&searchtype=all&source=header",
    "semantic_scholar": "https://www.semanticscholar.org/search?q={query}&sort=relevance",
    "papers_with_code": "https://paperswithcode.com/search?q={query}",
    "huggingface_papers": "https://huggingface.co/papers?q={query}",
}

RESEARCH_BRIEF_LIBRARY = {
    "sales-cleaning": {
        "profile_fit": "画像显示你在机器学习模型评估、实验记录和图表解释上已有连续证据，适合进入计算机视觉方向科研训练。",
        "recommendation_reason": "优先推荐该课题，是因为它同时覆盖赛题要求的前沿追踪、学术写作辅助和科研数据分析三个关键环节。",
        "research_stage": "当前处于实验分析与论文框架搭建阶段",
        "frontier_topics": [
            {
                "title": "轻量卷积网络与高效图像分类",
                "source": "课程知识库 + 近三年论文摘要样例",
                "source_url": "https://arxiv.org/search/?query=efficient+image+classification+lightweight+cnn&searchtype=all&source=header",
                "code_url": "https://paperswithcode.com/search?q=lightweight%20image%20classification",
                "heat": 92,
                "summary": "研究热点从单纯提升准确率转向参数量、推理成本与部署约束的综合平衡。",
            },
            {
                "title": "数据增强对小样本分类稳定性的影响",
                "source": "实验指南 + 综述片段",
                "source_url": "https://arxiv.org/search/?query=data+augmentation+small+sample+image+classification&searchtype=all&source=header",
                "code_url": "https://paperswithcode.com/search?q=data%20augmentation%20cifar-10",
                "heat": 78,
                "summary": "增强策略常被作为基线改进项，需要在实验表中单独记录。",
            },
            {
                "title": "模型可解释性与错误类别分析",
                "source": "教师资料库",
                "source_url": "https://www.semanticscholar.org/search?q=model%20interpretability%20image%20classification%20error%20analysis&sort=relevance",
                "code_url": "https://huggingface.co/papers?q=image%20classification%20interpretability",
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
                "source_url": "https://arxiv.org/search/?query=log+anomaly+detection+frequent+pattern+mining&searchtype=all&source=header",
                "code_url": "https://paperswithcode.com/search?q=log%20anomaly%20detection",
                "heat": 81,
                "summary": "高频错误路径是异常检测入门任务，适合比较统计结构与排序策略。",
            },
            {
                "title": "Top-K 算法在流式数据中的应用",
                "source": "课程知识库",
                "source_url": "https://www.semanticscholar.org/search?q=top-k%20algorithm%20streaming%20data&sort=relevance",
                "code_url": "https://paperswithcode.com/search?q=top-k%20streaming",
                "heat": 74,
                "summary": "研究关注从离线排序转向增量维护与空间开销控制。",
            },
            {
                "title": "文本日志语义归类",
                "source": "AI 归纳样例",
                "source_url": "https://arxiv.org/search/?query=semantic+log+clustering+anomaly+detection&searchtype=all&source=header",
                "code_url": "https://huggingface.co/papers?q=log%20anomaly%20detection",
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
                "source_url": "https://www.semanticscholar.org/search?q=learning%20analytics%20behavior%20sequence%20modeling&sort=relevance",
                "code_url": "https://paperswithcode.com/search?q=learning%20analytics",
                "heat": 84,
                "summary": "研究从单一完成率转向学习路径、停留时间和任务重试行为的综合解释。",
            },
            {
                "title": "在线学习留存影响因素",
                "source": "调查数据说明",
                "source_url": "https://arxiv.org/search/?query=online+learning+retention+factor+analysis&searchtype=all&source=header",
                "code_url": "https://huggingface.co/papers?q=online%20learning%20retention",
                "heat": 79,
                "summary": "留存分析需要控制任务难度、反馈及时性和学习基础差异。",
            },
            {
                "title": "教育数据可视化表达",
                "source": "教师资料库",
                "source_url": "https://www.semanticscholar.org/search?q=educational%20data%20visualization%20learning%20analytics&sort=relevance",
                "code_url": "https://paperswithcode.com/search?q=education%20data%20visualization",
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


def safe_file_name(name: str | None) -> str:
    base = Path(name or "upload").name
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", base)
    return cleaned[:255] or "upload"


def external_source_links(project: PracticeProject, focus: str = "") -> list[dict]:
    query = focus.strip() or project.direction or project.title
    encoded = quote_plus(query)
    return [
        {
            "platform": "arxiv",
            "label": "arXiv 论文检索",
            "description": "查看相关预印本、最新论文标题和摘要。",
            "url": PAPER_SEARCH_BASES["arxiv"].format(query=encoded),
        },
        {
            "platform": "semantic_scholar",
            "label": "Semantic Scholar",
            "description": "查看论文、作者、引用和相关研究脉络。",
            "url": PAPER_SEARCH_BASES["semantic_scholar"].format(query=encoded),
        },
        {
            "platform": "papers_with_code",
            "label": "Papers with Code",
            "description": "查看论文对应代码、任务、数据集和 benchmark。",
            "url": PAPER_SEARCH_BASES["papers_with_code"].format(query=encoded),
        },
        {
            "platform": "huggingface_papers",
            "label": "Hugging Face Papers",
            "description": "查看模型社区近期论文和实现讨论。",
            "url": PAPER_SEARCH_BASES["huggingface_papers"].format(query=encoded),
        },
    ]


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


def serialize_material(material: PracticeProjectMaterial) -> dict:
    return {
        "id": material.id,
        "project_id": material.project_id,
        "material_type": material.material_type,
        "title": material.title,
        "description": material.description,
        "content": material.content,
        "file_name": material.file_name,
        "file_size": material.file_size,
        "mime_type": material.mime_type,
        "download_url": (
            f"/api/v1/student/practice-projects/{material.project_id}/materials/{material.id}/download"
            if material.storage_path
            else None
        ),
        "external_url": material.external_url,
        "source": material.source,
        "status": material.status,
        "created_at": iso(material.created_at),
        "updated_at": iso(material.updated_at),
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
                    "source_url": PAPER_SEARCH_BASES["arxiv"].format(query=quote_plus(project.direction or project.title)),
                    "code_url": PAPER_SEARCH_BASES["papers_with_code"].format(query=quote_plus(project.direction or project.title)),
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
    for index, citation in enumerate(brief["citations"]):
        if isinstance(citation, dict) and not citation.get("source_url"):
            citation["source_url"] = external_source_links(project)[index % 4]["url"]
    brief["external_sources"] = external_source_links(project)
    brief["generated_at"] = iso(utc_now())
    brief["confidence"] = 0.86 if project.id in RESEARCH_BRIEF_LIBRARY else 0.72
    return brief


def _project_knowledge_points(project: PracticeProject) -> list[str]:
    points = safe_json_list(project.capability_points_json)
    if project.direction:
        points.insert(0, project.direction)
    return [str(point) for point in points[:6]]


def _add_learner_event(
    db: Session,
    *,
    project: PracticeProject,
    student_id: str,
    class_id: str,
    event_type: str,
    payload: dict,
) -> None:
    db.add(
        LearnerEvent(
            id=prefixed_id("event"),
            student_id=student_id,
            course_id=project.course_id,
            class_id=class_id,
            event_type=event_type,
            knowledge_points=json.dumps(_project_knowledge_points(project), ensure_ascii=False),
            payload=json.dumps(payload, ensure_ascii=False),
        )
    )


def _update_enrollment_for_activity(
    enrollment: PracticeProjectEnrollment | None,
    *,
    progress_delta: int,
    experiment_delta: int,
    summary: str,
) -> None:
    if enrollment is None:
        return
    enrollment.status = "IN_PROGRESS" if enrollment.status == "NOT_STARTED" else enrollment.status
    enrollment.progress = min(100, max(enrollment.progress, enrollment.progress + progress_delta))
    enrollment.experiment_record_count += experiment_delta
    enrollment.weekly_hours = round(float(enrollment.weekly_hours or 0) + 0.3, 1)
    enrollment.last_activity_summary = summary
    enrollment.updated_at = utc_now()


def _create_submission_resource(
    db: Session,
    *,
    project: PracticeProject,
    student: User,
    class_id: str,
    submission: PracticeProjectSubmission,
    materials: list[str],
    material_records: list[PracticeProjectMaterial],
) -> StudentGeneratedResource:
    resources = safe_json_list(project.resources_json)
    citations = [
        {
            "source_id": f"practice_project:{project.id}:{index}",
            "title": item.get("title", "科研项目资料") if isinstance(item, dict) else str(item),
            "summary": item.get("meta", "") if isinstance(item, dict) else "",
            "source_type": "practice_project",
            "version": "v0.1",
            "authority_level": "COURSE",
            "source_url": (
                item.get("source_url")
                if isinstance(item, dict) and item.get("source_url")
                else external_source_links(project)[index % 4]["url"]
            ),
        }
        for index, item in enumerate(resources)
    ]
    material_sections = [
        {
            "heading": record.title,
            "paragraphs": [
                record.description or "学生上传的科研过程材料。",
                record.content or record.file_name or record.external_url or "已记录材料元数据。",
            ],
            "citation_ids": [],
        }
        for record in material_records
    ]
    payload = {
        "sections": [
            {
                "heading": "阶段提交概览",
                "paragraphs": [
                    submission.description,
                    f"本次成果包包含：{'、'.join(materials) if materials else '阶段研究结论'}。",
                ],
                "citation_ids": [item["source_id"] for item in citations[:2]],
            },
            {
                "heading": "前沿追踪与分析依据",
                "paragraphs": [
                    "系统已将前沿追踪、写作检查、数据分析和阶段提交合并为可回看的科研学习产物。",
                    "后续可从资料中心继续追问、生成练习或补充论文框架。",
                ],
                "citation_ids": [item["source_id"] for item in citations],
            },
            *material_sections,
        ],
        "metadata": {
            "source": "practice_project_submission",
            "project_id": project.id,
            "submission_id": submission.id,
            "material_ids": [record.id for record in material_records],
        },
    }
    now = utc_now()
    resource = StudentGeneratedResource(
        id=prefixed_id("resource"),
        student_id=student.id,
        course_id=project.course_id,
        class_id=class_id,
        run_id=None,
        session_id=None,
        resource_type="DOCUMENT",
        title=f"{submission.title} · 科研阶段总结",
        prompt=f"沉淀科研项目「{project.title}」的阶段成果。",
        knowledge_point=project.direction or project.title,
        summary=f"已沉淀 {submission.title}，包含前沿追踪、材料清单、阶段结论和后续动作。",
        status="READY",
        render_payload_json=json.dumps(payload, ensure_ascii=False),
        citations_json=json.dumps(citations, ensure_ascii=False),
        file_path=None,
        file_format="HTML",
        confidence=0.84,
        saved_to_resource_center=True,
        saved_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(resource)
    return resource


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


def analyze_practice_project_fit(db: Session, student: User, class_id: str) -> dict:
    home = list_practice_projects(db, student_id=student.id, class_id=class_id)
    recommended_project_id = home.get("recommended_project_id")
    if not recommended_project_id:
        return {
            "analysis": {
                "project_id": None,
                "title": "科研画像信号不足",
                "summary": "当前还没有可进入的科研项目。建议先完成课程任务、自主学习或资料沉淀，让系统获得足够画像信号后再自动推荐课题。",
                "confidence": 0,
                "signals": [],
                "fit_reasons": ["暂无已绑定的科研课题", "课程任务和资料沉淀记录还不足以支撑推荐"],
                "risk_flags": ["缺少可沉淀的项目活动记录"],
                "next_actions": ["先完成一项课程任务", "保存一份学习资料", "回到科研入口生成第一个科研课题"],
                "generated_at": iso(utc_now()),
            },
            "activity": None,
            "home": home,
        }

    row = db.execute(
        project_scope_query(student.id, class_id).where(PracticeProject.id == recommended_project_id)
    ).first()
    if row is None:
        raise ApiError(404, "PRACTICE_PROJECT_NOT_FOUND", "科研项目实践不存在或当前学生无权访问。")

    project, enrollment, _ = row
    now = utc_now()
    recommendation = home.get("research_recommendation") or {}
    signals = recommendation.get("signals") or []
    brief = research_brief_for_project(project)
    progress = int(enrollment.progress if enrollment else 0)
    confidence = float(recommendation.get("confidence") or brief.get("confidence") or 0.72)
    next_actions = list(brief.get("next_actions") or [])[:3]
    if progress < 30:
        next_actions = ["先补一份前沿追踪笔记", *next_actions][:3]
    elif progress >= 70:
        next_actions = ["整理阶段成果并提交审核", *next_actions][:3]

    fit_reasons = [
        str(recommendation.get("profile_fit") or brief.get("profile_fit")),
        f"当前项目处于「{project.current_stage}」，已完成度 {progress}%，适合继续沿同一科研轨道推进。",
        "系统已把课程表现、资料沉淀、实验记录和提交质量合并为可复查的画像信号。",
    ]
    risk_flags = []
    if progress < 40:
        risk_flags.append("阶段证据偏少，需要先补前沿资料或实验记录。")
    if enrollment and enrollment.submission_count == 0:
        risk_flags.append("还没有正式阶段提交，建议尽快用文件或材料沉淀成果。")
    if not risk_flags:
        risk_flags.append("未发现明显偏离，继续按当前课题轨道推进。")

    summary = (
        f"系统复核后建议继续推进「{project.title}」。"
        f"该课题与当前画像的匹配置信度为 {round(confidence * 100)}%，"
        "下一步应优先把前沿来源、实验记录和阶段成果绑定到同一项目中。"
    )
    analysis = {
        "project_id": project.id,
        "title": f"{project.title} · 科研画像自动分析",
        "summary": summary,
        "confidence": confidence,
        "signals": signals,
        "fit_reasons": fit_reasons,
        "risk_flags": risk_flags,
        "next_actions": next_actions,
        "generated_at": iso(now),
    }

    activity = PracticeProjectActivity(
        id=prefixed_id("practice_activity"),
        project_id=project.id,
        student_id=student.id,
        activity_type="analysis",
        text=f"自动分析了「{project.title}」科研画像与下一步路径",
        time_label="刚刚",
        created_at=now,
    )
    db.add(activity)
    _update_enrollment_for_activity(
        enrollment,
        progress_delta=1,
        experiment_delta=0,
        summary="完成科研画像自动分析并更新下一步建议",
    )
    _add_learner_event(
        db,
        project=project,
        student_id=student.id,
        class_id=class_id,
        event_type="RESEARCH_PROFILE_ANALYZED",
        payload={
            "project_id": project.id,
            "confidence": confidence,
            "signals": signals,
            "next_actions": next_actions,
            "risk_flags": risk_flags,
        },
    )
    db.flush()
    return {
        "analysis": analysis,
        "activity": serialize_activity(activity),
        "home": list_practice_projects(db, student_id=student.id, class_id=class_id),
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
    materials = db.scalars(
        select(PracticeProjectMaterial)
        .where(
            PracticeProjectMaterial.project_id == project.id,
            PracticeProjectMaterial.student_id == student_id,
        )
        .order_by(PracticeProjectMaterial.created_at.desc())
        .limit(12)
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
        "materials": [serialize_material(material) for material in materials],
        "submissions": [serialize_submission(submission) for submission in submissions],
        "activities": [serialize_activity(activity) for activity in activities],
    }


def refresh_frontier_tracking(
    db: Session,
    project_id: str,
    student: User,
    class_id: str,
    focus: str,
) -> dict:
    row = db.execute(
        project_scope_query(student.id, class_id).where(PracticeProject.id == project_id)
    ).first()
    if row is None:
        raise ApiError(404, "PRACTICE_PROJECT_NOT_FOUND", "科研项目实践不存在或当前学生无权访问。")
    project, enrollment, _ = row
    brief = research_brief_for_project(project)
    focus_text = focus.strip()[:120]
    if focus_text:
        brief["next_actions"] = [f"围绕「{focus_text}」补充来源", *brief.get("next_actions", [])[:2]]
    now = utc_now()
    activity = PracticeProjectActivity(
        id=prefixed_id("practice_activity"),
        project_id=project.id,
        student_id=student.id,
        activity_type="frontier",
        text=f"刷新了「{project.title}」前沿追踪",
        time_label="刚刚",
        created_at=now,
    )
    db.add(activity)
    _update_enrollment_for_activity(
        enrollment,
        progress_delta=3,
        experiment_delta=1,
        summary="刷新了前沿追踪并生成最新研究动态",
    )
    _add_learner_event(
        db,
        project=project,
        student_id=student.id,
        class_id=class_id,
        event_type="RESEARCH_FRONTIER_TRACKED",
        payload={
            "project_id": project.id,
            "focus": focus_text,
            "topic_count": len(brief.get("frontier_topics", [])),
            "citation_count": len(brief.get("citations", [])),
        },
    )
    db.flush()
    return {
        "brief": brief,
        "activity": serialize_activity(activity),
        "detail": get_practice_project_detail(db, project.id, student.id, class_id),
    }


def create_practice_material(
    db: Session,
    project_id: str,
    student: User,
    class_id: str,
    material_type: str,
    title: str,
    description: str,
    content: str,
    file_name: str | None,
    file_size: int | None,
    mime_type: str | None,
    external_url: str,
) -> dict:
    row = db.execute(
        project_scope_query(student.id, class_id).where(PracticeProject.id == project_id)
    ).first()
    if row is None:
        raise ApiError(404, "PRACTICE_PROJECT_NOT_FOUND", "科研项目实践不存在或当前学生无权访问。")
    project, enrollment, _ = row
    normalized_title = title.strip()
    if not normalized_title:
        raise ApiError(422, "PRACTICE_MATERIAL_TITLE_EMPTY", "材料标题不能为空。")
    if not (content.strip() or description.strip() or file_name or external_url.strip()):
        raise ApiError(422, "PRACTICE_MATERIAL_CONTENT_EMPTY", "请至少填写材料说明、正文、文件名或外链。")
    now = utc_now()
    material = PracticeProjectMaterial(
        id=prefixed_id("practice_material"),
        project_id=project.id,
        student_id=student.id,
        material_type=(material_type.strip().upper() or "NOTE")[:40],
        title=normalized_title,
        description=description.strip(),
        content=content.strip(),
        file_name=file_name.strip() if file_name else None,
        file_size=file_size,
        mime_type=mime_type.strip()[:120] if mime_type else None,
        storage_path=None,
        external_url=external_url.strip(),
        source="student_upload",
        status="READY",
        created_at=now,
        updated_at=now,
    )
    db.add(material)
    activity = PracticeProjectActivity(
        id=prefixed_id("practice_activity"),
        project_id=project.id,
        student_id=student.id,
        activity_type="material",
        text=f"上传了科研过程材料「{material.title}」",
        time_label="刚刚",
        created_at=now,
    )
    db.add(activity)
    _update_enrollment_for_activity(
        enrollment,
        progress_delta=2,
        experiment_delta=1,
        summary=f"上传了科研过程材料「{material.title}」",
    )
    _add_learner_event(
        db,
        project=project,
        student_id=student.id,
        class_id=class_id,
        event_type="RESEARCH_MATERIAL_UPLOADED",
        payload={
            "project_id": project.id,
            "material_id": material.id,
            "material_title": material.title,
            "material_type": material.material_type,
            "file_name": material.file_name,
        },
    )
    db.flush()
    return {
        "material": serialize_material(material),
        "activity": serialize_activity(activity),
        "detail": get_practice_project_detail(db, project.id, student.id, class_id),
    }


def create_practice_material_file(
    db: Session,
    project_id: str,
    student: User,
    class_id: str,
    *,
    material_type: str,
    title: str,
    description: str,
    content: bytes,
    file_name: str | None,
    mime_type: str | None,
) -> dict:
    row = db.execute(
        project_scope_query(student.id, class_id).where(PracticeProject.id == project_id)
    ).first()
    if row is None:
        raise ApiError(404, "PRACTICE_PROJECT_NOT_FOUND", "科研项目实践不存在或当前学生无权访问。")
    project, enrollment, _ = row
    if not content:
        raise ApiError(422, "PRACTICE_MATERIAL_FILE_EMPTY", "上传文件为空。")
    settings = get_settings()
    limit = settings.resource_max_upload_mb * 1024 * 1024
    if len(content) > limit:
        raise ApiError(
            413,
            "PRACTICE_MATERIAL_FILE_TOO_LARGE",
            f"上传文件超过 {settings.resource_max_upload_mb} MB 上限。",
            details={"size": len(content)},
        )
    safe_name = safe_file_name(file_name)
    material_id = prefixed_id("practice_material")
    suffix = Path(safe_name).suffix[:16]
    target_dir = Path(settings.resource_storage_dir) / "practice-projects" / student.id / project.id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{material_id}{suffix}"
    target.write_bytes(content)

    now = utc_now()
    material = PracticeProjectMaterial(
        id=material_id,
        project_id=project.id,
        student_id=student.id,
        material_type=(material_type.strip().upper() or "CODE_FILE")[:40],
        title=title.strip() or safe_name,
        description=description.strip(),
        content="",
        file_name=safe_name,
        file_size=len(content),
        mime_type=mime_type,
        storage_path=str(target),
        external_url="",
        source="student_file_upload",
        status="READY",
        created_at=now,
        updated_at=now,
    )
    db.add(material)
    activity = PracticeProjectActivity(
        id=prefixed_id("practice_activity"),
        project_id=project.id,
        student_id=student.id,
        activity_type="file",
        text=f"上传了代码/实验文件「{material.file_name}」",
        time_label="刚刚",
        created_at=now,
    )
    db.add(activity)
    _update_enrollment_for_activity(
        enrollment,
        progress_delta=3,
        experiment_delta=1,
        summary=f"上传了代码/实验文件「{material.file_name}」",
    )
    _add_learner_event(
        db,
        project=project,
        student_id=student.id,
        class_id=class_id,
        event_type="RESEARCH_MATERIAL_UPLOADED",
        payload={
            "project_id": project.id,
            "material_id": material.id,
            "material_title": material.title,
            "material_type": material.material_type,
            "file_name": material.file_name,
            "file_size": material.file_size,
            "source": "student_file_upload",
        },
    )
    db.flush()
    return {
        "material": serialize_material(material),
        "activity": serialize_activity(activity),
        "detail": get_practice_project_detail(db, project.id, student.id, class_id),
    }


def get_practice_material_file(db: Session, project_id: str, student_id: str, material_id: str) -> PracticeProjectMaterial:
    material = db.get(PracticeProjectMaterial, material_id)
    if (
        material is None
        or material.project_id != project_id
        or material.student_id != student_id
        or not material.storage_path
    ):
        raise ApiError(404, "PRACTICE_MATERIAL_FILE_NOT_FOUND", "科研材料文件不存在或不可访问。")
    if not Path(material.storage_path).exists():
        raise ApiError(404, "PRACTICE_MATERIAL_FILE_MISSING", "科研材料文件尚未落盘或已被移除。")
    return material


def create_practice_submission(
    db: Session,
    project_id: str,
    student: User,
    class_id: str,
    title: str,
    description: str,
    materials: list[str],
    material_ids: list[str] | None = None,
    note: str = "",
) -> dict:
    row = db.execute(
        project_scope_query(student.id, class_id).where(PracticeProject.id == project_id)
    ).first()
    if row is None:
        raise ApiError(404, "PRACTICE_PROJECT_NOT_FOUND", "科研项目实践不存在或当前学生无权访问。")
    project, enrollment, _ = row
    now = utc_now()
    material_records = []
    if material_ids:
        material_records = list(
            db.scalars(
                select(PracticeProjectMaterial).where(
                    PracticeProjectMaterial.project_id == project.id,
                    PracticeProjectMaterial.student_id == student.id,
                    PracticeProjectMaterial.id.in_(material_ids),
                )
            ).all()
        )
        found_ids = {record.id for record in material_records}
        missing_ids = [item for item in material_ids if item not in found_ids]
        if missing_ids:
            raise ApiError(404, "PRACTICE_MATERIAL_NOT_FOUND", "存在不可访问的科研材料。", {"material_ids": missing_ids})
    submission = PracticeProjectSubmission(
        id=prefixed_id("practice_submit"),
        project_id=project.id,
        student_id=student.id,
        title=title.strip() or f"{project.current_stage} 阶段助研成果",
        description=description.strip() or f"提交内容：{project.current_stage} 阶段科研材料。",
        status="SUBMITTED",
        review_comment="已进入阶段助研成果审核队列，平台将结合前沿追踪、写作规范、数据分析和验收标准生成反馈。",
        content_json=json.dumps(
            {
                "materials": materials,
                "material_ids": [record.id for record in material_records],
                "material_titles": [record.title for record in material_records],
                "note": note.strip(),
            },
            ensure_ascii=False,
        ),
        submitted_at=now,
        created_at=now,
    )
    db.add(submission)
    enrollment.status = "SUBMITTED"
    enrollment.submission_count += 1
    enrollment.experiment_record_count += max(1 if materials else 0, len(material_records))
    enrollment.completed_stage_count = min(project.total_stage_count, enrollment.completed_stage_count + 1)
    enrollment.progress = min(100, max(enrollment.progress + 6, int(enrollment.completed_stage_count / max(project.total_stage_count, 1) * 100)))
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
    resource = _create_submission_resource(
        db,
        project=project,
        student=student,
        class_id=class_id,
        submission=submission,
        materials=materials,
        material_records=material_records,
    )
    _add_learner_event(
        db,
        project=project,
        student_id=student.id,
        class_id=class_id,
        event_type="artifact_saved",
        payload={
            "project_id": project.id,
            "submission_id": submission.id,
            "resource_id": resource.id,
            "resource_title": resource.title,
            "resource_type": resource.resource_type,
            "source": "practice_project_submission",
        },
    )
    _add_learner_event(
        db,
        project=project,
        student_id=student.id,
        class_id=class_id,
        event_type="RESEARCH_STAGE_SUBMITTED",
        payload={
            "project_id": project.id,
            "submission_id": submission.id,
            "material_count": len(materials),
            "uploaded_material_count": len(material_records),
        },
    )
    db.flush()
    content = safe_json_object(submission.content_json)
    content["artifact_resource_id"] = resource.id
    submission.content_json = json.dumps(content, ensure_ascii=False)
    db.flush()
    return {
        "submission": serialize_submission(submission),
        "artifact_resource_id": resource.id,
        "detail": get_practice_project_detail(db, project.id, student.id, class_id),
    }
