/**
 * AI 审核两个页面共用的枚举文案与格式化。
 *
 * 后端返回的是大写枚举（§14.4、诊断类型、入队原因），中文只在这里映射一次，
 * 免得列表页和详情页各写一份、改文案时漏掉一处。未知枚举原样显示，不吞掉。
 */

import type { AiReviewStatus } from "../../teacherTypes";

/** §14.4 审核状态 */
export const REVIEW_STATUS_TEXT: Record<AiReviewStatus, string> = {
  PENDING: "待审核",
  ACCEPTED: "已接受",
  MODIFIED: "已修改",
  REJECTED: "已驳回",
};

/** 学生端看到的状态标识（§11.3）。教师需要知道自己这一步会让学生看到什么 */
export const STUDENT_FACING_TEXT: Record<AiReviewStatus, string> = {
  PENDING: "AI 建议",
  ACCEPTED: "教师已确认",
  MODIFIED: "教师已修改",
  REJECTED: "不再向学生展示为确认结论",
};

export function reviewBadgeClass(status: AiReviewStatus) {
  return status.toLowerCase();
}

const DIAGNOSIS_TYPE_TEXT: Record<string, string> = {
  LINKED_LIST_HEAD_UPDATE_ERROR: "头节点更新错误",
  BOUNDARY_CASE_MISSING: "边界场景缺失",
  COMPILE_ERROR_EXPLANATION: "编译错误解释",
  UNKNOWN_OR_LOW_CONFIDENCE: "未知或低置信",
};

export function diagnosisTypeText(type: string) {
  return DIAGNOSIS_TYPE_TEXT[type] ?? type;
}

const QUEUE_REASON_TEXT: Record<string, string> = {
  LOW_CONFIDENCE: "低置信度",
  DIAGNOSIS_STATUS_LOW_CONFIDENCE: "诊断状态：低置信度",
  DIAGNOSIS_STATUS_REVIEW_REQUIRED: "诊断状态：待复核",
  MODEL_REQUESTED_REVIEW: "模型请求复核",
  NO_KNOWLEDGE_CITATION: "引用不足",
  RULE_FALLBACK: "规则兜底",
};

export function queueReasonText(reason: string) {
  return QUEUE_REASON_TEXT[reason] ?? reason;
}

/** 置信度阈值，与后端 ai_review.QUEUE_CONFIDENCE_THRESHOLD 对齐 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export function confidencePercent(confidence: number) {
  return Math.round(confidence * 100);
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
