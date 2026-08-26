import { useEffect, useMemo, useState, type PointerEvent } from 'react'
import {
  Alert, Avatar, Button, Checkbox, Col, DatePicker, Dropdown, Form, Input, InputNumber, message, Modal, Pagination, Progress,
  Row, Segmented, Select, Space, Steps, Switch, Tag, Typography, Upload,
} from 'antd'
import {
  Archive, ArrowRight, Bell, BookOpen, Bot, Edit3, Eye, Check, CheckCircle2, ChevronLeft, ChevronRight,
  CalendarDays, CircleHelp, ClipboardCheck, Clock3, Code2, EyeOff, FileText, FlaskConical, GraduationCap, ImageUp, Info, KeyRound, Lightbulb,
  ListChecks, Lock, LogIn, LogOut, MessageSquareText, Microscope, MoreVertical, Plus, RefreshCw, Search, Settings2, Sparkles, Trash2, User, Users,
} from 'lucide-react'

import { api, type ApiClass, type ApiCourse, type ApiTeacher, getCurrentUserName } from '../api'
import type { ExactView } from './components'
import { PageLoader } from './components'
import { StudentEntryMotionBackdrop, type StudentEntryTheme } from '../../pages/StudentEntryPortal'

const { Text, Title, Paragraph } = Typography
const TEACHER_ENTRY_THEME_KEY = 'codetrack.teacher.entry.theme'

function readStoredTeacherEntryTheme(): StudentEntryTheme {
  if (typeof window === 'undefined') return 'starmap'
  return window.localStorage.getItem(TEACHER_ENTRY_THEME_KEY) === 'cloud' ? 'cloud' : 'starmap'
}

function handleEntryCardPointerMove(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 10
  const y = ((event.clientY - rect.top) / rect.height - 0.5) * -10
  event.currentTarget.style.setProperty('--tilt-x', `${y.toFixed(2)}deg`)
  event.currentTarget.style.setProperty('--tilt-y', `${x.toFixed(2)}deg`)
}

function resetEntryCardTilt(event: PointerEvent<HTMLElement>) {
  event.currentTarget.style.setProperty('--tilt-x', '0deg')
  event.currentTarget.style.setProperty('--tilt-y', '0deg')
}

export function ExactPortal({ loggedIn, onLogin, onLogout, onEnter }: { loggedIn: boolean; onLogin: (userId: string, name: string) => void; onLogout: () => void; onEnter: () => void }) {
  const teacherName = getCurrentUserName()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<ApiTeacher[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [entryTheme, setEntryTheme] = useState<StudentEntryTheme>(readStoredTeacherEntryTheme)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    if (loggedIn) return
    api.teacherAccounts()
      .then(setAccounts)
      .catch((reason: any) => messageApi.error(reason.message || '教师账号加载失败'))
  }, [loggedIn, messageApi])

  const doLogin = async (username: string, enteredPassword: string) => {
    setLoading(true)
    try {
      const account = await api.teacherLogin(username, enteredPassword)
      onLogin(account.id, account.name)
      return true
    } catch (reason: any) {
      messageApi.error(reason.message || '用户名或密码错误，请重新输入')
      return false
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await doLogin(values.username.trim(), values.password)
    } catch { /* form validation */ }
  }

  const quickLogin = async (account: ApiTeacher) => {
    form.setFieldsValue({ username: account.number || account.name, password: '123456' })
    await doLogin(account.number || account.name, '123456')
  }

  const changeEntryTheme = (nextTheme: StudentEntryTheme) => {
    setEntryTheme(nextTheme)
    window.localStorage.setItem(TEACHER_ENTRY_THEME_KEY, nextTheme)
  }

  if (!loggedIn) return <main className="exact-login-page exact-login-simple">
    {contextHolder}
    <section className="exact-login-shell exact-login-shell-simple">
      <div className="exact-login-panel">
        <div className="exact-login-brand"><span>&lt;/&gt;</span><strong>CodeTrack</strong><small>Teacher</small></div>
        <div className="exact-login-title"><span><Lock size={19} /></span><div><Title level={2}>教师登录</Title><Text type="secondary">登录后进入 CodeTrack 教师工作台</Text></div></div>
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ username: '', password: '' }} requiredMark={false}>
          <Form.Item label="教师姓名 / 账号" name="username" rules={[{ required: true, message: '请输入教师姓名或账号' }]}>
            <Input prefix={<User size={16} />} placeholder="例如：王老师 或 T2024001" size="large" autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input prefix={<KeyRound size={16} />} suffix={<button type="button" className="portal-pwd-toggle" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>} type={showPassword ? 'text' : 'password'} placeholder="请输入登录密码" size="large" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} icon={<LogIn size={16} />} size="large" block className="portal-login-btn">登录教师端</Button>
        </Form>
        <div className="exact-login-demo-divider"><span>演示账号快速登录</span></div>
        <div className="exact-login-demo-list">{accounts.map((account) => <button type="button" key={account.id} disabled={loading} onClick={() => void quickLogin(account)}><span>{account.name.slice(0, 1)}</span><div><strong>{account.name}</strong><small>{account.number}</small></div><ChevronRight size={14} /></button>)}</div>
        <div className="exact-login-demo-password"><KeyRound size={12} /><span>演示密码</span><strong>123456</strong></div>
        <footer>仅限授权教师账号访问</footer>
      </div>
    </section>
  </main>

  return <main className="exact-portal teacher-entry-page student-entry-page teacher-exact-entry-page" data-entry-theme={entryTheme}>
    {contextHolder}
    <div className="student-entry-backdrop" aria-hidden="true">
      <StudentEntryMotionBackdrop theme={entryTheme} />
      <span className="student-entry-grid" />
      <span className="student-entry-stream stream-a" />
      <span className="student-entry-stream stream-b" />
    </div>
    <header className="teacher-entry-topbar">
      <button className="teacher-entry-brand" type="button" aria-label="CodeTrack Teacher">
        <span className="teacher-entry-logo" aria-hidden="true" />
        <strong>CodeTrack Teacher</strong>
      </button>
      <div className="teacher-entry-userline">
        <span className="teacher-entry-status"><i aria-hidden="true" />课程知识库已连接</span>
        <div className="student-entry-theme-toggle" aria-label="入口背景风格切换">
          <button type="button" className={entryTheme === 'starmap' ? 'active' : ''} aria-pressed={entryTheme === 'starmap'} onClick={() => changeEntryTheme('starmap')}>星图</button>
          <button type="button" className={entryTheme === 'cloud' ? 'active' : ''} aria-pressed={entryTheme === 'cloud'} onClick={() => changeEntryTheme('cloud')}>云图</button>
        </div>
        <Dropdown trigger={['click']} menu={{ items: [{ key: 'logout', icon: <LogOut size={14} />, label: '退出登录', onClick: onLogout }] }}>
          <button type="button" className="exact-portal-account"><Avatar size={28} className="exact-avatar">{teacherName.slice(0, 1)}</Avatar><Text strong>{teacherName}</Text><ChevronRight size={13} /></button>
        </Dropdown>
      </div>
    </header>
    <section className="teacher-entry-hero">
      <div className="teacher-entry-orbit" aria-hidden="true"><Sparkles size={54} strokeWidth={1.6} /></div>

      <>
        <Title>你好，{teacherName}</Title>
        <Text type="secondary">欢迎进入 CodeTrack 教师端，智能助力教学管理与科研协作。</Text>
        <div className="teacher-entry-cards">
          <article className="teacher-entry-card" onPointerMove={handleEntryCardPointerMove} onPointerLeave={resetEntryCardTilt}>
            <div className="teacher-card-visual workbench-visual" aria-hidden="true"><span className="visual-window"><i /><i /><i /><b /><em /></span><span className="visual-profile"><BookOpen size={34} strokeWidth={2.1} /></span><span className="visual-dot dot-a" /><span className="visual-dot dot-b" /></div>
            <h2>教学工作台</h2>
            <p>进入课程管理、班级组织、任务发布与学情分析</p>
            <button type="button" onClick={onEnter}>进入工作台 <ArrowRight size={24} strokeWidth={2.2} /></button>
          </article>
          <article className="teacher-entry-card" onPointerMove={handleEntryCardPointerMove} onPointerLeave={resetEntryCardTilt}>
            <div className="teacher-card-visual research-visual" aria-hidden="true"><span className="visual-microscope"><Microscope size={98} strokeWidth={1.45} /></span><span className="visual-flask"><FlaskConical size={42} strokeWidth={1.6} /></span><span className="visual-dot dot-a" /><span className="visual-dot dot-b" /></div>
            <h2>科研入口</h2>
            <p>论文阅读、代码复现与科研协作空间</p>
            <button type="button" onClick={() => window.alert('科研工作区将在后续版本接入')}>进入科研 <ArrowRight size={24} strokeWidth={2.2} /></button>
          </article>
        </div>
      </>
    </section>
  </main>
}

interface DashboardProps {
  courseId: string
  classId: string
  courses: ApiCourse[]
  onCourse: (id: string) => void
  onNavigate: (view: ExactView) => void
  onReload: (courseId?: string) => void | Promise<void>
}

export function ExactDashboard({ courseId, classId, courses, onCourse, onNavigate, onReload }: DashboardProps) {
  const [data, setData] = useState<any>(null)
  const [handled, setHandled] = useState<string[]>([])
  const [error, setError] = useState('')
  const [messageApi, contextHolder] = message.useMessage()
  const load = () => {
    setError('')
    api.dashboard(courseId, classId).then(setData).catch((reason) => setError(reason.message))
  }
  useEffect(load, [courseId, classId])
  if (!data && !error) return <PageLoader />
  if (error) return <Alert type="error" showIcon message={error} action={<Button onClick={load}>重试</Button>} />
  const summary = data.summary
  const metrics = [
    ['我的课程', courses.length, `共 ${courses.length} 门课程`, BookOpen, 'courses'],
    ['待发布任务', summary.active_tasks, '较上周 ↑ 1', ClipboardCheck, 'tasks'],
    ['待批改提交', 18, '较上周 ↑ 6', ClipboardCheck, 'grading'],
    ['学情提醒', summary.risk_students + 1, '较上周 ↑ 1', Bell, 'analytics'],
  ]

  const updateDashboardCourseStatus = async (course: ApiCourse, status: 'active' | 'preparing' | 'archived') => {
    try {
      await api.updateCourse(course.id, { status })
      await onReload(course.id)
      messageApi.success(status === 'preparing' ? '课程已保存为草稿' : status === 'archived' ? '课程已归档' : '课程已设为进行中')
    } catch (reason: any) {
      messageApi.error(reason.message || '课程状态更新失败')
    }
  }

  const removeDashboardCourse = (course: ApiCourse) => {
    Modal.confirm({
      title: '删除课程',
      content: `删除“${course.name}”后，课程下的班级、任务和教学资料也会被删除，此操作无法撤销。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteCourse(course.id)
          const fallback = courses.find((item) => item.id !== course.id && item.status !== 'archived')
            || courses.find((item) => item.id !== course.id)
          if (fallback) onCourse(fallback.id)
          await onReload(fallback?.id)
          messageApi.success('课程已删除')
        } catch (reason: any) {
          messageApi.error(reason.message || '课程删除失败')
          throw reason
        }
      },
    })
  }

  const dashboardCourseMenu = (course: ApiCourse) => ({
    items: [
      course.status === 'preparing'
        ? { key: 'activate', icon: <CheckCircle2 size={14} />, label: '设为进行中' }
        : { key: 'draft', icon: <FileText size={14} />, label: '保存为草稿' },
      { key: 'archive', icon: <Archive size={14} />, label: '归档课程' },
      { type: 'divider' as const },
      { key: 'delete', icon: <Trash2 size={14} />, label: '删除课程', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'activate') void updateDashboardCourseStatus(course, 'active')
      if (key === 'draft') void updateDashboardCourseStatus(course, 'preparing')
      if (key === 'archive') void updateDashboardCourseStatus(course, 'archived')
      if (key === 'delete') removeDashboardCourse(course)
    },
  })

  return <div className="exact-page exact-dashboard">
    {contextHolder}
    <div className="exact-page-title"><div><Title level={2}>欢迎回来，{getCurrentUserName()}</Title><Text type="secondary">高效管理教学任务，智能助力教学分析。</Text></div><img className="exact-dashboard-hero" src="/ui-assets/portal-teaching.png" alt="" /><Button icon={<RefreshCw size={15} />} onClick={load}>刷新</Button></div>
    <div className="exact-dashboard-grid">
      <section className="exact-dashboard-primary">
        <div className="exact-metric-row">{metrics.map(([label, value, detail, Icon, target]) =>
          <button key={String(label)} onClick={() => onNavigate(target as ExactView)}>
            <span><Icon size={19} /></span><div><small>{label as string}</small><strong>{value as number}</strong><em>{detail as string}</em></div><ChevronRight size={14} />
          </button>)}</div>
        <Button className="exact-create-course" type="primary" icon={<Plus size={16} />} onClick={() => onNavigate('create-course')}>创建课程</Button>
        <div className="exact-block">
          <div className="exact-block-title"><strong>我的课程</strong><Button type="link" onClick={() => onNavigate('courses')}>查看全部课程 <ChevronRight size={13} /></Button></div>
          <div className="exact-dashboard-courses">{courses.filter((course) => course.status !== 'archived').slice(0, 6).map((course, index) => <article key={course.id}>
            <div className="exact-course-art"><img src={'/ui-assets/' + courseAssets[index % courseAssets.length]} alt="" /></div>
            <div className="dashboard-course-heading"><strong>{course.name}</strong><Tag color={courseStatusColors[course.status]}>{courseStatusLabels[course.status] || course.status}</Tag></div>
            <small>{course.term} · {course.classes || 0} 个班级 · {course.students || 0} 名学生</small><Progress percent={course.progress || 0} strokeColor="#43b81a" size="small" />
            <div><Button icon={<ArrowRight size={15} />} type="primary" size="small" onClick={() => { onCourse(course.id); onNavigate('workspace') }}>进入课程</Button><Button icon={<Settings2 size={15} />} type="text" size="small" onClick={() => { onCourse(course.id); onNavigate('course-settings') }}>管理课程</Button><Dropdown trigger={['click']} menu={dashboardCourseMenu(course)}><Button aria-label={`${course.name}更多操作`} icon={<MoreVertical size={16} />} type="text" size="small" /></Dropdown></div>
          </article>)}{!courses.some((course) => course.status !== 'archived') && <div className="exact-empty-courses"><BookOpen size={24} /><strong>还没有进行中的课程</strong><small>创建课程后会自动显示在这里</small></div>}</div>
        </div>
        <div className="exact-block exact-activity">
          <div className="exact-block-title"><strong>最近动态</strong><Button type="link">查看全部动态 <ChevronRight size={13} /></Button></div>
          {['你发布了作业《单链表指定位置节点删除》','学生李思雨在《Java Web 开发技术》提交了一次作业','系统已完成《数据库系统原理》阶段学情分析'].map((item, index) => <div key={item}><span className={'dot d' + index} /><Text>{item}</Text><small>{index + 1} 小时前</small></div>)}
        </div>
      </section>
      <aside className="exact-dashboard-side">
        <div className="exact-block">
          <div className="exact-block-title"><strong>今日待办</strong><Button type="link">查看全部</Button></div>
          {data.todos.filter((item: any) => !handled.includes(item.id)).map((item: any, index: number) => <div className="exact-todo" key={item.id}><span className={'todo-icon t' + index}><ListChecks size={15} /></span><div><strong>{item.title}</strong><small>{item.detail}</small></div><button onClick={() => setHandled(handled.concat(item.id))}>{index === 0 ? '立即处理' : index === 1 ? '今天 23:59 截止' : '查看详情'}</button></div>)}
          {!data.todos.filter((item: any) => !handled.includes(item.id)).length && <div className="exact-finished"><Check size={18} />今日待办已完成</div>}
        </div>
        <div className="exact-block exact-ai-insight">
          <div className="exact-block-title"><strong><Sparkles size={15} /> AI 教学建议</strong><small>基于当前班级数据生成</small></div>
          <p>从近期学习数据来看，学生在“链表边界条件”上错误集中，建议安排一次 15 分钟微练习。</p>
          <div className="exact-ai-actions"><Tag color="red">高频错误</Tag><strong>边界条件遗漏</strong><Button size="small" onClick={() => onNavigate('analytics')}>查看详情</Button></div>
          <div className="exact-ai-actions"><Tag color="gold">学习提醒</Tag><strong>今日有 5 名学生未开始</strong><Button size="small" onClick={() => onNavigate('monitor')}>查看学生</Button></div>
          <div className="exact-ai-actions"><Tag color="blue">教学建议</Tag><strong>下节课可增加指针演示</strong><Button size="small" onClick={() => onNavigate('analytics')}>查看建议</Button></div>
        </div>
      </aside>
    </div>
  </div>
}

interface CoursesProps {
  courses: ApiCourse[]
  onReload: (courseId?: string) => void | Promise<void>
  onCourse: (id: string) => void
  onNavigate: (view: ExactView) => void
}

interface StoredCourseDraft {
  values?: { name?: string; term?: string }
  savedAt?: string
  coverUrl?: string
  knowledgePoints?: string[]
}

const courseAssets = ['course-ds-cover.png','course-java-cover.png','course-db-cover.png','course-se-cover.png','course-cpp-cover.png','course-network-cover.png']
const courseStatusLabels: Record<string, string> = { active: '进行中', preparing: '筹备中', archived: '已归档' }
const courseStatusColors: Record<string, string> = { active: 'green', preparing: 'gold', archived: 'default' }

function courseMajor(course: ApiCourse) {
  const content = course.name + ' ' + course.description
  if (/人工智能|机器学习|深度学习/.test(content)) return '人工智能'
  if (/Java|软件|操作系统|C\+\+|程序设计/.test(content)) return '软件工程'
  if (/数据科学|大数据|数据库/.test(content)) return '数据科学'
  if (/网络|通信/.test(content)) return '网络工程'
  return '计算机科学与技术'
}

function formatCourseDate(value?: string) {
  if (!value) return '时间未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function ExactCourses({ courses, onReload, onCourse, onNavigate }: CoursesProps) {
  const [search, setSearch] = useState('')
  const [academicYear, setAcademicYear] = useState('all')
  const [major, setMajor] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tipIndex, setTipIndex] = useState(0)
  const [page, setPage] = useState(1)
  const [showAllArchived, setShowAllArchived] = useState(false)
  const [draft, setDraft] = useState<StoredCourseDraft | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const usageTips = [
    ['定期更新课程资料，保持内容时效性，有助于提升学生学习效果。', '课程内容维护'],
    ['发布任务前先预览学生端效果，可以及时发现时间与权限设置问题。', '任务发布检查'],
    ['结合学情分析调整教学节奏，重点关注连续两周活跃度较低的学生。', '学情跟进建议'],
  ]

  useEffect(() => {
    api.courseDraft()
      .then((stored) => setDraft(stored as StoredCourseDraft | null))
      .catch(() => setDraft(null))
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setTipIndex((current) => (current + 1) % usageTips.length), 5000)
    return () => window.clearInterval(timer)
  }, [usageTips.length])

  const yearOptions = Array.from(new Set(courses.map((course) => course.term.match(/\d{4}-\d{4}/)?.[0]).filter(Boolean))) as string[]
  const archivedCourses = courses.filter((course) => course.status === 'archived')
  const shown = courses.filter((course) => course.status !== 'archived').filter((course) => {
    const keyword = search.trim().toLowerCase()
    const matchesSearch = !keyword || (course.name + ' ' + course.code + ' ' + course.description).toLowerCase().includes(keyword)
    const matchesYear = academicYear === 'all' || course.term.includes(academicYear)
    const matchesMajor = major === 'all' || courseMajor(course) === major
    const matchesStatus = statusFilter === 'all' || course.status === statusFilter
    return matchesSearch && matchesYear && matchesMajor && matchesStatus
  })

  const visibleCourses = shown.slice((page - 1) * 6, page * 6)
  const firstAvailableCourse = courses.find((course) => course.status !== 'archived') || courses[0]

  useEffect(() => {
    setPage(1)
  }, [search, academicYear, major, statusFilter])

  const resetFilters = () => {
    setSearch('')
    setAcademicYear('all')
    setMajor('all')
    setStatusFilter('all')
  }

  const openCourse = (course: ApiCourse, target: ExactView = 'workspace') => {
    onCourse(course.id)
    onNavigate(target)
  }

  const openFirstCourse = (target: ExactView, fallbackText: string) => {
    if (!firstAvailableCourse) {
      messageApi.info(fallbackText)
      return
    }
    openCourse(firstAvailableCourse, target)
  }

  const updateCourseStatus = (course: ApiCourse, status: 'preparing' | 'archived') => {
    const archiving = status === 'archived'
    Modal.confirm({
      title: archiving ? '归档课程' : '移出归档',
      content: archiving
        ? '归档后，“' + course.name + '”会出现在最近草稿 / 已归档课程中。'
        : '“' + course.name + '”将恢复为筹备中课程。',
      okText: archiving ? '确认归档' : '确认恢复',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.updateCourse(course.id, { status })
          await onReload(course.id)
          messageApi.success(archiving ? '课程已归档' : '课程已移出归档')
        } catch (reason: any) {
          messageApi.error(reason.message || '课程状态更新失败')
          throw reason
        }
      },
    })
  }

  const removeCourse = (course: ApiCourse) => {
    Modal.confirm({
      title: '删除课程',
      content: '删除“' + course.name + '”后，课程下的班级、任务与资料也会被删除，此操作无法撤销。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteCourse(course.id)
          const fallback = courses.find((item) => item.id !== course.id && item.status !== 'archived')
            || courses.find((item) => item.id !== course.id)
          if (fallback) onCourse(fallback.id)
          await onReload(fallback?.id)
          messageApi.success('课程已删除')
        } catch (reason: any) {
          messageApi.error(reason.message || '课程删除失败')
          throw reason
        }
      },
    })
  }

  const courseMenu = (course: ApiCourse) => ({
    items: [
      {
        key: 'archive',
        icon: <Archive size={14} />,
        label: course.status === 'archived' ? '移出归档' : '归档课程',
      },
      {
        key: 'delete',
        icon: <Trash2 size={14} />,
        label: '删除课程',
        danger: true,
      },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'archive') updateCourseStatus(course, course.status === 'archived' ? 'preparing' : 'archived')
      if (key === 'delete') removeCourse(course)
    },
  })

  const discardDraft = async () => {
    try {
      await api.deleteCourseDraft()
      setDraft(null)
      messageApi.success('课程草稿已删除')
    } catch (reason: any) {
      messageApi.error(reason.message || '课程草稿删除失败')
    }
  }

  const quickTips: Array<[string, string, () => void]> = [
    ['课程模板推荐', '参考优质课程模板，快速搭建课程框架', () => onNavigate('create-course')],
    ['批量导入资源', '一次性导入课件、题库等教学资源', () => openFirstCourse('materials', '请先创建一门课程，再导入教学资源')],
    ['课程公开设置', '设置课程可见范围与访问权限', () => openFirstCourse('course-settings', '请先创建一门课程，再配置公开范围')],
  ]

  return <div className="exact-page exact-courses">
    {contextHolder}
    <div className="exact-page-title"><div><Title level={2}>我的课程</Title><Text type="secondary">管理您的全部课程，进入课程工作空间继续开展教学。</Text></div></div>
    <div className="exact-courses-layout">
      <section>
        <div className="exact-filterbar">
          <Input allowClear prefix={<Search size={15} />} placeholder="搜索课程名称、课程代码或关键词" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select aria-label="选择学年" value={academicYear} onChange={setAcademicYear} options={[{ value: 'all', label: '全部学年' }, ...yearOptions.map((value) => ({ value, label: value + ' 学年' }))]} />
          <Select aria-label="选择专业" value={major} onChange={setMajor} options={['全部专业','计算机科学与技术','软件工程','人工智能','数据科学','网络工程'].map((label) => ({ value: label === '全部专业' ? 'all' : label, label }))} />
          <Select aria-label="选择课程状态" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: '全部状态' },{ value: 'active', label: '进行中' },{ value: 'preparing', label: '筹备中' }]} />
          <Button type="primary" icon={<Plus size={15} />} onClick={() => onNavigate('create-course')}>新建课程</Button>
        </div>

        <div className="exact-course-grid">{visibleCourses.map((course, index) => <article
          key={course.id}
          role="button"
          tabIndex={0}
          onClick={() => openCourse(course)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openCourse(course)
            }
          }}
        >
          <div className="course-art"><img src={'/ui-assets/' + courseAssets[index % courseAssets.length]} alt="" /></div>
          <div className="course-copy">
            <div className="course-card-heading"><Title level={4}>{course.name}</Title><Tag color={courseStatusColors[course.status]}>{courseStatusLabels[course.status] || course.status}</Tag></div>
            <div className="course-card-meta"><span><CalendarDays size={14} />{course.term}</span><span><GraduationCap size={14} />{courseMajor(course)}</span></div>
            <p>{course.description || '尚未填写课程简介'}</p>
            <div className="course-stats"><span><Users size={14} />{course.classes} 个班级</span><span><GraduationCap size={14} />{course.students} 名学生</span><span><ClipboardCheck size={14} />{course.task_count} 个任务</span></div>
            <div className="course-progress-label"><span>课程进度</span><b>{course.progress || 0}%</b></div>
            <Progress percent={course.progress || 0} showInfo={false} size="small" strokeColor="#43b81a" />
            <div className="course-card-actions"><Button icon={<ArrowRight size={15} />} type="primary" size="small" onClick={(event) => { event.stopPropagation(); openCourse(course) }}>进入课程</Button><Button icon={<Settings2 size={15} />} size="small" onClick={(event) => { event.stopPropagation(); openCourse(course, 'course-settings') }}>管理课程</Button><Dropdown trigger={['click']} menu={courseMenu(course)}><Button type="text" size="small" aria-label={course.name + '更多操作'} icon={<MoreVertical size={16} />} onClick={(event) => event.stopPropagation()} /></Dropdown></div>
          </div>
        </article>)}
        {!shown.length && <div className="exact-empty-courses"><BookOpen size={24} /><strong>没有符合条件的课程</strong><small>调整筛选条件后再试</small><Button size="small" onClick={resetFilters}>清除筛选</Button></div>}</div>
        {shown.length > 6 && <Pagination className="course-pagination" current={page} pageSize={6} total={shown.length} showSizeChanger={false} onChange={setPage} />}

        <section className="course-draft-archive">
          <div className="course-draft-head"><strong>最近草稿 / 已归档课程</strong>{archivedCourses.length > 3 && <Button type="link" onClick={() => setShowAllArchived((current) => !current)}>{showAllArchived ? '收起' : '查看全部'} <ChevronRight size={13} /></Button>}</div>
          <div className="course-draft-list">
            {draft && <div className="course-draft-row">
              <Tag color="gold">草稿</Tag>
              <div><strong>{draft.values?.name || '未命名课程'}</strong><small>{draft.values?.term || '尚未选择学期'}</small></div>
              <small>保存于 {formatCourseDate(draft.savedAt)}</small>
              <Button size="small" onClick={() => onNavigate('create-course')}>继续编辑</Button>
              <Dropdown trigger={['click']} menu={{ items: [{ key: 'delete', danger: true, icon: <Trash2 size={14} />, label: '删除草稿' }], onClick: discardDraft }}><Button type="text" aria-label="草稿更多操作" icon={<MoreVertical size={16} />} /></Dropdown>
            </div>}
            {(showAllArchived ? archivedCourses : archivedCourses.slice(0, 3)).map((course) => <div className="course-draft-row" key={course.id}>
              <Tag>已归档</Tag>
              <div><strong>{course.name}</strong><small>{course.term}</small></div>
              <small>归档于 {formatCourseDate(course.updated_at)}</small>
              <Button size="small" onClick={() => openCourse(course)}>查看</Button>
              <Dropdown trigger={['click']} menu={courseMenu(course)}><Button type="text" aria-label={course.name + '归档操作'} icon={<MoreVertical size={16} />} /></Dropdown>
            </div>)}
            {!draft && !archivedCourses.length && <div className="course-draft-empty">暂无课程草稿或已归档课程</div>}
          </div>
        </section>
      </section>

      <aside>
        <div className="exact-block"><div className="exact-block-title"><strong>课程总览</strong><Button type="link" onClick={resetFilters}>查看全部 <ChevronRight size={13} /></Button></div><div className="exact-overview-grid"><span><BookOpen size={17} /><strong>{courses.length}</strong><small>课程总数</small></span><span><ClipboardCheck size={17} /><strong>{courses.filter((item) => item.status === 'active').length}</strong><small>进行中课程</small></span><span><CalendarDays size={17} /><strong>{courses.filter((item) => item.term.includes('2024-2025')).length}</strong><small>本学期课程</small></span><span><FileText size={17} /><strong>{courses.filter((item) => item.status === 'preparing').length}</strong><small>筹备中课程</small></span></div></div>
        <div className="exact-block exact-tips"><div className="exact-block-title"><strong>快速提示</strong></div>{quickTips.map(([title, description, action], index) => <button type="button" key={title} onClick={action}><span className={'tip-icon i' + index}><Lightbulb size={16} /></span><div><strong>{title}</strong><small>{description}</small></div><ChevronRight size={14} /></button>)}</div>
        <div className="exact-block exact-usage-tip">
          <div className="exact-block-title"><strong>使用小贴士</strong></div>
          <div className="usage-tip-content"><div><strong>{usageTips[tipIndex][1]}</strong><p>{usageTips[tipIndex][0]}</p></div><span><GraduationCap size={42} /></span></div>
          <div className="usage-tip-controls"><Button type="text" aria-label="上一条提示" icon={<ChevronLeft size={14} />} onClick={() => setTipIndex((tipIndex - 1 + usageTips.length) % usageTips.length)} /><b>{tipIndex + 1} / {usageTips.length}</b><Button type="text" aria-label="下一条提示" icon={<ChevronRight size={14} />} onClick={() => setTipIndex((tipIndex + 1) % usageTips.length)} /></div>
        </div>
      </aside>
    </div>
  </div>
}
const COMPUTER_MAJOR = '计算机专业'
const COMPUTER_DIRECTIONS = [
  '软件工程',
  '人工智能',
  '计算机科学与技术',
  '数据科学与大数据技术',
  '网络工程',
  '信息安全',
]

interface CreateCourseProps {
  onDone: (course: ApiCourse, classId: string) => void
  onCancel: () => void
  teacher: ApiTeacher
}

export function ExactCreateCourse({ onDone, onCancel, teacher }: CreateCourseProps) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastSaved, setLastSaved] = useState('')
  const [termOpen, setTermOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [customKnowledge, setCustomKnowledge] = useState('')
  const [coverUrl, setCoverUrl] = useState('/ui-assets/course-preview.png')
  const [coverUploaded, setCoverUploaded] = useState(false)
  const [knowledgePoints, setKnowledgePoints] = useState(['线性表', '栈与队列', '二叉树', '图', '排序'])
  const [selectedKnowledge, setSelectedKnowledge] = useState(['线性表', '栈与队列', '二叉树'])
  const [teachingChapters, setTeachingChapters] = useState([
    { id: 'chapter-1', name: '程序设计基础', knowledge: '变量、数据类型、运算符、流程控制', weeks: '第 1-2 周', mode: '理论讲授' },
    { id: 'chapter-2', name: '函数与模块化编程', knowledge: '函数定义、参数传递、作用域、模块化', weeks: '第 3-4 周', mode: '理论讲授' },
    { id: 'chapter-3', name: '数据结构基础', knowledge: '线性表、栈、队列、链表', weeks: '第 5-7 周', mode: '混合' },
    { id: 'chapter-4', name: '算法设计与分析', knowledge: '排序、查找、递归、递推', weeks: '第 8-11 周', mode: '实验' },
    { id: 'chapter-5', name: '综合项目实践', knowledge: '综合应用与项目开发', weeks: '第 12-16 周', mode: '实验 + 项目' },
  ])
  const [termOptions, setTermOptions] = useState([
    { value: '2024-2025 学年春季学期', label: '2024-2025 学年春季学期' },
    { value: '2025-2026 学年秋季学期', label: '2025-2026 学年秋季学期' },
  ])
  const [createdCourse, setCreatedCourse] = useState<{ course: ApiCourse; classId: string } | null>(null)
  const [form] = Form.useForm()
  const [termForm] = Form.useForm()
  const defaults = {
    name: '数据结构与程序设计基础',
    code: '',
    term: '2024-2025 学年春季学期',
    description: '本课程系统讲解数据结构的基本概念、常用算法及其程序实现。',
    goals: '掌握常见数据结构的逻辑与存储结构，能够分析算法时间和空间复杂度，并运用所学知识解决实际问题。',
    major: COMPUTER_MAJOR,
    directions: ['软件工程', '人工智能'],
    weeks: 16,
    start_week: '第 1 周',
    end_week: '第 16 周',
    hours: 48,
    weekly_hours: 3,
    teaching_mode: '混合',
    ai_enabled: true,
    ai_sources: ['课程资料', '教学大纲'],
  }

  useEffect(() => {
    api.courseDraft().then((stored) => {
      if (!stored) return
      const parsed = stored as StoredCourseDraft
      if (parsed.values) form.setFieldsValue({ ...parsed.values, major: COMPUTER_MAJOR, code: '' })
      const restoredKnowledgePoints = parsed.knowledgePoints
      if (Array.isArray(restoredKnowledgePoints)) {
        setSelectedKnowledge(restoredKnowledgePoints)
        setKnowledgePoints((current) => Array.from(new Set([...current, ...restoredKnowledgePoints])))
      }
      if (parsed.coverUrl) {
        setCoverUrl(parsed.coverUrl)
        setCoverUploaded(parsed.coverUrl.startsWith('data:'))
      }
    }).catch(() => setError('课程草稿读取失败，请稍后重试'))
  }, [form])

  const watchedName = Form.useWatch('name', form) || ''
  const watchedCode = Form.useWatch('code', form) || ''
  const watchedTerm = Form.useWatch('term', form) || ''
  const watchedDescription = Form.useWatch('description', form) || ''
  const watchedGoals = Form.useWatch('goals', form) || ''
  const watchedMajor = Form.useWatch('major', form) || ''
  const watchedDirections = Form.useWatch('directions', form) || []
  const watchedWeeks = Form.useWatch('weeks', form) || defaults.weeks
  const watchedHours = Form.useWatch('hours', form) || defaults.hours
  const watchedStartWeek = Form.useWatch('start_week', form) || defaults.start_week
  const watchedEndWeek = Form.useWatch('end_week', form) || defaults.end_week
  const watchedWeeklyHours = Form.useWatch('weekly_hours', form) || defaults.weekly_hours
  const watchedTeachingMode = Form.useWatch('teaching_mode', form) || defaults.teaching_mode
  const aiEnabled = Form.useWatch('ai_enabled', form) ?? true
  const chapters = teachingChapters.map((chapter) => chapter.name).filter(Boolean)

  const saveDraft = async () => {
    const savedAt = new Date()
    const values = { ...form.getFieldsValue(true), major: COMPUTER_MAJOR, code: '' }
    const draft = {
      values,
      knowledgePoints: selectedKnowledge,
      savedAt: savedAt.toISOString(),
    }
    try {
      await api.saveCourseDraft({ ...draft, coverUrl })
      const hours = String(savedAt.getHours()).padStart(2, '0')
      const minutes = String(savedAt.getMinutes()).padStart(2, '0')
      setLastSaved(`今天 ${hours}:${minutes}`)
    } catch (reason: any) {
      setError(reason.message || '课程草稿保存失败')
    }
  }
  const addKnowledgePoint = () => {
    const value = customKnowledge.trim()
    if (!value) return
    setKnowledgePoints((current) => current.includes(value) ? current : [...current, value])
    setSelectedKnowledge((current) => current.includes(value) ? current : [...current, value])
    setCustomKnowledge('')
  }
  const updateTeachingChapter = (id: string, field: 'name' | 'knowledge' | 'weeks' | 'mode', value: string) => {
    setTeachingChapters((current) => current.map((chapter) => chapter.id === id ? { ...chapter, [field]: value } : chapter))
  }
  const addTeachingChapter = () => {
    setTeachingChapters((current) => [...current, {
      id: `chapter-${Date.now()}`,
      name: `新章节 ${current.length + 1}`,
      knowledge: '请选择或填写对应知识点',
      weeks: '第 16 周',
      mode: '理论讲授',
    }])
  }
  const saveTerm = async () => {
    const values = await termForm.validateFields()
    const range = values.range
    const label = `${values.academicYear} 学年${values.termType}`
    const option = {
      value: label,
      label: `${label} · ${range[0].format('YYYY.MM.DD')}-${range[1].format('YYYY.MM.DD')}`,
    }
    setTermOptions((current) => current.some((item) => item.value === option.value)
      ? current.map((item) => item.value === option.value ? option : item)
      : [...current, option])
    form.setFieldValue('term', option.value)
    setTermOpen(false)
    termForm.resetFields()
  }
  const beforeCoverUpload = (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      window.alert('请上传 JPG、PNG 或 WebP 图片')
      return false
    }
    if (file.size > 5 * 1024 * 1024) {
      window.alert('课程封面不能超过 5 MB')
      return false
    }
    const reader = new FileReader()
    reader.onload = () => {
      setCoverUrl(String(reader.result))
      setCoverUploaded(true)
    }
    reader.readAsDataURL(file)
    return false
  }
  const submit = async () => {
    setSaving(true); setError('')
    try {
      const values = { ...defaults, ...form.getFieldsValue(true) }
      const generatedCode = `CT-${new Date().getFullYear()}-${Date.now().toString(36).slice(-7).toUpperCase()}`
      form.setFieldValue('code', generatedCode)
      const created = await api.createCourse({
        name: values.name,
        code: generatedCode,
        term: values.term,
        description: values.description,
        student_visible: false,
        chapter_titles: chapters,
      })
      form.setFieldValue('code', created.code || generatedCode)
      const group = await api.createClass({
        course_id: created.id,
        name: '软件工程1班',
        schedule: '周二 3-4 节',
        mentor: teacher.name,
      })
      setCreatedCourse({ course: created, classId: group.id })
      await api.deleteCourseDraft()
      setStep(2)
    } catch (reason: any) {
      setError(reason.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="exact-create-flow">
    <div className="create-head"><div><Title level={2}>创建课程</Title><Text type="secondary">完善课程基础信息，右侧将实时展示学生端预览。</Text></div><Steps current={step} size="small" items={[{ title: '基础信息' },{ title: '教学设置' },{ title: '完成创建' }]} /></div>
    <div className="create-layout">
      <main>
        <Form form={form} layout="vertical" initialValues={defaults} requiredMark={false}>
          {step === 0 && <div className="create-form-section create-course-basics">
            <section className="create-basic-card">
              <div className="section-label"><span>1</span><strong>课程基础信息</strong></div>
              <div className="create-field-grid create-field-grid-primary">
                <Form.Item label="课程名称" name="name" rules={[{ required: true, message: '请输入课程名称' }]}><Input maxLength={50} placeholder="请输入课程名称" /></Form.Item>
                <Form.Item label={<span className="term-label">开课学期 <Button type="link" size="small" icon={<CalendarDays size={13} />} onClick={() => setTermOpen(true)}>学期管理</Button></span>} name="term" rules={[{ required: true, message: '请选择开课学期' }]}><Select options={termOptions} /></Form.Item>
                <Form.Item label="课程代码" name="code"><Input className="course-code-locked" disabled prefix={<Lock size={13} />} placeholder="创建课程后自动生成课程代码" /></Form.Item>
                <Form.Item label="课程简介" name="description"><Input.TextArea rows={2} showCount maxLength={300} placeholder="请输入课程简介" /></Form.Item>
              </div>
            </section>

            <section className="create-basic-card create-two-column">
              <div>
                <div className="section-label"><span>2</span><strong>教学目标</strong></div>
                <Form.Item name="goals"><Input.TextArea rows={4} maxLength={500} placeholder="填写课程教学目标" /></Form.Item>
              </div>
              <div>
                <div className="section-label"><span>3</span><strong>适用专业与方向</strong></div>
                <div className="major-fields">
                  <Form.Item name="major" className="major-primary-field">
                    <Select
                      aria-label="一级专业"
                      disabled
                      suffixIcon={<Lock size={13} />}
                      options={[{ value: COMPUTER_MAJOR, label: COMPUTER_MAJOR }]}
                    />
                  </Form.Item>
                  <div className="major-hierarchy-line" aria-hidden="true"><span /></div>
                  <Form.Item
                    name="directions"
                    rules={[{ required: true, message: '请至少选择一个专业方向' }]}
                  >
                    <Select
                      aria-label="二级专业方向"
                      mode="multiple"
                      showSearch
                      allowClear
                      optionFilterProp="label"
                      maxTagCount="responsive"
                      placeholder="搜索并选择专业方向"
                      notFoundContent="未找到匹配的专业方向"
                      options={COMPUTER_DIRECTIONS.map((value) => ({ value, label: value }))}
                    />
                  </Form.Item>
                </div>
                <p className="major-fields-help">已统一归入计算机专业，可选择一个或多个具体培养方向</p>
              </div>
            </section>

            <section className="create-basic-card create-two-column create-content-row">
              <div className="knowledge-module">
                <div className="section-label"><span>4</span><strong>知识点模板</strong></div>
                <small className="knowledge-hint">选择课程覆盖的基础知识点<br />可在后续教学中应用，也可添加自定义知识点</small>
                <div className="knowledge-editor">
                  <div className="knowledge-picker">{knowledgePoints.map((item) => {
                    const selected = selectedKnowledge.includes(item)
                    return <button type="button" key={item} className={selected ? 'selected' : ''} onClick={() => setSelectedKnowledge((current) => selected ? current.filter((value) => value !== item) : [...current, item])}>{selected && <Check size={12} />}{item}</button>
                  })}</div>
                  <div className="knowledge-custom"><Input value={customKnowledge} onChange={(event) => setCustomKnowledge(event.target.value)} onPressEnter={addKnowledgePoint} placeholder="填写自定义知识点" maxLength={16} /><Button icon={<Plus size={14} />} onClick={addKnowledgePoint}>添加</Button></div>
                </div>
              </div>
              <div className="cover-module">
                <div className="section-label"><span>5</span><strong>课程封面</strong></div>
                <Upload.Dragger className={`cover-uploader ${coverUploaded ? 'has-cover' : ''}`} accept="image/png,image/jpeg,image/webp" showUploadList={false} beforeUpload={beforeCoverUpload}>
                  {coverUploaded ? <div className="uploaded-cover-preview"><img src={coverUrl} alt="已上传课程封面" /><span><ImageUp size={17} />点击更换课程封面</span></div> : <div className="cover-upload-placeholder"><ImageUp size={27} /><strong>点击或拖拽上传封面图片</strong><small>支持 JPG/PNG/WebP，建议尺寸 1280×720，大小不超过 5MB</small></div>}
                </Upload.Dragger>
              </div>
            </section>

            <section className="create-basic-card ai-knowledge-settings">
              <div className="section-label"><span>6</span><strong>AI 知识库设置</strong></div>
              <div className="ai-knowledge-body">
                <div className="ai-knowledge-copy">
                  <div className="ai-toggle-line"><Form.Item name="ai_enabled" valuePropName="checked" noStyle><Switch /></Form.Item><strong>启用 AI 知识库</strong><CircleHelp size={14} /></div>
                  <small>启用后，系统将基于课程内容构建专属知识库，为学生提供智能问答与学习支持。</small>
                  <p><Info size={13} />知识库内容包括课程资料、代码示例、教学大纲等，支持后续持续更新。</p>
                </div>
                <Button className="ai-advanced-button" icon={<Settings2 size={14} />} onClick={() => setAdvancedOpen(true)}>高级设置</Button>
              </div>
            </section>
          </div>}

          {step === 1 && <div className="create-form-section teaching-settings-form">
            <section className="teaching-setting-card schedule-card">
              <div className="section-label"><span>1</span><strong>授课安排</strong></div>
              <div className="schedule-grid">
                <Form.Item label="开课周" name="start_week"><Select options={Array.from({ length: 20 }, (_, index) => ({ value: `第 ${index + 1} 周`, label: `第 ${index + 1} 周` }))} /></Form.Item>
                <Form.Item label="结课周" name="end_week"><Select options={Array.from({ length: 20 }, (_, index) => ({ value: `第 ${index + 1} 周`, label: `第 ${index + 1} 周` }))} /></Form.Item>
                <Form.Item label="总学时" name="hours"><InputNumber min={1} max={200} addonAfter="学时" /></Form.Item>
                <Form.Item label="每周课时" name="weekly_hours"><Select options={[1,2,3,4,6,8].map((value) => ({ value, label: `${value} 学时` }))} /></Form.Item>
                <Form.Item label={<span className="mode-label">授课模式 <CircleHelp size={13} /></span>} name="teaching_mode"><Segmented block options={['理论','实验','混合']} /></Form.Item>
              </div>
            </section>

            <section className="teaching-setting-card chapter-setting-card">
              <div className="section-label"><span>2</span><strong>教学章节与内容</strong><CircleHelp size={13} /></div>
              <div className="chapter-table-editor">
                <div className="chapter-table-head"><span>#</span><span>章节名称</span><span>对应知识点（来自课程知识库）</span><span>预计周次</span><span>教学模式</span><span>操作</span></div>
                {teachingChapters.map((chapter, index) => <div className="chapter-table-row" key={chapter.id}>
                  <b>{index + 1}</b>
                  <Input value={chapter.name} onChange={(event) => updateTeachingChapter(chapter.id, 'name', event.target.value)} />
                  <Input value={chapter.knowledge} onChange={(event) => updateTeachingChapter(chapter.id, 'knowledge', event.target.value)} />
                  <Select value={chapter.weeks} onChange={(value) => updateTeachingChapter(chapter.id, 'weeks', value)} options={['第 1-2 周','第 3-4 周','第 5-7 周','第 8-11 周','第 12-16 周','第 16 周'].map((value) => ({ value, label: value }))} />
                  <Select value={chapter.mode} onChange={(value) => updateTeachingChapter(chapter.id, 'mode', value)} options={['理论讲授','实验','混合','实验 + 项目'].map((value) => ({ value, label: value }))} />
                  <div className="chapter-row-actions"><Button type="text" aria-label="编辑章节" icon={<Edit3 size={14} />} /><Button type="text" danger aria-label="删除章节" icon={<Trash2 size={14} />} onClick={() => setTeachingChapters((current) => current.filter((item) => item.id !== chapter.id))} /></div>
                </div>)}
                <Button className="add-chapter-row" type="dashed" block icon={<Plus size={15} />} onClick={addTeachingChapter}>添加章节</Button>
              </div>
            </section>
          </div>}

          {step < 2 && error && <Alert className="create-course-submit-error" type="error" showIcon message={error} />}

          {step === 2 && <div className="exact-created completion-page">
            <div className="completion-hero"><div className="completion-confetti" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div><span><CheckCircle2 size={38} /></span><div><Title level={2}>课程创建完成</Title><Text type="secondary">恭喜！您的课程已成功创建，教学空间已为您准备就绪。</Text></div></div>
            <section className="completion-overview">
              <strong>课程信息概览</strong>
              <div className="completion-info-grid">
                <div><span><BookOpen size={15} /></span><small>课程名称</small><b>{watchedName || defaults.name}</b></div>
                <div><span><Clock3 size={15} /></span><small>学时</small><b>{watchedHours} 学时</b></div>
                <div><span><Code2 size={15} /></span><small>课程代码</small><b>{watchedCode || createdCourse?.course.code}</b></div>
                <div><span><Users size={15} /></span><small>已绑定班级数量</small><b>1 个班级</b></div>
                <div><span><CalendarDays size={15} /></span><small>学期</small><b>{watchedTerm || defaults.term}</b></div>
                <div><span><ListChecks size={15} /></span><small>知识点模板</small><b>{selectedKnowledge.join('、')}</b></div>
                <div><span><GraduationCap size={15} /></span><small>授课教师</small><b>{teacher.name}</b></div>
                <div><span><Sparkles size={15} /></span><small>AI 知识库状态</small><b className={aiEnabled ? 'enabled' : ''}>{aiEnabled ? '已启用' : '未启用'}</b></div>
              </div>
            </section>
            <div className="created-next"><strong>接下来，您可以...</strong><div>{[['进入课程工作空间', BookOpen], ['继续添加授课班级', Users], ['上传教学材料', FileText], ['创建第一个作业', ClipboardCheck], ['预览学生端课程卡', Eye]].map(([label, Icon]) => <button key={label as string}><Icon size={18} /><span>{label as string}</span><ChevronRight size={13} /></button>)}</div></div>
            <div className="created-guide"><strong>新手推荐：三步开启高效教学</strong><div><span><b>1</b>上传资料<small>上传课程大纲与教学资源</small></span><i>→</i><span><b>2</b>构建知识库<small>基于资料生成课程知识库</small></span><i>→</i><span><b>3</b>发布任务<small>创建作业或课堂练习</small></span></div></div>
            {error && <Alert type="error" showIcon message={error} />}
          </div>}
        </Form>
      </main>

      <aside>
        {step === 0 && <div className="course-preview-card live-course-preview">
          <div className="preview-title"><strong>课程预览</strong><Tag color="green">实时同步</Tag></div>
          <div className="preview-cover"><img src={coverUrl} alt="课程封面预览" /><span>学生端展示效果</span></div>
          <Title level={3}>{watchedName || '未命名课程'}</Title>
          <Text type="secondary">{watchedTerm || '请选择开课学期'}</Text>
          <div className="preview-tags">{watchedMajor && <Tag>{watchedMajor}</Tag>}{watchedDirections.map((item: string) => <Tag color="green" key={item}>{item}</Tag>)}</div>
          <div className="preview-meta"><span><Clock3 size={13} /> {watchedWeeks} 周</span><span><BookOpen size={13} /> {watchedHours} 学时</span><span><Users size={13} /> {teacher.name}</span></div>
          <div className="preview-description-card"><strong>课程简介</strong><p>{watchedDescription || '课程简介将显示在这里。'}</p></div>
          <div className="preview-knowledge"><strong>知识模块</strong><div>{selectedKnowledge.map((item) => <span key={item}>{item}</span>)}</div></div>
          <div className="preview-code"><Lock size={12} /><span>课程代码</span><strong>{watchedCode || '创建后自动生成'}</strong></div>
        </div>}
        {step === 1 && <div className="create-setting-preview teaching-live-preview"><Title level={4}>设置预览</Title><Text type="secondary">当前教学设置的概要信息</Text><section><strong><CalendarDays size={15} /> 授课安排</strong><p>{watchedStartWeek} - {watchedEndWeek}　·　总学时 {watchedHours} 学时　·　每周 {watchedWeeklyHours} 学时</p><Tag color="green">授课模式：{watchedTeachingMode}{watchedTeachingMode === '混合' ? '（理论 + 实验）' : ''}</Tag></section><section><strong><ListChecks size={15} /> 教学章节概览（{teachingChapters.length} 个章节）</strong>{teachingChapters.slice(0,5).map((chapter) => <span key={chapter.id}><i />{chapter.weeks}　{chapter.name}<Tag icon={chapter.mode.includes('实验') ? <FlaskConical size={11} /> : <BookOpen size={11} />}>{chapter.mode}</Tag></span>)}</section><Alert type="success" showIcon message="班级配置将在课程创建完成后进入课程工作空间进行设置。" /></div>}
        {step === 2 && <div className="create-result-preview completion-result-preview"><Title level={4}>课程创建结果</Title><Text type="secondary">以下是课程在学生端的展示效果预览</Text><div className="result-course-card"><div className="result-cover"><img src={coverUrl} alt="课程封面" /><Tag color="green">进行中</Tag></div><div className="result-course-copy"><Title level={3}>{watchedName || defaults.name}</Title><div className="result-meta"><span><GraduationCap size={13} />{teacher.name}</span><span><Clock3 size={13} />{watchedHours} 学时</span><span><Users size={13} />1 个班级</span></div><p>{watchedDescription || defaults.description}</p><Space wrap>{watchedDirections.map((item: string) => <Tag color="green" key={item}>{item}</Tag>)}</Space></div></div><section><strong>创建进度检查</strong>{['基础信息已完成','教学设置已完成', aiEnabled ? '知识库已启用' : '知识库未启用'].map((item) => <span key={item}><CheckCircle2 size={14} />{item}<b>已完成</b></span>)}</section><Alert type="info" showIcon message="课程创建完成后，您可以随时在课程设置中调整和完善各项内容。" /></div>}
      </aside>
    </div>
    <div className="create-actions">
      <div className="draft-status">{lastSaved && <><CheckCircle2 size={18} /><span><strong>已自动保存草稿</strong><small>上次保存：{lastSaved}</small></span></>}</div>
      <div className={`create-action-buttons step-${step}`}>{step === 0 ? <><Button onClick={saveDraft}>保存草稿</Button><Button type="primary" onClick={() => form.validateFields().then(() => setStep(1))}>下一步：教学设置 <ArrowRight size={14} /></Button></> : step === 1 ? <><Button onClick={() => setStep(0)}>上一步：基础信息</Button><Button onClick={saveDraft}>保存草稿</Button><Button type="primary" loading={saving} onClick={() => form.validateFields().then(submit)}>下一步：完成创建 <ArrowRight size={14} /></Button></> : <><Button onClick={onCancel}>返回我的课程</Button><Button type="primary" disabled={!createdCourse} onClick={() => createdCourse && onDone(createdCourse.course, createdCourse.classId)}>进入课程工作空间</Button></>}</div>
    </div>

    <Modal title="学期管理" open={termOpen} onCancel={() => setTermOpen(false)} onOk={saveTerm} okText="保存并使用" cancelText="取消" className="term-manager-modal">
      <Alert type="info" showIcon message="保存后会自动同步到创建课程的学期下拉列表。" />
      <Form form={termForm} layout="vertical" initialValues={{ academicYear: '2025-2026', duration: 4, termType: '秋季学期' }}>
        <div className="term-form-grid"><Form.Item label="学年" name="academicYear" rules={[{ required: true }]}><Select options={['2024-2025','2025-2026','2026-2027'].map((value) => ({ value, label: value }))} /></Form.Item><Form.Item label="学制" name="duration" rules={[{ required: true }]}><Select options={[2,3,4,5].map((value) => ({ value, label: `${value} 年制` }))} /></Form.Item></div>
        <Form.Item label="学期" name="termType" rules={[{ required: true }]}><Select options={['春季学期','秋季学期','短学期'].map((value) => ({ value, label: value }))} /></Form.Item>
        <Form.Item label="学期日历" name="range" rules={[{ required: true, message: '请选择学期起止日期' }]}><DatePicker.RangePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item>
      </Form>
    </Modal>

    <Modal title="AI 知识库高级设置" open={advancedOpen} onCancel={() => setAdvancedOpen(false)} onOk={() => setAdvancedOpen(false)} okText="保存设置" cancelText="取消">
      <div className="ai-advanced-settings"><Alert type="info" showIcon message="AI 生成的内容将先进入草稿，教师确认和编辑后才可发布。" /><label><span><strong>生成内容需人工确认</strong><small>大纲、练习题和知识图谱节点不会直接发布</small></span><Switch defaultChecked /></label><label><span><strong>引用课程资料来源</strong><small>生成结果中保留对应资料出处</small></span><Switch defaultChecked /></label></div>
    </Modal>
  </div>
}













