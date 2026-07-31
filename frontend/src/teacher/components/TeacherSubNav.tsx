import { NavLink } from "react-router-dom";

/**
 * 教师端模块内二级导航。
 * 开发方案里"任务中心""任务监控""教学改进"等模块都有多个子页面，
 * 用路径驱动的二级导航，保证刷新和直接输网址都能落到正确子页。
 */

export interface SubNavItem {
  /** 绝对路径，例如 /teacher/tasks/new */
  to: string;
  label: string;
  /** 仅精确匹配时高亮，用于模块首页 */
  end?: boolean;
}

interface Props {
  items: SubNavItem[];
  ariaLabel: string;
}

export default function TeacherSubNav({ items, ariaLabel }: Props) {
  return (
    <nav className="teacher-subnav" aria-label={ariaLabel}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
