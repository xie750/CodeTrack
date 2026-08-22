import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Checkbox, Col, Dropdown, Form, Input, InputNumber, Modal, Radio, Row,
  Select, Space, Steps, Tabs, Tag, Tooltip, Typography,
} from 'antd'
import {
  Activity, Bot, CheckCircle2, ChevronDown, Code2, Copy, Edit3, Eye, GitBranch, ListChecks,
  MessageSquareText, MoreHorizontal, Plus, Search, Settings2, Sparkles, X,
} from 'lucide-react'

import { api, type ApiClass, type ApiCourse, type ApiTask } from '../api'
import type { ExactView } from './components'
import { CourseBreadcrumb, EmptyPanel, PageLoader } from './components'
import './task-exact.css'

const { Text, Title, Paragraph } = Typography

interface Props {
  courseId: string
  classId: string
  courses: ApiCourse[]
  classes: ApiClass[]
  onNavigate: (view: ExactView) => void
  onRefresh: () => void
  notify: (text: string) => void
}

function taskStatus(task: ApiTask) {
  if (task.status === 'published') return { text: '已发布', color: 'green' }
  if (task.status === 'scheduled') return { text: '待发布', color: 'orange' }
  if (task.status === 'closed') return { text: '已结束', color: 'default' }
  return { text: '草稿', color: 'blue' }
}

function taskTypeLabel(type: string) {
  const labels: Record<string, string> = {
    programming: '编程题',
    quiz: '客观题',
    single_choice: '单选题',
    multiple_choice: '多选题',
    true_false: '判断题',
    fill_blank: '填空题',
    short_answer: '简答题',
    project: '综合项目',
  }
  return labels[type] || type
}

export function ExactTasksV2(props: Props) {
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [draftId, setDraftId] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('请为链表边界条件生成一道进阶编程练习，包含公开与隐藏测试。')
  const [aiLoading, setAiLoading] = useState(false)
  const [focusedTaskId, setFocusedTaskId] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [chapterFilter, setChapterFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      setTasks(await api.tasks(props.courseId))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    setTypeFilter('all')
    setChapterFilter('all')
    setClassFilter('all')
    setStatusFilter('all')
    setSearch('')
    setSortOrder('newest')
    void load()
  }, [props.courseId])

  useEffect(() => {
    const taskId = sessionStorage.getItem('codetrack:focus-task') || ''
    if (!taskId || !tasks.some((item) => item.id === taskId)) return
    setFocusedTaskId(taskId)
    sessionStorage.removeItem('codetrack:focus-task')
    window.setTimeout(() => document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
    window.setTimeout(() => setFocusedTaskId(''), 3200)
  }, [tasks])

  const courseClasses = useMemo(() => props.classes.filter((item) => item.course_id === props.courseId), [props.classes, props.courseId])
  const typeOptions = useMemo(() => [
    { value: 'all', label: '任务类型　全部' },
    ...Array.from(new Set(tasks.map((item) => item.type).filter(Boolean))).map((value) => ({ value, label: taskTypeLabel(value) })),
  ], [tasks])
  const chapterOptions = useMemo(() => [
    { value: 'all', label: '知识点　全部' },
    ...Array.from(new Set(tasks.map((item) => item.chapter).filter(Boolean))).map((value) => ({ value, label: value })),
  ], [tasks])
  const classOptions = useMemo(() => {
    return [
      { value: 'all', label: '班级　全部' },
      ...courseClasses.map((item) => ({ value: item.id, label: item.name })),
      ...(tasks.some((item) => !item.class_id) ? [{ value: 'unassigned', label: '未指定班级' }] : []),
    ]
  }, [courseClasses, tasks])
  const visibleTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return tasks
      .filter((task) => {
        if (statusFilter !== 'all' && task.status !== statusFilter) return false
        if (typeFilter !== 'all' && task.type !== typeFilter) return false
        if (chapterFilter !== 'all' && task.chapter !== chapterFilter) return false
        if (classFilter === 'unassigned' && task.class_id) return false
        if (classFilter !== 'all' && classFilter !== 'unassigned' && task.class_id !== classFilter) return false
        if (keyword && !`${task.title} ${task.description} ${task.chapter}`.toLowerCase().includes(keyword)) return false
        return true
      })
      .sort((left, right) => {
        const leftTime = new Date(left.created_at || 0).getTime()
        const rightTime = new Date(right.created_at || 0).getTime()
        return sortOrder === 'newest' ? rightTime - leftTime : leftTime - rightTime
      })
  }, [chapterFilter, classFilter, search, sortOrder, statusFilter, tasks, typeFilter])

  const openCreator = () => {
    setPanelOpen(true)
    setStep(0)
    setDraftId('')
    form.resetFields()
  }

  const createDraft = async () => {
    if (draftId) return tasks.find((item) => item.id === draftId)
    const values = form.getFieldsValue()
    const task = await api.createTask({
      course_id: props.courseId,
      class_id: props.classId,
      title: values.title || '单链表指定位置节点删除',
      type: values.type || 'programming',
      chapter_label: values.chapter || '第3章 函数结构',
      description: values.description || '给定单链表和头结点，删除指定位置节点并返回链表头结点。',
      starter_code: values.starter_code || 'ListNode* removeAt(ListNode* head, int index) {\n  return head;\n}',
      difficulty: values.difficulty || '进阶',
      due_at: values.due_at || '2026-12-30T23:59:00',
      allow_hints: true,
      test_cases: [
        { name: '基础用例', hidden: false, weight: 30 },
        { name: '边界用例', hidden: false, weight: 30 },
        { name: '隐藏用例', hidden: true, weight: 40 },
      ],
    })
    setDraftId(task.id)
    await load()
    return task
  }

  const saveDraft = async () => {
    setSaving(true)
    try {
      await createDraft()
      props.notify('作业已保存到草稿箱')
      setPanelOpen(false)
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setSaving(false)
    }
  }

  const publish = async () => {
    setSaving(true)
    try {
      const task = await createDraft()
      if (!task) throw new Error('创建任务失败')
      await api.publishTask(task.id, {
        class_id: props.classId,
        due_at: form.getFieldValue('due_at') || '2026-12-30T23:59:00',
      })
      props.notify('作业已发布到教学班')
      setPanelOpen(false)
      setStep(0)
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setSaving(false)
    }
  }

  const openTaskView = (view: 'monitor' | 'grading', taskId: string) => {
    sessionStorage.setItem(`codetrack:${view}-task-id`, taskId)
    props.onNavigate(view)
  }

  const editTask = (task: ApiTask, nextStep = 0) => {
    setDraftId(task.id)
    setPanelOpen(true)
    setStep(nextStep)
    form.setFieldsValue({ ...task, chapter: task.chapter ? [task.chapter] : [] })
  }

  const duplicateTask = async (task: ApiTask) => {
    try {
      await api.createTask({
        course_id: props.courseId,
        class_id: null,
        title: `${task.title}（副本）`,
        type: task.type,
        chapter_label: task.chapter,
        description: task.description,
        starter_code: task.starter_code,
        difficulty: task.difficulty,
        total_score: task.total_score,
        due_at: task.due_at,
        allow_hints: true,
        test_cases: task.test_cases.map((item) => ({
          name: item.name,
          hidden: item.hidden,
          weight: item.weight,
        })),
      })
      props.notify('任务已复制到草稿箱')
      await load()
    } catch (reason: any) {
      props.notify(reason.message || '复制任务失败')
    }
  }

  const taskMenu = (task: ApiTask) => ({
    items: [
      { key: 'monitor', icon: <Activity size={14} />, label: '查看提交监控' },
      { key: 'edit-settings', icon: <Settings2 size={14} />, label: '打开发布设置', disabled: task.status === 'closed' },
      { type: 'divider' as const },
      { key: 'duplicate', icon: <Copy size={14} />, label: '复制为草稿' },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'monitor') openTaskView('monitor', task.id)
      if (key === 'edit-settings') editTask(task, 2)
      if (key === 'duplicate') void duplicateTask(task)
    },
  })

  const generateAI = async () => {
    setAiLoading(true)
    try {
      const result = await api.aiTaskDraft({
        course_id: props.courseId,
        class_id: props.classId,
        prompt: aiPrompt,
      })
      setDraftId(result.id)
      form.setFieldsValue({
        title: result.title,
        type: result.type,
        chapter: result.chapter,
        description: result.description,
      })
      setAiOpen(false)
      setPanelOpen(true)
      props.notify('AI 生成结果已进入草稿，需教师修改确认后发布')
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) return <PageLoader />

  return <div className={'exact-course-page task-v2-page ' + (panelOpen ? 'panel-open' : '')}>
    <div className="task-v2-layout">
      <main>
        <div className="task-v2-heading">
          <div>
            <CourseBreadcrumb current="任务管理" onNavigate={props.onNavigate} />
            <Title level={2}>任务管理</Title>
            <Text type="secondary">创建、管理并发布课程任务，查看各班级下发状态。</Text>
          </div>
        </div>

        <div className="task-v2-filter">
          <Select value={typeFilter} onChange={setTypeFilter} options={typeOptions} suffixIcon={<ChevronDown size={14} />} />
          <Select value={chapterFilter} onChange={setChapterFilter} options={chapterOptions} suffixIcon={<ChevronDown size={14} />} />
          <Select value={classFilter} onChange={setClassFilter} options={classOptions} suffixIcon={<ChevronDown size={14} />} />
          <Input allowClear prefix={<Search size={15} />} placeholder="搜索任务标题" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button type="primary" icon={<Plus size={15} />} onClick={openCreator}>新建作业</Button>
        </div>

        <div className="task-v2-tabs">
          <Tabs activeKey={statusFilter} onChange={setStatusFilter} items={[
            { key: 'all', label: `全部 ${tasks.length}` },
            { key: 'published', label: `已发布 ${tasks.filter((item) => item.status === 'published').length}` },
            { key: 'scheduled', label: `待发布 ${tasks.filter((item) => item.status === 'scheduled').length}` },
            { key: 'draft', label: `草稿 ${tasks.filter((item) => item.status === 'draft').length}` },
            { key: 'closed', label: `已结束 ${tasks.filter((item) => item.status === 'closed').length}` },
          ]} />
          <Dropdown trigger={['click']} menu={{
            selectedKeys: [sortOrder],
            onClick: ({ key }) => setSortOrder(key as 'newest' | 'oldest'),
            items: [
              { key: 'newest', label: '创建时间：从新到旧' },
              { key: 'oldest', label: '创建时间：从旧到新' },
            ],
          }}>
            <Button type="text">{sortOrder === 'newest' ? '按创建时间（最新）' : '按创建时间（最早）'} <ChevronDown size={13} /></Button>
          </Dropdown>
        </div>

        <div className="task-v2-list">
          {!visibleTasks.length && <EmptyPanel text={tasks.length ? '当前筛选条件下没有匹配的任务' : '还没有课程任务，可以从新建作业开始'} />}
          {visibleTasks.map((task, index) => {
            const status = taskStatus(task)
            const canViewGrades = task.status === 'published' || task.status === 'closed'
            const Icon = index === 0 ? GitBranch : index === 1 ? ListChecks : Code2
            return <article id={`task-${task.id}`} className={focusedTaskId === task.id ? 'focused' : ''} key={task.id}>
              <span className={'task-v2-icon i' + index}><Icon size={26} /></span>
              <div className="task-v2-main">
                <div className="task-v2-meta-top"><Tag color="green">{task.chapter}</Tag><small>创建时间<b>{task.created_at?.slice(0,16).replace('T',' ') || '2024-05-21 10:30'}</b></small></div>
                <Title level={4}>{task.title}</Title>
                <Paragraph ellipsis={{ rows: 1 }}>{task.description}</Paragraph>
                <div className="task-v2-data">
                  <span><small>知识点</small><b>链表 / 链表删除</b></span>
                  <span><small>截止时间</small><b>{task.due_at.slice(0,16).replace('T',' ')}</b></span>
                  <span><small>下发班级</small><b>{Math.max(task.total ? 1 : 0, index + 1)} 个班级</b></span>
                  <span><small>提交概览</small><b>{task.submitted}/{task.total || 68} 提交</b></span>
                  <span><small>发布状态</small><b><i className={'task-state ' + status.color} />{status.text}</b></span>
                </div>
                <Space size={8}>
                  <Button size="small" icon={<Eye size={13} />} onClick={() => openTaskView('monitor', task.id)}>预览学生视角</Button>
                  <Button size="small" icon={<Edit3 size={13} />} onClick={() => editTask(task)}>编辑</Button>
                  <Tooltip title={canViewGrades ? '' : '任务发布后才能查看成绩'}>
                    <span className="task-grade-action"><Button size="small" icon={<MessageSquareText size={13} />} disabled={!canViewGrades} onClick={() => openTaskView('grading', task.id)}>查看成绩 ({task.submitted})</Button></span>
                  </Tooltip>
                  {task.status !== 'published' && <Button size="small" type="primary" onClick={() => editTask(task, 2)}>发布任务</Button>}
                  <Dropdown trigger={['click']} menu={taskMenu(task)}>
                    <Button size="small" icon={<MoreHorizontal size={13} />}>更多 <ChevronDown size={12} /></Button>
                  </Dropdown>
                </Space>
              </div>
            </article>
          })}
        </div>
        <div className="task-v2-pagination"><span>共 {visibleTasks.length} 条</span><Space><Button size="small">‹</Button><Button size="small" type="primary">1</Button><Button size="small">2</Button><Button size="small">›</Button><Select size="small" defaultValue="10" options={[{ value: '10', label: '10 条/页' }]} /></Space></div>
      </main>

      {panelOpen && <aside className="task-v2-panel">
        <div className="task-v2-panel-head"><div><Title level={3}>创建并发布任务</Title></div><Button type="text" icon={<X size={16} />} onClick={() => setPanelOpen(false)} /></div>
        <Steps current={step} size="small" items={[{ title: '基本信息' }, { title: '测试用例' }, { title: '发布设置' }, { title: '预览发布' }]} />
        <Button className="task-ai-button" block icon={<Sparkles size={15} />} onClick={() => setAiOpen(true)}>与 AI 对话生成练习草稿</Button>

        <Form form={form} layout="vertical" initialValues={{
          title: '单链表指定位置节点删除',
          type: 'programming',
          chapter: '第3章 函数结构',
          description: '给定单链表和头结点，删除指定位置节点并返回链表头结点。',
          difficulty: '进阶',
          due_at: '2026-12-30T23:59:00',
        }}>
          {step === 0 && <>
            <Form.Item label="任务标题" name="title" rules={[{ required: true }]}><Input showCount maxLength={50} /></Form.Item>
            <Form.Item label="题目说明" name="description"><Input.TextArea rows={4} showCount maxLength={500} /></Form.Item>
            <Form.Item label="知识点选择" name="chapter"><Select mode="multiple" options={['链表','链表删除','栈与队列'].map((value) => ({ value, label: value }))} /></Form.Item>
            <Row gutter={12}><Col span={12}><Form.Item label="任务类型" name="type"><Select options={[{ value: 'programming', label: '编程题' }, { value: 'single_choice', label: '单选题' }, { value: 'multiple_choice', label: '多选题' }, { value: 'true_false', label: '判断题' }, { value: 'fill_blank', label: '填空题' }, { value: 'short_answer', label: '简答题' }, { value: 'project', label: '综合项目' }]} /></Form.Item></Col><Col span={12}><Form.Item label="难度" name="difficulty"><Select options={['基础','进阶','挑战'].map((value) => ({ value, label: value }))} /></Form.Item></Col></Row>
          </>}
          {step === 1 && <>
            <Alert type="info" showIcon message="公开测试对学生可见，隐藏测试只对教师可见。" />
            {['基础用例','边界用例','隐藏用例'].map((name, index) => <div className="task-test-row" key={name}><Input value={name} readOnly /><InputNumber value={index === 2 ? 40 : 30} suffix="%" readOnly /><Tag color={index === 2 ? 'orange' : 'green'}>{index === 2 ? '隐藏' : '公开'}</Tag></div>)}
            <Button type="dashed" block icon={<Plus size={14} />}>添加测试用例</Button>
          </>}
          {step === 2 && <>
            <Form.Item label="截止时间" name="due_at"><Input /></Form.Item>
            <Form.Item label="下发班级"><Select mode="multiple" defaultValue={[props.classId]} options={props.classes.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
            <Form.Item label="提示开放级别"><Select defaultValue="3" options={[{ value: '3', label: '3 级提示（逐步引导）' }]} /></Form.Item>
            <Checkbox defaultChecked>允许学生在截止时间后查看题目与代码</Checkbox>
          </>}
          {step === 3 && <div className="task-preview-final"><CheckCircle2 /><Title level={4}>{form.getFieldValue('title')}</Title><p>{form.getFieldValue('description')}</p><Tag color="green">等待教师确认发布</Tag></div>}
        </Form>

        <div className="task-v2-panel-actions">
          {step > 0 ? <Button onClick={() => setStep(step - 1)}>上一步</Button> : <Button onClick={saveDraft} loading={saving}>保存为草稿</Button>}
          {step < 3 ? <Button type="primary" onClick={() => setStep(step + 1)}>下一步</Button> : <Button type="primary" onClick={publish} loading={saving}>确认发布</Button>}
        </div>
      </aside>}
    </div>

    <Modal title="AI 对话生成练习" open={aiOpen} onCancel={() => setAiOpen(false)} onOk={generateAI} confirmLoading={aiLoading} okText="生成到草稿">
      <div className="task-ai-chat"><span><Bot size={20} /></span><p>描述知识点、题型、难度或班级薄弱项。系统只创建草稿，发布前必须由教师修改确认。</p></div>
      <Input.TextArea rows={6} value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} />
      <Space wrap className="task-ai-prompts">{['生成链表编程题','生成 5 道选择题','生成二叉树项目'].map((text) => <Button size="small" key={text} onClick={() => setAiPrompt(text)}>{text}</Button>)}</Space>
    </Modal>
  </div>
}
