import type { SubNavItem } from "../../components/TeacherSubNav";

/**
 * 课程教学模块的二级导航（开发方案 §六）。
 *
 * 课程大纲用页内课程选择器而不是 `/courses/:courseId/syllabus` 路径参数 ——
 * 与资料中心、任务监控、学情诊断保持一致，导航项才能是固定的静态路径。
 */
export const coursesNav: SubNavItem[] = [
  { to: "/teacher/courses", label: "课程与班级", end: true },
  { to: "/teacher/courses/syllabus", label: "课程大纲" },
];
