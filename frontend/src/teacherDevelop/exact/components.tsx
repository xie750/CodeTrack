import type { ReactNode } from 'react'
import { Avatar, Badge, Breadcrumb, Button, Dropdown, Select, Space, Tag, Tooltip, Typography } from 'antd'
import {
  ArrowLeft, Bell, BookOpen, Bot, BrainCircuit, ChevronDown, ChevronRight, ClipboardList, FileText,
  GraduationCap, Home, LineChart, LogOut, MessageSquareText, Network, Settings, Users,
  ListTree,
} from 'lucide-react'

import type { ApiClass, ApiCourse } from '../api'
import { getCurrentUserName } from '../api'

const { Text } = Typography

export type ExactView =
  | 'dashboard'
  | 'courses'
  | 'create-course'
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
  ['dashboard', '工作台首页', <Home size={17} />],
  ['courses', '我的课程', <BookOpen size={17} />],
  ['settings', '个人设置', <Settings size={17} />],
]

const courseItems: Array<[ExactView, string, ReactNode]> = [
  ['workspace', '课程工作空间首页', <Home size={17} />],
  ['content', '课程章节内容', <ListTree size={17} />],
  ['classes', '班级管理', <Users size={17} />],
  ['tasks', '任务管理', <ClipboardList size={17} />],
  ['materials', '资料管理', <FileText size={17} />],
  ['graph', '课程知识图谱', <Network size={17} />],
  ['analytics', '学情分析', <LineChart size={17} />],
  ['ai-assistant', 'AI 助教', <Bot size={17} />],
  ['discussion', '课堂讨论', <MessageSquareText size={17} />],
]

function SideButton(props: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return <button className={'exact-nav-item ' + (props.active ? 'active' : '')} onClick={props.onClick}>
    {props.icon}<span>{props.label}</span>
  </button>
}

export function ExactShell(props: ShellProps) {
  const items = props.courseMode ? courseItems : globalItems
  const currentCourse = props.courses.find((item) => item.id === props.courseId)
  return <div className="exact-shell">
    <header className="exact-topbar">
      <div className="exact-logo"><span>&lt;/&gt;</span><strong>CodeTrack</strong><small>Teacher</small></div>
      <div className="exact-context">
        <Tag color="green">课程知识库已连接</Tag>
        <Tooltip title="通知">
          <Badge count={props.notificationCount} size="small"><Button type="text" icon={<Bell size={18} />} onClick={props.onNotifications} /></Badge>
        </Tooltip>
        {props.view !== 'dashboard' && <Button className="exact-back-dashboard" icon={<Home size={15} />} onClick={() => props.onNavigate('dashboard')}>回到工作台首页</Button>}
        <Avatar size={27} className="exact-avatar">{getCurrentUserName().slice(0, 1)}</Avatar>
        <Text strong>{getCurrentUserName()}</Text>
        {props.onLogout && <Dropdown menu={{ items: [{ key: 'logout', icon: <LogOut size={14} />, label: '退出登录', onClick: props.onLogout }] }} trigger={['click']}><ChevronDown size={14} style={{ cursor: 'pointer' }} /></Dropdown>}
        {!props.onLogout && <ChevronDown size={14} />}
      </div>
    </header>
    <aside className={'exact-sidebar ' + (props.courseMode ? 'course-mode' : '')}>
      {props.courseMode && <div className="exact-course-sidebar-label">课程工作空间</div>}
      {props.courseMode && <div className="exact-course-identity">
        <img src="/ui-assets/workspace-course-icon.png" alt="" />
        <div><strong>{currentCourse?.name || '数据结构与程序设计基础'}</strong><small>2024 春季</small></div>
      </div>}
      <nav>{items.map(([key, label, icon]) =>
        <SideButton key={key} active={props.view === key || (key === 'classes' && props.view === 'invite') || (key === 'tasks' && ['monitor','grading'].includes(props.view))} icon={icon} label={label} onClick={() => props.onNavigate(key)} />
      )}</nav>
      {props.courseMode && <button className="exact-back-courses" onClick={() => props.onNavigate('courses')}>
        <ArrowLeft size={16} /><span>返回我的课程</span>
      </button>}
    </aside>
    <div className={'exact-main view-' + props.view}>
      {props.children}
    </div>
  </div>
}

export function PageLoader() {
  return <div className="exact-loader"><span /><span /><span /><Text type="secondary">正在读取教学数据</Text></div>
}

export function EmptyPanel({ text }: { text: string }) {
  return <div className="exact-empty"><BrainCircuit size={34} /><strong>{text}</strong><small>当前数据源没有可显示的内容</small></div>
}
