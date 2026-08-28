import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Avatar, Button, Checkbox, Col, Drawer, Form, Input, InputNumber, Modal,
  Progress, QRCode, Radio, Row, Segmented, Select, Space, Steps, Switch, Table, Tabs, Tag,
  Typography, Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeft, BarChart3, Bell, BookOpen, BrainCircuit, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck,
  Clock3, Code2, Copy, Database, Download, Edit3, Eye, FileCode2, FileText,
  Folder, GitBranch, Globe2, Link2, ListChecks, Megaphone, MessageSquareText, Network, Pin, Plus,
  QrCode, RefreshCw, Save, Search, Send, Settings, SlidersHorizontal, Sparkles, UploadCloud, UserPlus,
  Users, WandSparkles,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  api, type ApiAnnouncement, type ApiClass, type ApiClassJoinStatus, type ApiCourse, type ApiDiscussion, type ApiMaterial,
  type ApiStudent, type ApiTask, type ApiTeacher,
} from '../api'
import type { ExactView } from './components'
import { CourseBreadcrumb, EmptyPanel, PageLoader } from './components'

const { Text, Title, Paragraph } = Typography

function parseStudentCsv(text: string) {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!rows.length) return []
  const split = (line: string) => {
    const values: string[] = []
    let current = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1 }
      else if (character === '"') quoted = !quoted
      else if (character === ',' && !quoted) { values.push(current.trim()); current = '' }
      else current += character
    }
    values.push(current.trim())
    return values
  }
  const first = split(rows[0]).map((value) => value.toLowerCase())
  const hasHeader = first.some((value) => ['姓名', 'name', '学号', 'number', 'student_number'].includes(value))
  const nameIndex = Math.max(0, first.findIndex((value) => ['姓名', 'name'].includes(value)))
  const numberIndex = first.findIndex((value) => ['学号', 'number', 'student_number'].includes(value))
  return rows.slice(hasHeader ? 1 : 0).map(split).map((columns) => ({
    name: columns[nameIndex]?.trim() || '',
    number: columns[numberIndex >= 0 ? numberIndex : 1]?.trim() || '',
  })).filter((row) => row.name && row.number)
}

interface CommonProps {
  courseId: string
  classId: string
  courses: ApiCourse[]
  classes: ApiClass[]
  teacher: ApiTeacher
  onNavigate: (view: ExactView) => void
  onRefresh: () => void | Promise<void>
  notify: (text: string) => void
}

export function ExactWorkspace(props: CommonProps) {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const [dashboard, setDashboard] = useState<any>(null)
  const [materials, setMaterials] = useState<ApiMaterial[]>([])
  const [discussionOpen, setDiscussionOpen] = useState(false)
  const [discussions, setDiscussions] = useState<ApiDiscussion[]>([])
  const [discussionLoading, setDiscussionLoading] = useState(false)
  const [discussionMode, setDiscussionMode] = useState<'home' | 'create' | 'live' | 'history'>('home')
  const [selectedDiscussionId, setSelectedDiscussionId] = useState('')
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [announcements, setAnnouncements] = useState<ApiAnnouncement[]>([])
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState('')
  const [announcementFilter, setAnnouncementFilter] = useState<'all' | 'unread'>('all')
  const [discussionForm] = Form.useForm()
  const course = props.courses.find((item) => item.id === props.courseId)
  const courseClasses = props.classes.filter((item) => item.course_id === props.courseId)

  useEffect(() => {
    api.dashboard(props.courseId, props.classId).then(setDashboard)
    api.materials(props.courseId).then(setMaterials)
  }, [props.courseId, props.classId])

  useEffect(() => {
    api.announcements(props.courseId)
      .then(setAnnouncements)
      .catch((reason: any) => props.notify(reason.message || '课程公告加载失败'))
    setSelectedAnnouncementId('')
    setAnnouncementFilter('all')
  }, [props.courseId])

  const loadDiscussions = async (quiet = false) => {
    if (!quiet) setDiscussionLoading(true)
    try {
      const rows = await api.discussions(props.courseId)
      setDiscussions(rows)
      setSelectedDiscussionId((current) => current && rows.some((item) => item.id === current) ? current : '')
      return rows
    } catch (reason: any) {
      props.notify(reason.message || '课堂讨论加载失败')
      return [] as ApiDiscussion[]
    } finally {
      if (!quiet) setDiscussionLoading(false)
    }
  }

  const openDiscussion = () => {
    setDiscussionOpen(true)
    setDiscussionMode('home')
    setSelectedDiscussionId('')
    discussionForm.setFieldsValue({ class_id: props.classId, publish: true })
    void loadDiscussions().then((rows) => {
      const active = rows?.find((item) => item.status === 'published')
      if (!active) return
      setSelectedDiscussionId(active.id)
      setDiscussionMode('live')
    })
  }

  const closeDiscussion = () => {
    setDiscussionOpen(false)
    if (new URLSearchParams(location.search).get('discussion') === '1') {
      routerNavigate(location.pathname, { replace: true })
    }
  }

  useEffect(() => {
    if (new URLSearchParams(location.search).get('discussion') === '1') openDiscussion()
  }, [location.search])

  useEffect(() => {
    if (!discussionOpen || discussionMode !== 'live' || !selectedDiscussionId) return
    const timer = window.setInterval(() => void loadDiscussions(true), 2000)
    return () => window.clearInterval(timer)
  }, [discussionMode, discussionOpen, selectedDiscussionId, props.courseId])

  const saveDiscussion = async () => {
    try {
      const values = await discussionForm.validateFields()
      setDiscussionLoading(true)
      const created = await api.createDiscussion({
        course_id: props.courseId,
        class_id: values.class_id,
        title: values.title,
        content: values.content,
        publish: !!values.publish,
      })
      props.notify(created.status === 'published' ? '课堂讨论已发布，学生端已收到' : '课堂讨论已保存为草稿')
      discussionForm.resetFields()
      discussionForm.setFieldsValue({ class_id: values.class_id, publish: true })
      setSelectedDiscussionId(created.id)
      setDiscussionMode(created.status === 'published' ? 'live' : 'home')
      await loadDiscussions(true)
    } catch (reason: any) {
      if (reason?.errorFields) return
      props.notify(reason.message || '课堂讨论保存失败')
    } finally {
      setDiscussionLoading(false)
    }
  }

  const publishDiscussion = async (discussionId: string) => {
    setDiscussionLoading(true)
    try {
      const updated = await api.publishDiscussion(discussionId)
      props.notify('讨论已发布给学生端')
      setSelectedDiscussionId(updated.id)
      setDiscussionMode('live')
      await loadDiscussions(true)
    } catch (reason: any) {
      props.notify(reason.message || '讨论发布失败')
    } finally {
      setDiscussionLoading(false)
    }
  }

  const endDiscussion = async (discussionId: string) => {
    setDiscussionLoading(true)
    try {
      await api.endDiscussion(discussionId)
      props.notify('本次课堂讨论已结束并生成历史记录')
      setSelectedDiscussionId('')
      setDiscussionMode('home')
      await loadDiscussions(true)
    } catch (reason: any) {
      props.notify(reason.message || '结束讨论失败')
    } finally {
      setDiscussionLoading(false)
    }
  }

  const openRecentTask = (taskId: string) => {
    sessionStorage.setItem('codetrack:focus-task', taskId)
    props.onNavigate('tasks')
  }

  const openAnnouncementCenter = () => {
    setSelectedAnnouncementId('')
    setAnnouncementFilter('all')
    setAnnouncementOpen(true)
  }

  const openAnnouncement = (announcementId: string) => {
    setAnnouncementOpen(true)
    setSelectedAnnouncementId(announcementId)
    if (announcements.find((item) => item.id === announcementId)?.read) return
    api.markAnnouncementRead(announcementId)
      .then(() => setAnnouncements((current) => current.map((item) => item.id === announcementId ? { ...item, read: true } : item)))
      .catch((reason: any) => props.notify(reason.message || '公告已读状态保存失败'))
  }

  if (!dashboard) return <PageLoader />

  const metrics = [
    ['学生总数', course?.students || 0, '较上周 ↑ 4', Users, 'classes'],
    ['进行中任务', dashboard.summary.active_tasks, '较上周 ↑ 2', ClipboardCheck, 'tasks'],
    ['资料数量', materials.length, '较上周 ↑ 6', FileText, 'materials'],
    ['未提交提醒', dashboard.summary.overdue_students, '较上周 ↓ 3', Bell, 'monitor'],
    ['平均学习进度', dashboard.summary.completion_rate + '%', '较上周 ↑ 5%', BarChart3, 'analytics'],
    ['优秀率', '28%', '较上周 ↑ 3%', MessageSquareText, 'analytics'],
  ]

  const materialCounts = [0, 0, 0, 0]
  materials.forEach((item) => {
    const content = item.title + ' ' + item.chapter + ' ' + item.type
    if (/实验|代码|案例/.test(content)) materialCounts[1] += 1
    else if (/拓展|视频|阅读|参考/.test(content)) materialCounts[2] += 1
    else if (/其他|链接|压缩/.test(content)) materialCounts[3] += 1
    else materialCounts[0] += 1
  })
  const materialStats = [
    { label: '课程资料', value: materialCounts[0], color: '#1677ff' },
    { label: '实验资料', value: materialCounts[1], color: '#06b6d4' },
    { label: '拓展资料', value: materialCounts[2], color: '#6366f1' },
    { label: '其他资料', value: materialCounts[3], color: '#94a3b8' },
  ]
  const materialTotal = materialStats.reduce((sum, item) => sum + item.value, 0)
  const materialChart = materialTotal ? materialStats : [{ label: '暂无资料', value: 1, color: '#e2e8f0' }]
  const activeDiscussions = discussions.filter((item) => item.status === 'published')
  const historyDiscussions = discussions.filter((item) => item.status === 'ended')
  const draftDiscussions = discussions.filter((item) => item.status === 'draft')
  const selectedDiscussion = discussions.find((item) => item.id === selectedDiscussionId)
  const selectedAnnouncement = announcements.find((item) => item.id === selectedAnnouncementId)
  const unreadAnnouncementCount = announcements.filter((item) => !item.read).length
  const visibleAnnouncements = announcementFilter === 'unread'
    ? announcements.filter((item) => !item.read)
    : announcements
  const selectedAnnouncementIndex = selectedAnnouncement
    ? announcements.findIndex((item) => item.id === selectedAnnouncement.id)
    : -1

  return <div className="exact-course-page exact-workspace">
    <div className="workspace-heading">
      <div className="workspace-course-title">
        <img src="/ui-assets/workspace-course-icon.png" alt="" />
        <div>
          <div className="workspace-title-line"><Title level={2}>{course?.name || '未命名课程'}</Title><Tag color="green">{course?.term || '当前学期'}</Tag></div>
          <div className="workspace-course-meta"><Text type="secondary">课程代码：{course?.code}</Text><Text type="secondary">授课教师：{props.teacher.name}</Text><Text type="secondary">开课院系：{props.teacher.department}</Text></div>
        </div>
      </div>
      <Button icon={<Settings size={15} />} onClick={() => props.onNavigate('course-settings')}>课程设置</Button>
    </div>

    <div className="workspace-metrics">{metrics.map(([label,value,detail,Icon,target]) => <button key={label as string} onClick={() => props.onNavigate(target as ExactView)}><span><Icon size={19} /></span><small>{label as string}</small><strong>{value as string | number}</strong><em>{detail as string}</em></button>)}</div>

    <div className="workspace-board">
      <section className="exact-block workspace-panel workspace-announcements">
        <div className="exact-block-title"><strong><Bell size={14} /> 课程公告 {unreadAnnouncementCount > 0 && <em>{unreadAnnouncementCount}</em>}</strong><Button type="link" onClick={openAnnouncementCenter}>更多 <ChevronRight size={13} /></Button></div>
        <div className="workspace-panel-body">{announcements.slice(0, 3).map((item) => <button type="button" className={`workspace-list-row ${item.read ? 'is-read' : 'is-unread'}`} key={item.id} onClick={() => openAnnouncement(item.id)}>
          <span className="dot" />
          <div><strong>{item.pinned && <Tag color="orange">置顶</Tag>}{item.title}</strong><small>{item.summary}</small></div>
          <time>{item.date}</time>
        </button>)}</div>
        <Button className="workspace-panel-more" type="link" onClick={openAnnouncementCenter}>查看全部公告 <ChevronRight size={13} /></Button>
      </section>

      <section className="exact-block workspace-panel workspace-recent-tasks">
        <div className="exact-block-title"><strong>最近任务</strong><Button type="link" onClick={() => props.onNavigate('tasks')}>更多 <ChevronRight size={13} /></Button></div>
        <div className="workspace-panel-body">{dashboard.recent_tasks.slice(0, 4).map((task: ApiTask,index: number) => <button className="workspace-task" key={task.id} onClick={() => openRecentTask(task.id)}>
          <span className={'task-square q' + index}><FileCode2 size={15} /></span>
          <div><strong>{task.title}</strong><small>截止 {task.due_at.slice(5,16).replace('T',' ')}</small></div>
          <Tag color={task.status === 'published' ? 'green' : task.status === 'closed' ? 'default' : 'gold'}>{task.status === 'published' ? '进行中' : task.status === 'closed' ? '已结束' : '草稿'}</Tag>
        </button>)}
        {!dashboard.recent_tasks.length && <div className="workspace-panel-empty">暂无最近任务</div>}</div>
        <Button className="workspace-panel-more" type="link" onClick={() => props.onNavigate('tasks')}>查看全部任务 <ChevronRight size={13} /></Button>
      </section>

      <section className="exact-block workspace-panel workspace-materials">
        <div className="exact-block-title"><strong><FileText size={14} /> 资料状态</strong><Button type="link" onClick={() => props.onNavigate('materials')}>更多 <ChevronRight size={13} /></Button></div>
        <div className="workspace-material-summary">
          <div className="material-donut"><div className="material-donut-ring" style={{ background: `conic-gradient(${materialChart.map((item, index) => `${item.color} ${materialChart.slice(0, index).reduce((sum, prev) => sum + prev.value, 0) / Math.max(materialChart.reduce((sum, current) => sum + current.value, 0), 1) * 100}% ${(materialChart.slice(0, index).reduce((sum, prev) => sum + prev.value, 0) + item.value) / Math.max(materialChart.reduce((sum, current) => sum + current.value, 0), 1) * 100}%`).join(', ')})` }} /><span><strong>{materialTotal}</strong><small>总资料数</small></span></div>
          <div className="material-legends">{materialStats.map((item) => <div className="material-legend" key={item.label}><i style={{ background: item.color }} />{item.label}<b>{item.value}</b><small>{materialTotal ? Math.round(item.value / materialTotal * 100) : 0}%</small></div>)}</div>
        </div>
        <Button className="workspace-panel-more" type="link" onClick={() => props.onNavigate('materials')}>查看全部资料 <ChevronRight size={13} /></Button>
      </section>

      <section className="exact-block workspace-panel workspace-quick-panel">
        <div className="exact-block-title"><strong>快捷操作</strong></div>
        <div className="workspace-quick">{[['新建作业','tasks',ClipboardCheck],['上传资料','materials',UploadCloud],['邀请学生','invite',UserPlus],['课堂讨论','discussion',MessageSquareText]].map(([label,target,Icon], index) => <button key={label as string} onClick={() => props.onNavigate(target as ExactView)}><span className={'quick-icon q' + index}><Icon size={22} /></span>{label as string}</button>)}</div>
      </section>

      <section className="exact-block workspace-panel workspace-class-panel">
        <div className="exact-block-title"><strong>班级概况</strong><Button type="link" onClick={() => props.onNavigate('classes')}>更多 <ChevronRight size={13} /></Button></div>
        <div className="workspace-panel-body">{courseClasses.slice(0,3).map((item) => <div className="workspace-class" key={item.id}><span><Users size={15} /></span><div><strong>{item.name}</strong><small>{item.students} 名学生</small></div><div><small>平均进度</small><b>{item.completion || 0}%</b></div><div><small>平均分</small><b>{item.students ? '82.5' : '--'}</b></div></div>)}
        {!courseClasses.length && <div className="workspace-panel-empty">当前课程还没有班级</div>}</div>
      </section>

      <section className="exact-block workspace-panel workspace-ai">
        <div className="exact-block-title"><strong><Sparkles size={14} /> AI 进度分析</strong><Text type="secondary">基于学习行为与任务数据</Text></div>
        <div><Tag color="red">软件工程 2 班</Tag><strong>边界条件错误集中</strong></div>
        <div><Tag color="gold">计算机科学 1 班</Tag><strong>提示依赖偏高</strong></div>
        <div><Tag color="green">软件工程 1 班</Tag><strong>任务完成率回升</strong></div>
        <Button className="workspace-panel-more" type="link" onClick={() => props.onNavigate('analytics')}>查看完整分析 <ChevronRight size={13} /></Button>
      </section>
    </div>

    <Drawer
      rootClassName="workspace-announcement-drawer"
      title={<span><Megaphone size={18} /> 课程公告</span>}
      placement="right"
      open={announcementOpen}
      onClose={() => setAnnouncementOpen(false)}
      width={500}
    >
      {!selectedAnnouncement ? <div className="announcement-center">
        <header className="announcement-center-head">
          <div><strong>{course?.name || '当前课程'}</strong><small>{unreadAnnouncementCount ? `${unreadAnnouncementCount} 条公告未读` : '公告已全部读完'}</small></div>
          <Segmented value={announcementFilter} onChange={(value) => setAnnouncementFilter(value as 'all' | 'unread')} options={[{ label: `全部 ${announcements.length}`, value: 'all' }, { label: `未读 ${unreadAnnouncementCount}`, value: 'unread' }]} />
        </header>
        <div className="announcement-center-list">
          {visibleAnnouncements.map((item) => {
            const read = item.read
            return <button type="button" className={read ? 'is-read' : 'is-unread'} key={item.id} onClick={() => openAnnouncement(item.id)}>
              <span className="announcement-state">{item.pinned ? <Pin size={14} /> : <i />}</span>
              <div><strong>{item.title}</strong><p>{item.summary}</p><small>{item.author} · {item.audience}</small></div>
              <time>{item.date}<ChevronRight size={14} /></time>
            </button>
          })}
          {!visibleAnnouncements.length && <div className="announcement-empty"><CheckCircle2 size={30} /><strong>没有未读公告</strong><p>新公告发布后会显示在这里。</p></div>}
        </div>
      </div> : <article className="announcement-detail">
        <button type="button" className="announcement-back" onClick={() => setSelectedAnnouncementId('')}><ArrowLeft size={15} /> 返回公告列表</button>
        <div className="announcement-detail-heading">
          <div>{selectedAnnouncement.pinned && <Tag color="orange" icon={<Pin size={11} />}>置顶公告</Tag>}<Tag color="green">已读</Tag></div>
          <h2>{selectedAnnouncement.title}</h2>
          <p><span>{selectedAnnouncement.author}</span><span>{selectedAnnouncement.published_at}</span></p>
        </div>
        <div className="announcement-detail-content">{selectedAnnouncement.content.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        <div className="announcement-audience"><Users size={15} /><span><small>接收范围</small><strong>{selectedAnnouncement.audience}</strong></span></div>
        <footer className="announcement-detail-nav">
          <Button disabled={selectedAnnouncementIndex <= 0} icon={<ChevronLeft size={14} />} onClick={() => openAnnouncement(announcements[selectedAnnouncementIndex - 1].id)}>上一篇</Button>
          <span>{selectedAnnouncementIndex + 1} / {announcements.length}</span>
          <Button disabled={selectedAnnouncementIndex >= announcements.length - 1} onClick={() => openAnnouncement(announcements[selectedAnnouncementIndex + 1].id)}>下一篇 <ChevronRight size={14} /></Button>
        </footer>
      </article>}
    </Drawer>

    <Drawer
      rootClassName={'workspace-discussion-drawer ' + (discussionMode === 'live' ? 'is-live' : '')}
      title={discussionMode === 'live' ? undefined : <span><MessageSquareText size={18} /> 课堂讨论</span>}
      placement="right"
      open={discussionOpen}
      onClose={closeDiscussion}
      width="32vw"
      closable={discussionMode !== 'live'}
      destroyOnHidden
    >
      {discussionMode === 'home' && <div className="discussion-hub">
        <div className="discussion-hub-actions"><div><strong>课堂交流平台</strong><small>发起讨论并实时查看学生观点。</small></div><Button type="primary" icon={<Plus size={14} />} onClick={() => setDiscussionMode('create')}>发起讨论</Button></div>
        {!!activeDiscussions.length && <section className="discussion-hub-section active"><header><span><i />正在进行</span><b>{activeDiscussions.length}</b></header>{activeDiscussions.map((item) => <button key={item.id} onClick={() => { setSelectedDiscussionId(item.id); setDiscussionMode('live') }}><span><strong>{item.title}</strong><small>{item.class_name} · {item.participant_count} 人参与 · {item.reply_count} 条回复</small></span><ChevronRight size={15} /></button>)}</section>}
        {!!draftDiscussions.length && <section className="discussion-hub-section drafts"><header><span>讨论草稿</span><b>{draftDiscussions.length}</b></header>{draftDiscussions.map((item) => <button key={item.id} onClick={() => publishDiscussion(item.id)}><span><strong>{item.title}</strong><small>{item.class_name} · 点击发布并进入讨论</small></span><Tag>草稿</Tag></button>)}</section>}
        <section className="discussion-hub-section history"><header><span>历史记录</span><b>{historyDiscussions.length}</b></header>{!historyDiscussions.length && <div className="discussion-hub-empty">结束后的课堂讨论会保存在这里</div>}{historyDiscussions.map((item) => <button key={item.id} onClick={() => { setSelectedDiscussionId(item.id); setDiscussionMode('history') }}><span><strong>{item.title}</strong><small>{item.class_name} · {item.reply_count} 条讨论记录</small></span><ChevronRight size={15} /></button>)}</section>
      </div>}

      {discussionMode === 'create' && <section className="discussion-compose">
        <div className="discussion-card-back"><Button type="text" onClick={() => setDiscussionMode('home')}>‹ 返回讨论列表</Button><Button href="/student/discussions" target="_blank" icon={<Eye size={14} />}>预览学生端</Button></div>
        <Form form={discussionForm} layout="vertical">
          <Form.Item label="发布班级" name="class_id" rules={[{ required: true, message: '请选择班级' }]}><Select options={courseClasses.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
          <Form.Item label="讨论主题" name="title" rules={[{ required: true, message: '请输入讨论主题' }]}><Input maxLength={160} showCount placeholder="例如：为什么链表插入不需要移动其他元素？" /></Form.Item>
          <Form.Item label="讨论内容" name="content" rules={[{ required: true, message: '请输入讨论内容' }]}><Input.TextArea rows={5} maxLength={2000} showCount placeholder="说明讨论背景、需要学生思考的问题，以及回复要求。" /></Form.Item>
          <Form.Item label="学生端可见性" name="publish" valuePropName="checked"><Switch checkedChildren="发布后进入讨论" unCheckedChildren="仅保存草稿" /></Form.Item>
          <Button type="primary" block loading={discussionLoading} icon={<Send size={15} />} onClick={saveDiscussion}>发布课堂讨论</Button>
        </Form>
      </section>}

      {(discussionMode === 'live' || discussionMode === 'history') && selectedDiscussion && <section className={'discussion-live ' + (discussionMode === 'history' ? 'is-history' : 'is-live')}>
        {discussionMode === 'history' && <div className="discussion-card-back"><Button type="text" onClick={() => { setDiscussionMode('home'); setSelectedDiscussionId('') }}>‹ 返回讨论列表</Button><Tag>已结束</Tag></div>}
        <div className="discussion-live-topic"><small>{selectedDiscussion.class_name}</small><Title level={4}>{selectedDiscussion.title}</Title><p>{selectedDiscussion.content}</p><div><span><Users size={14} /> {selectedDiscussion.participant_count} 人参与</span><span><MessageSquareText size={14} /> {selectedDiscussion.reply_count} 条回复</span>{discussionMode === 'live' && <em><i />实时更新</em>}</div></div>
        <div className="discussion-live-feed"><header><strong>学生讨论内容</strong><Button type="text" icon={<RefreshCw size={13} />} onClick={() => loadDiscussions(true)}>刷新</Button></header>{!selectedDiscussion.replies.length && <div className="discussion-live-empty"><MessageSquareText size={24} /><strong>等待学生参与</strong><small>学生提交观点后会实时显示在这里。</small></div>}{selectedDiscussion.replies.map((reply) => <div className="discussion-live-reply" key={reply.id}><Avatar size={30}>{reply.student_name.slice(0,1)}</Avatar><span><header><b>{reply.student_name}</b><time>{reply.created_at.slice(11,16)}</time></header><p>{reply.content}</p></span></div>)}</div>
        {discussionMode === 'live' && <Button className="discussion-end-button" danger block loading={discussionLoading} onClick={() => endDiscussion(selectedDiscussion.id)}>结束讨论</Button>}
      </section>}
    </Drawer>
  </div>
}

export function ExactCourseSettings(props: CommonProps) {
  const course = props.courses.find((item) => item.id === props.courseId)
  const courseClasses = props.classes.filter((item) => item.course_id === props.courseId)
  const [form] = Form.useForm()
  const [status, setStatus] = useState(course?.status || 'preparing')
  const [studentVisible, setStudentVisible] = useState(course?.student_visible ?? true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!course) return
    form.setFieldsValue({ name: course.name, code: course.code, term: course.term, description: course.description })
    setStatus(course.status)
    setStudentVisible(course.student_visible)
  }, [course?.id, course?.updated_at])

  const save = async () => {
    if (!course) return
    setSaving(true)
    try {
      const values = await form.validateFields()
      await api.updateCourse(course.id, {
        name: values.name,
        term: values.term,
        description: values.description,
        status,
        student_visible: studentVisible,
      })
      await props.onRefresh()
      props.notify(status === 'preparing' ? '课程设置已保存为草稿' : '课程设置已保存')
    } catch (reason: any) {
      if (reason?.errorFields) return
      props.notify(reason.message || '课程设置保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (!course) return <EmptyPanel text="未找到要管理的课程" />

  const statusLabels: Record<string, string> = { active: '进行中', preparing: '草稿', archived: '已归档' }
  return <div className="exact-course-page course-settings-page">
    <div className="course-settings-heading">
      <div><CourseBreadcrumb current="课程设置" onNavigate={props.onNavigate} /><Title level={2}>管理课程</Title><Text type="secondary">编辑课程基础信息、发布状态和学生端可见范围。</Text></div>
      <Tag color={status === 'active' ? 'green' : status === 'preparing' ? 'gold' : 'default'}>{statusLabels[status] || status}</Tag>
    </div>
    <div className="course-settings-layout">
      <aside>
        <div className="course-settings-summary"><span><BookOpen size={19} /></span><strong>{course.name}</strong><small>{course.code} · {course.term}</small></div>
        <Tabs tabPosition="left" activeKey="basic" items={[{ key: 'basic', label: '基础设置' }, { key: 'status', label: '发布状态' }, { key: 'visibility', label: '可见性' }, { key: 'classes', label: '授课班级' }]} />
        <Button block onClick={() => props.onNavigate('workspace')}>返回课程首页</Button>
      </aside>
      <main>
        <section className="course-setting-card course-status-manager">
          <header><span><SlidersHorizontal size={18} /></span><div><strong>课程状态</strong><small>草稿不会作为进行中课程展示，归档课程保留历史数据。</small></div><Tag color={status === 'active' ? 'green' : status === 'preparing' ? 'gold' : 'default'}>{statusLabels[status]}</Tag></header>
          <Segmented block value={status} onChange={(value) => setStatus(String(value))} options={[{ value: 'active', label: '进行中' }, { value: 'preparing', label: '保存为草稿' }, { value: 'archived', label: '归档' }]} />
          <div className="course-status-explain">{[['active','学生可以正常访问课程'],['preparing','教师继续完善课程内容'],['archived','保留数据但停止教学']].map(([key, text]) => <span className={status === key ? 'active' : ''} key={key}><i /><b>{statusLabels[key]}</b><small>{text}</small></span>)}</div>
        </section>
        <section className="course-setting-card">
          <header><span><Settings size={18} /></span><div><strong>基础信息</strong><small>课程名称、学期与简介将同步到课程卡片。</small></div></header>
          <Form form={form} layout="vertical" requiredMark={false}>
            <div className="course-setting-grid"><Form.Item label="课程名称" name="name" rules={[{ required: true, message: '请输入课程名称' }]}><Input maxLength={160} /></Form.Item><Form.Item label="课程代码" name="code"><Input disabled /></Form.Item><Form.Item label="开课学期" name="term"><Input /></Form.Item></div>
            <Form.Item label="课程简介" name="description"><Input.TextArea rows={4} maxLength={500} showCount /></Form.Item>
          </Form>
        </section>
        <section className="course-setting-card">
          <header><span><Globe2 size={18} /></span><div><strong>学生端可见性</strong><small>控制学生能否在课程列表中看到并进入本课程。</small></div></header>
          <div className="course-setting-switches compact"><label><span><b>学生可见</b><small>关闭后教师仍可继续编辑，学生暂时无法访问。</small></span><Switch checked={studentVisible} onChange={setStudentVisible} /></label></div>
        </section>
        <section className="course-setting-card course-management-classes">
          <header><span><Users size={18} /></span><div><strong>授课班级</strong><small>当前课程已关联 {courseClasses.length} 个教学班。</small></div><Button size="small" onClick={() => props.onNavigate('classes')}>管理班级</Button></header>
          <div className="course-management-class-list">{courseClasses.slice(0, 5).map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.grade} · {item.major}</small></span><b>{item.students} 名学生</b><Tag color={item.status === 'active' ? 'green' : 'default'}>{item.status === 'active' ? '授课中' : '未开始'}</Tag></div>)}{!courseClasses.length && <div className="course-settings-empty">当前课程暂未创建班级</div>}</div>
        </section>
        <div className="course-settings-actions"><span><CheckCircle2 size={14} />所有更改将在保存后生效</span><Button onClick={() => props.onNavigate('workspace')}>取消</Button><Button type="primary" icon={<Save size={15} />} loading={saving} onClick={save}>保存设置</Button></div>
      </main>
    </div>
  </div>
}
export function ExactClasses(props: CommonProps) {
  const [groups, setGroups] = useState<ApiClass[]>([])
  const [selected, setSelected] = useState<ApiClass | null>(null)
  const [students, setStudents] = useState<ApiStudent[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const load = () => api.classes(props.courseId).then((items) => {
    setGroups(items)
    setSelected((current) => current && items.find((item) => item.id === current.id) || items[0] || null)
  })
  useEffect(() => { void load() }, [props.courseId])
  useEffect(() => { if (selected) api.students(selected.id).then(setStudents) }, [selected?.id])
  const create = async () => {
    setSaving(true)
    try {
      await api.createClass({ course_id: props.courseId, ...form.getFieldsValue() })
      props.notify('教学班已创建')
      setCreateOpen(false); form.resetFields(); load(); props.onRefresh()
    } catch (reason: any) { props.notify(reason.message) } finally { setSaving(false) }
  }
  if (!groups.length) return <PageLoader />
  const columns: ColumnsType<ApiStudent> = [
    { title: '学生', render: (_,row) => <Space><Avatar size={28} className="exact-avatar">{row.name.slice(-1)}</Avatar><span><Text strong>{row.name}</Text><small>{row.number}</small></span></Space> },
    { title: '课程进度', dataIndex: 'progress', render: (value) => <Progress percent={value} size="small" /> },
    { title: '平均分', dataIndex: 'score' },
    { title: '状态', dataIndex: 'status', render: (value) => <Tag color={value === 'risk' ? 'red' : value === 'attention' ? 'gold' : 'green'}>{value === 'risk' ? '高风险' : value === 'attention' ? '需关注' : '正常'}</Tag> },
    { title: '最近活跃', dataIndex: 'last_active' },
  ]
  return <div className="exact-course-page exact-classes-page">
    <div className="exact-page-title"><div><Text type="secondary">课程工作空间 / 班级管理</Text><Title level={2}>班级管理</Title><Text type="secondary">管理教学班级与学生，查看班级整体学习情况。</Text></div><Button type="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>新建班级</Button></div>
    <div className="classes-layout">
      <main>
        <div className="classes-toolbar"><Input prefix={<Search size={15} />} placeholder="搜索班级名称" /><Select defaultValue="all" options={[{ value: 'all', label: '全部班级' }]} /><Select defaultValue="active" options={[{ value: 'active', label: '全部状态' }]} /></div>
        <div className="class-cards">{groups.map((item,index) => <article className={selected?.id === item.id ? 'active' : ''} key={item.id} role="button" tabIndex={0} onClick={() => setSelected(item)}><span className={'class-art c' + index}><Code2 size={27} /></span><div><Space><Title level={4}>{item.name}</Title><Tag color="green">进行中</Tag></Space><div className="class-info"><span><small>学生人数</small><b>{item.students} 人</b></span><span><small>班级完成率</small><b>{item.completion || 76}%</b></span><span><small>课程进度</small><b>第 6 周</b></span><span><small>班主任</small><b>{item.mentor}</b></span></div><div className="class-footer"><span>最近任务完成率</span><Progress percent={item.completion || 76} size="small" /></div></div><span className="class-actions"><Button size="small" type="primary" onClick={(event) => { event.stopPropagation(); setSelected(item); props.onNavigate('invite') }}>邀请学生</Button><Button size="small">班级设置</Button></span></article>)}</div>
      </main>
      <aside>
        <button className="aside-close">×</button>
        <div className="class-banner"><img src="/ui-assets/class-banner.png" alt="" /></div>
        <Space><Title level={3}>{selected?.name}</Title><Tag color="green">进行中</Tag></Space>
        <div className="class-summary"><span><small>班级编号</small><b>{selected?.id}</b></span><span><small>已加入学生</small><b>{selected?.students} 人</b></span><span><small>开课时间</small><b>2024-09-01</b></span><span><small>授课教师</small><b>{selected?.mentor}</b></span></div>
        <div className="exact-block-title"><strong>班级整体情况</strong><Button type="link">查看详情</Button></div>
        <div className="class-trends"><span><small>任务完成率</small><strong>{selected?.completion || 82}%</strong><em>↑ 12%</em></span><span><small>学生参与率</small><strong>{selected?.active_rate || 76}%</strong><em>↑ 7%</em></span></div>
        <div className="exact-block-title"><strong>学生加入记录</strong><Button type="link" onClick={() => props.onNavigate('invite')}>查看全部</Button></div>
        <div className="joined-students">{students.slice(0,5).map((student) => <div key={student.id}><Avatar size={27} className="exact-avatar">{student.name.slice(-1)}</Avatar><strong>{student.name}</strong><Tag color="green">已加入</Tag><small>{student.last_active}</small></div>)}{!students.length && ['赵同学','李同学','王同学','赵同学','陈同学'].map((name,index) => <div key={name + index}><Avatar size={28} className="exact-avatar">{name.slice(0,1)}</Avatar><strong>{name}</strong><Tag color={index < 2 ? 'gold' : 'green'}>{index < 2 ? '待审核' : '已加入'}</Tag><small>学号：20241210{index + 1}</small></div>)}</div>
        <Button type="primary" block icon={<UserPlus size={15} />} onClick={() => props.onNavigate('invite')}>邀请学生加入</Button>
      </aside>
    </div>
    <Modal title="新建教学班" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={create} confirmLoading={saving}><Form form={form} layout="vertical"><Form.Item label="班级名称" name="name" rules={[{ required: true }]}><Input placeholder="例如：软件工程 4 班" /></Form.Item><Form.Item label="上课安排" name="schedule"><Input placeholder="例如：周二 3-4 节" /></Form.Item><Form.Item label="任课教师" name="mentor" initialValue={'\u738b\u8001\u5e08'}><Input /></Form.Item></Form></Modal>
  </div>
}

export function ExactInvite(props: CommonProps) {
  const courseClasses = props.classes.filter((item) => item.course_id === props.courseId)
  const [selectedClassId, setSelectedClassId] = useState(() => sessionStorage.getItem('codetrack-selected-class-id') || props.classId)
  const selected = courseClasses.find((item) => item.id === selectedClassId) || courseClasses[0]
  const [students, setStudents] = useState<ApiStudent[]>([])
  const [joinStatus, setJoinStatus] = useState<ApiClassJoinStatus | null>(null)
  const [copied, setCopied] = useState('')
  const [joinCode, setJoinCode] = useState(selected?.join_code || '')
  const [refreshing, setRefreshing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [methodEnabled, setMethodEnabled] = useState({ link: true, qr: true, code: true })
  const inviteUrl = `${window.location.origin}/join/${joinCode}`

  useEffect(() => { if (courseClasses.some((item) => item.id === props.classId)) setSelectedClassId(props.classId) }, [props.classId, props.courseId])
  useEffect(() => {
    setJoinCode(selected?.join_code || '')
    if (selected) {
      sessionStorage.setItem('codetrack-selected-class-id', selected.id)
      Promise.all([api.students(selected.id), api.classJoinStatus(selected.id)]).then(([studentRows, status]) => {
        setStudents(studentRows)
        setJoinStatus(status)
      })
    }
  }, [selected?.id, selected?.join_code])

  const showAllJoinStatus = () => {
    if (!selected) return
    sessionStorage.setItem('codetrack-class-panel', JSON.stringify({
      courseId: props.courseId,
      classId: selected.id,
      panel: 'join-status',
      filter: 'all',
    }))
    props.onNavigate('classes')
  }

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    props.notify(label + '已复制')
    window.setTimeout(() => setCopied(''), 1800)
  }
  const regenerateCode = async () => {
    if (!selected) return
    setRefreshing(true)
    try {
      const result = await api.regenerateJoinCode(selected.id)
      setJoinCode(result.join_code)
      props.notify('班级邀请码已重新生成')
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setRefreshing(false)
    }
  }
  const downloadQr = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.invite-real-qr canvas')
    if (!canvas || !methodEnabled.qr) return
    const anchor = document.createElement('a')
    anchor.download = `${selected?.name || '班级'}-加入二维码.png`
    anchor.href = canvas.toDataURL('image/png')
    anchor.click()
  }
  const toggleMethod = (method: keyof typeof methodEnabled, checked: boolean) => {
    setMethodEnabled((current) => ({ ...current, [method]: checked }))
  }
  const importStudentFile = async (file: File) => {
    if (!selected) return false
    setImporting(true)
    try {
      const rows = parseStudentCsv(await file.text())
      if (!rows.length) throw new Error('CSV 中未识别到有效的姓名和学号')
      const result = await api.importStudents(selected.id, rows)
      props.notify(`导入完成：成功加入 ${result.enrolled} 人，跳过 ${result.skipped} 人`)
      const [studentRows, status] = await Promise.all([api.students(selected.id), api.classJoinStatus(selected.id)])
      setStudents(studentRows)
      setJoinStatus(status)
      await props.onRefresh()
    } catch (reason: any) {
      props.notify(reason.message || '学生名单导入失败')
    } finally {
      setImporting(false)
    }
    return false
  }
  const downloadImportTemplate = () => {
    const blob = new Blob(['\uFEFF姓名,学号\r\n张三,2026000001\r\n'], { type: 'text/csv;charset=utf-8' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = 'CodeTrack学生导入模板.csv'
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  return <div className="exact-course-page exact-invite">
    <div className="invite-breadcrumb"><CourseBreadcrumb current="邀请学生加入" onNavigate={props.onNavigate} /></div>
    <div className="invite-page-head"><div><Title level={2}>邀请学生加入</Title><Text type="secondary">生成班级邀请码、链接或二维码，帮助学生加入当前课程。</Text></div><Select className="invite-class-select" value={selected?.id} onChange={setSelectedClassId} suffixIcon={<Users size={15} />} options={courseClasses.map((item) => ({ value: item.id, label: item.name }))} /></div>
    <div className="invite-layout">
      <main>
        <section className="invite-method-panel">
          <div className="invite-panel-title"><strong>邀请方式</strong><Text type="secondary">三种方式均与当前班级绑定</Text></div>
          <div className="invite-methods">
            <article className={`invite-method-card link-method ${methodEnabled.link ? 'enabled' : 'disabled'}`}>
              <div className="invite-card-head"><span><Link2 size={20} /></span><strong>分享链接</strong></div>
              <p>复制链接并分享给学生，学生登录后即可申请加入班级。</p>
              <div className="invite-link-box"><code>{inviteUrl}</code><Button type="text" disabled={!methodEnabled.link} icon={<Copy size={14} />} onClick={() => copy(inviteUrl, '邀请链接')}>{copied === '邀请链接' ? '已复制' : '复制'}</Button></div>
              <Button className="invite-refresh" type="link" loading={refreshing} icon={<RefreshCw size={13} />} disabled={!methodEnabled.link} onClick={regenerateCode}>重新生成链接</Button>
              <div className="invite-method-toggle"><span><strong>允许加入课程</strong><small>{methodEnabled.link ? '分享链接当前有效' : '开启后此邀请方式才会生效'}</small></span><Switch checked={methodEnabled.link} onChange={(checked) => toggleMethod('link', checked)} /></div>
            </article>

            <article className={`invite-method-card qr-method ${methodEnabled.qr ? 'enabled' : 'disabled'}`}>
              <div className="invite-card-head"><span><QrCode size={20} /></span><strong>二维码</strong></div>
              <p>分享二维码给学生，学生扫码打开加入页面并申请加入班级。</p>
              <div className="invite-real-qr"><QRCode type="canvas" value={inviteUrl || 'CodeTrack'} size={136} bordered={false} status={methodEnabled.qr ? 'active' : 'expired'} onRefresh={() => toggleMethod('qr', true)} /></div>
              <div className="qr-actions"><Button type="text" disabled={!methodEnabled.qr} icon={<Download size={14} />} onClick={downloadQr}>下载二维码</Button><Button type="text" loading={refreshing} disabled={!methodEnabled.qr} icon={<RefreshCw size={14} />} onClick={regenerateCode}>刷新生成</Button></div>
              <div className="invite-method-toggle"><span><strong>允许加入课程</strong><small>{methodEnabled.qr ? '扫码入口当前有效' : '开启后二维码才能用于加入'}</small></span><Switch checked={methodEnabled.qr} onChange={(checked) => toggleMethod('qr', checked)} /></div>
            </article>

            <article className={`invite-method-card code-method ${methodEnabled.code ? 'enabled' : 'disabled'}`}>
              <div className="invite-card-head"><span><Code2 size={20} /></span><strong>班级邀请码</strong></div>
              <p>学生在加入页面输入邀请码，即可申请加入当前教学班。</p>
              <div className="invite-code-box"><strong>{joinCode}</strong><Button type="text" disabled={!methodEnabled.code} icon={<Copy size={14} />} onClick={() => copy(joinCode, '邀请码')}>{copied === '邀请码' ? '已复制' : '复制'}</Button></div>
              <Button className="invite-refresh" type="link" loading={refreshing} icon={<RefreshCw size={13} />} disabled={!methodEnabled.code} onClick={regenerateCode}>重新生成邀请码</Button>
              <div className="invite-method-toggle"><span><strong>允许加入课程</strong><small>{methodEnabled.code ? '邀请码当前有效' : '开启后学生才能使用邀请码'}</small></span><Switch checked={methodEnabled.code} onChange={(checked) => toggleMethod('code', checked)} /></div>
            </article>
          </div>
        </section>

        <div className="batch-import"><div><FileText size={24} /><span><strong>批量导入</strong><small>通过 CSV 文件批量导入学生列表，系统将校验姓名与学号。</small></span></div><Upload accept=".csv,text/csv" beforeUpload={importStudentFile} showUploadList={false}><Button loading={importing} icon={<UploadCloud size={15} />}>选择 CSV 文件</Button></Upload><Button type="link" icon={<Download size={14} />} onClick={downloadImportTemplate}>下载 CSV 模板</Button></div>
      </main>
      <aside>
        <div className="exact-block-title"><strong>学生加入状态</strong><Button type="link" onClick={showAllJoinStatus}>查看全部</Button></div>
        <div className="join-metrics"><span><b>{joinStatus?.summary.pending || 0}</b><small>待审核</small></span><span><b>{joinStatus?.summary.invited || 0}</b><small>已邀请</small></span><span><b>{joinStatus?.summary.joined ?? students.length}</b><small>已加入</small></span></div>
        <div className="joined-students">{students.slice(0,5).map((student) => <div key={student.id}><Avatar size={28} className="exact-avatar">{student.name.slice(-1)}</Avatar><strong>{student.name}</strong><Tag color={student.status === 'normal' ? 'green' : 'gold'}>{student.status === 'normal' ? '已加入' : '待审核'}</Tag><small>{student.number}</small></div>)}{!students.length && ['赵同学','李同学','王同学','赵同学','陈同学'].map((name,index) => <div key={name + index}><Avatar size={28} className="exact-avatar">{name.slice(0,1)}</Avatar><strong>{name}</strong><Tag color={index < 2 ? 'gold' : 'green'}>{index < 2 ? '待审核' : '已加入'}</Tag><small>学号：20241210{index + 1}</small></div>)}</div>
        <Button type="link" block onClick={showAllJoinStatus}>查看更多 <ChevronRight size={13} /></Button>
        <div className="student-invite-help"><strong>学生端预览</strong><p>学生可选择扫码、输入邀请码或打开分享链接加入课程。</p><div><span><Code2 /><small>输入邀请码</small></span><span><QrCode /><small>扫描二维码</small></span><span><Link2 /><small>链接加入</small></span></div></div>
      </aside>
    </div>
  </div>
}
export function ExactTasks(props: CommonProps) {
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [selected, setSelected] = useState<ApiTask | null>(null)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [form] = Form.useForm()
  const load = () => api.tasks(props.courseId).then((items) => { setTasks(items); setSelected((current) => current && items.find((item) => item.id === current.id) || items[0] || null) })
  useEffect(() => { void load() }, [props.courseId])
  const create = async () => {
    setSaving(true)
    try {
      const values = form.getFieldsValue()
      const task = await api.createTask({
        course_id: props.courseId,
        title: values.title || '链表边界条件专项练习',
        type: values.type || 'programming',
        chapter_label: values.chapter || '第 2 章 线性表',
        description: values.description || '实现单链表指定位置节点删除。',
        starter_code: 'ListNode* removeAt(ListNode* head, int index) {\n  return head;\n}',
        difficulty: '进阶',
        due_at: '2026-12-30T23:59:00',
        test_cases: [
          { name: '头节点删除', hidden: false, weight: 30 },
          { name: '尾节点删除', hidden: true, weight: 40 },
          { name: '越界输入', hidden: true, weight: 30 },
        ],
      })
      props.notify('任务草稿已保存到后端')
      setSelected(task); load()
    } catch (reason: any) { props.notify(reason.message) } finally { setSaving(false) }
  }
  const publish = async () => {
    if (!selected) return
    setPublishing(true)
    try {
      await api.publishTask(selected.id, { class_id: props.classId, due_at: '2026-12-30T23:59:00' })
      props.notify('任务已发布，学生端现在可以读取')
      load()
    } catch (reason: any) { props.notify(reason.message) } finally { setPublishing(false) }
  }
  if (!tasks.length) return <PageLoader />
  return <div className="exact-course-page exact-tasks">
    <div className="tasks-layout">
      <main>
        <div className="exact-page-title"><div><Text type="secondary">课程工作空间 / 任务管理</Text><Title level={2}>任务管理</Title><Text type="secondary">创建、配置、发布和管理课程任务。</Text></div></div>
        <div className="tasks-toolbar"><Select defaultValue="all" options={[{ value: 'all', label: '任务类型：全部' }]} /><Select defaultValue="all" options={[{ value: 'all', label: '状态：全部' }]} /><Select defaultValue="all" options={[{ value: 'all', label: '难度：全部' }]} /><Input prefix={<Search size={14} />} placeholder="搜索任务" /><Button type="primary" icon={<Plus size={15} />}>新建任务</Button></div>
        <Tabs items={[{ key: 'all', label: '全部 ' + tasks.length },{ key: 'draft', label: '草稿 ' + tasks.filter((item) => item.status === 'draft').length },{ key: 'published', label: '已发布 ' + tasks.filter((item) => item.status === 'published').length },{ key: 'closed', label: '已结束 0' }]} />
        <div className="task-list">{tasks.map((task,index) => <article className={selected?.id === task.id ? 'active' : ''} key={task.id} role="button" tabIndex={0} onClick={() => setSelected(task)}><span className={'task-list-icon t' + index}>{task.type === 'programming' ? <Code2 /> : task.type === 'quiz' ? <ListChecks /> : <GitBranch />}</span><div><Space><Tag color="green">{task.chapter}</Tag><Text type="secondary">{task.created_at?.slice(0,10)}</Text></Space><Title level={4}>{task.title}</Title><p>{task.description}</p><div className="task-data"><span>任务类型 <b>{task.type === 'programming' ? '编程任务' : task.type === 'quiz' ? '客观题' : '综合项目'}</b></span><span>难度 <b>{task.difficulty}</b></span><span>已提交 <b>{task.submitted}/{task.total}</b></span><span>状态 <Tag color={task.status === 'published' ? 'green' : 'default'}>{task.status === 'published' ? '已发布' : task.status === 'draft' ? '草稿' : '待发布'}</Tag></span></div><Space><Button size="small" icon={<Eye size={13} />} onClick={(event) => { event.stopPropagation(); props.onNavigate('monitor') }}>查看学生情况</Button><Button size="small" icon={<Edit3 size={13} />}>编辑</Button><Button size="small" type={task.status === 'published' ? 'primary' : 'default'} onClick={(event) => { event.stopPropagation(); setSelected(task); if (task.status !== 'published') publish() }}>{task.status === 'published' ? '已发布' : '立即发布'}</Button><Button size="small">更多⌄</Button></Space></div></article>)}</div>
      </main>
      <aside>
        <div className="side-panel-head"><div><Title level={3}>创建并发布任务</Title><Text type="secondary">按步骤完成任务配置</Text></div><button>×</button></div>
        <Steps current={0} size="small" items={[{ title: '基本信息' },{ title: '题目配置' },{ title: '发布设置' },{ title: '预览发布' }]} />
        <Form form={form} layout="vertical" initialValues={{ title: '\u5355\u94fe\u8868\u8fb9\u754c\u6761\u4ef6\u4e13\u9879\u7ec3\u4e60', chapter: '\u7b2c 2 \u7ae0 \u7ebf\u6027\u8868', type: 'programming' }}>
          <Form.Item label="任务名称" name="title"><Input showCount maxLength={50} /></Form.Item>
          <Form.Item label="任务说明" name="description"><Input.TextArea rows={4} /></Form.Item>
          <Form.Item label="关联知识点" name="chapter"><Select options={[{ value: '第 2 章 线性表', label: '第 2 章 线性表' },{ value: '第 3 章 栈与队列', label: '第 3 章 栈与队列' }]} /></Form.Item>
          <Row gutter={12}><Col span={12}><Form.Item label="任务类型" name="type"><Select options={[{ value: 'programming', label: '编程任务' },{ value: 'quiz', label: '客观题' }]} /></Form.Item></Col><Col span={12}><Form.Item label="截止时间"><Input value="2026-12-30 23:59" readOnly /></Form.Item></Col></Row>
          <Form.Item><Checkbox defaultChecked>允许学生使用分层提示</Checkbox></Form.Item>
        </Form>
        <div className="side-panel-actions"><Button onClick={create} loading={saving}>保存为草稿</Button><Button type="primary" onClick={selected?.status === 'draft' ? publish : create} loading={publishing}>{selected?.status === 'draft' ? '确认发布' : '确认创建'}</Button></div>
        <Button block className="simulate-student" disabled>学生提交接口已预留，当前未启用</Button>
      </aside>
    </div>
  </div>
}

export function ExactMaterials(props: CommonProps) {
  const [items, setItems] = useState<ApiMaterial[]>([])
  const [selected, setSelected] = useState<ApiMaterial | null>(null)
  const [uploading, setUploading] = useState(false)
  const load = () => api.materials(props.courseId).then((rows) => { setItems(rows); setSelected((current) => current && rows.find((item) => item.id === current.id) || rows[0] || null) })
  useEffect(() => { void load() }, [props.courseId])
  const upload = async (file: File) => {
    setUploading(true)
    try {
      await api.uploadMaterial(props.courseId, file)
      props.notify('资料文件已上传到后端并完成持久化')
      load()
    } catch (reason: any) { props.notify(reason.message) } finally { setUploading(false) }
    return false
  }
  if (!items.length) return <PageLoader />
  const columns: ColumnsType<ApiMaterial> = [
    { title: '文件名称', render: (_,row) => <Space><span className={'material-file ' + row.type}><FileText size={16} /></span><span><Text strong>{row.title}</Text><small>{row.size}</small></span></Space> },
    { title: '类型', dataIndex: 'type' },
    { title: '处理状态', dataIndex: 'status', render: (value) => <Tag color={value === 'ready' ? 'green' : 'processing'}>{value === 'ready' ? '处理完成' : '解析中'}</Tag> },
    { title: '上传时间', dataIndex: 'updated_at', render: (value) => value.slice(0,16).replace('T',' ') },
    { title: 'AI 引用', dataIndex: 'citations', render: (value) => value + ' 次' },
    { title: '\u64cd\u4f5c', render: (_, row) => <Button type="text" onClick={async () => { await api.deleteMaterial(row.id); props.notify('\u8d44\u6599\u5df2\u5220\u9664'); load() }}>···</Button> },
  ]
  return <div className="exact-course-page exact-materials">
    <div className="materials-layout">
      <main>
        <div className="materials-heading"><div><Title level={2}>教学材料</Title><Text type="secondary">上传课件、讲义、实验指导书与课程资料，供学生和 AI 使用。</Text></div><img src="/ui-assets/materials-banner.png" alt="" /></div>
        <div className="materials-actions"><Upload beforeUpload={upload} showUploadList={false}><Button type="primary" loading={uploading} icon={<UploadCloud size={15} />}>上传课件</Button></Upload><Upload beforeUpload={upload} showUploadList={false}><Button icon={<FileText size={15} />}>上传讲义</Button></Upload><Button icon={<Link2 size={15} />}>添加链接</Button><Button icon={<WandSparkles size={15} />}>AI 生成材料目录</Button></div>
        <div className="materials-main">
          <aside className="material-folders"><div className="exact-block-title"><strong>材料目录</strong><Button type="text" icon={<Plus size={14} />} /></div>{[['全部材料',items.length],['第 1 章 算法基础',3],['第 2 章 线性表',4],['2.1 单链表',3],['第 3 章 栈与队列',2],['第 5 章 树',4],['参考资料',3]].map((item,index) => <button className={index === 0 ? 'active' : ''} key={item[0] as string}><Folder size={15} />{item[0]}<b>{item[1]}</b></button>)}</aside>
          <section><div className="material-filter"><Tabs items={[{ key: 'all', label: '全部' },{ key: 'slides', label: '课件' },{ key: 'doc', label: '讲义' },{ key: 'video', label: '实验指导' },{ key: 'link', label: '外部链接' }]} /><Input prefix={<Search size={14} />} placeholder="搜索材料" /></div><Table rowKey="id" columns={columns} dataSource={items} pagination={{ pageSize: 6 }} onRow={(row) => ({ onClick: () => setSelected(row) })} /></section>
        </div>
        <div className="generate-courseware"><span><FileText /></span><div><strong>生成课件大纲</strong><small>基于课程大纲和班级学情生成 PPT 结构草稿。</small></div><Button type="primary" icon={<WandSparkles size={15} />} onClick={() => props.notify('AI 课件大纲已生成到资料草稿')}>生成大纲</Button></div>
      </main>
      <aside>
        <div className="side-panel-head"><strong>预览</strong><button>×</button></div>
        <div className="material-preview"><span>概览</span><div><small>数据结构与程序设计基础</small><Title level={3}>{selected?.title}</Title><i /></div></div>
        <div className="ai-summary"><strong>AI 内容摘要</strong><p>该材料围绕单链表节点结构、插入删除和边界处理展开，可作为任务与诊断引用来源。</p><Button type="link">查看详细摘要</Button></div>
        <div className="material-detail"><strong>可信度与可见性</strong><span>权威等级 <Tag color="green">教师认证</Tag></span><span>学生可见 <Switch size="small" checked={selected?.visibility === 'students'} onChange={async (checked) => { if (!selected) return; await api.updateMaterial(selected.id, { visibility: checked ? 'students' : 'teacher' }); props.notify('\u53ef\u89c1\u6027\u5df2\u66f4\u65b0'); load() }} /></span><span>标签 <Space wrap><Tag>链表</Tag><Tag>头节点</Tag><Tag>删除操作</Tag></Space></span><span>上传时间 <b>{selected?.updated_at.slice(0,16).replace('T',' ')}</b></span><span>文件大小 <b>{selected?.size}</b></span><span>格式 <b>{selected?.type.toUpperCase()}</b></span><span>解析状态 <Tag color={selected?.status === 'ready' ? 'green' : 'processing'}>{selected?.status === 'ready' ? '解析完成' : '解析中'}</Tag></span></div>
      </aside>
    </div>
  </div>
}

export function ExactGraph(props: CommonProps) {
  const [graph, setGraph] = useState<any>(null)
  const [selected, setSelected] = useState<any>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form] = Form.useForm()
  const load = () => api.graph(props.courseId).then((data) => { setGraph(data); setSelected((current: any) => current && data.nodes.find((item: any) => item.id === current.id) || data.nodes[0] || null) })
  useEffect(() => { void load() }, [props.courseId])
  const add = async () => {
    const values = form.getFieldsValue()
    const chapters = await api.chapters(props.courseId)
    try {
      await api.createKnowledgePoint({ chapter_id: chapters[0].id, name: values.name, description: values.description || '', difficulty: values.difficulty || '基础', position_x: 65, position_y: 45 })
      props.notify('知识点已写入后端')
      setAddOpen(false); form.resetFields(); load()
    } catch (reason: any) { props.notify(reason.message) }
  }
  if (!graph) return <PageLoader />
  return <div className="exact-course-page exact-graph">
    <div className="graph-layout">
      <main>
        <div className="exact-page-title"><div><Text type="secondary">课程工作空间 / 课程知识图谱</Text><Title level={2}>课程知识图谱</Title><Text type="secondary">构建课程知识点关系，关联资料、任务和学情证据。</Text></div><Space><Button icon={<Eye size={14} />}>查看学生端</Button><Button icon={<Download size={14} />}>导出子图</Button><Button onClick={() => setAddOpen(true)} icon={<Plus size={14} />}>添加节点</Button><Button icon={<Network size={14} />}>关系布局</Button><Button type="primary" onClick={() => props.notify('知识图谱已发布')}>一键导入</Button></Space></div>
        <div className="graph-workspace">
          <aside><Input prefix={<Search size={14} />} placeholder="搜索知识点" /><div className="graph-source"><strong>知识来源</strong>{[['课程教学大纲',28],['教师确认知识点',19],['AI 候选节点',6]].map((item,index) => <button className={index === 0 ? 'active' : ''} key={item[0] as string}><i className={'s' + index} />{item[0]}<b>{item[1]}</b></button>)}</div><Alert type="info" showIcon message="AI 候选节点必须经教师确认后才能发布。" /></aside>
          <section className="graph-stage">{graph.nodes.map((node: any,index: number) => <button className={'live-node ' + (index === 0 ? 'center ' : '') + (selected?.id === node.id ? 'selected' : '')} style={{ left: node.x + '%', top: node.y + '%' }} key={node.id} onClick={() => setSelected(node)}><span>{index === 0 ? <Link2 /> : <BrainCircuit />}</span><b>{node.name}</b></button>)}<svg viewBox="0 0 100 100" preserveAspectRatio="none">{graph.edges.map((edge: any) => { const source = graph.nodes.find((item: any) => item.id === edge.source); const target = graph.nodes.find((item: any) => item.id === edge.target); return source && target ? <line key={edge.target} x1={source.x} y1={source.y} x2={target.x} y2={target.y} /> : null })}</svg><div className="graph-zoom"><Button size="small">+</Button><Button size="small">−</Button><span>100%</span></div></section>
        </div>
      </main>
      <aside>
        <div className="side-panel-head"><div><Tag color="green">知识点</Tag><Title level={3}>{selected?.name}</Title></div><Button type="text" icon={<Edit3 size={14} />}>编辑</Button><button>×</button></div>
        <Text type="secondary">{selected?.description}</Text>
        <div className="node-details"><span>难度等级 <Tag color="gold">{selected?.difficulty}</Tag></span><span>掌握度 <b>{selected?.mastery}%</b></span></div>
        <div className="exact-block-title"><strong>前置知识</strong><Button type="link">添加</Button></div><Space wrap><Tag>指针基础</Tag><Tag>结构体</Tag></Space>
        <div className="exact-block-title"><strong>关联知识</strong><Button type="link">添加</Button></div>{graph.nodes.filter((item: any) => item.id !== selected?.id).slice(0,4).map((item: any) => <div className="related-node" key={item.id}><i />{item.name}<small>{item.mastery}%</small></div>)}
        <div className="exact-block-title"><strong>查看关联资料</strong></div><Button block onClick={() => props.onNavigate('materials')}>打开资料管理 <ChevronRight size={13} /></Button>
        <Button type="primary" block icon={<WandSparkles size={14} />} onClick={() => props.notify('AI 图谱候选节点已生成，等待确认')}>发布图谱</Button>
      </aside>
    </div>
    <Modal title="添加知识点" open={addOpen} onCancel={() => setAddOpen(false)} onOk={add}><Form form={form} layout="vertical"><Form.Item label="知识点名称" name="name" rules={[{ required: true }]}><Input /></Form.Item><Form.Item label="描述" name="description"><Input.TextArea rows={4} /></Form.Item><Form.Item label="难度" name="difficulty" initialValue={'\u57fa\u7840'}><Select options={['基础','进阶','挑战'].map((value) => ({ value, label: value }))} /></Form.Item></Form></Modal>
  </div>
}


