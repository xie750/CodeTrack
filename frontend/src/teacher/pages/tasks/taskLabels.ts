/**
 * 任务中心的枚举文案与格式化。
 *
 * 后端返回大写枚举（§14.1 内容状态、§14.2 发布状态、发布模式），中文只在这里映射一次。
 * 未知枚举原样显示，不吞掉 —— 数据里出现没见过的状态时要看得见，而不是显示成空白。
 */

import type { TaskContentStatus, TaskPublishStatus } from "../../teacherTypes";

/** §14.1 任务内容状态 */
export const CONTENT_STATUS_TEXT: Record<TaskContentStatus, string> = {
  DRAFT: "草稿",
  READY: "可发布",
  PUBLISHED: "已发布",
  CLOSED: "已结束",
  ARCHIVED: "已归档",
};

/** 每个状态一句「这意味着学生端看得到什么」，教师最关心的就是这件事 */
export const CONTENT_STATUS_HINT: Record<TaskContentStatus, string> = {
  DRAFT: "内容未完成，学生端不可见",
  READY: "内容就绪但未下发，学生端不可见",
  PUBLISHED: "已进入学生端班级任务",
  CLOSED: "学生端保留历史记录，不能再提交",
  ARCHIVED: "已归档，不再出现在教学流程中",
};

/** §14.2 班级任务发布状态 */
export const PUBLISH_STATUS_TEXT: Record<TaskPublishStatus, string> = {
  DRAFT: "发布草稿",
  SCHEDULED: "定时发布",
  PUBLISHED: "已发布",
  PAUSED: "已暂停",
  CLOSED: "已结束",
};

/** 发布模式（§八 8.6 任务模式选择器）。同一份内容可以按不同模式发给不同班级 */
const ASSIGNMENT_MODE_TEXT: Record<string, string> = {
  PRACTICE: "练习",
  QUIZ: "测验",
  EXAM: "考试",
  REMEDIAL: "补救",
};

export function assignmentModeText(mode: string) {
  return ASSIGNMENT_MODE_TEXT[mode] ?? mode;
}

const TASK_TYPE_TEXT: Record<string, string> = {
  PROGRAMMING: "编程任务",
  QUESTION: "客观题",
};

export function taskTypeText(type: string) {
  return TASK_TYPE_TEXT[type] ?? type;
}

export function contentStatusText(status: TaskContentStatus | string) {
  return CONTENT_STATUS_TEXT[status as TaskContentStatus] ?? status;
}

export function publishStatusText(status: TaskPublishStatus | string) {
  return PUBLISH_STATUS_TEXT[status as TaskPublishStatus] ?? status;
}

/** 徽标配色沿用 AI 审核那套 .review-badge 修饰类，避免同一套视觉写第二遍 */
export function contentStatusBadgeClass(status: TaskContentStatus | string) {
  return String(status).toLowerCase();
}

/** null 表示无数据，0 表示实测为零。这两者不能都渲染成 0% */
export function formatRate(rate: number | null) {
  if (rate === null || rate === undefined) return "暂无";
  return `${Math.round(rate * 100)}%`;
}

export function formatDateTime(value: string | null) {
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

/** 把 unavailable_actions 数组转成按 action 取原因的查表函数 */
export function actionReasonLookup(
  actions: Array<{ action: string; reason: string; target_route: string | null }> = []
) {
  const map = new Map(actions.map((item) => [item.action, item]));
  return (action: string) => map.get(action);
}
