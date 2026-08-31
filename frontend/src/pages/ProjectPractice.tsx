import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpenText,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  ClipboardList,
  Code2,
  Database,
  FileCheck2,
  FileText,
  GitBranch,
  Layers3,
  LineChart,
  Loader2,
  ShieldCheck,
  Sparkles,
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
  type PracticeProjectTaskSection
} from "../api";
import practiceHeroArt from "../assets/project-practice/project-practice-hero.jpg";

const fallbackProjects: PracticeProjectSummary[] = [
  {
    id: "sales-cleaning",
    course_id: "course_arch_001",
    course_name: "机器学习",
    title: "基于公开数据集的图像分类对比研究",
    status: "IN_PROGRESS",
    status_label: "进行中",
    description: "通过 CIFAR-10 公开数据集完成多种模型训练与对比，形成实验记录和研究结论。",
    long_description: "通过对公开数据集进行多种模型的训练与对比分析，完成效果评估、数据解读与建模优化，形成可复用的科研过程与研究结论。",
    progress: 62,
    accent: "blue",
    tags: ["机器学习", "模型训练", "对比分析"],
    members: ["王", "李"],
    period: "2 周",
    stage: "P3 模型训练",
    direction: "AI方向 + 自主完成",
    capability_points: ["公开数据集理解", "模型训练", "指标评估", "实验记录", "对比分析"],
    last_activity_summary: "提交了 v1.2 实验记录",
    weekly_hours: 6.2
  },
  {
    id: "log-topk",
    course_id: "course_ds_001",
    course_name: "数据结构",
    title: "服务日志 Top-K 问题定位",
    status: "NOT_STARTED",
    status_label: "待开始",
    description: "基于服务日志识别并定位 Top-K 异常问题，输出分析报告与优化建议。",
    long_description: "基于接口日志识别高频异常路径，比较哈希表、排序与堆结构的实现取舍，输出可复查的异常定位报告。",
    progress: 12,
    accent: "cyan",
    tags: ["数据结构", "分析", "后端"],
    members: ["陈", "赵"],
    period: "1 周",
    stage: "P2 算法实现",
    direction: "后端排障 + 引导完成",
    capability_points: ["哈希统计", "复杂度分析", "日志阅读", "问题定位"],
    last_activity_summary: "加入项目团队",
    weekly_hours: 1.1
  },
  {
    id: "retention-dashboard",
    course_id: "course_network_001",
    course_name: "Python 程序设计",
    title: "用户留存分析与可视化看板",
    status: "IN_PROGRESS",
    status_label: "进行中",
    description: "分析用户留存数据并构建可视化看板，洞察用户行为趋势与关键影响因素。",
    long_description: "围绕用户行为数据构建留存分析指标，完成趋势分析、图表表达和业务解释，沉淀可展示的产品分析成果。",
    progress: 86,
    accent: "violet",
    tags: ["SQL", "分析", "图表"],
    members: ["周", "吴"],
    period: "3 周",
    stage: "P3 指标解释",
    direction: "AI 方向 + 自主完成",
    capability_points: ["指标口径", "SQL 查询", "数据可视化", "业务解释"],
    last_activity_summary: "老师在项目中留言",
    weekly_hours: 7.3
  }
];

const fallbackPathSteps = [
  { title: "需求理解", description: "明确项目背景与目标，梳理需求与验收标准" },
  { title: "资料调研", description: "收集相关资料，调研技术方案与实现路径" },
  { title: "方案设计", description: "设计整体方案与技术架构，制定实施计划" },
  { title: "开发实现", description: "编码实现核心功能，完成项目开发" },
  { title: "测试验证", description: "进行测试与验证，确保功能正确与性能达标" },
  { title: "成果沉淀", description: "整理项目文档与成果，形成可复用的能力证据" }
];

const fallbackActivities: PracticeProjectActivity[] = [
  { id: "fallback-1", project_id: "sales-cleaning", type: "success", text: "AI 助手生成了对比图表示例", time: "今天 15:30", created_at: null },
  { id: "fallback-2", project_id: "sales-cleaning", type: "submit", text: "提交了阶段成果「v1.2 实验记录」", time: "今天 10:24", created_at: null },
  { id: "fallback-3", project_id: "retention-dashboard", type: "comment", text: "老师在项目「用户留存分析与看板」中留言", time: "昨天 18:37", created_at: null },
  { id: "fallback-4", project_id: "log-topk", type: "join", text: "加入项目「服务日志 Top-K 问题定位」团队", time: "05-16 15:42", created_at: null }
];

const fallbackProofItems: PracticeProjectProofItem[] = [
  { title: "真实输入", description: "用数据、日志、业务指标模拟企业任务。", icon: "database" },
  { title: "过程留痕", description: "记录提交、调试、提示使用和阶段成果。", icon: "folder" },
  { title: "成果可交", description: "沉淀代码、报告、测试和可复用文档。", icon: "file-check" },
  { title: "AI 辅导", description: "提供分层提示，不替学生直接完成项目。", icon: "bot" }
];

const fallbackHome: PracticeProjectHome = {
  projects: fallbackProjects,
  recommended_project_id: "sales-cleaning",
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
  proof_items: fallbackProofItems
};

function fallbackDetail(project: PracticeProjectSummary): PracticeProjectDetail {
  return {
    project,
    metrics: {
      completed_stage_count: project.id === "sales-cleaning" ? 3 : project.id === "retention-dashboard" ? 5 : 0,
      total_stage_count: 6,
      experiment_record_count: project.id === "sales-cleaning" ? 8 : 0,
      submission_count: project.id === "sales-cleaning" ? 2 : 0
    },
    task_sections: [
      {
        title: "当前任务说明",
        description: "在 ResNet-18 与 EfficientNet-B0 上完成模型训练与对比，记录训练过程与关键实验指标，分析模型性能差异，并撰写对比分析结论。",
        icon: "bot"
      },
      { title: "数据集 / 研究对象", description: "CIFAR-10 图像分类数据集，共 60,000 张，10 类。", action: "查看数据集详情", icon: "database" },
      { title: "方法要求", description: "使用深度学习框架实现训练模型，至少包含训练过程、验证指标、召回率、F1 等指标评估。", icon: "workflow" },
      { title: "输出物要求", description: "代码、训练日志、模型性能对比表格、可视化图表、对比分析报告。", icon: "file-check" }
    ],
    submission_requirements: ["上传代码 / 文档", "运行结果截图", "实验记录", "其他补充材料（可选）"],
    acceptance_criteria: ["模型在测试集 Top-1 准确率不低于 80%", "完整的实验记录与结果可复现", "对比分析结论清晰，图表规范"],
    mentor_tips: ["关键模型对比思路与实验设计建议", "优化建议 Accuracy / Recall / F1", "实验结果解读与图表建议"],
    resources: [
      { title: "图像分类实验指南", meta: "PDF · 1.2 MB" },
      { title: "2种模型结构对比综述", meta: "PDF · 890 KB" },
      { title: "CIFAR-10 数据集说明", meta: "PDF · 650 KB" }
    ],
    submissions: [
      {
        id: "fallback-submit-1",
        project_id: project.id,
        title: "v1.2 实验记录",
        description: "提交内容：ResNet-18 训练结果与学习曲线；评审意见：指标达标，建议补充 EfficientNet-B0 对比分析。",
        status: "APPROVED",
        status_label: "已通过",
        review_comment: "指标达标，建议补充 EfficientNet-B0 对比分析。",
        content: {},
        submitted_at: "2026-05-17T14:32:00Z",
        created_at: null
      }
    ],
    activities: fallbackActivities.filter((activity) => activity.project_id === project.id)
  };
}

function projectIcon(project: PracticeProjectSummary, index = 0) {
  if (project.course_id === "course_ds_001" || project.id.includes("log")) return <Code2 size={24} />;
  if (project.id.includes("retention") || project.tags.some((tag) => ["SQL", "图表"].includes(tag))) return <BarChart3 size={24} />;
  return index % 2 === 0 ? <ClipboardList size={24} /> : <Database size={24} />;
}

function pathIcon(index: number) {
  const icons = [
    <FileText size={23} />,
    <BookOpenText size={23} />,
    <Workflow size={23} />,
    <Code2 size={23} />,
    <ShieldCheck size={23} />,
    <Trophy size={23} />
  ];
  return icons[index] ?? <FileText size={23} />;
}

function taskIcon(section: PracticeProjectTaskSection) {
  if (section.icon === "database") return <Database size={18} />;
  if (section.icon === "workflow") return <Workflow size={18} />;
  if (section.icon === "file-check") return <FileCheck2 size={18} />;
  return <Bot size={18} />;
}

function statusClass(status: string) {
  return status === "IN_PROGRESS" || status === "SUBMITTED" ? "active" : "pending";
}

function apiErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "项目实训数据暂时不可用，已使用本地演示数据。";
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
  if (item.includes("代码")) return "关联本阶段代码仓、Notebook、配置说明等成果文件";
  if (item.includes("截图")) return "记录运行输出、关键图表、指标面板等可验证证据";
  if (item.includes("实验")) return "沉淀实验参数、指标变化、问题定位和调整记录";
  return "补充说明文档、参考链接或其他可帮助审核的材料";
}

export default function ProjectPractice() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId?: string }>();
  const [homeData, setHomeData] = useState<PracticeProjectHome | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);

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
  const recommendedProjectId = pageData.recommended_project_id ?? pageData.projects[0]?.id ?? fallbackProjects[0].id;

  if (projectId) {
    const fallbackProject = fallbackProjects.find((project) => project.id === projectId) ?? fallbackProjects[0];
    return <ProjectPracticeDetail fallbackProject={fallbackProject} projectId={projectId} />;
  }

  return (
    <main className="project-practice-home">
      <section className="practice-hero-card" aria-labelledby="practice-home-title">
        <div className="practice-hero-illustration" aria-hidden="true">
          <img src={practiceHeroArt} alt="" />
        </div>
        <div className="practice-hero-copy">
          <h1 id="practice-home-title">开始你的科研项目实训之旅 <Sparkles size={25} /></h1>
          <p>将课程能力转化为真实的项目证据，构建完整的科研与工程能力体系。按照项目流程逐步完成任务，积累可展示、可复用的成果。</p>
          <div className="practice-hero-actions">
            <button type="button" onClick={() => navigate(`/project-practice/projects/${recommendedProjectId}`)}>
              查看推荐项目
              <ArrowRight size={18} />
            </button>
            <button type="button" className="secondary" onClick={() => navigate(`/project-practice/projects/${recommendedProjectId}`)}>
              <CirclePlay size={18} />
              继续上次任务
            </button>
          </div>
        </div>
      </section>

      {(homeLoading || homeError) ? (
        <div className={`practice-data-banner ${homeError ? "error" : ""}`}>
          {homeLoading ? <Loader2 className="practice-spin-icon" size={15} /> : <AlertCircle size={15} />}
          <span>{homeLoading ? "正在同步项目实训数据..." : homeError}</span>
        </div>
      ) : null}

      <section className="practice-main-grid">
        <div className="practice-project-panel">
          <div className="practice-section-title">
            <span><Layers3 size={19} /> 我的项目</span>
            <button type="button" onClick={() => navigate(`/project-practice/projects/${recommendedProjectId}`)}>查看全部项目 <ArrowRight size={15} /></button>
          </div>
          <div className="practice-project-list">
            {pageData.projects.map((project, index) => (
              <button
                type="button"
                className={`practice-project-card ${recommendedProjectId === project.id ? "selected" : ""}`}
                data-accent={project.accent}
                key={project.id}
                onClick={() => navigate(`/project-practice/projects/${project.id}`)}
              >
                <span className="practice-project-icon">{projectIcon(project, index)}</span>
                <span className={`practice-project-status ${statusClass(project.status)}`}>{project.status_label}</span>
                <strong>{project.title}</strong>
                <small>{project.description}</small>
                <span className="practice-progress-label">
                  <em>项目进度</em>
                  <b>{project.progress}%</b>
                </span>
                <i className="practice-progress-track"><b style={{ width: `${project.progress}%` }} /></i>
                <span className="practice-project-footer">
                  <span>{project.tags.map((tag) => <em key={tag}>{tag}</em>)}</span>
                  <span className="practice-avatar-stack">
                    {project.members.map((member) => <b key={member}>{member}</b>)}
                    <b>+2</b>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <aside className="practice-side-column">
          <section className="practice-stats-card">
            <div className="practice-section-title compact">
              <span><LineChart size={19} /> 学习统计</span>
              <button type="button">本周 05.12 - 05.18 <ChevronDown size={14} /></button>
            </div>
            <div className="practice-stat-grid">
              <div><span>项目数</span><strong>{pageData.stats.project_count}</strong><small>全部项目</small></div>
              <div><span>进行中</span><strong>{pageData.stats.in_progress_count}</strong><small>较上周 <b>+{pageData.stats.project_delta}</b></small></div>
              <div><span>已完成</span><strong>{pageData.stats.completed_count}</strong><small>较上周 <b>+{pageData.stats.completed_delta}</b></small></div>
              <div><span>本周投入</span><strong>{pageData.stats.weekly_hours}h</strong><small>较上周 <b>+{pageData.stats.weekly_hours_delta}h</b></small></div>
            </div>
          </section>

          <section className="practice-activity-card">
            <div className="practice-section-title compact">
              <span><ShieldCheck size={19} /> 最近动态</span>
              <button type="button">查看全部 <ArrowRight size={14} /></button>
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

      <section className="practice-path-card">
        <div className="practice-section-title">
          <span><GitBranch size={19} /> 项目学习路径</span>
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
  const [activeTab, setActiveTab] = useState("任务说明");
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
        title: `${project.stage} 阶段成果`,
        description: `提交内容：${project.stage} 阶段材料。`,
        materials
      });
      setDetail(result.detail);
      setSelectedMaterials([]);
      setSubmitMessage("阶段成果已提交，已进入审核队列。");
    } catch (err) {
      setSubmitMessage(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function renderWorkspaceTab() {
    if (activeTab === "参考资料") {
      return (
        <div className="project-tab-surface reference-view">
          <div className="project-tab-summary">
            <div>
              <strong>当前阶段参考资料</strong>
              <p>围绕 {project.stage} 自动聚合项目资料、导师建议和关联能力点。</p>
            </div>
            <span>{pageData.resources.length} 份资料</span>
          </div>
          <div className="project-reference-list">
            {pageData.resources.length > 0 ? pageData.resources.map((resource) => (
              <article key={resource.title}>
                <span><FileText size={18} /></span>
                <div>
                  <strong>{resource.title}</strong>
                  <p>{resource.meta || "项目资料"}</p>
                </div>
                <em>阶段资料</em>
              </article>
            )) : (
              <div className="project-empty-state">暂无可用资料，完成当前阶段后会自动沉淀新的参考材料。</div>
            )}
          </div>
          <div className="project-tip-list">
            <strong><Bot size={18} /> AI 导师建议</strong>
            {pageData.mentor_tips.map((tip) => (
              <span key={tip}><CheckCircle2 size={14} /> {tip}</span>
            ))}
          </div>
          <div className="project-capability-strip">
            {project.capability_points.map((point) => <span key={point}>{point}</span>)}
          </div>
        </div>
      );
    }

    if (activeTab === "过程记录") {
      return (
        <div className="project-tab-surface process-view">
          <div className="project-tab-summary">
            <div>
              <strong>项目过程留痕</strong>
              <p>记录提交、导师辅助、阶段更新等动作，用于复盘与能力证据生成。</p>
            </div>
            <span>{activityRows.length} 条动态</span>
          </div>
          <div className="project-process-metrics">
            <div><span>阶段进度</span><strong>{pageData.metrics.completed_stage_count}/{pageData.metrics.total_stage_count}</strong></div>
            <div><span>实验记录</span><strong>{pageData.metrics.experiment_record_count}</strong></div>
            <div><span>阶段提交</span><strong>{pageData.metrics.submission_count}</strong></div>
          </div>
          <div className="project-process-list">
            {activityRows.length > 0 ? activityRows.map((activity, index) => (
              <article key={activity.id}>
                <i data-kind={activity.type} />
                <div>
                  <strong>{activity.text}</strong>
                  <p>{index === 0 ? "最近一次项目动作，会影响项目进度、提交记录或能力证据。" : "项目过程留痕，用于后续复盘与能力证明。"}</p>
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

    if (activeTab === "提交成果") {
      return (
        <div className="project-tab-surface result-view">
          <div className="project-tab-summary">
            <div>
              <strong>阶段成果包</strong>
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

    return (
      <div className="project-task-card">
        {pageData.task_sections.map((item) => (
          <article key={item.title}>
            <span>{taskIcon(item)}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
              {item.action ? (
                <button type="button" onClick={() => setActiveTab("参考资料")}>
                  {item.action} <ArrowRight size={14} />
                </button>
              ) : null}
            </div>
          </article>
        ))}
        <div className="project-acceptance">
          <strong><ShieldCheck size={18} /> 验收标准</strong>
          {pageData.acceptance_criteria.map((criterion) => (
            <span key={criterion}><CheckCircle2 size={14} /> {criterion}</span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="project-detail-page">
      <section className="project-detail-command">
        <div className="project-detail-crumb">
          <span>项目实训</span>
          <b>/</b>
          <span>我的项目</span>
          <b>/</b>
          <strong>{project.title}</strong>
        </div>
        <div className="project-detail-tags">
          <span className="running">{project.status_label}</span>
          <span>{project.course_name || "AI方向"}</span>
          <span className="green">科研小项目</span>
        </div>
        <div className="project-detail-actions">
          <button type="button" className="primary" disabled={submitting} onClick={submitCurrentStage}>
            {submitting ? <Loader2 className="practice-spin-icon" size={17} /> : <ArrowRight size={17} />}
            {submitting ? "提交中" : "提交阶段成果"}
          </button>
          <button type="button" onClick={() => setActiveTab("提交成果")}>
            <FileText size={17} />
            查看提交记录
          </button>
        </div>
      </section>

      {(loading || error || submitMessage) ? (
        <div className={`practice-data-banner ${error || submitMessage?.includes("不可用") ? "error" : ""}`}>
          {loading ? <Loader2 className="practice-spin-icon" size={15} /> : error ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          <span>{loading ? "正在读取项目详情..." : error ?? submitMessage}</span>
        </div>
      ) : null}

      <section className="project-detail-summary">
        <div className="project-detail-title-block">
          <span className="project-detail-icon"><BarChart3 size={26} /></span>
          <div>
            <h1>{project.title}</h1>
            <p>{project.long_description}</p>
          </div>
        </div>
        <div className="project-detail-facts">
          <div><CalendarDays size={18} /><span>项目周期</span><strong>{project.period}</strong></div>
          <div><Layers3 size={18} /><span>当前阶段</span><strong>{project.stage}</strong></div>
          <div><Workflow size={18} /><span>项目方向</span><strong>{project.direction}</strong></div>
        </div>
        <div className="project-progress-ring" aria-label={`整体进度 ${project.progress}%`}>
          <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
            <circle cx="60" cy="60" r="47" />
            <circle cx="60" cy="60" r="47" pathLength="100" style={{ strokeDasharray: `${project.progress} 100` }} />
          </svg>
          <span>整体进度</span>
          <strong>{project.progress}%</strong>
        </div>
        <div className="project-detail-metrics">
          <div><BarChart3 size={24} /><span>已完成阶段</span><strong>{pageData.metrics.completed_stage_count} / {pageData.metrics.total_stage_count}</strong></div>
          <div><Database size={24} /><span>实验记录</span><strong>{pageData.metrics.experiment_record_count}</strong></div>
          <div><FileCheck2 size={24} /><span>阶段提交</span><strong>{pageData.metrics.submission_count}</strong></div>
        </div>
      </section>

      <section className="project-detail-layout">
        <div className="project-work-panel">
          <h2>项目工作区</h2>
          <div className="project-work-tabs" role="tablist" aria-label="项目工作区标签">
            {["任务说明", "参考资料", "过程记录", "提交成果"].map((tab) => (
              <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>
          {renderWorkspaceTab()}
        </div>

        <aside className="project-context-column">
          <section className="project-mentor-card">
            <h2><Bot size={20} /> AI科研导师</h2>
            <p>基于当前阶段为你提供：</p>
            {pageData.mentor_tips.map((tip) => <span key={tip}><CheckCircle2 size={14} /> {tip}</span>)}
            <button type="button">与导师对话</button>
          </section>

          <section className="project-resource-card">
            <div className="project-card-head">
              <h2>资料与文献</h2>
              <button type="button">查看更多 <ArrowRight size={14} /></button>
            </div>
            {pageData.resources.map((resource) => (
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
              <button type="button">查看全部 <ArrowRight size={14} /></button>
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
