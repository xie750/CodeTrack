import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Bot,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ClipboardCheck,
  Code2,
  Database,
  FunctionSquare,
  Goal,
  GraduationCap,
  HardDrive,
  Layers3,
  ListChecks,
  Medal,
  Network,
  NotebookTabs,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Triangle,
  UserRound
} from "lucide-react";
import { api, LearningContext, StudentProfile } from "../api";
import heroArt from "../assets/ui-home/hero-art.png";

const knowledgeIcons = [<Medal size={19} />, <FunctionSquare size={19} />, <Triangle size={19} />, <RefreshCw size={19} />, <NotebookTabs size={19} />, <Sparkles size={19} />];
const knowledgeColors = ["blue", "green", "blue", "purple", "green", "orange"];

type CourseProfileDimension = {
  key: string;
  label: string;
  score: number;
  source: string;
  icon: JSX.Element;
  tone: "blue" | "green" | "purple" | "orange";
};

type GlobalProfileDimension = CourseProfileDimension & {
  group: "课程能力" | "自主学习" | "学习行为";
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stateText(state: string) {
  const map: Record<string, string> = {
    STABLE: "基本稳定",
    WEAK: "需要复习",
    IMPROVING: "正在提升",
    MASTERED: "掌握良好"
  };
  return map[state] ?? state;
}

function formatTime(value?: string) {
  if (!value) return "刚刚更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function courseDimensionProfile(profile: StudentProfile): CourseProfileDimension[] {
  const courseName = profile.course.name;
  const overview = profile.overview;
  const knowledgeAverage = profile.knowledge_states.length
    ? profile.knowledge_states.reduce((sum, item) => sum + item.mastery_score, 0) / profile.knowledge_states.length
    : overview.overall_progress;
  const weakPenalty = profile.knowledge_states.filter((item) => item.state === "WEAK").length * 8;
  const errorPenalty = profile.frequent_errors.reduce((sum, item) => sum + item.count, 0) * 3;
  const hintScore = overview.hint_dependency_level === "HIGH" ? 55 : overview.hint_dependency_level === "MEDIUM" ? 72 : 88;

  if (courseName.includes("网络")) {
    const dimensions: CourseProfileDimension[] = [
      { key: "network-foundation", label: "网络概念结构", score: knowledgeAverage, source: "教学大纲：网络分层、IP 地址、子网划分", icon: <Network size={19} />, tone: "blue" },
      { key: "subnet-calculation", label: "子网计算能力", score: knowledgeAverage - weakPenalty, source: "课程知识库：子网掩码与可用主机数", icon: <FunctionSquare size={19} />, tone: "purple" },
      { key: "protocol-reasoning", label: "协议推理表达", score: 100 - overview.logic_error_rate, source: "任务诊断：网络号、主机号、地址范围", icon: <Layers3 size={19} />, tone: "green" },
      { key: "practice-transfer", label: "场景迁移练习", score: overview.recent_task_completion, source: "课程任务与练习完成记录", icon: <ListChecks size={19} />, tone: "orange" },
      { key: "debug-discipline", label: "计算过程稳定性", score: 100 - overview.compile_error_rate, source: "系统验证与提交记录", icon: <ShieldCheck size={19} />, tone: "green" },
      { key: "self-regulation", label: "自主纠错控制", score: hintScore, source: "提示使用与自学记录", icon: <Goal size={19} />, tone: "blue" },
    ];
    return dimensions.map((item) => ({ ...item, score: clampScore(item.score) }));
  }

  if (courseName.includes("组成") || courseName.includes("体系")) {
    const dimensions: CourseProfileDimension[] = [
      { key: "architecture-concepts", label: "组成原理概念", score: knowledgeAverage, source: "教学大纲：数据表示、存储器、指令系统", icon: <HardDrive size={19} />, tone: "blue" },
      { key: "data-path", label: "数据通路理解", score: knowledgeAverage - weakPenalty, source: "课程知识库：CPU 与存储层次", icon: <Database size={19} />, tone: "purple" },
      { key: "calculation", label: "计算与推导", score: 100 - overview.logic_error_rate, source: "任务诊断：地址换算、性能计算", icon: <FunctionSquare size={19} />, tone: "green" },
      { key: "experiment", label: "实验验证习惯", score: overview.recent_task_completion, source: "课程实验与提交记录", icon: <ClipboardCheck size={19} />, tone: "orange" },
      { key: "error-control", label: "错误定位能力", score: 100 - overview.compile_error_rate - errorPenalty, source: "系统验证与错因统计", icon: <ShieldCheck size={19} />, tone: "green" },
      { key: "learning-loop", label: "复盘闭环", score: hintScore, source: "提示使用、资料保存、自学事件", icon: <RefreshCw size={19} />, tone: "blue" },
    ];
    return dimensions.map((item) => ({ ...item, score: clampScore(item.score) }));
  }

  const dimensions: CourseProfileDimension[] = [
    { key: "data-structure-foundation", label: "结构概念建模", score: knowledgeAverage, source: "教学大纲：线性表、栈队列、树结构", icon: <Layers3 size={19} />, tone: "blue" },
    { key: "algorithm-implementation", label: "算法实现能力", score: 100 - overview.compile_error_rate - weakPenalty, source: "课程任务：编程提交与公开样例", icon: <Code2 size={19} />, tone: "green" },
    { key: "boundary-reasoning", label: "边界场景推理", score: knowledgeAverage - errorPenalty, source: "知识库与诊断：头节点、空结构、非法位置", icon: <Triangle size={19} />, tone: "orange" },
    { key: "debugging", label: "调试与验证", score: 100 - overview.logic_error_rate, source: "沙箱运行、测试结果、错因统计", icon: <ShieldCheck size={19} />, tone: "purple" },
    { key: "practice-progress", label: "任务完成闭环", score: overview.recent_task_completion, source: "教师下发任务与学习总结", icon: <ListChecks size={19} />, tone: "green" },
    { key: "self-regulation", label: "提示依赖控制", score: hintScore, source: "分层提示使用与自主学习记录", icon: <Goal size={19} />, tone: "blue" },
  ];
  return dimensions.map((item) => ({ ...item, score: clampScore(item.score) }));
}

function radarPoints(dimensions: CourseProfileDimension[]) {
  const center = { x: 158, y: 120 };
  const radius = 90;
  return dimensions.slice(0, 6).map((dimension, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / 6);
    const length = radius * clampScore(dimension.score) / 100;
    return {
      x: center.x + Math.cos(angle) * length,
      y: center.y + Math.sin(angle) * length,
    };
  });
}

function average(values: number[], fallback = 0) {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildGlobalProfileDimensions(profile: StudentProfile): GlobalProfileDimension[] {
  const overview = profile.overview;
  const knowledgeAverage = average(profile.knowledge_states.map((item) => item.mastery_score), overview.overall_progress);
  const weakCount = profile.knowledge_states.filter((item) => item.state === "WEAK" || item.mastery_score < 70).length;
  const errorCount = profile.frequent_errors.reduce((sum, item) => sum + item.count, 0);
  const hintScore = overview.hint_dependency_level === "HIGH" ? 56 : overview.hint_dependency_level === "MEDIUM" ? 72 : 88;
  const artifactSignal = clampScore(68 + Math.min(profile.recommendations.length, 4) * 5);

  const dimensions: GlobalProfileDimension[] = [
    {
      key: "course-foundation",
      label: "课程知识基础",
      score: knowledgeAverage,
      source: "来自各课程知识点掌握度、任务测评和课程知识库证据",
      icon: <Layers3 size={19} />,
      tone: "blue",
      group: "课程能力"
    },
    {
      key: "practice-delivery",
      label: "任务实践能力",
      score: 100 - overview.compile_error_rate - weakCount * 5,
      source: "整合编程提交、系统验证、测试通过和任务完成闭环",
      icon: <Code2 size={19} />,
      tone: "green",
      group: "课程能力"
    },
    {
      key: "problem-diagnosis",
      label: "问题诊断能力",
      score: 100 - overview.logic_error_rate - errorCount * 2,
      source: "综合高频错因、AI 诊断、边界场景和调试记录",
      icon: <ShieldCheck size={19} />,
      tone: "purple",
      group: "课程能力"
    },
    {
      key: "self-study-drive",
      label: "自主学习驱动",
      score: artifactSignal,
      source: "自主学习入口、资料生成、保存笔记和复习计划信号",
      icon: <Sparkles size={19} />,
      tone: "orange",
      group: "自主学习"
    },
    {
      key: "learning-habit",
      label: "学习习惯稳定性",
      score: overview.recent_task_completion,
      source: "近期任务完成、自学复盘、资料查看和持续学习节奏",
      icon: <RefreshCw size={19} />,
      tone: "green",
      group: "学习行为"
    },
    {
      key: "ai-collaboration",
      label: "AI 协作控制",
      score: hintScore,
      source: "分层提示依赖、AI 助学使用和独立完成程度估计",
      icon: <Bot size={19} />,
      tone: "blue",
      group: "学习行为"
    }
  ];
  return dimensions.map((item) => ({ ...item, score: clampScore(item.score) }));
}

function globalSummary(profile: StudentProfile) {
  const weak = profile.knowledge_states.find((item) => item.state === "WEAK" || item.mastery_score < 70);
  const error = profile.frequent_errors[0];
  if (weak && error) {
    return `当前整体画像显示：${weak.knowledge_point}仍是主要薄弱点，${error.label}出现较多；建议用自主学习完成专项复盘，再通过课程任务验证。`;
  }
  if (weak) {
    return `当前整体画像显示：${weak.knowledge_point}需要继续巩固；建议结合自主学习资料和课程任务形成新的能力证据。`;
  }
  return "当前整体画像较稳定，建议继续通过自主学习补齐迁移任务和学习产物证据。";
}

type LearningProfileProps = {
  initialCourseId?: string;
};

export default function LearningProfile({ initialCourseId }: LearningProfileProps = {}) {
  const [context, setContext] = useState<LearningContext | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAdviceRequested, setAiAdviceRequested] = useState(false);

  useEffect(() => {
    let alive = true;
    setContextLoading(true);
    setError(null);
    setContext(null);
    setProfile(null);
    api.getLearningContext().then((data) => {
      if (!alive) return;
      setContext(data);
      const preferredCourse = initialCourseId && data.courses.some((course) => course.course_id === initialCourseId)
        ? initialCourseId
        : data.courses[0]?.course_id ?? "";
      setSelectedCourseId(preferredCourse);
    }).catch(() => {
      if (!alive) return;
      setError("学习画像上下文加载失败，请稍后刷新。");
    }).finally(() => {
      if (alive) setContextLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [initialCourseId]);

  useEffect(() => {
    if (!selectedCourseId) return;
    let alive = true;
    setProfileLoading(true);
    setError(null);
    setProfile(null);
    api.getStudentProfile(selectedCourseId).then((data) => {
      if (alive) setProfile(data);
    }).catch(() => {
      if (!alive) return;
      setProfile(null);
      setError("当前课程画像数据加载失败，请稍后刷新。");
    }).finally(() => {
      if (alive) setProfileLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [selectedCourseId]);

  const currentCourse = useMemo(
    () => context?.courses.find((course) => course.course_id === selectedCourseId),
    [context, selectedCourseId]
  );

  const isLoading = contextLoading || profileLoading;

  if (isLoading) {
    return (
      <div className="profile-page">
        <section className="profile-hero profile-loading-hero">
          <div>
            <h1>正在读取学习画像...</h1>
            <p>页面会在当前课程画像数据返回后一次性回显。</p>
          </div>
          <img src={heroArt} alt="学生使用电脑学习" />
        </section>
        <section className="profile-top-grid">
          <article className="profile-card profile-pad skeleton-block" />
          <article className="profile-card profile-pad skeleton-block" />
        </section>
        <section className="profile-card profile-pad skeleton-block profile-page-skeleton" />
      </div>
    );
  }

  if (error || !context || !profile) {
    return (
      <div className="profile-page">
        <section className="profile-card profile-pad">
          <h2>学习画像暂不可用</h2>
          <p className="profile-empty-copy">{error ?? "当前账号还没有可展示的课程画像数据。"}</p>
        </section>
      </div>
    );
  }

  const isCourseLocked = Boolean(initialCourseId);
  const overview = profile.overview;
  const dimensions = isCourseLocked ? courseDimensionProfile(profile) : buildGlobalProfileDimensions(profile);
  const polygonPoints = radarPoints(dimensions).map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const knowledgeCards = profile.knowledge_states.map((item, index) => ({
    icon: knowledgeIcons[index % knowledgeIcons.length],
    title: item.knowledge_point,
    score: item.mastery_score,
    state: stateText(item.state),
    color: knowledgeColors[index % knowledgeColors.length],
    warn: item.state === "WEAK",
    evidence: item.last_evidence
  }));
  const weakItems = profile.knowledge_states
    .filter((item) => item.state === "WEAK" || item.mastery_score < 70)
    .map((item) => ({
      title: item.knowledge_point,
      rate: `掌握度 ${item.mastery_score}%`,
      desc: item.last_evidence || `证据 ${item.evidence_count} 条，建议结合最近任务复盘。`
    }));
  const adviceItems = profile.recommendations.map((item, index) => ({
    icon: index === 0 ? <CalendarDays size={21} /> : index === 1 ? <Goal size={21} /> : <BookOpenCheck size={21} />,
    title: item.title,
    desc: item.reason,
    action: item.suggested_action || "去完成",
    color: index === 0 ? "blue" : index === 1 ? "green" : "orange"
  }));
  const records = profile.frequent_errors.slice(0, 4).map((item) => ({
      icon: <ClipboardCheck size={16} />,
      title: `高频错因　${item.label}`,
      meta: `${item.count} 次 · ${item.related_knowledge_points.join(" / ")}`,
      time: formatTime(overview.updated_at)
    }));
  const progress = overview.overall_progress;
  const compileRate = overview.compile_error_rate;
  const logicRate = overview.logic_error_rate;
  const completion = overview.recent_task_completion;

  if (!isCourseLocked) {
    const globalDimensions = dimensions as GlobalProfileDimension[];
    const globalScore = clampScore(average(globalDimensions.map((item) => item.score), overview.overall_progress));
    const courseAbility = clampScore(average(globalDimensions.filter((item) => item.group === "课程能力").map((item) => item.score), overview.overall_progress));
    const selfStudyAbility = clampScore(average(globalDimensions.filter((item) => item.group === "自主学习").map((item) => item.score), 70));
    const behaviorAbility = clampScore(average(globalDimensions.filter((item) => item.group === "学习行为").map((item) => item.score), 70));
    const groupedDimensions = ["课程能力", "自主学习", "学习行为"].map((group) => ({
      group,
      items: globalDimensions.filter((item) => item.group === group)
    }));

    return (
      <div className="profile-page global-profile-page">
        <section className="profile-hero course-profile-hero global-profile-hero">
          <div>
            <span className="student-eyebrow">自主学习空间 / 全局个人画像</span>
            <h1>{context.student.name}的个人学习画像</h1>
            <p>{globalSummary(profile)}</p>
          </div>
          <img src={heroArt} alt="学生使用电脑学习" />
        </section>

        <section className="global-profile-metrics">
          <article className="profile-card">
            <span><ChartNoAxesColumnIncreasing size={18} /></span>
            <small>整体画像分</small>
            <strong>{globalScore}</strong>
          </article>
          <article className="profile-card">
            <span><GraduationCap size={18} /></span>
            <small>课程能力</small>
            <strong>{courseAbility}</strong>
          </article>
          <article className="profile-card">
            <span><Sparkles size={18} /></span>
            <small>自主学习</small>
            <strong>{selfStudyAbility}</strong>
          </article>
          <article className="profile-card">
            <span><RefreshCw size={18} /></span>
            <small>学习行为</small>
            <strong>{behaviorAbility}</strong>
          </article>
        </section>

        <section className="profile-top-grid global-profile-top">
          <article className="profile-card profile-pad">
            <h2>个人画像口径</h2>
            <div className="goal-table">
              <span>学生</span><strong>{context.student.name} · {context.student.class_name}</strong>
              <span>画像层级</span><strong>全局个人画像，高于单门课程画像</strong>
              <span>课程来源</span><strong>{context.courses.map((course) => course.course_name).join(" / ") || profile.course.name}</strong>
              <span>总体进度</span>
              <div className="profile-progress-line">
                <div className="profile-track"><i style={{ width: `${progress}%` }} /></div>
                <b>{progress}%</b>
              </div>
              <span>合并范围</span><strong>课程任务 / 自主学习 / AI 助学 / 资料沉淀 / 错因记录</strong>
              <span>画像目的</span><strong>判断学生整体学习状态，而不是只评价某门课表现</strong>
              <span>下一步计划</span><strong>{overview.recommendation}</strong>
            </div>
            <div className="profile-course-scope global">
              <span><ChartNoAxesColumnIncreasing size={15} /> 当前页面为自主学习全局画像</span>
              <p>课程画像里的单项能力会被搬到这里，但会和自学行为、资料产出、AI 使用与学习习惯一起重新汇总。</p>
            </div>
          </article>

          <article className="profile-card profile-pad">
            <h2>整体能力雷达</h2>
            <div className="profile-radar-wrap">
              <svg className="profile-radar" viewBox="0 0 330 250" aria-label="整体个人画像雷达图">
                <g transform="translate(158,120)" fill="none" stroke="#d5dfef">
                  <polygon points="0,-90 78,-45 78,45 0,90 -78,45 -78,-45" />
                  <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" />
                  <polygon points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15" />
                  <line x1="0" y1="0" x2="0" y2="-96" />
                  <line x1="0" y1="0" x2="84" y2="-48" />
                  <line x1="0" y1="0" x2="84" y2="48" />
                  <line x1="0" y1="0" x2="0" y2="96" />
                  <line x1="0" y1="0" x2="-84" y2="48" />
                  <line x1="0" y1="0" x2="-84" y2="-48" />
                </g>
                <polygon points={polygonPoints} fill="rgba(35,116,245,.18)" stroke="#176cf5" strokeWidth="4" />
                {radarPoints(globalDimensions).map((point, index) => (
                  <circle key={globalDimensions[index]?.key ?? index} cx={point.x} cy={point.y} r="5" fill="#176cf5" />
                ))}
                {([
                  { x: 158, y: 16, anchor: "middle" },
                  { x: 258, y: 86 },
                  { x: 247, y: 178 },
                  { x: 158, y: 228, anchor: "middle" },
                  { x: 37, y: 178 },
                  { x: 27, y: 86 },
                ] as Array<{ x: number; y: number; anchor?: "middle" }>).map((pos, index) => (
                  <g key={globalDimensions[index]?.key ?? index}>
                    <text x={pos.x} y={pos.y} textAnchor={pos.anchor}>{globalDimensions[index]?.label ?? ""}</text>
                    <text x={pos.x} y={pos.y + 16} textAnchor={pos.anchor}>{globalDimensions[index]?.score ?? 0}</text>
                  </g>
                ))}
              </svg>
              <div className="profile-legend">
                <span><i className="green" />80分及以上　优势</span>
                <span><i className="blue" />60-79分　稳定</span>
                <span><i className="orange" />40-59分　待提升</span>
                <span><i className="red" />40分以下　需加强</span>
              </div>
            </div>
          </article>
        </section>

        <section className="profile-card profile-pad course-dimension-section">
          <div className="profile-section-head"><h2>个人画像三类维度</h2><span>由课程画像、学习行为和自学空间证据合并生成</span></div>
          <div className="global-dimension-groups">
            {groupedDimensions.map((group) => (
              <article className="global-dimension-group" key={group.group}>
                <h3>{group.group}</h3>
                <div className="course-dimension-grid compact">
                  {group.items.map((dimension) => (
                    <article className="course-dimension-card" key={dimension.key}>
                      <span className={dimension.tone}>{dimension.icon}</span>
                      <div>
                        <strong>{dimension.label}</strong>
                        <p>{dimension.source}</p>
                      </div>
                      <em>{dimension.score}</em>
                    </article>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="profile-card profile-pad knowledge-section">
          <div className="profile-section-head"><h2>从课程搬入的知识画像</h2><span>单门课程维度在这里沉淀为个人能力证据</span></div>
          <div className="knowledge-grid">
            {knowledgeCards.length ? knowledgeCards.map((item) => (
              <article className="knowledge-card" key={item.title}>
                <div className="knowledge-top"><span className={item.color}>{item.icon}</span>{item.title}</div>
                <strong>{item.score}% <em className={item.warn ? "warn" : ""}>{item.state}</em></strong>
                <div className="profile-track"><i className={item.warn ? "orange" : ""} style={{ width: `${item.score}%` }} /></div>
              </article>
            )) : <div className="empty-panel wide">当前暂无可搬入的课程知识画像。</div>}
          </div>
        </section>

        <section className="profile-mid-grid global-advice-grid">
          <div className="global-left-stack">
            <article className="profile-card profile-pad">
              <div className="profile-section-head"><h2>整体薄弱信号</h2></div>
              <div className="weak-list">
                {weakItems.length ? weakItems.map((item, index) => (
                  <div className="weak-row" key={item.title}>
                    <span className="rank">{index + 1}</span>
                    <div className="weak-name"><strong>{item.title}</strong><span>{item.rate}</span></div>
                    <p>{item.desc}</p>
                    <button type="button">去自学</button>
                  </div>
                )) : <div className="empty-panel">暂无明显整体薄弱项，继续积累自学和课程证据。</div>}
              </div>
            </article>

            <article className="profile-card chart-card">
              <h2>学习行为 <span>（近 7 天）</span></h2>
              <div className="behavior-layout">
                <svg className="line-chart" viewBox="0 0 500 210" aria-label="近七天学习行为趋势">
                  <g stroke="#e7edf6" strokeWidth="1">
                    <line x1="48" y1="30" x2="460" y2="30" /><line x1="48" y1="75" x2="460" y2="75" /><line x1="48" y1="120" x2="460" y2="120" /><line x1="48" y1="165" x2="460" y2="165" />
                  </g>
                  <g fill="#748198" fontSize="11">
                    <text x="24" y="33">120</text><text x="30" y="78">90</text><text x="30" y="123">60</text><text x="30" y="168">30</text>
                    {["05-11", "05-12", "05-13", "05-14", "05-15", "05-16", "05-17"].map((day, idx) => <text key={day} x={62 + idx * 58} y="198">{day}</text>)}
                  </g>
                  <polyline points="62,130 120,97 178,127 236,145 294,112 352,98 410,126" fill="none" stroke="#176cf5" strokeWidth="4" strokeLinecap="round" />
                  <polyline points="62,132 120,146 178,104 236,96 294,86 352,117 410,151" fill="none" stroke="#20bd79" strokeWidth="4" strokeLinecap="round" />
                  {[62,120,178,236,294,352,410].map((x, idx) => <circle key={`b-${x}`} cx={x} cy={[130,97,127,145,112,98,126][idx]} r="4" fill="#176cf5" />)}
                  {[62,120,178,236,294,352,410].map((x, idx) => <circle key={`g-${x}`} cx={x} cy={[132,146,104,96,86,117,151][idx]} r="4" fill="#20bd79" />)}
                </svg>
                <div className="behavior-stats">
                  <span>学习高峰时间<strong>20:00 - 22:00</strong></span>
                  <span>编译错误率<strong>{compileRate}%</strong></span>
                  <span>逻辑错误率<strong>{logicRate}%</strong></span>
                  <span>任务完成率 <b>{completion}%</b></span>
                </div>
              </div>
            </article>
          </div>

          <article className="profile-card profile-pad global-advice-card">
            <div className="profile-section-head">
              <div>
                <h2>个人下一步建议</h2>
                <span>基于左侧整体薄弱信号生成，优先给出可执行学习动作</span>
              </div>
              <button className="ai-suggest-button" type="button" onClick={() => setAiAdviceRequested(true)}>
                <Sparkles size={15} />
                AI 建议
              </button>
            </div>
            <div className="ai-advice-brief">
              <strong>{aiAdviceRequested ? "AI 已根据整体薄弱信号生成建议" : "等待生成 AI 建议"}</strong>
              <p>
                {aiAdviceRequested
                  ? "建议先围绕最薄弱知识点完成一次概念复盘，再生成 1 组专项练习，最后用课程任务或迁移题验证是否真正稳定。"
                  : "点击右上角后，系统会读取薄弱信号、最近学习内容、资料沉淀和提示依赖，生成下一步学习安排。"}
              </p>
            </div>
            <div className="advice-list">
              {adviceItems.length ? adviceItems.map((item) => (
                <div className="advice-row" key={item.title}>
                  <span className={item.color}>{item.icon}</span>
                  <div><strong>{item.title}</strong><p>{item.desc}</p></div>
                  <button type="button">{item.action}</button>
                </div>
              )) : <div className="empty-panel">暂无个性化建议。</div>}
            </div>
          </article>
        </section>

        <section className="profile-summary-grid">
          <article className="profile-card summary-card">
            <div className="summary-icon"><Star size={27} fill="currentColor" /></div>
            <div><h3>系统综合画像</h3><strong>{globalScore}<span> 分</span></strong><p>{globalSummary(profile)}<br />更新于：{formatTime(overview.updated_at)}</p></div>
          </article>
          <article className="profile-card summary-card">
            <div className="summary-icon purple"><GraduationCap size={28} /></div>
            <div><h3>课程能力沉淀</h3><strong className="purple">{courseAbility}<span> 分</span></strong><p>课程画像中的知识、任务和调试能力已合并进个人画像。<br />来源：课程任务与知识库</p></div>
          </article>
          <article className="profile-card summary-card">
            <div className="summary-icon green"><UserRound size={28} /></div>
            <div><h3>自学空间表现</h3><strong className="green">{selfStudyAbility}<span> 分</span></strong><p>结合自主学习内容生成、资料保存和 AI 助学使用。<br />班级：{context.student.class_name}</p></div>
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <section className="profile-hero course-profile-hero">
        <div>
          <span className="student-eyebrow">课程学习画像 / {currentCourse?.course_name ?? profile.course.name}</span>
          <h1>{currentCourse?.course_name ?? profile.course.name}画像</h1>
          <p>{overview.summary}</p>
        </div>
        <img src={heroArt} alt="学生使用电脑学习" />
      </section>

      <section className="profile-top-grid">
        <article className="profile-card profile-pad">
          <h2>课程画像口径</h2>
          <div className="goal-table">
            <span>当前班级</span><strong>{context.student.class_name}</strong>
            <span>当前课程</span><strong>{currentCourse?.course_name ?? profile.course.name}</strong>
            <span>任课教师</span><strong>{currentCourse?.teacher_name ?? profile.course.teacher_name}</strong>
            <span>总体进度</span>
            <div className="profile-progress-line">
              <div className="profile-track"><i style={{ width: `${progress}%` }} /></div>
              <b>{progress}%</b>
            </div>
            <span>画像范围</span><strong>仅统计本课程任务、知识库、自学与资料沉淀</strong>
            <span>维度来源</span><strong>教学大纲 / 课程知识库 / 任务证据 / 后续模型分析</strong>
            <span>当前阶段</span><strong>提示依赖：{overview.hint_dependency_level}</strong>
            <span>下一步计划</span><strong>{overview.recommendation}</strong>
          </div>
          <div className="profile-course-scope">
            <span><ChartNoAxesColumnIncreasing size={15} /> 当前页面已锁定为课程画像</span>
            {isCourseLocked ? (
              <p>大学生会有多门课，但教师查看时只看到自己负责课程下的画像，避免把其他课程表现混入判断。</p>
            ) : (
              <p>自主学习入口暂取第一门课程画像预览；进入“我的课程”后每门课都有独立画像。</p>
            )}
          </div>
        </article>

        <article className="profile-card profile-pad">
          <h2>本课程能力维度</h2>
          <div className="profile-radar-wrap">
            <svg className="profile-radar" viewBox="0 0 330 250" aria-label="能力维度画像雷达图">
              <g transform="translate(158,120)" fill="none" stroke="#d5dfef">
                <polygon points="0,-90 78,-45 78,45 0,90 -78,45 -78,-45" />
                <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" />
                <polygon points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15" />
                <line x1="0" y1="0" x2="0" y2="-96" />
                <line x1="0" y1="0" x2="84" y2="-48" />
                <line x1="0" y1="0" x2="84" y2="48" />
                <line x1="0" y1="0" x2="0" y2="96" />
                <line x1="0" y1="0" x2="-84" y2="48" />
                <line x1="0" y1="0" x2="-84" y2="-48" />
              </g>
              <polygon points={polygonPoints} fill="rgba(35,116,245,.18)" stroke="#176cf5" strokeWidth="4" />
              {radarPoints(dimensions).map((point, index) => (
                <circle key={dimensions[index]?.key ?? index} cx={point.x} cy={point.y} r="5" fill="#176cf5" />
              ))}
              {([
                { x: 158, y: 16, anchor: "middle" },
                { x: 258, y: 86 },
                { x: 247, y: 178 },
                { x: 158, y: 228, anchor: "middle" },
                { x: 37, y: 178 },
                { x: 27, y: 86 },
              ] as Array<{ x: number; y: number; anchor?: "middle" }>).map((pos, index) => (
                <g key={dimensions[index]?.key ?? index}>
                  <text x={pos.x} y={pos.y} textAnchor={pos.anchor}>{dimensions[index]?.label ?? ""}</text>
                  <text x={pos.x} y={pos.y + 16} textAnchor={pos.anchor}>{dimensions[index]?.score ?? 0}</text>
                </g>
              ))}
            </svg>
            <div className="profile-legend">
              <span><i className="green" />80分及以上　优秀</span>
              <span><i className="blue" />60-79分　良好</span>
              <span><i className="orange" />40-59分　待提升</span>
              <span><i className="red" />40分以下　需加强</span>
            </div>
          </div>
        </article>
      </section>

      <section className="profile-card profile-pad course-dimension-section">
        <div className="profile-section-head"><h2>课程画像维度设计</h2><span>后续由模型结合教学大纲与知识库动态生成</span></div>
        <div className="course-dimension-grid">
          {dimensions.map((dimension) => (
            <article className="course-dimension-card" key={dimension.key}>
              <span className={dimension.tone}>{dimension.icon}</span>
              <div>
                <strong>{dimension.label}</strong>
                <p>{dimension.source}</p>
              </div>
              <em>{dimension.score}</em>
            </article>
          ))}
        </div>
      </section>

      <section className="profile-card profile-pad knowledge-section">
        <div className="profile-section-head"><h2>本课程知识掌握画像</h2><a href="#">查看详情 ›</a></div>
        <div className="knowledge-grid">
          {knowledgeCards.length ? knowledgeCards.map((item) => (
            <article className="knowledge-card" key={item.title}>
              <div className="knowledge-top"><span className={item.color}>{item.icon}</span>{item.title}</div>
              <strong>{item.score}% <em className={item.warn ? "warn" : ""}>{item.state}</em></strong>
              <div className="profile-track"><i className={item.warn ? "orange" : ""} style={{ width: `${item.score}%` }} /></div>
            </article>
          )) : <div className="empty-panel wide">当前课程暂无知识点画像数据。</div>}
        </div>
      </section>

      <section className="profile-mid-grid">
        <article className="profile-card profile-pad">
          <div className="profile-section-head"><h2>薄弱项诊断</h2></div>
          <div className="weak-list">
            {weakItems.length ? weakItems.map((item, index) => (
              <div className="weak-row" key={item.title}>
                <span className="rank">{index + 1}</span>
                <div className="weak-name"><strong>{item.title}</strong><span>{item.rate}</span></div>
                <p>{item.desc}</p>
                <button type="button">去练习</button>
              </div>
            )) : <div className="empty-panel">暂无明显薄弱项，继续完成任务后画像会更新。</div>}
          </div>
          <a className="profile-more" href="#">查看全部薄弱项 ›</a>
        </article>

        <article className="profile-card profile-pad">
          <div className="profile-section-head"><h2>本课程个性化建议</h2></div>
          <div className="advice-list">
            {adviceItems.length ? adviceItems.map((item) => (
              <div className="advice-row" key={item.title}>
                <span className={item.color}>{item.icon}</span>
                <div><strong>{item.title}</strong><p>{item.desc}</p></div>
                <button type="button">{item.action}</button>
              </div>
            )) : <div className="empty-panel">暂无个性化建议。</div>}
          </div>
        </article>
      </section>

      <section className="profile-bottom-grid">
        <article className="profile-card chart-card">
          <h2>学习行为画像 <span>（近 7 天）</span></h2>
          <div className="behavior-layout">
            <svg className="line-chart" viewBox="0 0 500 210" aria-label="近七天学习时长和正确率趋势">
              <g stroke="#e7edf6" strokeWidth="1">
                <line x1="48" y1="30" x2="460" y2="30" /><line x1="48" y1="75" x2="460" y2="75" /><line x1="48" y1="120" x2="460" y2="120" /><line x1="48" y1="165" x2="460" y2="165" />
              </g>
              <g fill="#748198" fontSize="11">
                <text x="24" y="33">120</text><text x="30" y="78">90</text><text x="30" y="123">60</text><text x="30" y="168">30</text>
                {["05-11", "05-12", "05-13", "05-14", "05-15", "05-16", "05-17"].map((day, idx) => <text key={day} x={62 + idx * 58} y="198">{day}</text>)}
              </g>
              <polyline points="62,130 120,97 178,127 236,145 294,112 352,98 410,126" fill="none" stroke="#176cf5" strokeWidth="4" strokeLinecap="round" />
              <polyline points="62,132 120,146 178,104 236,96 294,86 352,117 410,151" fill="none" stroke="#20bd79" strokeWidth="4" strokeLinecap="round" />
              {[62,120,178,236,294,352,410].map((x, idx) => <circle key={`b-${x}`} cx={x} cy={[130,97,127,145,112,98,126][idx]} r="4" fill="#176cf5" />)}
              {[62,120,178,236,294,352,410].map((x, idx) => <circle key={`g-${x}`} cx={x} cy={[132,146,104,96,86,117,151][idx]} r="4" fill="#20bd79" />)}
            </svg>
            <div className="behavior-stats">
              <span>学习高峰时间<strong>20:00 - 22:00</strong></span>
              <span>编译错误率<strong>{compileRate}%</strong></span>
              <span>逻辑错误率<strong>{logicRate}%</strong></span>
              <span>任务完成率 <b>{completion}%</b></span>
            </div>
          </div>
          <a className="profile-more" href="#">查看学习周报 ›</a>
        </article>

        <article className="profile-card chart-card">
          <h2>近期学习记录</h2>
          <div className="profile-timeline">
            {records.length ? records.map((item) => (
              <div className="record-row" key={item.title}>
                <span>{item.icon}</span>
                <strong>{item.title}</strong>
                <em>{item.meta}</em>
                <time>{item.time}</time>
              </div>
            )) : <div className="empty-panel">暂无近期学习记录。</div>}
          </div>
          <a className="profile-more" href="#">查看全部记录 ›</a>
        </article>
      </section>

      <section className="profile-summary-grid">
        <article className="profile-card summary-card">
          <div className="summary-icon"><Star size={27} fill="currentColor" /></div>
          <div><h3>课程系统分析</h3><strong>{progress}<span> 分</span></strong><p>{overview.summary}<br />更新于：{formatTime(overview.updated_at)}</p></div>
        </article>
        <article className="profile-card summary-card">
          <div className="summary-icon purple"><GraduationCap size={28} /></div>
          <div><h3>教师评价</h3><strong className="purple">{currentCourse?.teacher_name ?? profile.course.teacher_name} <span>课程视角</span></strong><p>画像按课程独立计算，便于老师查看本课程情况。<br />来自：{profile.course.name}</p><a href="#">查看评语 ›</a></div>
        </article>
        <article className="profile-card summary-card">
          <div className="summary-icon green"><UserRound size={28} /></div>
          <div><h3>自我评价</h3><strong className="green">{completion}<span> 分</span></strong><p>我会继续努力，突破薄弱点！<br />班级：{context.student.class_name}</p><a href="#">去更新 ›</a></div>
        </article>
      </section>
    </div>
  );
}
