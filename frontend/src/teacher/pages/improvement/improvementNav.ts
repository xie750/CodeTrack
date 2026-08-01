import type { SubNavItem } from "../../components/TeacherSubNav";

/**
 * 教学改进模块的二级导航（开发方案 §十二）。
 *
 * 教学策略优化放在模块根 `/teacher/improvement`：侧栏入口和历史链接都指向这里，
 * 不再多一层重定向。另外两个子页目前只有骨架，各自页面上写明被什么卡住。
 */
export const improvementNav: SubNavItem[] = [
  { to: "/teacher/improvement", label: "教学策略优化", end: true },
  { to: "/teacher/improvement/adjustment", label: "任务调整" },
  { to: "/teacher/improvement/effect", label: "教学效果评估" },
];
