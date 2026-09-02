import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Drawer, message, Tag, Typography } from 'antd'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useRef } from 'react'
import { CheckCircle2, CircleAlert } from 'lucide-react'

import { api, TEACHER_API_BASE, type ApiCourse, type BootstrapData } from '../api'
import { ExactShell, type ExactView } from './components'
import { ExactCreateCourse, ExactCourses, ExactDashboard, ExactPortal } from './pages-global'
import { ExactCourseSettings, ExactInvite, ExactWorkspace } from './pages-course'
import { ExactAnalytics, ExactGrading, ExactMonitor, ExactReviews, ExactSettings } from './pages-flow'
import { ExactClassesV2 } from './ExactClassesV2'
import { ExactTasksV2 } from './ExactTasksV2'
import { ExactMaterialsV2 } from './ExactMaterialsV2'
import { ExactGraphV2 } from './ExactGraphV2'
import { ExactCourseContent } from './ExactCourseContent'
import { ExactTeacherAiAssistant } from './ExactTeacherAiAssistant'
import { matchTeacherRoute, teacherPath } from '../routes/routeConfig'
import type { AuthUser } from '../../authSession'
import './exact.css'

const { Text } = Typography

const courseOnlyViews: ExactView[] = [
  'workspace', 'content', 'classes', 'invite', 'tasks', 'materials', 'graph',
  'monitor', 'grading', 'analytics', 'ai-assistant', 'reviews', 'discussion', 'course-settings',
]

function TeacherWorkbenchBoot() {
  return <div className="exact-boot-shell" role="status" aria-live="polite">
    <header className="exact-boot-topbar">
      <div className="exact-boot-brand" />
      <div className="exact-boot-actions"><span /><span /><span /></div>
    </header>
    <aside className="exact-boot-sidebar">
      {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
    </aside>
    <main className="exact-boot-main">
      <div className="exact-boot-title">
        <span />
        <strong>正在准备教师工作台</strong>
        <Text type="secondary">同步课程、班级和教学任务数据</Text>
      </div>
      <div className="exact-boot-metrics">
        {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
      </div>
      <div className="exact-boot-grid">
        <section />
        <section />
        <aside />
      </div>
    </main>
  </div>
}

export default function ExactApp({ authUser, loggedIn, onLogin, onLogout }: { authUser: AuthUser; loggedIn: boolean; onLogin: (userId: string, name: string) => void; onLogout: () => void }) {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const matchedRoute = useMemo(() => matchTeacherRoute(location.pathname), [location.pathname])
  const [entered, setEntered] = useState(() => loggedIn && location.pathname.startsWith('/teacher/'))
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null)
  const [courseId, setCourseId] = useState(() => matchedRoute.courseId || 'course-ds')
  const courseIdRef = useRef(courseId)
  const [classId, setClassId] = useState('class-se1')
  const [loading, setLoading] = useState(false)
  const [enteringWorkbench, setEnteringWorkbench] = useState(false)
  const [error, setError] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const view = matchedRoute.view

  const load = useCallback(async (requestedCourseId = courseId, requestedClassId = classId) => {
    setLoading(true)
    setError('')
    try {
      const data = await api.bootstrap(requestedCourseId, requestedClassId)
      setBootstrap(data)
      if (data.selected_course_id !== courseIdRef.current) {
        courseIdRef.current = data.selected_course_id
        setCourseId(data.selected_course_id)
      }
      if (data.selected_class_id !== classId) setClassId(data.selected_class_id)
      return data
    } catch (reason: any) {
      if (reason?.status === 403) {
        setError('当前教师账号无权访问该课程，请重新登录')
        onLogout()
        return null
      }
      setError(reason.message || '无法连接 CodeTrack 后端')
      return null
    } finally {
      setLoading(false)
    }
  }, [courseId, classId, onLogout])

  useEffect(() => {
    if (loggedIn && entered && !bootstrap && !loading) void load()
  }, [loggedIn, entered, bootstrap, loading, load])

  useEffect(() => {
    if (!loggedIn) setEntered(false)
  }, [loggedIn])

  useEffect(() => {
    if (!matchedRoute.courseId || matchedRoute.courseId === courseIdRef.current) return
    courseIdRef.current = matchedRoute.courseId
    setCourseId(matchedRoute.courseId)
    const first = bootstrap?.classes.find((item) => item.course_id === matchedRoute.courseId)
    if (first) setClassId(first.id)
  }, [matchedRoute.courseId, bootstrap?.classes])

  const classes = useMemo(
    () => bootstrap?.classes.filter((item) => item.course_id === courseId) || [],
    [bootstrap?.classes, courseId],
  )

  const notify = (text: string) => messageApi.success(text)
  const navigate = (next: ExactView) => {
    if (next === 'discussion') {
      routerNavigate(`/teacher/courses/${encodeURIComponent(courseIdRef.current)}/workspace?discussion=1`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const nextCourseMode = matchedRoute.courseMode || courseOnlyViews.includes(next)
    routerNavigate(teacherPath(next, courseIdRef.current, nextCourseMode))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const chooseCourse = (id: string) => {
    courseIdRef.current = id
    setCourseId(id)
    const first = bootstrap?.classes.find((item) => item.course_id === id)
    if (first) setClassId(first.id)
  }
  const courseCreated = (course: ApiCourse, createdClassId: string) => {
    messageApi.success('课程已写入数据库')
    courseIdRef.current = course.id
    setCourseId(course.id)
    setClassId(createdClassId)
    routerNavigate(teacherPath('invite', course.id, true))
    void load(course.id, createdClassId)
  }
  const readNotice = async (id: string) => {
    try {
      await api.markNotification(id)
      setBootstrap((current) => current ? {
        ...current,
        notifications: current.notifications.map((item) => item.id === id ? { ...item, read: true } : item),
      } : current)
    } catch (reason: any) {
      messageApi.error(reason.message)
    }
  }

  const refresh = useCallback(async (requestedCourseId?: string) => {
    await load(requestedCourseId ?? courseIdRef.current, classId)
  }, [classId, load])

  const enterWorkbench = async () => {
    if (bootstrap) {
      setEntered(true)
      routerNavigate('/teacher/dashboard')
      return
    }

    setEnteringWorkbench(true)
    const data = await load(courseIdRef.current, classId)
    if (data) {
      setEntered(true)
      routerNavigate('/teacher/dashboard')
    }
    setEnteringWorkbench(false)
  }

  if (!loggedIn || !entered) return <ExactPortal
    authUser={authUser}
    loggedIn={loggedIn}
    onLogin={(userId, name) => { onLogin(userId, name); routerNavigate('/', { replace: true }) }}
    onLogout={onLogout}
    onEnter={() => { void enterWorkbench() }}
    onNavigate={(path) => {
      setEntered(true)
      routerNavigate(path === '/teacher/materials' ? teacherPath('materials', courseIdRef.current, true) : path)
    }}
    enteringWorkbench={enteringWorkbench}
    entryError={error}
  />

  if (loading && !bootstrap) {
    return <TeacherWorkbenchBoot />
  }

  if (error && !bootstrap) {
    return <div className="exact-boot-error">
      <CircleAlert size={36} />
      <h2>无法连接教学后端</h2>
      <p>{error}</p>
      <code>{TEACHER_API_BASE}/health</code>
      <Button type="primary" onClick={() => void load()}>重新连接</Button>
    </div>
  }

  if (!bootstrap) return null

  const common = {
    courseId,
    classId,
    courses: bootstrap.courses,
    classes,
    teacher: bootstrap.teacher,
    onNavigate: navigate,
    onRefresh: refresh,
    notify,
  }
  const dashboard = <ExactDashboard courseId={courseId} classId={classId} courses={bootstrap.courses} onCourse={chooseCourse} onNavigate={navigate} onReload={refresh} />
  const classesPage = <ExactClassesV2 {...common} />
  const tasksPage = <ExactTasksV2 {...common} />
  const materialsPage = <ExactMaterialsV2 {...common} />
  const analyticsPage = <ExactAnalytics courseId={courseId} classId={classId} classes={classes} onNavigate={navigate} notify={notify} />
  const content = <Routes>
    <Route path="dashboard" element={dashboard} />
    <Route path="courses" element={<ExactCourses courses={bootstrap.courses} onReload={refresh} onCourse={chooseCourse} onNavigate={navigate} />} />
    <Route path="courses/new" element={<ExactCreateCourse teacher={bootstrap.teacher} onDone={courseCreated} onCancel={() => navigate('courses')} />} />
    <Route path="classes" element={<Navigate to="/teacher/courses" replace />} />
    <Route path="tasks" element={<Navigate to="/teacher/courses" replace />} />
    <Route path="materials" element={<Navigate to="/teacher/courses" replace />} />
    <Route path="analytics" element={<Navigate to="/teacher/courses" replace />} />
    <Route path="settings" element={<ExactSettings courseId={courseId} classId={classId} onNavigate={navigate} notify={notify} teacher={bootstrap.teacher} />} />
    <Route path="courses/:courseId/workspace" element={<ExactWorkspace {...common} />} />
    <Route path="courses/:courseId/content" element={<ExactCourseContent {...common} />} />
    <Route path="courses/:courseId/classes" element={classesPage} />
    <Route path="courses/:courseId/invite" element={<ExactInvite {...common} />} />
    <Route path="courses/:courseId/tasks" element={tasksPage} />
    <Route path="courses/:courseId/materials" element={materialsPage} />
    <Route path="courses/:courseId/graph" element={<ExactGraphV2 {...common} />} />
    <Route path="courses/:courseId/monitor" element={<ExactMonitor courseId={courseId} classId={classId} onNavigate={navigate} notify={notify} />} />
    <Route path="courses/:courseId/grading" element={<ExactGrading courseId={courseId} classId={classId} onNavigate={navigate} notify={notify} />} />
    <Route path="courses/:courseId/analytics" element={analyticsPage} />
    <Route path="courses/:courseId/ai-assistant" element={<ExactTeacherAiAssistant courseId={courseId} classId={classId} courses={bootstrap.courses} classes={classes} onNavigate={navigate} />} />
    <Route path="courses/:courseId/reviews" element={<ExactReviews courseId={courseId} classId={classId} onNavigate={navigate} notify={notify} />} />
    <Route path="courses/:courseId/course-settings" element={<ExactCourseSettings {...common} />} />
    <Route path="*" element={<Navigate to="/teacher/dashboard" replace />} />
  </Routes>

  return <>
    {contextHolder}
    <ExactShell
      authUser={authUser}
      view={new URLSearchParams(location.search).get('discussion') === '1' ? 'discussion' : view}
      courseMode={matchedRoute.courseMode}
      courses={bootstrap.courses}
      classes={classes}
      courseId={courseId}
      classId={classId}
      notificationCount={bootstrap.notifications.filter((item) => !item.read).length}
      onNavigate={navigate}
      onCourse={chooseCourse}
      onClass={setClassId}
      onNotifications={() => setNoticeOpen(true)}
      onLogout={onLogout}
    >
      {error && <Alert className="exact-inline-error" type="warning" showIcon message={error} action={<Button size="small" onClick={() => void load()}>重新加载</Button>} />}
      {content}
    </ExactShell>
    <Drawer title="通知中心" open={noticeOpen} onClose={() => setNoticeOpen(false)} size="large">
      <div className="exact-notifications">{bootstrap.notifications.map((item) => <button key={item.id} onClick={() => readNotice(item.id)}><span className={item.read ? '' : 'unread'} />{item.type === 'ai' ? <Tag color="purple">AI</Tag> : item.type === 'risk' ? <Tag color="red">预警</Tag> : <Tag color="green">任务</Tag>}<div><strong>{item.title}</strong><Text>{item.content}</Text><small>{item.created_at.slice(0,16).replace('T',' ')}</small></div>{item.read && <CheckCircle2 size={15} />}</button>)}</div>
    </Drawer>
  </>
}
