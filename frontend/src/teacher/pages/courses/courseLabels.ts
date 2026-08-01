/**
 * 课程教学的枚举文案与格式化（开发方案 §六）。
 *
 * 后端返回的是大写枚举，中文只在这里映射一次，未知枚举原样显示、不吞掉。
 */

import type {
  KnowledgePointDifficulty,
  KnowledgePointType,
  KnowledgePointUsage,
  StudentRiskLevel,
  SyllabusStatus,
} from "../../teacherTypes";

/** §6.1 风险筛选器。NORMAL 不是预警等级，是「没命中任何规则」 */
export const RISK_TEXT: Record<StudentRiskLevel, string> = {
  NORMAL: "正常",
  NOTICE: "提醒",
  WATCH: "关注",
  HIGH: "高风险",
};

/** 每个等级教师该做什么，光给颜色没法行动 */
export const RISK_EFFECT: Record<StudentRiskLevel, string> = {
  NORMAL: "未命中预警规则，按正常节奏跟进",
  NOTICE: "命中 1 条规则，留意后续任务表现",
  WATCH: "命中 2 条规则，建议发送提醒或补救资料",
  HIGH: "命中 3 条及以上规则，建议尽快人工介入",
};

export function riskBadgeClass(level: StudentRiskLevel) {
  if (level === "HIGH") return "red";
  if (level === "WATCH") return "orange";
  if (level === "NOTICE") return "indigo";
  return "green";
}

/** §6.2 知识点标签：类型 */
export const POINT_TYPE_TEXT: Record<KnowledgePointType, string> = {
  CONCEPT: "概念",
  SKILL: "技能",
  SYNTAX: "语法",
  ALGORITHM: "算法",
};

/** §6.2 知识点标签：难度 */
export const DIFFICULTY_TEXT: Record<KnowledgePointDifficulty, string> = {
  BASIC: "基础",
  INTERMEDIATE: "进阶",
  ADVANCED: "挑战",
};

export const SYLLABUS_STATUS_TEXT: Record<SyllabusStatus, string> = {
  ACTIVE: "启用",
  ARCHIVED: "停用",
};

export function pointTypeText(value: string) {
  return POINT_TYPE_TEXT[value as KnowledgePointType] ?? value;
}

export function difficultyText(value: string) {
  return DIFFICULTY_TEXT[value as KnowledgePointDifficulty] ?? value;
}

export function syllabusStatusText(value: string) {
  return SYLLABUS_STATUS_TEXT[value as SyllabusStatus] ?? value;
}

export function riskText(value: string) {
  return RISK_TEXT[value as StudentRiskLevel] ?? value;
}

export const RISK_OPTIONS = (Object.keys(RISK_TEXT) as StudentRiskLevel[]).map((value) => ({
  value,
  label: RISK_TEXT[value],
}));

export const POINT_TYPE_OPTIONS = (Object.keys(POINT_TYPE_TEXT) as KnowledgePointType[]).map(
  (value) => ({ value, label: POINT_TYPE_TEXT[value] })
);

export const DIFFICULTY_OPTIONS = (
  Object.keys(DIFFICULTY_TEXT) as KnowledgePointDifficulty[]
).map((value) => ({ value, label: DIFFICULTY_TEXT[value] }));

export function formatDate(value: string | null | undefined) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** null 与 0 是两件事：没成绩显示「暂无成绩」，真 0 分显示 0 */
export function scoreText(value: number | null | undefined) {
  if (value === null || value === undefined) return "暂无成绩";
  return `${value} 分`;
}

/** 知识点被引用的一句话摘要，0 引用时说清楚「可以删」 */
export function usageText(usage: KnowledgePointUsage) {
  const parts: string[] = [];
  if (usage.resource_count) parts.push(`${usage.resource_count} 份资料`);
  if (usage.question_count) parts.push(`${usage.question_count} 道题目`);
  if (usage.profile_count) parts.push(`${usage.profile_count} 条画像`);
  if (!parts.length) return "暂无引用";
  return parts.join(" · ");
}

/** 完成率。task_total 为 0 时不是 0%，是「还没有任务」 */
export function completionText(completed: number, total: number) {
  if (!total) return "暂无任务";
  return `${Math.round((completed / total) * 100)}%`;
}
