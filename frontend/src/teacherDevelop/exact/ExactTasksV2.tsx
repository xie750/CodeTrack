import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Checkbox, Col, Dropdown, Form, Input, InputNumber, Modal, Radio, Row,
  Select, Space, Steps, Tabs, Tag, Tooltip, Typography,
} from 'antd'
import {
  Activity, Bot, CheckCircle2, ChevronDown, Code2, Copy, Edit3, Eye, GitBranch, ListChecks,
  MessageSquareText, MoreHorizontal, Plus, Search, Settings2, Sparkles, X,
} from 'lucide-react'

import {
  api,
  defaultTaskStartAt,
  formatTaskDateTime,
  taskDateTimeInputValue,
  type ApiClass,
  type ApiCourse,
  type ApiTask,
  type ApiTaskQuestion,
} from '../api'
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

type TaskKind = 'programming' | 'question_set'

const QUESTION_TYPE_OPTIONS: Array<{ value: ApiTaskQuestion['question_type']; label: string }> = [
  { value: 'SINGLE_CHOICE', label: '单选题' },
  { value: 'MULTIPLE_CHOICE', label: '多选题' },
  { value: 'TRUE_FALSE', label: '判断题' },
  { value: 'FILL_BLANK', label: '填空题' },
]

function defaultQuestionOptions(type: ApiTaskQuestion['question_type']) {
  if (type === 'TRUE_FALSE') {
    return [
      { label: 'A', content: '正确', is_correct: false },
      { label: 'B', content: '错误', is_correct: true },
    ]
  }
  if (type === 'FILL_BLANK' || type === 'FILL_IN_BLANK') {
    return [{ label: '答案', content: 'head.next', is_correct: true }]
  }
  return [
    { label: 'A', content: '空链表', is_correct: type === 'MULTIPLE_CHOICE' },
    { label: 'B', content: '删除头结点', is_correct: true },
    { label: 'C', content: '位置越界', is_correct: type === 'MULTIPLE_CHOICE' },
    { label: 'D', content: '只处理普通中间节点', is_correct: false },
  ]
}

function createDefaultPaperQuestions(): ApiTaskQuestion[] {
  return [
    {
      question_type: 'SINGLE_CHOICE',
      stem: '链表删除头结点时，最关键的返回值是什么？',
      analysis: '删除头结点后，新的头指针应指向原 head.next。',
      knowledge_points: ['链表', '链表删除'],
      difficulty: 'BASIC',
      score: 10,
      options: [
        { label: 'A', content: '返回原 head', is_correct: false },
        { label: 'B', content: '返回 head.next', is_correct: true },
        { label: 'C', content: '返回空指针', is_correct: false },
        { label: 'D', content: '返回被删除节点', is_correct: false },
      ],
    },
    {
      question_type: 'MULTIPLE_CHOICE',
      stem: '设计链表删除逻辑时，通常需要覆盖哪些边界场景？',
      analysis: '空链表、头结点删除和越界位置都属于高频边界场景。',
      knowledge_points: ['链表', '边界处理'],
      difficulty: 'BASIC',
      score: 15,
      options: [
        { label: 'A', content: '空链表', is_correct: true },
        { label: 'B', content: '删除头结点', is_correct: true },
        { label: 'C', content: '位置越界', is_correct: true },
        { label: 'D', content: '只测试中间节点即可', is_correct: false },
      ],
    },
    {
      question_type: 'FILL_BLANK',
      stem: '删除头结点后，新的头指针通常应指向 ____。',
      analysis: '头结点被删除后，链表入口应更新为原头结点的 next。',
      knowledge_points: ['链表删除'],
      difficulty: 'BASIC',
      score: 10,
      options: [{ label: '答案', content: 'head.next', is_correct: true }],
    },
  ]
}

function normalizeQuestionForSubmit(question: ApiTaskQuestion, chapter: string[], index: number): ApiTaskQuestion {
  const type = question.question_type
  const isFill = type === 'FILL_BLANK' || type === 'FILL_IN_BLANK'
  const options = isFill
    ? [{ label: '答案', content: question.options[0]?.content || '', is_correct: true }]
    : question.options.map((option, optionIndex) => ({
        label: option.label || String.fromCharCode(65 + optionIndex),
        content: option.content,
        is_correct: option.is_correct,
      }))
  return {
    ...question,
    stem: question.stem || `第 ${index + 1} 题`,
    knowledge_points: question.knowledge_points?.length ? question.knowledge_points : chapter,
    score: Number(question.score || 10),
    options,
  }
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
  const taskKind = Form.useWatch('task_kind', form) as TaskKind | undefined
  const currentTaskKind: TaskKind = taskKind || 'question_set'
  const [paperQuestions, setPaperQuestions] = useState<ApiTaskQuestion[]>(createDefaultPaperQuestions)

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

  const courseClasses = useMemo(() => props.classes.filter((item) => item.course_id === props.courseId && item.id === props.classId), [props.classes, props.courseId, props.classId])
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
    setPaperQuestions(createDefaultPaperQuestions())
    form.resetFields()
    form.setFieldValue('start_at', defaultTaskStartAt())
  }

  const createDraft = async () => {
    if (draftId) return tasks.find((item) => item.id === draftId)
    const values = form.getFieldsValue()
    const kind: TaskKind = values.task_kind || currentTaskKind
    const chapter = Array.isArray(values.chapter) ? values.chapter : [values.chapter].filter(Boolean)
    const normalizedQuestions = paperQuestions.map((question, index) => normalizeQuestionForSubmit(question, chapter, index))
    if (kind === 'question_set') {
      if (!normalizedQuestions.length) throw new Error('题组试卷至少需要一道题目')
      const invalidQuestion = normalizedQuestions.find((question) => {
        const isFill = question.question_type === 'FILL_BLANK' || question.question_type === 'FILL_IN_BLANK'
        const correctCount = question.options.filter((option) => option.is_correct && option.content.trim()).length
        return !question.stem.trim() || correctCount === 0 || (!isFill && question.options.filter((option) => option.content.trim()).length < 2)
      })
      if (invalidQuestion) throw new Error('请补全题干、选项和正确答案后再保存')
    }
    const task = await api.createTask({
      course_id: props.courseId,
      class_id: null,
      title: values.title || (kind === 'question_set' ? '链表边界条件诊断小卷' : '单链表指定位置节点删除'),
      task_kind: kind,
      type: kind === 'programming' ? 'programming' : 'quiz',
      chapter_label: chapter.length ? chapter : ['链表'],
      description: values.description || (kind === 'question_set' ? '完成本组链表边界条件诊断题。' : '给定单链表和头结点，删除指定位置节点并返回链表头结点。'),
      starter_code: kind === 'programming' ? values.starter_code || 'ListNode* removeAt(ListNode* head, int index) {\n  return head;\n}' : '',
      difficulty: values.difficulty || '进阶',
      total_score: 100,
      start_at: values.start_at || defaultTaskStartAt(),
      due_at: values.due_at || '2026-12-30T23:59:00',
      allow_hints: true,
      questions: kind === 'question_set' ? normalizedQuestions : [],
      test_cases: kind === 'programming' ? [
        { name: '基础用例', input_data: 'values=[1,2,3], position=1', expected_output: '[1,3]', hidden: false, weight: 30 },
        { name: '边界用例', input_data: 'values=[], position=0', expected_output: '[]', hidden: false, weight: 30 },
        { name: '隐藏用例', input_data: 'values=[1,2,3], position=2', expected_output: '[1,2]', hidden: true, weight: 40 },
      ] : [],
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
        start_at: form.getFieldValue('start_at') || defaultTaskStartAt(),
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

  const updateQuestion = (index: number, patch: Partial<ApiTaskQuestion>) => {
    setPaperQuestions((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, ...patch } : question
    )))
  }

  const changeQuestionType = (index: number, questionType: ApiTaskQuestion['question_type']) => {
    updateQuestion(index, {
      question_type: questionType,
      options: defaultQuestionOptions(questionType),
    })
  }

  const updateQuestionOption = (questionIndex: number, optionIndex: number, patch: Partial<ApiTaskQuestion['options'][number]>) => {
    setPaperQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question
      return {
        ...question,
        options: question.options.map((option, currentOptionIndex) => (
          currentOptionIndex === optionIndex ? { ...option, ...patch } : option
        )),
      }
    }))
  }

  const setSingleCorrectOption = (questionIndex: number, optionIndex: number) => {
    setPaperQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question
      return {
        ...question,
        options: question.options.map((option, currentOptionIndex) => ({
          ...option,
          is_correct: currentOptionIndex === optionIndex,
        })),
      }
    }))
  }

  const addQuestion = () => {
    setPaperQuestions((current) => [
      ...current,
      {
        question_type: 'SINGLE_CHOICE',
        stem: `第 ${current.length + 1} 题题干`,
        analysis: '',
        knowledge_points: [],
        difficulty: 'BASIC',
        score: 10,
        options: defaultQuestionOptions('SINGLE_CHOICE'),
      },
    ])
  }

  const removeQuestion = (index: number) => {
    setPaperQuestions((current) => current.length <= 1 ? current : current.filter((_, questionIndex) => questionIndex !== index))
  }

  const openTaskView = (view: 'monitor' | 'grading', taskId: string) => {
    sessionStorage.setItem(`codetrack:${view}-task-id`, taskId)
    props.onNavigate(view)
  }

  const editTask = (task: ApiTask, nextStep = 0) => {
    setDraftId(task.id)
    setPanelOpen(true)
    setStep(nextStep)
    setPaperQuestions(createDefaultPaperQuestions())
    form.setFieldsValue({
      ...task,
      task_kind: task.type === 'programming' || task.type === 'project' ? 'programming' : 'question_set',
      chapter: task.chapter ? [task.chapter] : [],
      start_at: taskDateTimeInputValue(task.start_at),
      due_at: taskDateTimeInputValue(task.due_at, '2026-12-30T23:59'),
    })
  }

  const duplicateTask = async (task: ApiTask) => {
    try {
      await api.createTask({
        course_id: props.courseId,
        class_id: null,
        title: `${task.title}（副本）`,
        task_kind: task.type === 'programming' || task.type === 'project' ? 'programming' : 'question_set',
        type: task.type === 'programming' || task.type === 'project' ? 'programming' : 'quiz',
        chapter_label: task.chapter,
        description: task.description,
        starter_code: task.starter_code,
        difficulty: task.difficulty,
        total_score: task.total_score,
        start_at: task.start_at || defaultTaskStartAt(),
        due_at: task.due_at || '2026-12-30T23:59:00',
        allow_hints: true,
        questions: task.type === 'programming' || task.type === 'project' ? [] : createDefaultPaperQuestions(),
        test_cases: task.type === 'programming' || task.type === 'project' ? task.test_cases.map((item) => ({
          name: item.name,
          input_data: '',
          expected_output: '',
          hidden: item.hidden,
          weight: item.weight,
        })) : [],
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
      // The legacy AI draft endpoint still writes to the old teacher database.
      // Let the unified task create call persist the edited draft on publish.
      setDraftId('')
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
                  <span><small>开始时间</small><b>{formatTaskDateTime(task.start_at)}</b></span>
                  <span><small>截止时间</small><b>{formatTaskDateTime(task.due_at)}</b></span>
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
        <Steps current={step} size="small" items={[{ title: '基本信息' }, { title: currentTaskKind === 'programming' ? '测试用例' : '题目编辑' }, { title: '发布设置' }, { title: '预览发布' }]} />
        <Button className="task-ai-button" block icon={<Sparkles size={15} />} onClick={() => setAiOpen(true)}>与 AI 对话生成练习草稿</Button>

        <Form form={form} layout="vertical" initialValues={{
          title: '链表边界条件诊断小卷',
          task_kind: 'question_set',
          chapter: ['链表', '链表删除'],
          description: '完成本组链表边界条件诊断题。',
          difficulty: '进阶',
          start_at: defaultTaskStartAt(),
          due_at: '2026-12-30T23:59',
        }}>
          {step === 0 && <>
            <Form.Item label="任务标题" name="title" rules={[{ required: true }]}><Input showCount maxLength={50} /></Form.Item>
            <Form.Item label="题目说明" name="description"><Input.TextArea rows={4} showCount maxLength={500} /></Form.Item>
            <Form.Item label="知识点选择" name="chapter"><Select mode="multiple" options={['链表','链表删除','栈与队列'].map((value) => ({ value, label: value }))} /></Form.Item>
            <Row gutter={12}><Col span={12}><Form.Item label="任务形态" name="task_kind"><Select options={[{ value: 'question_set', label: '题组试卷' }, { value: 'programming', label: '编程任务' }]} /></Form.Item></Col><Col span={12}><Form.Item label="难度" name="difficulty"><Select options={['基础','进阶','挑战'].map((value) => ({ value, label: value }))} /></Form.Item></Col></Row>
          </>}
          {step === 1 && currentTaskKind === 'programming' && <>
            <Alert type="info" showIcon message="编程任务使用公开与隐藏测试用例，学生进入代码工作区完成提交。" />
            {['基础用例','边界用例','隐藏用例'].map((name, index) => <div className="task-test-row" key={name}><Input value={name} readOnly /><InputNumber value={index === 2 ? 40 : 30} suffix="%" readOnly /><Tag color={index === 2 ? 'orange' : 'green'}>{index === 2 ? '隐藏' : '公开'}</Tag></div>)}
            <Button type="dashed" block icon={<Plus size={14} />}>添加测试用例</Button>
          </>}
          {step === 1 && currentTaskKind === 'question_set' && <div className="task-paper-editor">
            <Alert type="info" showIcon message="题组试卷可以混合单选、多选、判断和填空题；学生端会进入做题页面，不再进入编程工作区。" />
            {paperQuestions.map((question, questionIndex) => {
              const isFill = question.question_type === 'FILL_BLANK' || question.question_type === 'FILL_IN_BLANK'
              const isMulti = question.question_type === 'MULTIPLE_CHOICE'
              return (
                <section className="task-question-card" key={questionIndex}>
                  <div className="task-question-card-head">
                    <Tag color="blue">第 {questionIndex + 1} 题</Tag>
                    <Select
                      size="small"
                      value={question.question_type}
                      options={QUESTION_TYPE_OPTIONS}
                      onChange={(value) => changeQuestionType(questionIndex, value)}
                    />
                    <InputNumber
                      min={1}
                      max={100}
                      value={question.score}
                      addonAfter="分"
                      onChange={(value) => updateQuestion(questionIndex, { score: Number(value || 10) })}
                    />
                    <Button size="small" danger disabled={paperQuestions.length <= 1} onClick={() => removeQuestion(questionIndex)}>删除</Button>
                  </div>
                  <Input.TextArea
                    rows={2}
                    value={question.stem}
                    onChange={(event) => updateQuestion(questionIndex, { stem: event.target.value })}
                    placeholder="输入题干"
                  />
                  {isFill ? (
                    <label className="task-fill-answer">
                      <span>标准答案</span>
                      <Input
                        value={question.options[0]?.content || ''}
                        onChange={(event) => updateQuestion(questionIndex, { options: [{ label: '答案', content: event.target.value, is_correct: true }] })}
                        placeholder="学生填写内容与标准答案一致即判为正确"
                      />
                    </label>
                  ) : (
                    <div className="task-question-options">
                      {question.options.map((option, optionIndex) => (
                        <div className="task-question-option" key={`${questionIndex}-${option.label}`}>
                          {isMulti ? (
                            <Checkbox checked={option.is_correct} onChange={(event) => updateQuestionOption(questionIndex, optionIndex, { is_correct: event.target.checked })} />
                          ) : (
                            <Radio checked={option.is_correct} onChange={() => setSingleCorrectOption(questionIndex, optionIndex)} />
                          )}
                          <Tag>{option.label}</Tag>
                          <Input value={option.content} onChange={(event) => updateQuestionOption(questionIndex, optionIndex, { content: event.target.value })} />
                        </div>
                      ))}
                    </div>
                  )}
                  <Input.TextArea
                    rows={2}
                    value={question.analysis}
                    onChange={(event) => updateQuestion(questionIndex, { analysis: event.target.value })}
                    placeholder="题目解析，提交后展示给学生"
                  />
                </section>
              )
            })}
            <Button type="dashed" block icon={<Plus size={14} />} onClick={addQuestion}>添加题目</Button>
          </div>}
          {step === 2 && <>
            <Row gutter={12}>
              <Col span={12}><Form.Item label="开始时间" name="start_at" rules={[{ required: true, message: '请选择开始时间' }]}><Input type="datetime-local" /></Form.Item></Col>
              <Col span={12}><Form.Item label="截止时间" name="due_at" rules={[{ required: true, message: '请选择截止时间' }]}><Input type="datetime-local" /></Form.Item></Col>
            </Row>
            <Form.Item label="下发班级"><Select mode="multiple" defaultValue={[props.classId]} options={courseClasses.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
            <Form.Item label="提示开放级别"><Select defaultValue="3" options={[{ value: '3', label: '3 级提示（逐步引导）' }]} /></Form.Item>
            <Checkbox defaultChecked>允许学生在截止时间后查看题目与代码</Checkbox>
          </>}
          {step === 3 && <div className="task-preview-final"><CheckCircle2 /><Title level={4}>{form.getFieldValue('title')}</Title><p>{form.getFieldValue('description')}</p><Tag color="green">{currentTaskKind === 'programming' ? '编程任务' : `${paperQuestions.length} 题混合试卷`} · 等待教师确认发布</Tag></div>}
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
