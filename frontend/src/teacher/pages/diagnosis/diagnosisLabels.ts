/**
 * 学情诊断三个子页共用的枚举文案、格式化和分档规则。
 *
 * 后端返回大写枚举和原始数值，中文与颜色分档只在这里映射一次 —— 三个子页各写一份的话，
 * 同一个掌握度在总览和个体页会显示成不同颜色，教师会以为是两套数据。
 */

import type { AlertLevel, HintDependencyLevel } from "../../teacherTypes";

/** 掌握度四档，与学生端 .profile-legend 的图例完全对齐（80/60/40） */
export type MasteryBand = "excellent" | "good" | "fair" | "weak";

export const MASTERY_BANDS: Array<{ band: MasteryBand; label: string; range: string }> = [
  { band: "excellent", label: "优秀", range: "80 分及以上" },
  { band: "good", label: "良好", range: "60-79 分" },
  { band: "fair", label: "待提升", range: "40-59 分" },
  { band: "weak", label: "需加强", range: "40 分以下" },
];

export function masteryBand(score: number): MasteryBand {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "weak";
}

/** 知识点掌握状态，question_workflow.mastery_state 写入 */
const KNOWLEDGE_STATE_TEXT: Record<string, string> = {
  STRONG: "掌握扎实",
  MASTERED: "掌握良好",
  STABLE: "基本稳定",
  DEVELOPING: "正在提升",
  IMPROVING: "正在提升",
  WEAK: "需要复习",
};

export function knowledgeStateText(state: string | null) {
  if (!state) return "暂无证据";
  return KNOWLEDGE_STATE_TEXT[state] ?? state;
}

export const HINT_DEPENDENCY_TEXT: Record<HintDependencyLevel, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
};

/** §10.3 预警等级 */
export const ALERT_LEVEL_TEXT: Record<AlertLevel, string> = {
  HIGH: "高风险",
  WATCH: "关注",
  NOTICE: "提醒",
};

export const ALERT_LEVEL_ORDER: AlertLevel[] = ["HIGH", "WATCH", "NOTICE"];

/** §14.3 学生任务状态 */
const PROGRESS_STATUS_TEXT: Record<string, string> = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "进行中",
  SUBMITTED: "已提交",
  NEEDS_REVISION: "需要修改",
  COMPLETED: "已完成",
  OVERDUE: "已逾期",
};

export function progressStatusText(status: string) {
  return PROGRESS_STATUS_TEXT[status] ?? status;
}

const EVENT_TYPE_TEXT: Record<string, string> = {
  TASK_OPENED: "打开任务",
  CODE_SUBMITTED: "提交代码",
  QUESTION_SET_SUBMITTED: "提交客观题",
  HINT_VIEWED: "查看提示",
  DIAGNOSIS_VIEWED: "查看诊断",
  SELF_STUDY_GENERATED: "自主学习生成",
};

export function eventTypeText(type: string) {
  return EVENT_TYPE_TEXT[type] ?? type;
}

const EVIDENCE_STRENGTH_TEXT: Record<string, string> = {
  STRONG: "强证据",
  MEDIUM: "中等证据",
  WEAK: "弱证据",
};

export function evidenceStrengthText(strength: string) {
  return EVIDENCE_STRENGTH_TEXT[strength] ?? strength;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * 后端把「没有数据」表示为 null，把「真实的 0」表示为 0。
 * 这两者在页面上必须看得出区别（迁移执行清单 §11.7 验收项）。
 */
export function metricText(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return "暂无数据";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
}
