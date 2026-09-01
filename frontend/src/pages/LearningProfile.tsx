import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpenCheck,
  Bot,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChevronLeft,
  ChevronRight,
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
  Maximize2,
  Network,
  NotebookTabs,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Triangle,
  X,
} from "lucide-react";
import { api, LearningContext, StudentAiChatResponse, StudentProfile } from "../api";
import heroArt from "../assets/ui-home/hero-art.png";
import { StudentState, studentErrorDetail, studentErrorMessage } from "../components/StudentState";

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

type ProfileRecommendation = StudentProfile["recommendations"][number];

type AdviceItem = {
  icon: JSX.Element;
  title: string;
  desc: string;
  rawAction: string;
  actionLabel: string;
  color: "blue" | "green" | "orange";
  relatedTaskId: string | null;
  relatedKnowledgePoints: string[];
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

function recommendationActionLabel(action?: string) {
  const normalized = (action || "").trim();
  const map: Record<string, string> = {
    OPEN_SELF_STUDY: "去自学",
    OPEN_TASK: "去任务",
    GENERATE_EXERCISE: "生成练习",
    REVIEW_GENERATED_PRACTICE: "练习复盘",
    REVIEW_WRONG_QUESTIONS: "复盘错题",
    REVIEW_SELF_STUDY: "自学复盘"
  };
  if (!normalized) return "去处理";
  if (map[normalized]) return map[normalized];
  return /^[A-Z0-9_]+$/.test(normalized) ? "去处理" : normalized;
}

function buildAiAdvicePrompt(profile: StudentProfile, dimensions: CourseProfileDimension[]) {
  const weakPoints = profile.knowledge_states
    .filter((item) => item.state === "WEAK" || item.mastery_score < 70)
    .slice(0, 5)
    .map((item) => `${item.knowledge_point}${item.mastery_score}%`)
    .join("、") || "暂无明显低分知识点";
  const frequentErrors = profile.frequent_errors
    .slice(0, 4)
    .map((item) => `${item.label}${item.count}次`)
    .join("、") || "暂无高频错因";
  const dimensionText = dimensions
    .slice(0, 6)
    .map((item) => `${item.label}${item.score}分`)
    .join("、");
  const recommendations = profile.recommendations
    .slice(0, 4)
    .map((item) => item.title)
    .join("、") || "暂无系统推荐项";

  return [
    "请基于当前登录学生的学习画像，生成自主学习页“个人下一步建议”。",
    "业务要求：先指出当前最主要薄弱点，再结合画像各维度给出3步以内的优先补强安排；每步包含目标、学习动作和验证方式；语言要直接可执行，不要泛泛鼓励。",
    `课程：${profile.course.name}`,
    `画像概览：总体进度${profile.overview.overall_progress}%，提示依赖${profile.overview.hint_dependency_level}，编译错误率${profile.overview.compile_error_rate}%，逻辑错误率${profile.overview.logic_error_rate}%，近期任务完成率${profile.overview.recent_task_completion}%。`,
    `维度得分：${dimensionText}`,
    `薄弱知识点：${weakPoints}`,
    `高频错因：${frequentErrors}`,
    `已有系统推荐：${recommendations}`
  ].join("\n").slice(0, 1900);
}

type BehaviorTrendMode = "day" | "month" | "year";

type BehaviorTrendEvent = NonNullable<StudentProfile["behavior_events"]>[number];

type BehaviorTrendPoint = {
  key: string;
  label: string;
  title: string;
  activityIndex: number;
  qualityScore: number;
  taskCompletionRate: number;
  compileErrorRate: number;
  logicErrorRate: number;
  peakPeriod: string;
  eventCount: number;
  summary: string;
  source: string;
  confidence: number;
  nextAction: string;
};

const behaviorModeOptions: Array<{ key: BehaviorTrendMode; label: string }> = [
  { key: "day", label: "日" },
  { key: "month", label: "月" },
  { key: "year", label: "年" },
];

const behaviorModeCopy: Record<BehaviorTrendMode, { subtitle: string; previous: string; next: string }> = {
  day: { subtitle: "近 7 天", previous: "前一天", next: "后一天" },
  month: { subtitle: "本月逐日", previous: "上月", next: "下月" },
  year: { subtitle: "本年逐月", previous: "上一年", next: "下一年" },
};

function profilePercent(value: number) {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
}

function formatProfilePercent(value: number) {
  const normalized = profilePercent(value);
  return `${Number.isInteger(normalized) ? normalized.toFixed(0) : normalized.toFixed(1)}%`;
}

function parseProfileDate(value?: string | null) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
}

function addYears(date: Date, years: number) {
  return new Date(date.getFullYear() + years, 0, 1, 12);
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatAxisDate(date: Date) {
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatWindowLabel(mode: BehaviorTrendMode, anchorDate: Date) {
  if (mode === "day") {
    return `截至 ${formatAxisDate(anchorDate)}`;
  }
  if (mode === "month") {
    return `${anchorDate.getFullYear()}年${pad2(anchorDate.getMonth() + 1)}月`;
  }
  return `${anchorDate.getFullYear()}年`;
}

function shiftBehaviorDate(date: Date, mode: BehaviorTrendMode, delta: number) {
  if (mode === "day") return addDays(date, delta);
  if (mode === "month") return addMonths(date, delta);
  return addYears(date, delta);
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 9973;
  }
  return hash;
}

function averageNumber(values: number[], fallback = 0) {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function eventDate(event: BehaviorTrendEvent) {
  const date = parseProfileDate(event.occurred_at);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventInRange(event: BehaviorTrendEvent, start: Date, end: Date) {
  const date = eventDate(event);
  return date ? date >= start && date < end : false;
}

function formatPeakPeriod(events: BehaviorTrendEvent[]) {
  const dated = events
    .map((event) => ({ event, date: eventDate(event) }))
    .filter((item): item is { event: BehaviorTrendEvent; date: Date } => Boolean(item.date));
  if (!dated.length) return "20:00 - 22:00";
  const strongest = dated.reduce((best, item) => (
    item.event.activity_minutes > best.event.activity_minutes ? item : best
  ));
  const start = Math.max(0, strongest.date.getHours() - 1);
  const end = Math.min(23, strongest.date.getHours() + 1);
  return `${pad2(start)}:00 - ${pad2(end)}:00`;
}

function summarizeBucket(title: string, events: BehaviorTrendEvent[], weakPoint: string, fallbackSummary: string) {
  if (!events.length) {
    return `${title}暂无直接行为事件，图表使用画像快照推断趋势：${fallbackSummary}`;
  }
  const topics = Array.from(new Set(events.flatMap((event) => event.knowledge_points))).slice(0, 3).join("、") || weakPoint;
  const topEvent = [...events].sort((a, b) => b.activity_minutes - a.activity_minutes)[0];
  return `${title}共记录 ${events.length} 条学习行为，主要围绕${topics}；${topEvent.summary}`;
}

function bucketEvents(
  events: BehaviorTrendEvent[],
  mode: BehaviorTrendMode,
  anchorDate: Date
): Array<{ key: string; label: string; title: string; start: Date; end: Date }> {
  if (mode === "day") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(anchorDate, index - 6);
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0);
      return {
        key: dateKey(date),
        label: formatAxisDate(date),
        title: `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日`,
        start,
        end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0),
      };
    });
  }
  if (mode === "month") {
    const count = daysInMonth(anchorDate);
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), index + 1, 12);
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0);
      return {
        key: dateKey(date),
        label: pad2(index + 1),
        title: `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日`,
        start,
        end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0),
      };
    });
  }
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(anchorDate.getFullYear(), index, 1, 12);
    const start = new Date(date.getFullYear(), date.getMonth(), 1, 0);
    return {
      key: monthKey(date),
      label: `${index + 1}月`,
      title: `${date.getFullYear()}年${index + 1}月`,
      start,
      end: addMonths(start, 1),
    };
  });
}

function buildBehaviorTrend(profile: StudentProfile, mode: BehaviorTrendMode, anchorDate: Date): BehaviorTrendPoint[] {
  const events = profile.behavior_events ?? [];
  const knowledgeAverage = averageNumber(profile.knowledge_states.map((item) => item.mastery_score), profile.overview.overall_progress);
  const weakPoint = profile.knowledge_states.find((item) => item.state === "WEAK" || item.mastery_score < 70)?.knowledge_point
    || profile.knowledge_states[0]?.knowledge_point
    || profile.course.name;
  const primaryError = profile.frequent_errors[0]?.label || "阶段性错因";
  const completionBase = profilePercent(profile.overview.recent_task_completion);
  const compileBase = profilePercent(profile.overview.compile_error_rate);
  const logicBase = profilePercent(profile.overview.logic_error_rate);
  const fallbackSummary = profile.overview.summary || profile.overview.recommendation;

  return bucketEvents(events, mode, anchorDate).map((bucket, index) => {
    const matchedEvents = events.filter((event) => eventInRange(event, bucket.start, bucket.end));
    const noise = (hashText(`${profile.student.id}-${profile.course.id}-${bucket.key}`) % 21) - 10;
    const scale = mode === "year" ? 0.32 : 1.45;
    const activityIndex = matchedEvents.length
      ? clampScore(Math.min(120, matchedEvents.reduce((sum, event) => sum + event.activity_minutes, 0) * scale))
      : clampScore(44 + knowledgeAverage * 0.42 + completionBase * 0.24 + Math.sin((index + 1) * 1.35) * 11 + noise);
    const qualityScore = matchedEvents.length
      ? clampScore(averageNumber(matchedEvents.map((event) => event.quality_score), knowledgeAverage))
      : clampScore(knowledgeAverage * 0.55 + completionBase * 0.28 + (100 - logicBase) * 0.16 + noise * 0.8);
    return {
      key: bucket.key,
      label: bucket.label,
      title: bucket.title,
      activityIndex,
      qualityScore,
      taskCompletionRate: clampScore(completionBase + (matchedEvents.length ? matchedEvents.length * 2 : noise * 0.25)),
      compileErrorRate: Math.max(0, Math.min(100, compileBase + (matchedEvents.some((event) => event.error_type) ? 3 : -1))),
      logicErrorRate: Math.max(0, Math.min(100, logicBase + (matchedEvents.some((event) => event.error_type) ? 4 : -2))),
      peakPeriod: formatPeakPeriod(matchedEvents),
      eventCount: matchedEvents.length,
      summary: summarizeBucket(bucket.title, matchedEvents, weakPoint, fallbackSummary),
      source: matchedEvents.length ? "learner_events" : "learner_profile_snapshots",
      confidence: matchedEvents.length ? 0.88 : 0.62,
      nextAction: matchedEvents.length
        ? `继续围绕${weakPoint}做一次复盘，并检查${primaryError}是否下降。`
        : `补一条${weakPoint}练习或资料保存记录，让画像趋势更可靠。`,
    };
  });
}

function summarizeTrend(points: BehaviorTrendPoint[]) {
  const peak = [...points].sort((a, b) => b.activityIndex - a.activityIndex)[0];
  return {
    peak,
    averageQuality: clampScore(averageNumber(points.map((point) => point.qualityScore), 0)),
    compileErrorRate: averageNumber(points.map((point) => point.compileErrorRate), 0),
    logicErrorRate: averageNumber(points.map((point) => point.logicErrorRate), 0),
    taskCompletionRate: averageNumber(points.map((point) => point.taskCompletionRate), 0),
    eventCount: points.reduce((sum, point) => sum + point.eventCount, 0),
    sourceCount: points.filter((point) => point.source === "learner_events").length,
  };
}

function BehaviorTrendChart({
  points,
  large = false,
  showTooltip = false,
}: {
  points: BehaviorTrendPoint[];
  large?: boolean;
  showTooltip?: boolean;
}) {
  const latestKey = points.length ? points[points.length - 1].key : "";
  const [activeKey, setActiveKey] = useState(latestKey);

  useEffect(() => {
    setActiveKey(points.length ? points[points.length - 1].key : "");
  }, [points]);

  const width = 500;
  const height = large ? 260 : 210;
  const left = 48;
  const right = 28;
  const top = large ? 34 : 28;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = 120;
  const labelEvery = Math.max(1, Math.ceil(points.length / (large ? 10 : 7)));
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? left + plotWidth / 2 : left + (plotWidth / (points.length - 1)) * index;
    return {
      point,
      x,
      activityY: top + (1 - point.activityIndex / maxValue) * plotHeight,
      qualityY: top + (1 - point.qualityScore / maxValue) * plotHeight,
    };
  });
  const active = coords.find((item) => item.point.key === activeKey) ?? (coords.length ? coords[coords.length - 1] : undefined);
  const activityPoints = coords.map((item) => `${item.x.toFixed(1)},${item.activityY.toFixed(1)}`).join(" ");
  const qualityPoints = coords.map((item) => `${item.x.toFixed(1)},${item.qualityY.toFixed(1)}`).join(" ");
  const zoneWidth = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;

  return (
    <div className={`behavior-chart-stage${large ? " large" : ""}`} onMouseLeave={() => setActiveKey(points.length ? points[points.length - 1].key : "")}>
      <svg className="line-chart behavior-trend-svg" viewBox={`0 0 ${width} ${height}`} aria-label="学习行为趋势图">
        <g stroke="#e7edf6" strokeWidth="1">
          {[120, 90, 60, 30].map((tick) => {
            const y = top + (1 - tick / maxValue) * plotHeight;
            return <line key={tick} x1={left} y1={y} x2={width - right} y2={y} />;
          })}
        </g>
        <g fill="#748198" fontSize="11">
          {[120, 90, 60, 30].map((tick) => {
            const y = top + (1 - tick / maxValue) * plotHeight + 4;
            return <text key={tick} x={tick === 120 ? 22 : 28} y={y}>{tick}</text>;
          })}
          {coords.map((item, index) => (
            index % labelEvery === 0 || index === coords.length - 1
              ? <text key={item.point.key} x={item.x - 12} y={height - 9}>{item.point.label}</text>
              : null
          ))}
        </g>
        <polyline points={activityPoints} fill="none" stroke="#176cf5" strokeWidth={large ? 4 : 3.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 8" />
        <polyline points={qualityPoints} fill="none" stroke="#20bd79" strokeWidth={large ? 4 : 3.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 7" />
        {active ? (
          <line x1={active.x} y1={top - 5} x2={active.x} y2={height - bottom + 4} stroke="#b9c9e4" strokeWidth="1.3" strokeDasharray="5 6" />
        ) : null}
        {coords.map((item) => (
          <g key={item.point.key}>
            <rect
              x={item.x - zoneWidth / 2}
              y={top - 10}
              width={zoneWidth}
              height={plotHeight + 20}
              fill="transparent"
              onMouseEnter={() => setActiveKey(item.point.key)}
              onFocus={() => setActiveKey(item.point.key)}
            />
            <circle
              cx={item.x}
              cy={item.activityY}
              r={large ? 8 + item.point.activityIndex / 34 : 4.5}
              fill="rgba(23,108,245,.22)"
              stroke="#176cf5"
              strokeWidth={large ? 2.5 : 2}
            />
            <circle cx={item.x} cy={item.qualityY} r={large ? 6.5 : 4} fill="#20bd79" stroke="#ffffff" strokeWidth="2" />
          </g>
        ))}
      </svg>
      <div className="behavior-legend">
        <span><i className="activity" />学习活跃度</span>
        <span><i className="quality" />完成质量</span>
      </div>
      {showTooltip && active ? (
        <div
          className="behavior-tooltip"
          style={{
            left: `${Math.min(78, Math.max(18, (active.x / width) * 100))}%`,
            top: `${Math.min(70, Math.max(12, (Math.min(active.activityY, active.qualityY) / height) * 100))}%`,
          }}
        >
          <strong>{active.point.title}</strong>
          <span>活跃度 {active.point.activityIndex} · 完成质量 {active.point.qualityScore}</span>
          <p>{active.point.summary}</p>
          <em>来源：{active.point.source} · 置信度 {Math.round(active.point.confidence * 100)}%</em>
        </div>
      ) : null}
    </div>
  );
}

function BehaviorTrendCard({ profile, title }: { profile: StudentProfile; title: string }) {
  const [mode, setMode] = useState<BehaviorTrendMode>("day");
  const [anchorDate, setAnchorDate] = useState(() => parseProfileDate(profile.overview.updated_at));
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setAnchorDate(parseProfileDate(profile.overview.updated_at));
  }, [profile.course.id, profile.overview.updated_at]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  const points = useMemo(() => buildBehaviorTrend(profile, mode, anchorDate), [profile, mode, anchorDate]);
  const stats = useMemo(() => summarizeTrend(points), [points]);
  const modeCopy = behaviorModeCopy[mode];

  return (
    <article className="profile-card chart-card behavior-trend-card">
      <div className="profile-section-head behavior-chart-head">
        <h2>{title} <span>（{modeCopy.subtitle}）</span></h2>
        <div className="behavior-chart-controls">
          <div className="behavior-window-control" aria-label="切换时间窗口">
            <button type="button" onClick={() => setAnchorDate((date) => shiftBehaviorDate(date, mode, -1))} title={modeCopy.previous}>
              <ChevronLeft size={15} />
            </button>
            <strong>{formatWindowLabel(mode, anchorDate)}</strong>
            <button type="button" onClick={() => setAnchorDate((date) => shiftBehaviorDate(date, mode, 1))} title={modeCopy.next}>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="behavior-mode-switch" role="group" aria-label="趋势粒度">
            {behaviorModeOptions.map((item) => (
              <button
                type="button"
                key={item.key}
                className={mode === item.key ? "active" : ""}
                onClick={() => setMode(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button className="behavior-icon-button" type="button" onClick={() => setExpanded(true)} title="放大学习行为趋势">
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div className="behavior-layout">
        <BehaviorTrendChart points={points} />
        <div className="behavior-stats">
          <span>学习高峰时段<strong>{stats.peak?.peakPeriod ?? "20:00 - 22:00"}</strong></span>
          <span>平均完成质量<strong>{stats.averageQuality}</strong></span>
          <span>编译错误率<strong>{formatProfilePercent(stats.compileErrorRate)}</strong></span>
          <span>逻辑错误率<strong>{formatProfilePercent(stats.logicErrorRate)}</strong></span>
          <span>任务完成率 <b>{formatProfilePercent(stats.taskCompletionRate)}</b></span>
          <span className="behavior-source">真实事件桶<strong>{stats.sourceCount}/{points.length}</strong></span>
        </div>
      </div>
      {expanded ? (
        <div className="behavior-modal-backdrop" role="presentation" onMouseDown={() => setExpanded(false)}>
          <article className="behavior-modal" role="dialog" aria-modal="true" aria-label="放大学习行为趋势" onMouseDown={(event) => event.stopPropagation()}>
            <div className="behavior-modal-head">
              <div>
                <h2>{title}</h2>
                <p>{formatWindowLabel(mode, anchorDate)} · {modeCopy.subtitle} · 悬浮气泡查看当天简介</p>
              </div>
              <div className="behavior-chart-controls">
                <div className="behavior-window-control">
                  <button type="button" onClick={() => setAnchorDate((date) => shiftBehaviorDate(date, mode, -1))} title={modeCopy.previous}>
                    <ChevronLeft size={16} />
                  </button>
                  <strong>{formatWindowLabel(mode, anchorDate)}</strong>
                  <button type="button" onClick={() => setAnchorDate((date) => shiftBehaviorDate(date, mode, 1))} title={modeCopy.next}>
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="behavior-mode-switch" role="group" aria-label="放大趋势粒度">
                  {behaviorModeOptions.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={mode === item.key ? "active" : ""}
                      onClick={() => setMode(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <button className="behavior-icon-button" type="button" onClick={() => setExpanded(false)} title="关闭放大图">
                  <X size={17} />
                </button>
              </div>
            </div>
            <BehaviorTrendChart points={points} large showTooltip />
            <div className="behavior-modal-foot">
              <span>事件数：{stats.eventCount}</span>
              <span>任务完成率：{formatProfilePercent(stats.taskCompletionRate)}</span>
              <span>下一步：{stats.peak?.nextAction}</span>
            </div>
          </article>
        </div>
      ) : null}
    </article>
  );
}

type LearningProfileProps = {
  initialCourseId?: string;
};

export default function LearningProfile({ initialCourseId }: LearningProfileProps = {}) {
  const navigate = useNavigate();
  const [context, setContext] = useState<LearningContext | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [aiAdvice, setAiAdvice] = useState<StudentAiChatResponse | null>(null);
  const [aiAdviceLoading, setAiAdviceLoading] = useState(false);
  const [aiAdviceError, setAiAdviceError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setContextLoading(true);
    setError(null);
    setErrorDetail(null);
    setContext(null);
    setProfile(null);
    api.getLearningContext().then((data) => {
      if (!alive) return;
      setContext(data);
      const preferredCourse = initialCourseId && data.courses.some((course) => course.course_id === initialCourseId)
        ? initialCourseId
        : data.courses[0]?.course_id ?? "";
      setSelectedCourseId(preferredCourse);
    }).catch((err) => {
      if (!alive) return;
      setError(studentErrorMessage(err, "学习画像上下文加载失败，请稍后刷新。"));
      setErrorDetail(studentErrorDetail(err));
    }).finally(() => {
      if (alive) setContextLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [initialCourseId, reloadKey]);

  useEffect(() => {
    if (!selectedCourseId) return;
    let alive = true;
    setProfileLoading(true);
    setError(null);
    setErrorDetail(null);
    setProfile(null);
    setAiAdvice(null);
    setAiAdviceError(null);
    setAiAdviceLoading(false);
    api.getStudentProfile(selectedCourseId).then((data) => {
      if (alive) setProfile(data);
    }).catch((err) => {
      if (!alive) return;
      setProfile(null);
      setError(studentErrorMessage(err, "当前课程画像数据加载失败，请稍后刷新。"));
      setErrorDetail(studentErrorDetail(err));
    }).finally(() => {
      if (alive) setProfileLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [selectedCourseId, reloadKey]);

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
        <StudentState
          kind={error ? "unavailable" : "empty"}
          title="学习画像暂不可用"
          description={error ?? "当前账号还没有可展示的课程画像数据。完成课程任务或保存学习资料后，画像会逐步生成。"}
          detail={errorDetail}
          actions={error ? [{ label: "重新加载", variant: "primary", onClick: () => setReloadKey((value) => value + 1) }] : []}
          className="profile-card profile-pad"
        />
      </div>
    );
  }

  const activeProfile = profile;
  const activeContext = context;
  const isCourseLocked = Boolean(initialCourseId);
  const overview = activeProfile.overview;
  const dimensions = isCourseLocked ? courseDimensionProfile(activeProfile) : buildGlobalProfileDimensions(activeProfile);
  const polygonPoints = radarPoints(dimensions).map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const knowledgeCards = activeProfile.knowledge_states.map((item, index) => ({
    icon: knowledgeIcons[index % knowledgeIcons.length],
    title: item.knowledge_point,
    score: item.mastery_score,
    state: stateText(item.state),
    color: knowledgeColors[index % knowledgeColors.length],
    warn: item.state === "WEAK",
    evidence: item.last_evidence
  }));
  const weakItems = activeProfile.knowledge_states
    .filter((item) => item.state === "WEAK" || item.mastery_score < 70)
    .map((item) => ({
      title: item.knowledge_point,
      rate: `掌握度 ${item.mastery_score}%`,
      desc: item.last_evidence || `证据 ${item.evidence_count} 条，建议结合最近任务复盘。`
    }));
  const adviceItems: AdviceItem[] = activeProfile.recommendations.map((item, index) => ({
    icon: index === 0 ? <CalendarDays size={21} /> : index === 1 ? <Goal size={21} /> : <BookOpenCheck size={21} />,
    title: item.title,
    desc: item.reason,
    rawAction: item.suggested_action || "",
    actionLabel: recommendationActionLabel(item.suggested_action),
    color: index === 0 ? "blue" : index === 1 ? "green" : "orange",
    relatedTaskId: item.related_task_id,
    relatedKnowledgePoints: item.related_knowledge_points
  }));
  const records = activeProfile.frequent_errors.slice(0, 4).map((item) => ({
      icon: <ClipboardCheck size={16} />,
      title: `高频错因　${item.label}`,
      meta: `${item.count} 次 · ${item.related_knowledge_points.join(" / ")}`,
      time: formatTime(overview.updated_at)
    }));
  const progress = overview.overall_progress;

  function openSelfStudyForPoint(knowledgePoint?: string) {
    navigate("/self-study", {
      state: {
        knowledgePoint: knowledgePoint || weakItems[0]?.title || activeProfile.knowledge_states[0]?.knowledge_point,
        fromCourseId: selectedCourseId
      }
    });
  }

  function openAiTutorWithPrompt(message: string) {
    navigate("/self-study/ai", {
      state: {
        initialMessage: message,
        focusKnowledgePoint: weakItems[0]?.title || activeProfile.knowledge_states[0]?.knowledge_point,
        fromCourseId: selectedCourseId
      }
    });
  }

  function handleRecommendationAction(item: AdviceItem | ProfileRecommendation) {
    const rawAction = "rawAction" in item ? item.rawAction : item.suggested_action;
    const relatedTaskId = "relatedTaskId" in item ? item.relatedTaskId : item.related_task_id;
    const relatedKnowledgePoints = "relatedKnowledgePoints" in item ? item.relatedKnowledgePoints : item.related_knowledge_points;
    const title = item.title;
    const firstPoint = relatedKnowledgePoints[0] || weakItems[0]?.title || activeProfile.knowledge_states[0]?.knowledge_point;

    switch ((rawAction || "").toUpperCase()) {
      case "OPEN_SELF_STUDY":
      case "REVIEW_SELF_STUDY":
        openSelfStudyForPoint(firstPoint);
        return;
      case "GENERATE_EXERCISE":
        openAiTutorWithPrompt(`请围绕${firstPoint || title}生成一组专项练习，并在题后给出答案解析和自查标准。`);
        return;
      case "REVIEW_GENERATED_PRACTICE":
        navigate("/self-study/library", { state: { focus: "practice", fromCourseId: selectedCourseId } });
        return;
      case "REVIEW_WRONG_QUESTIONS":
        openAiTutorWithPrompt(`请基于我的错因记录，帮我复盘${firstPoint || title}相关错题，并给出下一次提交前的检查清单。`);
        return;
      case "OPEN_TASK":
        navigate(selectedCourseId ? `/courses/${selectedCourseId}/tasks` : "/learning-home", {
          state: relatedTaskId ? { focusTaskId: relatedTaskId } : undefined
        });
        return;
      default:
        openAiTutorWithPrompt(`请基于我的学习画像，帮我处理这条建议：${title}。`);
    }
  }

  async function generateAiAdvice() {
    if (aiAdviceLoading) return;
    setAiAdviceLoading(true);
    setAiAdviceError(null);
    try {
      const result = await api.sendStudentAiChat(
        buildAiAdvicePrompt(activeProfile, dimensions),
        selectedCourseId,
        [],
        {
          entry: "self-study.profile.next_advice",
          profile_scope: isCourseLocked ? "course" : "global",
          student_id: activeContext.student.id,
          course_id: selectedCourseId,
          dimensions: dimensions.map((item) => ({ key: item.key, label: item.label, score: item.score, source: item.source })),
          weak_points: weakItems,
          frequent_errors: activeProfile.frequent_errors.slice(0, 4),
          recommendations: activeProfile.recommendations.slice(0, 5)
        }
      );
      setAiAdvice(result);
    } catch (err) {
      setAiAdviceError(studentErrorMessage(err, "AI 建议暂时生成失败，请稍后重试。"));
    } finally {
      setAiAdviceLoading(false);
    }
  }

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
                    <button type="button" onClick={() => openSelfStudyForPoint(item.title)}>去自学</button>
                  </div>
                )) : <div className="empty-panel">暂无明显整体薄弱项，继续积累自学和课程证据。</div>}
              </div>
            </article>

            <BehaviorTrendCard profile={activeProfile} title="学习行为" />
          </div>

          <article className="profile-card profile-pad global-advice-card">
            <div className="profile-section-head">
              <div>
                <h2>个人下一步建议</h2>
                <span>基于左侧整体薄弱信号生成，优先给出可执行学习动作</span>
              </div>
              <button className="ai-suggest-button" type="button" onClick={generateAiAdvice} disabled={aiAdviceLoading}>
                {aiAdviceLoading ? <RefreshCw size={15} className="spinning" /> : <Sparkles size={15} />}
                {aiAdviceLoading ? "生成中" : aiAdvice ? "重新生成" : "AI 建议"}
              </button>
            </div>
            <div className={`ai-advice-brief${aiAdvice ? " ready" : ""}${aiAdviceError ? " error" : ""}`}>
              <strong>{aiAdviceLoading ? "正在生成个人画像 AI 建议" : aiAdvice ? "AI 已根据整体画像生成建议" : aiAdviceError ? "AI 建议生成失败" : "等待生成 AI 建议"}</strong>
              {aiAdvice ? (
                <>
                  <p className="ai-advice-text">{aiAdvice.answer}</p>
                  <div className="ai-advice-meta">
                    <span>{aiAdvice.profile_used ? "已结合学习画像" : "画像未参与"}</span>
                    <span>{aiAdvice.source_used ? `引用 ${aiAdvice.citations.length} 个课程来源` : "未命中课程引用"}</span>
                    <span>置信度 {Math.round(aiAdvice.confidence * 100)}%</span>
                  </div>
                  {aiAdvice.suggested_actions.length ? (
                    <div className="ai-advice-actions" aria-label="AI 建议动作">
                      {aiAdvice.suggested_actions.slice(0, 4).map((action) => (
                        <button type="button" key={action} onClick={() => openAiTutorWithPrompt(action)}>
                          {action}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p>
                  {aiAdviceError || "点击右上角后，系统会读取薄弱信号、最近学习内容、资料沉淀和提示依赖，生成下一步学习安排。"}
                </p>
              )}
            </div>
            <div className="advice-list">
              {adviceItems.length ? adviceItems.map((item) => (
                <div className="advice-row" key={item.title}>
                  <span className={item.color}>{item.icon}</span>
                  <div><strong>{item.title}</strong><p>{item.desc}</p></div>
                  <button type="button" onClick={() => handleRecommendationAction(item)}>{item.actionLabel}</button>
                </div>
              )) : <div className="empty-panel">暂无个性化建议。</div>}
            </div>
          </article>
        </section>

      </div>
    );
  }

  return (
    <div className="profile-page">
      <section className="profile-hero course-profile-hero">
        <div>
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
        <div className="profile-section-head"><h2>本课程知识掌握画像</h2></div>
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
                <button type="button" onClick={() => openAiTutorWithPrompt(`请围绕${item.title}生成一组专项练习，并给出做题后的自查标准。`)}>去练习</button>
              </div>
            )) : <div className="empty-panel">暂无明显薄弱项，继续完成任务后画像会更新。</div>}
          </div>
        </article>

        <article className="profile-card profile-pad">
          <div className="profile-section-head"><h2>本课程个性化建议</h2></div>
          <div className="advice-list">
            {adviceItems.length ? adviceItems.map((item) => (
              <div className="advice-row" key={item.title}>
                <span className={item.color}>{item.icon}</span>
                <div><strong>{item.title}</strong><p>{item.desc}</p></div>
                <button type="button" onClick={() => handleRecommendationAction(item)}>{item.actionLabel}</button>
              </div>
            )) : <div className="empty-panel">暂无个性化建议。</div>}
          </div>
        </article>
      </section>

      <section className="profile-bottom-grid">
        <BehaviorTrendCard profile={activeProfile} title="学习行为画像" />

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
        </article>
      </section>

    </div>
  );
}
