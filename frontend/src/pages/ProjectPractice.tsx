import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpenText,
  Bot,
  CalendarDays,
  CheckCircle2,
  CirclePlay,
  Database,
  FileCheck2,
  FileText,
  GitBranch,
  Layers3,
  LineChart,
  Loader2,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Workflow
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ApiRequestError,
  api,
  type PracticeProjectActivity,
  type PracticeProjectDetail,
  type PracticeProjectHome,
  type PracticeProjectProofItem,
  type PracticeProjectSummary,
  type PracticeProjectTaskSection,
  type PracticeResearchBrief
} from "../api";
import practiceHeroArt from "../assets/project-practice/project-practice-hero.jpg";

type ResearchBrief = {
  profileFit: string;
  recommendationReason: string;
  researchStage: string;
  frontierTopics: Array<{ title: string; source: string; heat: number; summary: string }>;
  writingBlocks: Array<{ title: string; content: string; status: string }>;
  writingChecks: Array<{ label: string; result: string }>;
  dataMetrics: Array<{ label: string; value: string; note: string }>;
  chartSeries: Array<{ label: string; value: number }>;
  dataInsights: string[];
  citations: Array<{ title: string; meta: string }>;
  generatedAt?: string | null;
  confidence?: number;
  nextActions?: string[];
};

const fallbackProjects: PracticeProjectSummary[] = [
  {
    id: "sales-cleaning",
    course_id: "course_arch_001",
    course_name: "机器学习",
    title: "基于公开数据集的图像分类对比研究",
    status: "IN_PROGRESS",
    status_label: "最适合",
    description: "系统根据机器学习画像自动匹配的科研课题，覆盖前沿追踪、实验对比、图表分析和论文框架。",
    long_description: "围绕 CIFAR-10 图像分类任务，自动聚合近期轻量模型研究动态，完成 ResNet-18 与 EfficientNet-B0 的实验对比、指标可视化、结论提炼和论文框架沉淀。",
    progress: 62,
    accent: "blue",
    tags: ["画像匹配", "前沿追踪", "数据分析"],
    members: ["AI", "王"],
    period: "2 周",
    stage: "P3 实验分析",
    direction: "计算机视觉 + 画像自动推荐",
    capability_points: ["论文阅读", "模型评估", "实验记录", "可视化表达", "论文写作"],
    last_activity_summary: "AI 已生成实验对比图与论文框架建议",
    weekly_hours: 6.2
  },
  {
    id: "log-topk",
    course_id: "course_ds_001",
    course_name: "数据结构",
    title: "面向日志异常检测的 Top-K 方法研究",
    status: "NOT_STARTED",
    status_label: "备选课题",
    description: "面向数据结构薄弱点推荐的轻量研究课题，训练算法分析、文本资料处理和结果解释能力。",
    long_description: "基于脱敏服务日志，比较哈希表、堆结构与排序策略在 Top-K 异常定位中的效果，形成方法对比、实验图表和研究报告。",
    progress: 12,
    accent: "cyan",
    tags: ["文本资料", "Top-K", "方法对比"],
    members: ["AI", "陈"],
    period: "1 周",
    stage: "P1 资料归纳",
    direction: "数据结构 + 科研入门",
    capability_points: ["文献归纳", "复杂度分析", "文本处理", "图表解释"],
    last_activity_summary: "系统判断可作为第二推荐课题",
    weekly_hours: 1.1
  },
  {
    id: "retention-dashboard",
    course_id: "course_network_001",
    course_name: "Python 程序设计",
    title: "学习行为数据留存与影响因素分析",
    status: "IN_PROGRESS",
    status_label: "拓展课题",
    description: "面向 Python 数据处理能力推荐的科研数据分析课题，输出调查数据分析和可视化结论。",
    long_description: "围绕学习行为数据构建留存指标，完成趋势分析、影响因素解释和可视化表达，沉淀可复查的数据分析报告。",
    progress: 86,
    accent: "violet",
    tags: ["调查数据", "可视化", "结论洞察"],
    members: ["AI", "周"],
    period: "3 周",
    stage: "P4 结论提炼",
    direction: "教育数据分析 + 画像推荐",
    capability_points: ["指标口径", "Python 分析", "趋势图表", "研究结论"],
    last_activity_summary: "AI 已完成关键波动解释草稿",
    weekly_hours: 7.3
  }
];

const fallbackPathSteps = [
  { title: "画像推理", description: "读取课程表现、错因、资料保存和学习兴趣，自动判断科研入口方向" },
  { title: "课题推荐", description: "系统生成最适合课题和备选课题，学生无需手动选择研究方向" },
  { title: "前沿追踪", description: "归纳相关论文与研究动态，生成热点主题和发展趋势" },
  { title: "写作辅助", description: "生成综述脉络、论文框架、语言润色和格式检查建议" },
  { title: "数据分析", description: "处理实验数据、调查结果或文本资料，输出图表和研究洞察" },
  { title: "成果沉淀", description: "提交论文框架、分析报告、图表和过程记录，更新科研画像" }
];

const fallbackActivities: PracticeProjectActivity[] = [
  { id: "fallback-1", project_id: "sales-cleaning", type: "success", text: "AI 助研生成了模型对比图与结论草稿", time: "今天 15:30", created_at: null },
  { id: "fallback-2", project_id: "sales-cleaning", type: "submit", text: "提交了阶段成果「v1.2 实验分析记录」", time: "今天 10:24", created_at: null },
  { id: "fallback-3", project_id: "retention-dashboard", type: "comment", text: "系统更新了留存分析的关键波动解释", time: "昨天 18:37", created_at: null },
  { id: "fallback-4", project_id: "log-topk", type: "join", text: "AI 将 Top-K 日志研究列为备选课题", time: "05-16 15:42", created_at: null }
];

const fallbackProofItems: PracticeProjectProofItem[] = [
  { title: "画像驱动推荐", description: "不让学生先选方向，平台基于画像自动匹配课题。", icon: "target" },
  { title: "前沿追踪", description: "归纳论文、研究动态、热点主题和趋势判断。", icon: "search" },
  { title: "写作辅助", description: "支持综述生成、论文框架、润色和格式规范检查。", icon: "file-check" },
  { title: "数据分析", description: "处理实验、调查和文本资料，输出图表与研究洞察。", icon: "database" }
];

const fallbackHome: PracticeProjectHome = {
  projects: fallbackProjects,
  recommended_project_id: "sales-cleaning",
  research_recommendation: {
    project_id: "sales-cleaning",
    profile_fit: "画像显示你在机器学习模型评估、实验记录和图表解释上已有连续证据，适合进入计算机视觉方向科研训练。",
    recommendation_reason: "优先推荐该课题，是因为它同时覆盖赛题要求的前沿追踪、学术写作辅助和科研数据分析三个关键环节。",
    confidence: 0.86,
    signals: [
      { label: "研究方向", value: "机器学习 / 计算机视觉", note: "由课程表现和资料保存记录推断" },
      { label: "能力短板", value: "文献综述、图表解释", note: "来自 AI 问答与实验记录质量" },
      { label: "推荐策略", value: "先做小课题，再沉淀论文框架", note: "匹配赛题助研关键环节" }
    ]
  },
  stats: {
    project_count: 3,
    in_progress_count: 2,
    completed_count: 1,
    weekly_hours: 14.6,
    project_delta: 1,
    completed_delta: 1,
    weekly_hours_delta: 2.3
  },
  activities: fallbackActivities,
  path_steps: fallbackPathSteps,
  readiness: {
    status: "ACTIVE",
    title: "AI 已为你生成科研项目推荐",
    description: "平台已根据学习画像、课程表现和能力短板完成底层推理，自动给出最适合的科研训练课题。",
    primary_action_label: "进入最适合课题",
    secondary_action_label: "查看推理路径"
  },
  proof_items: fallbackProofItems
};

const researchBriefs: Record<string, ResearchBrief> = {
  "sales-cleaning": {
    profileFit: "画像显示你在机器学习模型评估、实验记录和图表解释上已有连续证据，适合进入计算机视觉方向科研训练。",
    recommendationReason: "优先推荐该课题，是因为它同时覆盖赛题要求的前沿追踪、学术写作辅助和科研数据分析三个关键环节。",
    researchStage: "当前处于实验分析与论文框架搭建阶段",
    frontierTopics: [
      { title: "轻量卷积网络与高效图像分类", source: "课程知识库 + 近三年论文摘要样例", heat: 92, summary: "研究热点从单纯提升准确率转向参数量、推理成本与部署约束的综合平衡。" },
      { title: "数据增强对小样本分类稳定性的影响", source: "实验指南 + 综述片段", heat: 78, summary: "趋势显示 RandAugment、Mixup 等增强策略常被作为基线改进项，需要在实验表中单独记录。" },
      { title: "模型可解释性与错误类别分析", source: "教师资料库", heat: 71, summary: "分类错误不只看总准确率，还要分析混淆类别、召回率和失败样本分布。" }
    ],
    writingBlocks: [
      { title: "研究背景", content: "CIFAR-10 图像分类适合作为人工智能专业本科科研训练的标准实验入口，可连接模型结构、训练策略和评估指标。", status: "已生成" },
      { title: "相关工作", content: "围绕 ResNet、EfficientNet 与轻量模型改进路线组织综述，突出准确率、参数量和推理效率的取舍。", status: "待补引用" },
      { title: "实验设计", content: "固定数据集划分、训练轮次和评价指标，对比不同模型的 Accuracy、Recall、F1 与混淆矩阵表现。", status: "可提交" },
      { title: "结论表达", content: "先给出总体指标，再解释差异来源，最后说明局限与下一步优化方向。", status: "待润色" }
    ],
    writingChecks: [
      { label: "文献综述结构", result: "已形成主题归纳，但需补充 2 条代表性引用" },
      { label: "论文框架完整性", result: "摘要、引言、方法、实验、结论均已覆盖" },
      { label: "格式规范", result: "图表编号和指标缩写需要统一" }
    ],
    dataMetrics: [
      { label: "ResNet-18 Accuracy", value: "82.4%", note: "达到验收阈值" },
      { label: "EfficientNet-B0 Accuracy", value: "84.1%", note: "较基线 +1.7%" },
      { label: "Macro F1", value: "0.831", note: "部分类别仍需分析召回率" }
    ],
    chartSeries: [
      { label: "ResNet-18", value: 82 },
      { label: "EfficientNet-B0", value: 84 },
      { label: "增强策略", value: 86 },
      { label: "错误分析后", value: 88 }
    ],
    dataInsights: [
      "EfficientNet-B0 的提升主要体现在动物类别召回率，但交通工具类别混淆仍明显。",
      "只报告 Accuracy 不足以支撑研究结论，需要补充 Macro F1 与混淆矩阵解释。",
      "下一步建议把数据增强作为消融实验，避免把性能提升全部归因于模型结构。"
    ],
    citations: [
      { title: "CIFAR-10 数据集说明", meta: "课程知识库 · 数据集来源" },
      { title: "图像分类实验指南", meta: "教师资料 · 实验规范" },
      { title: "轻量模型对比综述", meta: "文献摘要样例 · 相关工作" }
    ]
  },
  "log-topk": {
    profileFit: "画像显示你在链表和复杂度表达上仍需强化，Top-K 日志课题可以把数据结构知识转成科研分析证据。",
    recommendationReason: "该课题适合作为备选，因为它把文本资料处理、算法比较和异常趋势解释压缩到一个轻量研究任务里。",
    researchStage: "当前处于资料归纳与方法选择阶段",
    frontierTopics: [
      { title: "日志异常检测中的高频模式挖掘", source: "项目资料库", heat: 81, summary: "高频错误路径是异常检测入门任务，适合比较统计结构与排序策略。" },
      { title: "Top-K 算法在流式数据中的应用", source: "课程知识库", heat: 74, summary: "研究关注从离线排序转向增量维护与空间开销控制。" },
      { title: "文本日志语义归类", source: "AI 归纳样例", heat: 66, summary: "后续可引入文本聚类，但首版先用规则字段保证可解释。" }
    ],
    writingBlocks: [
      { title: "问题定义", content: "从服务日志中定位高频异常接口，比较不同 Top-K 统计方法的准确性和复杂度。", status: "已生成" },
      { title: "方法对比", content: "对比哈希计数、堆维护和全量排序三种方案，说明各自适用的数据规模。", status: "可提交" },
      { title: "结果讨论", content: "结合异常接口分布解释系统风险，避免只列统计结果。", status: "待润色" }
    ],
    writingChecks: [
      { label: "综述覆盖", result: "需要增加流式 Top-K 的研究背景" },
      { label: "方法描述", result: "复杂度表达清晰" },
      { label: "格式规范", result: "表格字段命名需要统一" }
    ],
    dataMetrics: [
      { label: "日志记录数", value: "12,480", note: "脱敏样例数据" },
      { label: "异常路径数", value: "37", note: "需聚合相似路径" },
      { label: "Top-5 覆盖率", value: "68%", note: "异常集中度较高" }
    ],
    chartSeries: [
      { label: "/api/login", value: 88 },
      { label: "/api/submit", value: 74 },
      { label: "/api/report", value: 52 },
      { label: "/api/search", value: 39 }
    ],
    dataInsights: [
      "异常高度集中在登录和提交接口，建议优先检查限流、超时与参数校验。",
      "堆维护方案适合增量日志，但首版报告需要先给出全量排序基线。",
      "文本错误摘要可作为后续语义聚类的扩展入口。"
    ],
    citations: [
      { title: "Top-K 问题实现指南", meta: "课程知识库 · 算法方法" },
      { title: "服务日志字段说明", meta: "项目资料 · 数据字典" }
    ]
  },
  "retention-dashboard": {
    profileFit: "画像显示你在 Python 数据处理和图表表达上已有基础，适合进入调查/行为数据分析型科研任务。",
    recommendationReason: "该课题可强化科研数据分析产出，特别是指标口径、趋势可视化和结论解释。",
    researchStage: "当前处于结论提炼与图表规范检查阶段",
    frontierTopics: [
      { title: "学习分析中的行为序列建模", source: "资料库摘要", heat: 84, summary: "研究从单一完成率转向学习路径、停留时间和任务重试行为的综合解释。" },
      { title: "在线学习留存影响因素", source: "调查数据说明", heat: 79, summary: "留存分析需要控制任务难度、反馈及时性和学习基础差异。" },
      { title: "教育数据可视化表达", source: "教师资料库", heat: 72, summary: "趋势图与分组柱状图适合展示阶段变化，结论必须绑定指标口径。" }
    ],
    writingBlocks: [
      { title: "研究问题", content: "不同学习行为是否会影响课程任务留存和后续提交质量。", status: "已生成" },
      { title: "数据方法", content: "用 Python 汇总注册、访问、学习、提交事件，计算次日和 7 日留存。", status: "可提交" },
      { title: "结论草稿", content: "高频查看诊断和保存资料的学生，后续任务完成稳定性更高。", status: "待补统计检验" }
    ],
    writingChecks: [
      { label: "研究问题清晰度", result: "变量关系明确" },
      { label: "数据分析规范", result: "建议补充缺失值处理说明" },
      { label: "图表格式", result: "纵轴单位和样本量需要标注" }
    ],
    dataMetrics: [
      { label: "次日留存", value: "71.3%", note: "较低互动组 +12.6%" },
      { label: "7 日留存", value: "48.9%", note: "受任务难度影响" },
      { label: "有效样本", value: "1,286", note: "已排除缺失记录" }
    ],
    chartSeries: [
      { label: "低互动", value: 43 },
      { label: "看诊断", value: 56 },
      { label: "保存资料", value: 63 },
      { label: "完成复盘", value: 71 }
    ],
    dataInsights: [
      "保存学习资料与 7 日留存存在正相关，但不能直接解释为因果关系。",
      "任务难度是主要混杂因素，报告中需要按课程或难度分组呈现。",
      "下一步适合补充一张分组趋势图，说明不同学习行为的留存差异。"
    ],
    citations: [
      { title: "留存指标口径说明", meta: "项目资料 · 指标定义" },
      { title: "Python 分组聚合示例", meta: "课程知识库 · 分析方法" }
    ]
  }
};

const fallbackBrief = researchBriefs["sales-cleaning"];

function fallbackDetail(project: PracticeProjectSummary): PracticeProjectDetail {
  const brief = researchBriefFor(project);
  return {
    project,
    metrics: {
      completed_stage_count: project.id === "sales-cleaning" ? 3 : project.id === "retention-dashboard" ? 5 : 0,
      total_stage_count: 6,
      experiment_record_count: project.id === "sales-cleaning" ? 8 : project.id === "retention-dashboard" ? 11 : 0,
      submission_count: project.id === "sales-cleaning" ? 2 : project.id === "retention-dashboard" ? 4 : 0
    },
    task_sections: [
      { title: "画像推理结论", description: brief.profileFit, icon: "target" },
      { title: "当前科研任务", description: project.long_description, icon: "bot" },
      {
        title: "研究对象 / 数据来源",
        description: project.id === "sales-cleaning" ? "CIFAR-10 图像分类公开数据集，结合课程知识库中的实验指南和模型评估规范。" : "使用项目内置的脱敏数据样例，保证演示链路稳定可复查。",
        action: "查看前沿追踪",
        icon: "database"
      },
      { title: "成果要求", description: "完成前沿归纳、文献综述框架、实验或调查数据分析、可视化图表、阶段研究结论和下一步计划。", icon: "file-check" }
    ],
    submission_requirements: ["文献综述 / 论文框架", "实验数据分析报告", "趋势图谱或指标图表", "阶段研究结论"],
    acceptance_criteria: ["前沿追踪有来源", "论文框架结构完整", "数据分析图表可解释", "结论不脱离实验或资料证据"],
    mentor_tips: brief.dataInsights,
    resources: brief.citations,
    submissions: [
      {
        id: "fallback-submit-1",
        project_id: project.id,
        title: "v1.2 实验分析记录",
        description: "提交内容：模型对比表、学习曲线、结论草稿；评审意见：建议补充前沿综述引用和消融实验说明。",
        status: "APPROVED",
        status_label: "已通过",
        review_comment: "指标达标，建议补充前沿综述引用和消融实验说明。",
        content: {},
        submitted_at: "2026-05-17T14:32:00Z",
        created_at: null
      }
    ],
    activities: fallbackActivities.filter((activity) => activity.project_id === project.id)
  };
}

function projectIcon(project: PracticeProjectSummary, index = 0) {
  if (project.id.includes("log")) return <Search size={24} />;
  if (project.id.includes("retention")) return <BarChart3 size={24} />;
  return index % 2 === 0 ? <Target size={24} /> : <Database size={24} />;
}

function pathIcon(index: number) {
  const icons = [
    <Target size={23} />,
    <Sparkles size={23} />,
    <Search size={23} />,
    <PenLine size={23} />,
    <BarChart3 size={23} />,
    <Trophy size={23} />
  ];
  return icons[index] ?? <FileText size={23} />;
}

function taskIcon(section: PracticeProjectTaskSection) {
  if (section.icon === "database") return <Database size={18} />;
  if (section.icon === "workflow") return <Workflow size={18} />;
  if (section.icon === "file-check") return <FileCheck2 size={18} />;
  if (section.icon === "target") return <Target size={18} />;
  return <Bot size={18} />;
}

function statusClass(status: string) {
  return status === "IN_PROGRESS" || status === "SUBMITTED" ? "active" : "pending";
}

function apiErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "科研项目实践数据暂时不可用，已使用本地演示数据。";
}

function formatSubmittedAt(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function materialHint(item: string) {
  if (item.includes("框架") || item.includes("综述")) return "包含研究问题、相关工作脉络、论文结构和引用依据";
  if (item.includes("数据") || item.includes("报告")) return "包含数据来源、指标口径、分析图表和结论洞察";
  if (item.includes("图")) return "用于展示热点、趋势、指标对比或研究对象分布";
  return "沉淀阶段结论、下一步计划和 AI 助研过程证据";
}

function normalizeResearchBrief(apiBrief: PracticeResearchBrief | undefined, fallback: ResearchBrief): ResearchBrief {
  if (!apiBrief) return fallback;
  return {
    profileFit: apiBrief.profile_fit || fallback.profileFit,
    recommendationReason: apiBrief.recommendation_reason || fallback.recommendationReason,
    researchStage: apiBrief.research_stage || fallback.researchStage,
    frontierTopics: apiBrief.frontier_topics?.length ? apiBrief.frontier_topics : fallback.frontierTopics,
    writingBlocks: apiBrief.writing_blocks?.length ? apiBrief.writing_blocks : fallback.writingBlocks,
    writingChecks: apiBrief.writing_checks?.length ? apiBrief.writing_checks : fallback.writingChecks,
    dataMetrics: apiBrief.data_metrics?.length ? apiBrief.data_metrics : fallback.dataMetrics,
    chartSeries: apiBrief.chart_series?.length ? apiBrief.chart_series : fallback.chartSeries,
    dataInsights: apiBrief.data_insights?.length ? apiBrief.data_insights : fallback.dataInsights,
    citations: apiBrief.citations?.length ? apiBrief.citations : fallback.citations,
    generatedAt: apiBrief.generated_at,
    confidence: apiBrief.confidence,
    nextActions: apiBrief.next_actions
  };
}

function researchBriefFor(project: PracticeProjectSummary, apiBrief?: PracticeResearchBrief) {
  return normalizeResearchBrief(apiBrief, researchBriefs[project.id] ?? fallbackBrief);
}

function sortedRecommendedProjects(projects: PracticeProjectSummary[], recommendedProjectId: string | null) {
  return [...projects].sort((left, right) => {
    if (left.id === recommendedProjectId) return -1;
    if (right.id === recommendedProjectId) return 1;
    return right.progress - left.progress;
  });
}

export default function ProjectPractice() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId?: string }>();
  const [homeData, setHomeData] = useState<PracticeProjectHome | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [startingProject, setStartingProject] = useState(false);

  useEffect(() => {
    if (projectId) return;
    let alive = true;
    setHomeLoading(true);
    setHomeError(null);
    api.getPracticeProjectHome()
      .then((payload) => {
        if (alive) setHomeData(payload);
      })
      .catch((error) => {
        if (alive) setHomeError(apiErrorMessage(error));
      })
      .finally(() => {
        if (alive) setHomeLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const pageData = homeData ?? fallbackHome;
  const hasProjects = pageData.projects.length > 0;
  const recommendedProjectId = pageData.recommended_project_id ?? pageData.projects[0]?.id ?? null;
  const recommendedProject = pageData.projects.find((project) => project.id === recommendedProjectId) ?? pageData.projects[0];
  const recommendedBrief = recommendedProject ? researchBriefFor(recommendedProject) : fallbackBrief;
  const researchRecommendation = pageData.research_recommendation;
  const researchSignals = researchRecommendation?.signals?.length ? researchRecommendation.signals : fallbackHome.research_recommendation?.signals ?? [];
  const rankedProjects = sortedRecommendedProjects(pageData.projects, recommendedProjectId);

  async function startFirstProject() {
    setStartingProject(true);
    setHomeError(null);
    try {
      const result = await api.startFirstPracticeProject();
      navigate(`/project-practice/projects/${result.detail.project.id}`);
    } catch (error) {
      setHomeError(apiErrorMessage(error));
    } finally {
      setStartingProject(false);
    }
  }

  function openRecommendedProject() {
    if (recommendedProjectId) {
      navigate(`/project-practice/projects/${recommendedProjectId}`);
      return;
    }
    void startFirstProject();
  }

  if (projectId) {
    const fallbackProject = fallbackProjects.find((project) => project.id === projectId) ?? fallbackProjects[0];
    return <ProjectPracticeDetail fallbackProject={fallbackProject} projectId={projectId} />;
  }

  return (
    <main className="project-practice-home">
      <section className="practice-hero-card research-hero-card" aria-labelledby="practice-home-title">
        <div className="practice-hero-illustration" aria-hidden="true">
          <img src={practiceHeroArt} alt="" />
        </div>
        <div className="practice-hero-copy">
          <span className="research-kicker"><Target size={15} /> 画像驱动 · AI 助研入口</span>
          <h1 id="practice-home-title">
            {hasProjects ? "系统已为你匹配最适合的科研课题" : pageData.readiness.title}
            <Sparkles size={25} />
          </h1>
          <p>
            {hasProjects
              ? "无需手动选择方向。平台根据课程表现、学习画像、资料沉淀和能力短板完成底层推理，直接推荐可进入的科研项目实践。"
              : pageData.readiness.description}
          </p>
          {hasProjects ? (
            <div className="practice-hero-actions">
              <button type="button" disabled={startingProject} onClick={openRecommendedProject}>
                {startingProject ? <Loader2 className="practice-spin-icon" size={18} /> : null}
                进入最适合课题
                {!startingProject ? <ArrowRight size={18} /> : null}
              </button>
              <button type="button" className="secondary" onClick={openRecommendedProject}>
                <CirclePlay size={18} />
                查看 AI 推理依据
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {(homeLoading || homeError) ? (
        <div className={`practice-data-banner ${homeError ? "error" : ""}`}>
          {homeLoading ? <Loader2 className="practice-spin-icon" size={15} /> : <AlertCircle size={15} />}
          <span>{homeLoading ? "正在同步科研项目实践数据..." : homeError}</span>
        </div>
      ) : null}

      {hasProjects ? (
        <section className="practice-main-grid research-main-grid">
          <div className="practice-project-panel research-recommend-panel">
            <div className="practice-section-title">
              <span><Target size={19} /> 个性化课题推荐</span>
              <button type="button" onClick={openRecommendedProject}>进入推荐课题 <ArrowRight size={15} /></button>
            </div>
            <div className="research-fit-card">
              <span>最适合课题</span>
              <h2>{recommendedProject?.title}</h2>
              <p>{researchRecommendation?.recommendation_reason ?? recommendedBrief.recommendationReason}</p>
              <div>
                <strong>画像依据</strong>
                <small>{researchRecommendation?.profile_fit ?? recommendedBrief.profileFit}</small>
              </div>
            </div>
            <div className="practice-project-list research-project-list">
              {rankedProjects.map((project, index) => (
                <button
                  type="button"
                  className={`practice-project-card ${recommendedProjectId === project.id ? "selected" : ""}`}
                  data-accent={project.accent}
                  key={project.id}
                  onClick={() => navigate(`/project-practice/projects/${project.id}`)}
                >
                  <span className="practice-project-icon">{projectIcon(project, index)}</span>
                  <span className={`practice-project-status ${statusClass(project.status)}`}>{recommendedProjectId === project.id ? "最适合" : project.status_label}</span>
                  <strong>{project.title}</strong>
                  <small>{project.description}</small>
                  <span className="practice-progress-label">
                    <em>助研完成度</em>
                    <b>{project.progress}%</b>
                  </span>
                  <i className="practice-progress-track"><b style={{ width: `${project.progress}%` }} /></i>
                  <span className="practice-project-footer">
                    <span>{project.tags.map((tag) => <em key={tag}>{tag}</em>)}</span>
                    <span className="practice-avatar-stack">
                      {project.members.map((member) => <b key={member}>{member}</b>)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <aside className="practice-side-column">
            <section className="practice-stats-card">
              <div className="practice-section-title compact">
                <span><LineChart size={19} /> 科研画像信号</span>
                <em className="practice-section-meta">自动分析</em>
              </div>
              <div className="research-signal-list">
                {researchSignals.map((signal) => (
                  <article key={signal.label}>
                    <strong>{signal.label}</strong>
                    <span>{signal.value}</span>
                    <small>{signal.note}</small>
                  </article>
                ))}
              </div>
            </section>

            <section className="practice-activity-card">
              <div className="practice-section-title compact">
                <span><ShieldCheck size={19} /> 助研动态</span>
              </div>
              <div className="practice-activity-list">
                {pageData.activities.map((activity) => (
                  <div className="practice-activity-row" data-type={activity.type} key={activity.id}>
                    <i><CheckCircle2 size={13} /></i>
                    <span>{activity.text}</span>
                    <time>{activity.time}</time>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      ) : (
        <section className="practice-initial-shell" aria-label="科研项目实践初始状态">
          <div className="practice-initial-panel">
            <span className="practice-initial-icon"><Target size={24} /></span>
            <span className="practice-initial-kicker">等待画像信号</span>
            <h2>系统将自动生成科研课题</h2>
            <p>学生不需要先选择方向。平台会在课程任务、自主学习和资料沉淀产生足够信号后，自动推荐最适合的科研项目实践。</p>
            <div className="practice-initial-actions">
              <button type="button" disabled={startingProject} onClick={startFirstProject}>
                {startingProject ? <Loader2 className="practice-spin-icon" size={18} /> : <ArrowRight size={18} />}
                {startingProject ? "正在生成" : pageData.readiness.primary_action_label}
              </button>
              <button type="button" className="secondary" onClick={() => navigate("/courses")}>
                <CirclePlay size={18} />
                {pageData.readiness.secondary_action_label}
              </button>
            </div>
          </div>
          <aside className="practice-readiness-panel">
            <h2>自动推荐依据</h2>
            <div className="practice-readiness-list">
              <article><span><CheckCircle2 size={16} /></span><div><strong>课程能力证据</strong><p>从机器学习、Python、数据结构任务中抽取能力信号。</p></div></article>
              <article><span><ShieldCheck size={16} /></span><div><strong>资料沉淀记录</strong><p>根据笔记、PPT 大纲、实验记录判断研究兴趣。</p></div></article>
              <article><span><Workflow size={16} /></span><div><strong>赛题助研链路</strong><p>推荐结果必须覆盖前沿、写作、数据分析和成果产出。</p></div></article>
            </div>
          </aside>
        </section>
      )}

      <section className="practice-path-card">
        <div className="practice-section-title">
          <span><GitBranch size={19} /> AI 助研闭环</span>
        </div>
        <div className="practice-path-flow">
          {pageData.path_steps.map((step, index) => (
            <article className={index === pageData.path_steps.length - 1 ? "finish" : ""} key={step.title}>
              <span className="practice-path-number">{index + 1}</span>
              <i>{pathIcon(index)}</i>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function ProjectPracticeDetail({
  fallbackProject,
  projectId
}: {
  fallbackProject: PracticeProjectSummary;
  projectId: string;
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("课题任务");
  const [detail, setDetail] = useState<PracticeProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api.getPracticeProjectDetail(projectId)
      .then((payload) => {
        if (alive) setDetail(payload);
      })
      .catch((err) => {
        if (alive) setError(apiErrorMessage(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const pageData = detail ?? fallbackDetail(fallbackProject);
  const project = pageData.project;
  const brief = researchBriefFor(project, pageData.research_brief);
  const latestSubmits = pageData.submissions.length > 0 ? pageData.submissions : fallbackDetail(project).submissions;
  const activityRows = useMemo(
    () => (pageData.activities.length > 0 ? pageData.activities : fallbackActivities.filter((activity) => activity.project_id === project.id)),
    [pageData.activities, project.id]
  );

  function toggleMaterial(item: string) {
    setSelectedMaterials((current) => {
      if (current.includes(item)) return current.filter((value) => value !== item);
      return [...current, item];
    });
    setSubmitMessage(null);
  }

  async function submitCurrentStage() {
    setSubmitting(true);
    setSubmitMessage(null);
    const materials = selectedMaterials.length > 0 ? selectedMaterials : pageData.submission_requirements.slice(0, 3);
    try {
      const result = await api.submitPracticeProject(project.id, {
        title: `${project.stage} 阶段助研成果`,
        description: `提交内容：${project.stage} 阶段科研材料。`,
        materials
      });
      setDetail(result.detail);
      setSelectedMaterials([]);
      setSubmitMessage("阶段助研成果已提交，已进入审核队列。");
    } catch (err) {
      setSubmitMessage(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function renderTopicTab() {
    return (
      <div className="project-task-card">
        {pageData.task_sections.map((item) => (
          <article key={item.title}>
            <span>{taskIcon(item)}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
              {item.action ? (
                <button type="button" onClick={() => setActiveTab("前沿追踪")}>
                  {item.action} <ArrowRight size={14} />
                </button>
              ) : null}
            </div>
          </article>
        ))}
        <div className="project-acceptance">
          <strong><ShieldCheck size={18} /> 助研验收标准</strong>
          {pageData.acceptance_criteria.map((criterion) => (
            <span key={criterion}><CheckCircle2 size={14} /> {criterion}</span>
          ))}
        </div>
      </div>
    );
  }

  function renderFrontierTab() {
    return (
      <div className="project-tab-surface research-tab-surface">
        <div className="project-tab-summary">
          <div>
            <strong>领域前沿追踪</strong>
            <p>自动检索并归纳最新学术论文或研究动态，生成热点主题与发展趋势分析。</p>
          </div>
          <span>{brief.frontierTopics.length} 个热点</span>
        </div>
        <div className="research-frontier-grid">
          {brief.frontierTopics.map((topic) => (
            <article key={topic.title}>
              <div className="research-topic-top">
                <strong>{topic.title}</strong>
                <span>{topic.heat}</span>
              </div>
              <p>{topic.summary}</p>
              <small>{topic.source}</small>
              <i><b style={{ width: `${topic.heat}%` }} /></i>
            </article>
          ))}
        </div>
        <div className="research-citation-strip">
          {brief.citations.map((citation) => (
            <span key={citation.title}><BookOpenText size={14} /> {citation.title} · {citation.meta}</span>
          ))}
        </div>
      </div>
    );
  }

  function renderWritingTab() {
    return (
      <div className="project-tab-surface research-tab-surface">
        <div className="project-tab-summary">
          <div>
            <strong>学术写作辅助</strong>
            <p>围绕文献综述、论文框架、语言润色和格式规范检查，生成可提交的阶段写作产物。</p>
          </div>
          <span>{brief.writingBlocks.length} 个段落</span>
        </div>
        <div className="research-writing-layout">
          <div className="research-outline-list">
            {brief.writingBlocks.map((block) => (
              <article key={block.title}>
                <span>{block.status}</span>
                <strong>{block.title}</strong>
                <p>{block.content}</p>
              </article>
            ))}
          </div>
          <aside className="research-check-panel">
            <h3>规范检查</h3>
            {brief.writingChecks.map((item) => (
              <div key={item.label}>
                <CheckCircle2 size={15} />
                <span><strong>{item.label}</strong><small>{item.result}</small></span>
              </div>
            ))}
          </aside>
        </div>
      </div>
    );
  }

  function renderDataTab() {
    return (
      <div className="project-tab-surface research-tab-surface">
        <div className="project-tab-summary">
          <div>
            <strong>科研数据分析</strong>
            <p>对实验数据、调查结果或文本资料进行智能处理、可视化呈现和结论提炼。</p>
          </div>
          <span>{brief.dataMetrics.length} 个指标</span>
        </div>
        <div className="research-data-grid">
          <div className="research-metric-grid">
            {brief.dataMetrics.map((metric) => (
              <article key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.note}</small>
              </article>
            ))}
          </div>
          <div className="research-chart-card" role="img" aria-label="科研数据分析柱状趋势图">
            {brief.chartSeries.map((item) => (
              <div key={item.label}>
                <i style={{ height: `${item.value}%` }} />
                <span>{item.label}</span>
                <strong>{item.value}%</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="research-insight-list">
          <strong><Bot size={18} /> AI 研究洞察</strong>
          {brief.dataInsights.map((insight) => (
            <span key={insight}><CheckCircle2 size={14} /> {insight}</span>
          ))}
        </div>
      </div>
    );
  }

  function renderProcessTab() {
    return (
      <div className="project-tab-surface process-view">
        <div className="project-tab-summary">
          <div>
            <strong>科研过程留痕</strong>
            <p>记录前沿追踪、写作辅助、数据分析、阶段提交等动作，用于复盘与成果质量证明。</p>
          </div>
          <span>{activityRows.length} 条动态</span>
        </div>
        <div className="project-process-metrics">
          <div><span>阶段进度</span><strong>{pageData.metrics.completed_stage_count}/{pageData.metrics.total_stage_count}</strong></div>
          <div><span>实验/分析记录</span><strong>{pageData.metrics.experiment_record_count}</strong></div>
          <div><span>阶段提交</span><strong>{pageData.metrics.submission_count}</strong></div>
        </div>
        <div className="project-process-list">
          {activityRows.length > 0 ? activityRows.map((activity, index) => (
            <article key={activity.id}>
              <i data-kind={activity.type} />
              <div>
                <strong>{activity.text}</strong>
                <p>{index === 0 ? "最近一次助研动作，会影响科研画像、成果质量或下一步推荐。" : "科研过程留痕，用于后续复盘与成果证明。"}</p>
              </div>
              <time>{activity.time}</time>
            </article>
          )) : (
            <div className="project-empty-state">暂无过程记录，提交阶段成果后会自动生成项目动态。</div>
          )}
        </div>
      </div>
    );
  }

  function renderSubmitTab() {
    return (
      <div className="project-tab-surface result-view">
        <div className="project-tab-summary">
          <div>
            <strong>阶段助研成果包</strong>
            <p>选择本次要提交的材料类型，平台会写入阶段成果并刷新最近提交。</p>
          </div>
          <span>{selectedMaterials.length || pageData.submission_requirements.slice(0, 3).length} 项待提交</span>
        </div>
        <div className="project-result-grid">
          {pageData.submission_requirements.map((item) => (
            <button
              type="button"
              key={item}
              className={selectedMaterials.includes(item) ? "selected" : ""}
              onClick={() => toggleMaterial(item)}
            >
              <FileCheck2 size={18} />
              <span>
                <strong>{item}</strong>
                <small>{materialHint(item)}</small>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="project-result-submit" disabled={submitting} onClick={submitCurrentStage}>
          {submitting ? <Loader2 className="practice-spin-icon" size={18} /> : <ArrowRight size={18} />}
          {submitting ? "提交中" : "提交当前阶段成果"}
        </button>
        <div className="project-result-history">
          <strong>最近成果</strong>
          {latestSubmits.length > 0 ? latestSubmits.slice(0, 3).map((submit) => (
            <article key={submit.id}>
              <span><FileText size={16} /></span>
              <div>
                <b>{submit.title}</b>
                <p>{submit.description}</p>
                {submit.submitted_at ? <small>{formatSubmittedAt(submit.submitted_at)}</small> : null}
              </div>
              <em>{submit.status_label}</em>
            </article>
          )) : (
            <div className="project-empty-state">暂无提交记录。</div>
          )}
        </div>
      </div>
    );
  }

  function renderWorkspaceTab() {
    if (activeTab === "前沿追踪") return renderFrontierTab();
    if (activeTab === "文献写作") return renderWritingTab();
    if (activeTab === "数据分析") return renderDataTab();
    if (activeTab === "过程记录") return renderProcessTab();
    if (activeTab === "成果提交") return renderSubmitTab();
    return renderTopicTab();
  }

  return (
    <main className="project-detail-page">
      <section className="project-detail-command">
        <div className="project-detail-crumb">
          <span>科研项目实践</span>
          <b>/</b>
          <span>AI 助研工作台</span>
          <b>/</b>
          <strong>{project.title}</strong>
        </div>
        <div className="project-detail-tags">
          <span className="running">{project.status_label}</span>
          <span>{project.course_name || "AI方向"}</span>
          <span className="green">画像推荐</span>
        </div>
        <div className="project-detail-actions">
          <button type="button" className="primary" disabled={submitting} onClick={submitCurrentStage}>
            {submitting ? <Loader2 className="practice-spin-icon" size={17} /> : <ArrowRight size={17} />}
            {submitting ? "提交中" : "提交助研成果"}
          </button>
          <button type="button" onClick={() => setActiveTab("成果提交")}>
            <FileText size={17} />
            查看成果包
          </button>
        </div>
      </section>

      {(loading || error || submitMessage) ? (
        <div className={`practice-data-banner ${error || submitMessage?.includes("不可用") ? "error" : ""}`}>
          {loading ? <Loader2 className="practice-spin-icon" size={15} /> : error ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          <span>{loading ? "正在读取科研项目详情..." : error ?? submitMessage}</span>
        </div>
      ) : null}

      <section className="project-detail-summary research-detail-summary">
        <div className="project-detail-title-block">
          <span className="project-detail-icon"><Target size={26} /></span>
          <div>
            <h1>{project.title}</h1>
            <p>{project.long_description}</p>
          </div>
        </div>
        <div className="project-detail-facts">
          <div><CalendarDays size={18} /><span>周期</span><strong>{project.period}</strong></div>
          <div><Layers3 size={18} /><span>阶段</span><strong>{project.stage}</strong></div>
          <div><Workflow size={18} /><span>方向</span><strong>{project.direction}</strong></div>
        </div>
        <div className="project-progress-ring" aria-label={`助研完成度 ${project.progress}%`}>
          <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
            <circle cx="60" cy="60" r="47" />
            <circle cx="60" cy="60" r="47" pathLength="100" style={{ strokeDasharray: `${project.progress} 100` }} />
          </svg>
          <span>助研进度</span>
          <strong>{project.progress}%</strong>
        </div>
        <div className="project-detail-metrics">
          <div><Search size={24} /><span>前沿热点</span><strong>{brief.frontierTopics.length}</strong></div>
          <div><Database size={24} /><span>分析记录</span><strong>{pageData.metrics.experiment_record_count}</strong></div>
          <div><FileCheck2 size={24} /><span>成果提交</span><strong>{pageData.metrics.submission_count}</strong></div>
        </div>
      </section>

      <section className="project-detail-layout">
        <div className="project-work-panel">
          <h2>AI 助研工作台</h2>
          <div className="project-work-tabs research-work-tabs" role="tablist" aria-label="AI 助研工作区标签">
            {["课题任务", "前沿追踪", "文献写作", "数据分析", "过程记录", "成果提交"].map((tab) => (
              <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>
          {renderWorkspaceTab()}
        </div>

        <aside className="project-context-column">
          <section className="project-mentor-card">
            <h2><Bot size={20} /> AI 助研导师</h2>
            <p>{brief.researchStage}</p>
            {brief.dataInsights.slice(0, 3).map((tip) => <span key={tip}><CheckCircle2 size={14} /> {tip}</span>)}
            <button type="button" onClick={() => navigate("/self-study/ai")}>带着课题去追问</button>
          </section>

          <section className="project-resource-card">
            <div className="project-card-head">
              <h2>来源与引用</h2>
            </div>
            {brief.citations.map((resource) => (
              <article key={resource.title}>
                <FileText size={16} />
                <span>{resource.title}</span>
                <small>{resource.meta}</small>
              </article>
            ))}
          </section>

          <section className="project-timeline-card">
            <div className="project-card-head">
              <h2>阶段动态</h2>
            </div>
            {activityRows.map((item, index) => (
              <article key={item.id} data-step={index + 1}>
                <i />
                <span>{item.text}</span>
                <time>{item.time}</time>
              </article>
            ))}
          </section>
        </aside>
      </section>
    </main>
  );
}
