/**
 * 提交进度看板的枚举文案与格式化（开发方案 §九 9.1）。
 *
 * 后端返回大写枚举和原始数值，中文映射只在这里做一次。和 `diagnosisLabels.ts` 同一约定：
 * 状态文案在多个地方各写一份的话，同一个 NEEDS_REVISION 在卡片和表格里会显示成两种说法。
 */

import type { MonitorRow, MonitorStats } from "../../teacherTypes";

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

/**
 * 状态徽标配色，沿用学生端 .class-badge 那套语义色。
 * 逾期单独一档：它和状态正交，一行可以同时是「已提交」和「逾期」。
 */
const STATUS_TONE: Record<string, string> = {
  NOT_STARTED: "grey",
  IN_PROGRESS: "blue",
  SUBMITTED: "indigo",
  NEEDS_REVISION: "orange",
  COMPLETED: "green",
};

export function statusTone(status: string) {
  return STATUS_TONE[status] ?? "grey";
}

/** §14.2 班级任务发布状态 */
const PUBLISH_STATUS_TEXT: Record<string, string> = {
  DRAFT: "发布草稿",
  SCHEDULED: "定时发布",
  PUBLISHED: "已发布",
  PAUSED: "已暂停",
  CLOSED: "已结束",
};

export function publishStatusText(status: string) {
  return PUBLISH_STATUS_TEXT[status] ?? status;
}

const TASK_TYPE_TEXT: Record<string, string> = {
  PROGRAMMING: "编程任务",
  QUESTION: "客观题",
};

export function taskTypeText(type: string) {
  return TASK_TYPE_TEXT[type] ?? type;
}

export function hintLevelText(level: number) {
  if (level <= 0) return "未使用提示";
  return `${["一", "二", "三"][level - 1] ?? level}级提示`;
}

/**
 * 后端把「没有数据」表示为 null，把「真实的 0」表示为 0，页面上必须看得出区别
 * （迁移执行清单 §11.7 验收项）。
 */
export function metricText(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return "暂无数据";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
}

/**
 * 平均成绩单独一个函数：编程任务根本没有分数字段，显示「不适用」而不是「暂无数据」，
 * 因为前者是「这个指标对这类任务无意义」，后者是「有指标但还没数据」。
 */
export function avgScoreText(stats: MonitorStats) {
  if (!stats.score_supported) return "不适用";
  if (stats.avg_score === null) return "暂无数据";
  return `${stats.avg_score}`;
}

export function rowScoreText(row: MonitorRow, scoreSupported: boolean) {
  if (!scoreSupported) return "—";
  if (row.score === null) return "未评定";
  return `${row.score}`;
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
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** 距截止还有多久。已过期返回 null，由调用方渲染成「已截止」 */
export function remainingText(deadline: string | null) {
  if (!deadline) return "未设置截止时间";
  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return "未设置截止时间";
  const diff = target - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `剩余 ${days} 天`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `剩余 ${hours} 小时`;
  return "剩余不足 1 小时";
}
