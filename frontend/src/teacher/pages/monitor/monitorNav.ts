import type { SubNavItem } from "../../components/TeacherSubNav";

/**
 * 任务监控模块的二级导航。
 * 学生提交详情（§九 9.2）由 GradingWorkspace 承担，从表格行内进入，
 * 依赖 submissionId，不放进二级导航。
 */
export const monitorNav: SubNavItem[] = [
  { to: "/teacher/monitor", label: "提交进度看板", end: true },
  { to: "/teacher/monitor/grading", label: "批改进度" },
  { to: "/teacher/monitor/quality", label: "任务质量分析" },
];
