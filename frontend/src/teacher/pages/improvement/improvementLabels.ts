import type { ImprovementSeverity } from "../../teacherTypes";

/** 教学改进页的文案与格式化（开发方案 §十二 12.1）。 */

export const SEVERITY_TEXT: Record<ImprovementSeverity, string> = {
  HIGH: "需优先处理",
  MEDIUM: "建议关注",
  INFO: "情况说明",
};

/** 严重度徽标复用 .class-badge（已有 .red / .green / .purple），不给 .type-tag 加新色 */
export function severityBadgeClass(severity: ImprovementSeverity): string {
  if (severity === "HIGH") return "class-badge red";
  if (severity === "MEDIUM") return "class-badge purple";
  return "class-badge green";
}

const MASTERY_STATE_TEXT: Record<string, string> = {
  STRONG: "掌握良好",
  STABLE: "基本稳定",
  DEVELOPING: "尚在发展",
  WEAK: "需要补强",
};

export function masteryStateText(state: string | null): string {
  if (!state) return "暂无证据";
  return MASTERY_STATE_TEXT[state] ?? state;
}

const ERROR_SEVERITY_TEXT: Record<string, string> = {
  HIGH: "高",
  MEDIUM: "中",
  LOW: "低",
};

export function errorSeverityText(severity: string): string {
  return ERROR_SEVERITY_TEXT[severity] ?? severity;
}

/**
 * null 与 0 的区别只在这里落地：null 是「无数据」，显示「—」；0 是实测为零，照实显示。
 * 所有百分比和分数都要经过这个函数，不要在页面里直接渲染裸的 nullable。
 */
export function formatRate(value: number | null, unit = "%"): string {
  return value === null || value === undefined ? "—" : `${value}${unit}`;
}

export function formatScore(value: number | null): string {
  return value === null || value === undefined ? "—" : `${value} 分`;
}

/** 进度条宽度：无数据时给 0，但文字仍显示「—」，避免用条长暗示一个不存在的值 */
export function barWidth(value: number | null): string {
  if (value === null || value === undefined) return "0%";
  return `${Math.max(0, Math.min(100, value))}%`;
}

export function formatDelta(value: number | null, unit = ""): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return `持平`;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}${unit}`;
}
