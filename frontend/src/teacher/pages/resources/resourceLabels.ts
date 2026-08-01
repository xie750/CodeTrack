/**
 * 资料中心的枚举文案与格式化（开发方案 §七）。
 *
 * 后端返回的是大写枚举，中文只在这里映射一次，未知枚举原样显示、不吞掉。
 */

import type {
  ResourceAuthorityLevel,
  ResourceShareScope,
  ResourceStatus,
} from "../../teacherTypes";

/** §7.2 A 状态筛选器四态 */
export const STATUS_TEXT: Record<ResourceStatus, string> = {
  ACTIVE: "启用",
  DISABLED: "停用",
  PARSE_PENDING: "待解析",
  PARSE_FAILED: "解析失败",
};

/** 每个状态对学生端和 AI 的实际含义，教师需要知道自己这一步会影响什么 */
export const STATUS_EFFECT: Record<ResourceStatus, string> = {
  ACTIVE: "正常参与学生自主学习与 AI 检索",
  DISABLED: "不再参与新的 AI 检索，历史引用保留",
  PARSE_PENDING: "文件已存档，正文待解析，暂不参与检索",
  PARSE_FAILED: "解析失败，需要重新上传或改用文本资料",
};

export function statusBadgeClass(status: ResourceStatus) {
  if (status === "ACTIVE") return "active";
  if (status === "DISABLED") return "disabled";
  if (status === "PARSE_FAILED") return "failed";
  return "pending";
}

const SOURCE_TYPE_TEXT: Record<string, string> = {
  COURSEWARE: "课件",
  CODE: "代码",
  DATASET: "数据集",
  TECH_DOC: "技术文档",
  TEACHER_NOTE: "教师笔记",
};

export function sourceTypeText(type: string) {
  return SOURCE_TYPE_TEXT[type] ?? type;
}

/** 编辑面板里的资料类型下拉。与后端 SOURCE_TYPES 对齐 */
export const SOURCE_TYPE_OPTIONS = Object.entries(SOURCE_TYPE_TEXT).map(([value, label]) => ({
  value,
  label,
}));

export const AUTHORITY_TEXT: Record<ResourceAuthorityLevel, string> = {
  HIGH: "高（教材/教师定稿）",
  MEDIUM: "中（讲义/参考）",
  LOW: "低（草稿/待核）",
};

/** 权威等级影响 AI 引用时的取信程度，列表上用短标签 */
export const AUTHORITY_SHORT: Record<ResourceAuthorityLevel, string> = {
  HIGH: "权威",
  MEDIUM: "参考",
  LOW: "草稿",
};

export const SHARE_SCOPE_TEXT: Record<ResourceShareScope, string> = {
  CLASS: "仅当前班级",
  COURSE: "当前课程",
  TEACHER: "教师复用",
};

export function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDateTime(value: string | null) {
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
