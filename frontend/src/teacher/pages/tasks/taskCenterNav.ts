import type { SubNavItem } from "../../components/TeacherSubNav";

/**
 * 任务中心模块的二级导航。
 * 编辑器和发布页都依赖具体 taskId，无法放进全局二级导航，
 * 只能从任务列表的行内操作进入。
 */
export const taskCenterNav: SubNavItem[] = [
  { to: "/teacher/tasks", label: "任务列表", end: true },
  { to: "/teacher/tasks/new", label: "新建任务" },
];
