import type { ReactNode } from 'react'
import {
  LayoutDashboard,
  Users,
  FlaskConical,
  Sparkles,
  Settings,
} from 'lucide-react'

export interface NavEntry {
  key: string
  label: string
}

export interface NavModule {
  key: string
  label: string
  icon: ReactNode
  entries: NavEntry[]
}

// 六大一级分组 —— 全站导航唯一数据源（Sidebar 菜单 + 面包屑共用）
export const navModules: NavModule[] = [
  {
    key: '/dashboard',
    label: '工作台',
    icon: <LayoutDashboard size={17} />,
    entries: [{ key: '/dashboard', label: '全局工作台' }],
  },
  {
    key: '/users',
    label: '用户与组织',
    icon: <Users size={17} />,
    entries: [
      { key: '/users/teachers', label: '教师账号管理' },
      { key: '/users/students', label: '学生账号管理' },
      { key: '/users/classes', label: '课程管理' },
    ],
  },
  {
    key: '/research',
    label: '科研管理',
    icon: <FlaskConical size={17} />,
    entries: [
      { key: '/research/projects', label: '科研项目管理' },
      { key: '/research/compliance', label: '科研合规审查' },
      { key: '/research/statistics', label: '科研统计' },
    ],
  },
  {
    key: '/ai',
    label: 'AI 运维管控',
    icon: <Sparkles size={17} />,
    entries: [
      { key: '/ai/route', label: '模型管理' },
      { key: '/ai/monitor', label: '运行观测与告警处置' },
    ],
  },
  {
    key: '/system',
    label: '系统设置与安全',
    icon: <Settings size={17} />,
    entries: [
      { key: '/system/config', label: '系统配置' },
      { key: '/system/notices', label: '通知公告' },
      { key: '/system/logs', label: '操作日志' },
    ],
  },
]

// 由当前路径解析出所属模块与二级页面（面包屑 / 菜单高亮共用）
export function resolveNav(pathname: string): { module?: NavModule; entry?: NavEntry } {
  for (const m of navModules) {
    if (pathname === m.key || pathname.startsWith(m.key + '/')) {
      const entry = m.entries.find((e) => pathname === e.key || pathname.startsWith(e.key + '/'))
      return { module: m, entry }
    }
  }
  return {}
}
