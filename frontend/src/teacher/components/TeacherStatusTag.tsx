import { Tag } from "antd";

interface StatusTagProps {
  status: string;
  type?: "task" | "submission" | "grade";
}

export default function TeacherStatusTag({ status, type = "task" }: StatusTagProps) {
  const statusConfig: Record<string, { color: string; text: string }> = {
    // Task status
    draft: { color: "default", text: "草稿" },
    scheduled: { color: "processing", text: "已安排" },
    published: { color: "success", text: "已发布" },
    closed: { color: "error", text: "已关闭" },
    archived: { color: "default", text: "已归档" },
    // Submission status
    not_started: { color: "default", text: "未开始" },
    in_progress: { color: "processing", text: "进行中" },
    submitted: { color: "warning", text: "已提交" },
    needs_revision: { color: "warning", text: "需修改" },
    completed: { color: "success", text: "已完成" },
    overdue: { color: "error", text: "已逾期" },
    // Submission.status（后端评测状态）
    queued: { color: "default", text: "排队中" },
    running: { color: "processing", text: "评测中" },
    analyzing: { color: "processing", text: "分析中" },
    passed: { color: "success", text: "已通过" },
    feedback_ready: { color: "warning", text: "反馈就绪" },
    review_required: { color: "error", text: "待人工复核" },
    failed: { color: "error", text: "未通过" },
  };

  // 后端返回大写枚举（SUBMITTED / REVIEW_REQUIRED），这里统一按小写查表
  const config = statusConfig[String(status).toLowerCase()] || { color: "default", text: status };
  return <Tag color={config.color as any}>{config.text}</Tag>;
}
