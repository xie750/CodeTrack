import { useEffect, useMemo, useState } from 'react'
import {
  Avatar, Button, Drawer, Form, Input, Modal, Select, Space, Spin, Tag, Typography,
} from 'antd'
import {
  Braces, CheckCircle2, ChevronDown, Clock3, Code2, Copy, Database, Edit3,
  Mail, Search, Settings, Terminal, UserCheck, UserPlus, Users, X,
} from 'lucide-react'

import {
  api, type ApiClass, type ApiClassJoinStatus, type ApiCourse, type ApiStudent,
} from '../api'
import type { ExactView } from './components'
import { CourseBreadcrumb, EmptyPanel, PageLoader } from './components'
import './class-exact.css'

const { Text, Title } = Typography

interface Props {
  courseId: string
  classId: string
  courses: ApiCourse[]
  classes: ApiClass[]
  onNavigate: (view: ExactView) => void
  onRefresh: () => void
  notify: (text: string) => void
}

const classIcons = [Code2, Braces, Terminal, Code2, Database]
const commonGrades = ['2023级', '2024级', '2025级', '2026级']
const commonMajors = ['软件工程', '计算机科学与技术', '人工智能', '数据科学与大数据技术', '网络工程']

function statusView(status: string) {
  if (status === 'active') return { text: '进行中', color: 'green', dot: 'green' }
  if (status === 'closed') return { text: '已结束', color: 'blue', dot: 'blue' }
  return { text: '未开始', color: 'orange', dot: 'orange' }
}

function joinStatusView(status: string) {
  if (status === 'pending') return { text: '待审核', color: 'gold' }
  if (status === 'invited') return { text: '已邀请', color: 'blue' }
  return { text: '已加入', color: 'green' }
}

function formatJoinTime(value: string | null) {
  return value ? value.slice(0, 16).replace('T', ' ') : '-'
}

export function ExactClassesV2(props: Props) {
  const [groups, setGroups] = useState<ApiClass[]>([])
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<ApiStudent[]>([])
  const [selectedId, setSelectedId] = useState(props.classId || 'class-se1')
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [majorFilter, setMajorFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinStatus, setJoinStatus] = useState<ApiClassJoinStatus | null>(null)
  const [joinSearch, setJoinSearch] = useState('')
  const [joinFilter, setJoinFilter] = useState('all')
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const loadGroups = async () => {
    setLoading(true)
    try {
      const items = await api.classes(props.courseId)
      setGroups(items)
      setSelectedId((current) => items.some((item) => item.id === current) ? current : items[0]?.id || '')
      if (!items.length) setStudents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSearch('')
    setGradeFilter('all')
    setMajorFilter('all')
    setStatusFilter('all')
    void loadGroups()
  }, [props.courseId])

  useEffect(() => {
    if (props.classId && groups.some((item) => item.id === props.classId)) setSelectedId(props.classId)
  }, [props.classId, groups])

  useEffect(() => {
    if (selectedId) void api.students(selectedId).then(setStudents)
  }, [selectedId])

  const selected = groups.find((item) => item.id === selectedId) || groups[0]
  const gradeOptions = useMemo(() => [
    { value: 'all', label: '全部年级' },
    ...Array.from(new Set(groups.map((item) => item.grade).filter(Boolean))).map((value) => ({ value, label: value })),
  ], [groups])
  const majorOptions = useMemo(() => [
    { value: 'all', label: '全部专业方向' },
    ...Array.from(new Set(groups.map((item) => item.major).filter(Boolean))).map((value) => ({ value, label: value })),
  ], [groups])
  const statusOptions = useMemo(() => [
    { value: 'all', label: '全部状态' },
    ...Array.from(new Set(groups.map((item) => item.status).filter(Boolean))).map((value) => ({ value, label: statusView(value).text })),
  ], [groups])
  const createGradeOptions = useMemo(() =>
    Array.from(new Set([...groups.map((item) => item.grade).filter(Boolean), ...commonGrades])).map((value) => ({ value, label: value })), [groups])
  const createMajorOptions = useMemo(() =>
    Array.from(new Set([...groups.map((item) => item.major).filter(Boolean), ...commonMajors])).map((value) => ({ value, label: value })), [groups])
  const visibleGroups = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return groups.filter((item) => {
      if (keyword && !item.name.toLowerCase().includes(keyword)) return false
      if (gradeFilter !== 'all' && item.grade !== gradeFilter) return false
      if (majorFilter !== 'all' && item.major !== majorFilter) return false
      return statusFilter === 'all' || item.status === statusFilter
    })
  }, [gradeFilter, groups, majorFilter, search, statusFilter])
  const visibleJoinRows = useMemo(() => {
    const keyword = joinSearch.trim().toLowerCase()
    return (joinStatus?.rows || []).filter((item) => {
      if (joinFilter !== 'all' && item.join_status !== joinFilter) return false
      return !keyword || `${item.name} ${item.number}`.toLowerCase().includes(keyword)
    })
  }, [joinFilter, joinSearch, joinStatus])

  const loadJoinStatus = async (group: ApiClass, filter = 'all') => {
    setSelectedId(group.id)
    setJoinFilter(filter)
    setJoinLoading(true)
    try {
      setJoinStatus(await api.classJoinStatus(group.id))
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setJoinLoading(false)
    }
  }

  const openJoinStatus = (group: ApiClass, filter = 'all') => {
    setDetailOpen(false)
    setJoinOpen(true)
    void loadJoinStatus(group, filter)
  }

  useEffect(() => {
    if (!groups.length) return
    const stored = sessionStorage.getItem('codetrack-class-panel')
    if (!stored) return
    sessionStorage.removeItem('codetrack-class-panel')
    try {
      const target = JSON.parse(stored)
      const group = groups.find((item) => item.id === target.classId)
      if (group && target.courseId === props.courseId && target.panel === 'join-status') openJoinStatus(group, target.filter || 'all')
    } catch { /* Ignore malformed navigation state. */ }
  }, [groups, props.courseId])

  const openDetail = (group: ApiClass) => {
    setSelectedId(group.id)
    setDetailOpen(true)
    void loadJoinStatus(group)
  }

  const createClass = async () => {
    try {
      await form.validateFields()
      setSaving(true)
      const created = await api.createClass({ course_id: props.courseId, ...form.getFieldsValue() })
      props.notify('教学班已创建并写入数据库')
      setCreateOpen(false)
      form.resetFields()
      await loadGroups()
      setSelectedId(created.id)
      props.onRefresh()
    } catch (reason: any) {
      if (reason?.errorFields) return
      props.notify(reason.message)
    } finally {
      setSaving(false)
    }
  }

  const copyJoinCode = async () => {
    if (!selected) return
    await navigator.clipboard.writeText(selected.join_code)
    props.notify('班级邀请码已复制')
  }

  if (loading) return <PageLoader />

  return <div className="exact-course-page class-v2-page">
    <div className="class-v2-heading">
      <div><CourseBreadcrumb current="班级管理" onNavigate={props.onNavigate} /><Title level={2}>班级管理</Title><Text type="secondary">创建与管理课程班级，邀请学生加入，跟踪班级整体学习情况。</Text></div>
      <img src="/ui-assets/class-banner-clean.png" alt="" />
    </div>

    <main className="class-v2-main-panel">
      <div className="class-v2-filter">
        <div className="class-v2-filter-controls">
          <Input allowClear prefix={<Search size={16} />} placeholder="搜索班级名称" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select value={gradeFilter} onChange={setGradeFilter} options={gradeOptions} suffixIcon={<ChevronDown size={14} />} />
          <Select value={majorFilter} onChange={setMajorFilter} options={majorOptions} suffixIcon={<ChevronDown size={14} />} />
          <Select value={statusFilter} onChange={setStatusFilter} options={statusOptions} suffixIcon={<ChevronDown size={14} />} />
        </div>
        <Button type="primary" icon={<span className="class-v2-plus">+</span>} onClick={() => setCreateOpen(true)}>新建班级</Button>
      </div>

      <div className="class-v2-list">
        {!visibleGroups.length && <EmptyPanel text={groups.length ? '当前筛选条件下没有匹配的班级' : '当前课程还没有教学班级，可以先新建班级'} />}
        {visibleGroups.map((group, index) => {
          const Icon = classIcons[index % classIcons.length]
          const state = statusView(group.status)
          const capacity = group.capacity || Math.max(group.students, 60)
          return <article key={group.id} onClick={() => setSelectedId(group.id)}>
            <span className={'class-v2-icon icon-' + index}><Icon size={27} /><i><Users size={11} /></i></span>
            <div className="class-v2-row-main">
              <div className="class-v2-name"><Title level={4}>{group.name}</Title>{index === 0 && <Tag color="green">主讲班级</Tag>}</div>
              <div className="class-v2-stats">
                <span><small>班级规模</small><strong>{capacity} 人</strong></span>
                <span><small>已加入</small><strong>{group.students} 人 <em>({Math.round(group.students * 100 / capacity)}%)</em></strong></span>
                <span><small>班级状态</small><strong><i className={'status-dot ' + state.dot} />{state.text}</strong></span>
                <span><small>班长/负责人</small><strong><Avatar size={20} className="exact-avatar">{group.mentor.slice(0, 1)}</Avatar>{group.mentor}</strong></span>
                <span><small>上课时间</small><strong><i className="status-dot blue" />{group.schedule || '待安排'}</strong></span>
              </div>
            </div>
            <div className="class-v2-actions">
              <Button size="small" onClick={(event) => { event.stopPropagation(); openDetail(group) }}>查看详情</Button>
              <Button size="small" type="primary" ghost icon={<UserPlus size={14} />} onClick={(event) => { event.stopPropagation(); setSelectedId(group.id); sessionStorage.setItem('codetrack-selected-class-id', group.id); props.onNavigate('invite') }}>邀请学生</Button>
              <Button size="small" icon={<Settings size={14} />} onClick={(event) => { event.stopPropagation(); props.notify('班级设置已加载') }}>管理班级</Button>
            </div>
          </article>
        })}
      </div>
    </main>

    <Drawer rootClassName="class-detail-drawer" open={detailOpen} onClose={() => setDetailOpen(false)} placement="right" width={440} closeIcon={<X size={17} />} title={<Space size={8}><Title level={3}>{selected?.name}</Title><Tag color="green">主讲班级</Tag></Space>}>
      <div className="class-v2-detail">
        <section className="class-v2-info-card">
          <div className="class-v2-section-title"><strong>班级信息</strong><Button type="link" icon={<Edit3 size={14} />}>编辑</Button></div>
          <div className="class-v2-info-grid">
            <span><small>年级</small><b>{selected?.grade}</b></span><span><small>已加入学生</small><b>{selected?.students} 人</b></span>
            <span><small>专业方向</small><b>{selected?.major}</b></span><span><small>课程状态</small><b>{statusView(selected?.status || '').text}</b></span>
            <span><small>班级规模</small><b>{selected?.capacity || 60} 人</b></span><span><small>邀请码</small><b>{selected?.join_code}<Button size="small" type="link" icon={<Copy size={12} />} onClick={copyJoinCode}>复制</Button></b></span>
          </div>
        </section>
        <section className="class-v2-overall">
          <div className="class-v2-section-title"><strong>班级整体情况</strong><Text type="secondary">实时数据</Text></div>
          <div className="class-v2-chart-grid"><article><small>完成任务率</small><div><strong>{selected?.completion || 0}%</strong><em>↑ 12%</em></div><div className="class-progress"><i style={{ width: `${selected?.completion || 0}%` }} /></div></article><article><small>近 7 天活跃度</small><div><strong>{selected?.active_rate || 0}%</strong><em>↑ 9%</em></div><div className="class-v2-bars">{[16, 28, 10, 19, 35, 43, 56, 72, 86, 100].map((height, i) => <i style={{ height: height + '%' }} key={i} />)}</div></article></div>
        </section>
        <section className="class-v2-joins">
          <div className="class-v2-section-title"><strong>学生加入状态 <small>（最近）</small></strong><Button type="link" onClick={() => selected && openJoinStatus(selected)}>查看全部</Button></div>
          {students.slice(0, 5).map((student) => <div className="class-v2-student" key={student.id}><Avatar size={29} className="exact-avatar">{student.name.slice(-1)}</Avatar><strong>{student.name}</strong><Tag color="green">已加入</Tag><Text type="secondary">通过班级邀请加入</Text><small>{student.last_active}</small></div>)}
          <footer><span>共 {joinStatus?.summary.joined ?? selected?.students ?? 0} 人已加入，{joinStatus?.summary.pending ?? 0} 人待审核</span><Button type="link" onClick={() => selected && openJoinStatus(selected, 'pending')}>管理申请</Button></footer>
        </section>
      </div>
    </Drawer>

    <Drawer rootClassName="class-join-status-drawer" open={joinOpen} onClose={() => setJoinOpen(false)} placement="right" width={820} closeIcon={<X size={18} />} title={<div className="class-join-drawer-title"><span><UserCheck size={20} /></span><div><Title level={3}>学生加入状态</Title><Text type="secondary">{joinStatus?.class_name || selected?.name}</Text></div></div>}>
      <div className="class-join-status-page">
        <div className="class-join-summary"><article><span className="joined"><CheckCircle2 /></span><div><small>已加入</small><strong>{joinStatus?.summary.joined || 0}</strong></div></article><article><span className="pending"><Clock3 /></span><div><small>待审核</small><strong>{joinStatus?.summary.pending || 0}</strong></div></article><article><span className="invited"><Mail /></span><div><small>已邀请</small><strong>{joinStatus?.summary.invited || 0}</strong></div></article><article><span className="available"><Users /></span><div><small>剩余名额</small><strong>{joinStatus?.summary.available_slots || 0}</strong></div></article></div>
        <div className="class-join-toolbar"><Input allowClear prefix={<Search size={15} />} placeholder="搜索学生姓名或学号" value={joinSearch} onChange={(event) => setJoinSearch(event.target.value)} /><Select value={joinFilter} onChange={setJoinFilter} options={[{ value: 'all', label: '全部状态' }, { value: 'joined', label: '已加入' }, { value: 'pending', label: '待审核' }, { value: 'invited', label: '已邀请' }]} /><Button type="primary" icon={<UserPlus size={15} />} onClick={() => { if (!selected) return; sessionStorage.setItem('codetrack-selected-class-id', selected.id); props.onNavigate('invite') }}>继续邀请</Button></div>
        <div className="class-join-list"><div className="class-join-list-head"><span>学生</span><span>加入状态</span><span>加入方式</span><span>加入时间</span><span>最近活跃</span><span>操作</span></div>{joinLoading && <div className="class-join-loading"><Spin /><span>正在加载加入记录</span></div>}{!joinLoading && !visibleJoinRows.length && <EmptyPanel text="当前筛选条件下没有学生加入记录" />}{!joinLoading && visibleJoinRows.map((student) => { const state = joinStatusView(student.join_status); return <div className="class-join-list-row" key={student.id}><span className="class-join-student"><Avatar size={34} className="exact-avatar">{student.name.slice(-1)}</Avatar><span><strong>{student.name}</strong><small>{student.number}</small></span></span><Tag color={state.color}>{state.text}</Tag><span>{student.join_method}</span><span>{formatJoinTime(student.joined_at)}</span><span>{student.last_active}</span><Button type="link" onClick={() => props.notify(`正在查看 ${student.name} 的学生信息`)}>查看</Button></div> })}</div>
        <div className="class-join-footer"><span>共 {visibleJoinRows.length} 条记录</span><span>数据与当前班级加入记录实时同步</span></div>
      </div>
    </Drawer>

    <Modal title="新建教学班" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={createClass} confirmLoading={saving} okText="创建班级">
      <Form form={form} layout="vertical" initialValues={{ mentor: '王老师', grade: '2024级', major: '软件工程', status: 'active' }}><Form.Item label="班级名称" name="name" rules={[{ required: true, message: '请输入班级名称' }]}><Input placeholder="例如：软件工程4班" /></Form.Item><Form.Item label="年级" name="grade" rules={[{ required: true, message: '请选择年级' }]}><Select placeholder="请选择年级" options={createGradeOptions} suffixIcon={<ChevronDown size={14} />} /></Form.Item><Form.Item label="专业方向" name="major" rules={[{ required: true, message: '请选择专业方向' }]}><Select showSearch optionFilterProp="label" placeholder="请选择专业方向" options={createMajorOptions} suffixIcon={<ChevronDown size={14} />} /></Form.Item><Form.Item label="班级状态" name="status"><Select options={[{ value: 'active', label: '进行中' }, { value: 'pending', label: '未开始' }, { value: 'closed', label: '已结束' }]} /></Form.Item><Form.Item label="上课安排" name="schedule"><Input placeholder="例如：周二 3-4 节" /></Form.Item><Form.Item label="任课教师" name="mentor"><Input /></Form.Item></Form>
    </Modal>
  </div>
}
