import { useState, type ReactNode } from 'react'
import { Badge, Breadcrumb, Button, Select, Tag, Tooltip, Typography } from 'antd'
import {
  ArrowLeft, Bell, BookOpen, Bot, BrainCircuit, ChevronRight, ClipboardList, FileText,
  GraduationCap, Home, LineChart, MessageSquareText, Network, Settings, Users,
  ListTree, ChevronsLeft, ChevronsRight,
} from 'lucide-react'

import type { ApiClass, ApiCourse } from '../api'
import AccountMenu from '../../components/AccountMenu'
import type { AuthUser } from '../../authSession'

const { Text } = Typography

export type ExactView =
  | 'dashboard'
  | 'courses'
  | 'create-course'
  | 'research'
  | 'workspace'
  | 'content'
  | 'classes'
  | 'invite'
  | 'tasks'
  | 'materials'
  | 'graph'
  | 'monitor'
  | 'grading'
  | 'analytics'
  | 'ai-assistant'
  | 'reviews'
  | 'discussion'
  | 'course-settings'
  | 'settings'

export function CourseBreadcrumb({ current, onNavigate, parent }: {
  current: string
  onNavigate: (view: ExactView) => void
  parent?: { label: string; view: ExactView }
}) {
  return <Breadcrumb
    className="course-breadcrumb"
    separator={<ChevronRight className="course-breadcrumb-separator" size={11} />}
    items={[
      { title: <button type="button" onClick={() => onNavigate('workspace')}><Home size={12} />课程工作空间</button> },
      ...(parent ? [{ title: <button type="button" onClick={() => onNavigate(parent.view)}>{parent.label}</button> }] : []),
      { title: <span>{current}</span> },
    ]}
  />
}

interface ShellProps {
  authUser: AuthUser
  view: ExactView
  courseMode: boolean
  courses: ApiCourse[]
  classes: ApiClass[]
  courseId: string
  classId: string
  notificationCount: number
  onNavigate: (view: ExactView) => void
  onCourse: (id: string) => void
  onClass: (id: string) => void
  onNotifications: () => void
  onLogout?: () => void
  children: ReactNode
}

const globalItems: Array<[ExactView, string, ReactNode]> = [
  ['dashboard', '首页', <Home size={17} />],
  ['courses', '我的课程', <BookOpen size={17} />],
  ['settings', '设置', <Settings size={17} />],
]

const courseItems: Array<[ExactView, string, ReactNode]> = [
  ['workspace', '课程首页', <Home size={17} />],
  ['content', '章节内容', <ListTree size={17} />],
  ['classes', '班级', <Users size={17} />],
  ['tasks', '任务', <ClipboardList size={17} />],
  ['materials', '资料', <FileText size={17} />],
  ['graph', '知识图谱', <Network size={17} />],
  ['analytics', '学情分析', <LineChart size={17} />],
  ['ai-assistant', 'AI 助教', <Bot size={17} />],
]

function SideButton(props: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return <button type="button" title={props.label} aria-current={props.active ? 'page' : undefined} className={'exact-nav-item ' + (props.active ? 'active' : '')} onClick={props.onClick}>
    {props.icon}<span>{props.label}</span>
  </button>
}

export function ExactShell(props: ShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const items = props.courseMode ? courseItems : globalItems
  const currentCourse = props.courses.find((item) => item.id === props.courseId)
  const userMenuItems = props.courseMode ? [{
      key: 'discussion',
      icon: <MessageSquareText size={14} />,
      label: '课堂讨论',
    }] : []

  function handleAccountNavigate(path: string) {
    if (path === '/teacher/dashboard') {
      props.onNavigate('dashboard')
      return
    }
    if (path === '/teacher/materials') {
      props.onNavigate('materials')
      return
    }
    if (path === '/teacher/settings') props.onNavigate('settings')
  }

  return <div className="exact-shell teacher-ui student-direct-window">
    <header className="student-app-topbar teacher-app-topbar">
      <button className="student-app-brand" type="button" onClick={() => props.onNavigate('dashboard')} aria-label="返回教师首页">
        <span className="student-app-logo-mark" aria-hidden="true" />
        <span><strong>CodeTrack</strong><small>教师教学空间</small></span>
      </button>
      {props.courseMode && <div className="exact-topbar-context" aria-label="当前教学上下文">
        <label>
          <span><BookOpen size={14} />课程</span>
          <Select
            size="small"
            value={props.courseId}
            onChange={props.onCourse}
            options={props.courses.map((item) => ({ value: item.id, label: item.name }))}
            popupMatchSelectWidth={260}
          />
        </label>
        <label>
          <span><Users size={14} />班级</span>
          <Select
            size="small"
            value={props.classId || undefined}
            onChange={props.onClass}
            options={props.classes.map((item) => ({ value: item.id, label: item.name }))}
            placeholder="选择班级"
            popupMatchSelectWidth={220}
          />
        </label>
      </div>}
      <div className="student-app-topbar-actions teacher-topbar-actions">
        <Tag color="green">课程知识库已连接</Tag>
        <Tooltip title="通知">
          <Badge count={props.notificationCount} size="small"><Button type="text" icon={<Bell size={18} />} onClick={props.onNotifications} /></Badge>
        </Tooltip>
        {props.view !== 'dashboard' && <Tooltip title="回到教师首页"><Button aria-label="回到教师首页" type="text" icon={<Home size={18} />} onClick={() => props.onNavigate('dashboard')} /></Tooltip>}
        <AccountMenu
          authUser={props.authUser}
          leadingItems={userMenuItems}
          onLogout={props.onLogout ?? (() => undefined)}
          onNavigate={handleAccountNavigate}
          onMenuSelect={(key) => {
            if (key !== 'discussion') return false
            props.onNavigate('discussion')
            return true
          }}
        />
      </div>
    </header>
    <div className={'student-work-window teacher-work-window' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
      <aside className="student-window-sidebar">
        {props.courseMode && <button className="student-window-back" type="button" title="返回我的课程" onClick={() => props.onNavigate('courses')}>
          <ArrowLeft size={17} /><span>返回我的课程</span>
        </button>}
        <div className="student-window-title">
          <span className="teacher-soft-icon blue"><GraduationCap size={22} /></span>
          <div><strong>{props.courseMode ? currentCourse?.name || '课程工作台' : '教学工作台'}</strong><small>{props.courseMode ? currentCourse?.term : props.authUser.display_name}</small></div>
        </div>
        <nav className="student-window-nav teacher-window-nav" aria-label="教师导航">{items.map(([key, label, icon]) =>
          <SideButton key={key} active={props.view === key || (key === 'classes' && props.view === 'invite') || (key === 'tasks' && ['monitor','grading'].includes(props.view))} icon={icon} label={label} onClick={() => props.onNavigate(key)} />
        )}</nav>
      </aside>
      <button className="student-window-rail-toggle" type="button" aria-label={sidebarCollapsed ? '展开教师导航' : '收起教师导航'} title={sidebarCollapsed ? '展开导航' : '收起导航'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((current) => !current)}>
        <span className="student-window-grip" aria-hidden="true"><i /><i /><i /></span>
        {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
      </button>
      <main className={'student-window-content exact-main view-' + props.view}>
        {props.children}
      </main>
    </div>
  </div>
}

export function PageLoader({ label = '正在加载页面内容' }: { label?: string } = {}) {
  return <div className="exact-loader" role="status" aria-live="polite">
    <span className="exact-loader-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
    <Text type="secondary">{label}</Text>
  </div>
}

export function EmptyPanel({ text }: { text: string }) {
  return <div className="exact-empty"><BrainCircuit size={34} /><strong>{text}</strong><small>当前数据源没有可显示的内容</small></div>
}
