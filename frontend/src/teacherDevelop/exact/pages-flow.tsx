import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Avatar, Button, Col, Divider, Form, Input, InputNumber, Progress, Row,
  Segmented, Select, Slider, Space, Statistic, Switch, Table, Tabs, Tag, Timeline,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  AlertTriangle, Bot, Check, CheckCircle2, ChevronRight, Clock3, Code2,
  Download, Edit3, FileText, MessageSquareText, RefreshCw, Search, Send,
  Sparkles, Users, X,
} from 'lucide-react'

import {
  api, type ApiClass, type ApiQuestionInsightCluster, type ApiQuestionInsightDiagnosis, type ApiQuestionInsights,
  type ApiReview, type ApiStudent, type ApiSubmission, type ApiTask,
  type ApiTeacher, type ApiTeacherPreference,
} from '../api'
import type { ExactView } from './components'
import { CourseBreadcrumb, EmptyPanel, PageLoader } from './components'

const { Text, Title, Paragraph } = Typography

interface FlowProps {
  courseId: string
  classId: string
  onNavigate: (view: ExactView) => void
  notify: (text: string) => void
}

type ScoreDimensions = {
  autoTest: number
  codeQuality: number
  report: number
  participation: number
}

const scoreDimensionMeta: Array<{ key: keyof ScoreDimensions; label: string; max: number }> = [
  { key: 'autoTest', label: '自动测试', max: 40 },
  { key: 'codeQuality', label: '代码质量', max: 30 },
  { key: 'report', label: '实验报告', max: 20 },
  { key: 'participation', label: '课堂表现', max: 10 },
]

function SimpleBarPanel({ data, labelKey, color }: { data: Array<Record<string, any>>; labelKey: string; color: string }) {
  const max = Math.max(1, ...data.map((item) => Number(item.value) || 0))
  return <div className="simple-chart-panel">{data.map((item) => {
    const value = Number(item.value) || 0
    return <div className="simple-chart-row" key={`${item[labelKey]}-${value}`}>
      <span>{item[labelKey]}</span>
      <div><i style={{ width: `${Math.max(4, value / max * 100)}%`, background: color }} /></div>
      <b>{value}</b>
    </div>
  })}</div>
}

function aiScoreSuggestion(totalScore: number): ScoreDimensions {
  const bounded = Math.max(0, Math.min(100, Math.round(totalScore)))
  const suggestion: ScoreDimensions = { autoTest: 0, codeQuality: 0, report: 0, participation: 0 }
  const ranked = scoreDimensionMeta
    .map((item) => {
      const raw = bounded * item.max / 100
      suggestion[item.key] = Math.floor(raw)
      return { ...item, fraction: raw - Math.floor(raw) }
    })
    .sort((left, right) => right.fraction - left.fraction)
  let remainder = bounded - Object.values(suggestion).reduce((sum, value) => sum + value, 0)
  for (const item of ranked) {
    if (!remainder) break
    if (suggestion[item.key] < item.max) {
      suggestion[item.key] += 1
      remainder -= 1
    }
  }
  return suggestion
}

export function ExactMonitor({ courseId, onNavigate, notify }: FlowProps) {
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [taskId, setTaskId] = useState('')
  const [rows, setRows] = useState<ApiSubmission[]>([])
  const [selected, setSelected] = useState<ApiSubmission | null>(null)
  useEffect(() => {
    setLoading(true)
    api.tasks(courseId).then((items) => {
      setTasks(items)
      const requested = sessionStorage.getItem('codetrack:monitor-task-id') || ''
      const first = items.find((item) => item.id === requested)?.id
        || items.find((item) => item.status === 'published')?.id
        || items[0]?.id || ''
      setTaskId(first)
      if (!items.length) { setRows([]); setSelected(null) }
    }).finally(() => setLoading(false))
  }, [courseId])
  const load = () => {
    if (!taskId) return
    api.submissions(taskId).then((items) => { setRows(items); setSelected((current) => current && items.find((item) => item.id === current.id) || items[0] || null) })
  }
  useEffect(() => { void load() }, [taskId])
  if (loading) return <PageLoader />
  if (!tasks.length) return <div className="exact-course-page exact-monitor"><div className="exact-page-title"><div><Title level={2}>任务监控</Title><Text type="secondary">跟踪学生提交、测试结果、提示使用与 AI 诊断。</Text></div><Button type="primary" onClick={() => onNavigate('tasks')}>前往任务管理</Button></div><EmptyPanel text="当前课程还没有可监控的任务" /></div>
  const columns: ColumnsType<ApiSubmission> = [
    { title: '学生', render: (_,row) => <Space><Avatar size={28} className="exact-avatar">{row.student.name.slice(-1)}</Avatar><span><Text strong>{row.student.name}</Text><small>{row.student.number}</small></span></Space> },
    { title: '任务状态', dataIndex: 'status', render: () => <Tag color="green">已提交</Tag> },
    { title: '得分', render: (_,row) => row.grade?.score ?? row.evaluation?.score ?? '—' },
    { title: '通过测试', render: (_,row) => row.evaluation ? row.evaluation.passed_tests + '/' + row.evaluation.total_tests : '—' },
    { title: '提交版本', dataIndex: 'version' },
    { title: '最高提示', dataIndex: 'hint_level', render: (value) => value ? 'L' + value : '未使用' },
    { title: 'AI 诊断', render: (_,row) => row.diagnosis?.needs_teacher_review ? <Tag color="orange">待审核</Tag> : <Tag color="green">已生成</Tag> },
    { title: '操作', render: (_,row) => <Button type="link" onClick={() => setSelected(row)}>查看详情</Button> },
  ]
  const average = rows.length ? Math.round(rows.reduce((sum,item) => sum + (item.evaluation?.score || 0),0) / rows.length) : 0
  return <div className="exact-course-page exact-monitor">
    <div className="exact-page-title"><div><Text type="secondary">课程工作空间 / 任务监控</Text><Title level={2}>任务监控</Title><Text type="secondary">跟踪学生提交、测试结果、提示使用与 AI 诊断。</Text></div><Space><Button icon={<Download size={14} />} onClick={() => notify('当前筛选结果已导出')}>导出数据</Button><Button icon={<RefreshCw size={14} />} onClick={load}>刷新</Button></Space></div>
    <div className="monitor-toolbar"><Select value={taskId} onChange={setTaskId} options={tasks.map((item) => ({ value: item.id, label: item.title }))} /><Input prefix={<Search size={14} />} placeholder="学生姓名 / 学号" /><Select defaultValue="all" options={[{ value: 'all', label: '全部状态' }]} /></div>
    <div className="monitor-metrics"><span><Users /><small>提交学生</small><strong>{rows.length}</strong></span><span><CheckCircle2 /><small>平均得分</small><strong>{average}</strong></span><span><Clock3 /><small>平均提示</small><strong>L1.5</strong></span><span><Bot /><small>待审核诊断</small><strong>{rows.filter((item) => item.diagnosis?.needs_teacher_review).length}</strong></span></div>
    <div className="monitor-layout"><main><Table rowKey="id" columns={columns} dataSource={rows} pagination={{ pageSize: 10 }} /></main><aside>{selected ? <><div className="side-panel-head"><div><Title level={3}>{selected.student.name}</Title><Text type="secondary">提交版本 #{selected.version}</Text></div><Button type="primary" onClick={() => onNavigate('grading')}>进入批改</Button></div><div className="submission-code"><div className="code-head"><span>C++17 · {selected.evaluation?.runtime_ms || 0} ms</span><Tag color="green">通过 {selected.evaluation?.passed_tests}/{selected.evaluation?.total_tests}</Tag></div><pre>{selected.source_code}</pre></div><div className="test-result-list">{selected.evaluation?.details.map((item) => <div key={item.name}><CheckCircle2 className={item.passed ? '' : 'failed'} size={15} /><span>{item.name}</span><b>{item.passed ? '通过' : '未通过'}</b></div>)}</div>{selected.diagnosis && <Alert type={selected.diagnosis.needs_teacher_review ? 'warning' : 'info'} showIcon message={selected.diagnosis.type} description={selected.diagnosis.explanation} />}</> : <EmptyPanel text="选择一条提交记录" />}</aside></div>
  </div>
}

export function ExactGrading({ courseId, onNavigate, notify }: FlowProps) {
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [taskId, setTaskId] = useState('')
  const [rows, setRows] = useState<ApiSubmission[]>([])
  const [selected, setSelected] = useState<ApiSubmission | null>(null)
  const [score, setScore] = useState(0)
  const [scoreDimensions, setScoreDimensions] = useState<ScoreDimensions>(() => aiScoreSuggestion(0))
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  useEffect(() => {
    setLoading(true)
    api.tasks(courseId).then((items) => {
      setTasks(items)
      const requested = sessionStorage.getItem('codetrack:grading-task-id') || ''
      setTaskId(items.find((item) => item.id === requested)?.id
        || items.find((item) => item.status === 'published')?.id
        || items[0]?.id || '')
      if (!items.length) { setRows([]); setSelected(null) }
    }).finally(() => setLoading(false))
  }, [courseId])
  const applyStudentScore = (row: ApiSubmission | null) => {
    const nextScore = row?.grade?.score ?? row?.evaluation?.score ?? 0
    setSelected(row)
    setScore(nextScore)
    setScoreDimensions(row?.grade?.dimensions || aiScoreSuggestion(nextScore))
    setComment(row?.grade?.comment || '')
  }
  const load = () => { if (taskId) api.submissions(taskId).then((items) => { setRows(items); applyStudentScore(items[0] || null) }) }
  useEffect(() => { void load() }, [taskId])
  useEffect(() => { setStudentSearch('') }, [taskId])
  const visibleRows = useMemo(() => {
    const keyword = studentSearch.trim().toLowerCase()
    return rows.filter((row) => !keyword || `${row.student.name} ${row.student.number}`.toLowerCase().includes(keyword))
  }, [rows, studentSearch])
  const pick = (row: ApiSubmission) => applyStudentScore(row)
  const updateFinalScore = (value: number | null) => {
    const nextScore = Math.max(0, Math.min(100, value || 0))
    setScore(nextScore)
    setScoreDimensions(aiScoreSuggestion(nextScore))
  }
  const updateScoreDimension = (key: keyof ScoreDimensions, value: number) => {
    setScoreDimensions((current) => {
      const next = { ...current, [key]: value }
      setScore(Object.values(next).reduce((sum, item) => sum + item, 0))
      return next
    })
  }
  const restoreAiSuggestion = () => {
    const suggestedScore = selected?.grade?.score ?? selected?.evaluation?.score ?? 0
    setScore(suggestedScore)
    setScoreDimensions(aiScoreSuggestion(suggestedScore))
    notify('已恢复 AI 评分建议')
  }
  const save = async (publish: boolean) => {
    if (!selected) return
    setSaving(true)
    try {
      await api.saveGrade(selected.id, { score, comment, dimensions: scoreDimensions })
      if (comment) await api.feedback(selected.id, { content: comment, publish })
      if (publish) await api.publishGrade(selected.id)
      notify(publish ? '成绩与教师反馈已发布到学生端' : '批改草稿已保存')
      load()
    } catch (reason: any) { notify(reason.message) } finally { setSaving(false) }
  }
  if (loading) return <PageLoader />
  if (!tasks.length) return <div className="exact-course-page exact-grading"><div className="exact-page-title"><div><Title level={2}>批改工作区</Title><Text type="secondary">集中批改学生提交并发布成绩与反馈。</Text></div><Button type="primary" onClick={() => onNavigate('tasks')}>前往任务管理</Button></div><EmptyPanel text="当前课程还没有可批改的任务" /></div>
  return <div className="exact-course-page exact-grading">
    <CourseBreadcrumb current="学生成绩" parent={{ label: '任务管理', view: 'tasks' }} onNavigate={onNavigate} />
    <div className="grading-top"><div><Title level={2}>学生成绩</Title><Text type="secondary">{tasks.find((item) => item.id === taskId)?.title || '选择任务查看学生成绩'}</Text></div><Select showSearch optionFilterProp="label" filterOption={(input, option) => String(option?.label || '').toLowerCase().includes(input.toLowerCase())} value={taskId} onChange={setTaskId} placeholder="搜索或选择任务" aria-label="搜索或选择任务" options={tasks.map((item) => ({ value: item.id, label: item.title }))} /></div>
    <div className="grading-layout-real">
      <aside className="grading-student-list"><Input allowClear prefix={<Search size={14} />} value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="搜索学生姓名或学号" />{visibleRows.map((row) => <button className={selected?.id === row.id ? 'active' : ''} key={row.id} onClick={() => pick(row)}><Avatar size={27} className="exact-avatar">{row.student.name.slice(-1)}</Avatar><div><strong>{row.student.name}</strong><small>{row.student.number} · {row.evaluation?.passed_tests}/{row.evaluation?.total_tests} 测试 · L{row.hint_level}</small></div><Tag color={row.grade?.status === 'grade_published' ? 'green' : 'orange'}>{row.grade?.status === 'grade_published' ? '已发布' : '待批改'}</Tag></button>)}{!visibleRows.length && <div className="grading-student-empty">{rows.length ? '没有匹配的学生' : '当前任务暂无学生提交'}</div>}</aside>
      <main><div className="grading-code-head"><span>提交代码 · 版本 #{selected?.version}</span><Space><Button icon={<RefreshCw size={14} />}>重新评测</Button><Button icon={<Code2 size={14} />}>版本对比</Button></Space></div><pre>{selected?.source_code}</pre><div className="grading-tests">{selected?.evaluation?.details.map((item) => <span className={item.passed ? 'pass' : 'fail'} key={item.name}><CheckCircle2 size={14} />{item.name}</span>)}</div></main>
      <aside className="grading-score"><div className="final-score"><small>最终得分</small><InputNumber value={score} min={0} max={100} onChange={updateFinalScore} /><strong>/ 100</strong></div><Divider /><div className="score-basis-heading"><span><strong>评分依据</strong><Tag color="green" icon={<Sparkles size={11} />}>AI 建议</Tag></span><Button type="link" size="small" onClick={restoreAiSuggestion}>恢复建议</Button></div><p className="score-basis-hint">AI 提供初始评分，拖动各项后由教师最终确认。</p>{scoreDimensionMeta.map((item) => <div className="score-dimension" key={item.key}><span>{item.label}<small>{scoreDimensions[item.key]}/{item.max}</small></span><Slider aria-label={item.label} value={scoreDimensions[item.key]} max={item.max} onChange={(value) => updateScoreDimension(item.key, value)} /></div>)}<Divider /><strong>教师反馈</strong><Input.TextArea rows={5} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="输入给学生的具体反馈" /><div className="grade-actions"><Button loading={saving} onClick={() => save(false)}>保存草稿</Button><Button type="primary" loading={saving} icon={<Send size={14} />} onClick={() => save(true)}>发布成绩</Button></div></aside>
    </div>
  </div>
}

export function ExactAnalytics({ courseId, classId, classes, notify }: FlowProps & { classes: ApiClass[] }) {
  const [data, setData] = useState<any>(null)
  const [questionInsights, setQuestionInsights] = useState<ApiQuestionInsights | null>(null)
  const [view, setView] = useState('班级总览')
  const [diagnosisClassId, setDiagnosisClassId] = useState(classId)
  const [students, setStudents] = useState<ApiStudent[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedQuestionId, setSelectedQuestionId] = useState('')
  const [showQuestionDiagnosis, setShowQuestionDiagnosis] = useState(false)
  const [questionDiagnosis, setQuestionDiagnosis] = useState<ApiQuestionInsightDiagnosis | null>(null)
  const [diagnosisLoading, setDiagnosisLoading] = useState(false)
  const [diagnosingClusterId, setDiagnosingClusterId] = useState<string | null>(null)
  const [interventionLoading, setInterventionLoading] = useState<string | null>(null)
  const courseClasses = useMemo(() => classes.filter((item) => item.course_id === courseId), [classes, courseId])
  useEffect(() => {
    setDiagnosisClassId(classId || courseClasses[0]?.id || '')
    setStudentSearch('')
    setSelectedQuestionId('')
    setShowQuestionDiagnosis(false)
    setQuestionDiagnosis(null)
    setDiagnosingClusterId(null)
    setInterventionLoading(null)
  }, [classId, courseId])
  useEffect(() => { api.analytics(courseId, diagnosisClassId || classId).then(setData) }, [courseId, classId, diagnosisClassId])
  useEffect(() => {
    if (!diagnosisClassId && !classId) { setQuestionInsights(null); return }
    api.questionInsights(courseId, diagnosisClassId || classId)
      .then((payload) => {
        setQuestionInsights(payload)
        setSelectedQuestionId((current) => payload.clusters.some((item) => item.id === current) ? current : payload.clusters[0]?.id || '')
      })
      .catch((reason: any) => notify(reason.message || '高频疑问数据加载失败'))
  }, [courseId, classId, diagnosisClassId])
  useEffect(() => {
    if (!diagnosisClassId) { setStudents([]); setSelectedStudentId(''); return }
    api.students(diagnosisClassId).then((items) => {
      setStudents(items)
      setSelectedStudentId((current) => items.some((item) => item.id === current) ? current : items[0]?.id || '')
    }).catch((reason: any) => notify(reason.message || '学生名单加载失败'))
  }, [diagnosisClassId])
  const visibleStudents = useMemo(() => {
    const keyword = studentSearch.trim().toLowerCase()
    return students.filter((item) => !keyword || `${item.name} ${item.number}`.toLowerCase().includes(keyword))
  }, [studentSearch, students])
  const selectedStudent = students.find((item) => item.id === selectedStudentId) || students[0]
  const selectedQuestion = questionInsights?.clusters.find((item) => item.id === selectedQuestionId) || questionInsights?.clusters[0]
  const generateQuestionDiagnosis = async (clusterId?: string | null) => {
    const targetClassId = diagnosisClassId || classId || null
    setDiagnosisLoading(true)
    setDiagnosingClusterId(clusterId || null)
    setShowQuestionDiagnosis(true)
    try {
      const result = await api.diagnoseQuestionInsights({ course_id: courseId, class_id: targetClassId, cluster_id: clusterId || null })
      setQuestionDiagnosis(result)
      notify('AI 诊断已由真实模型生成')
    } catch (reason: any) {
      setQuestionDiagnosis(null)
      notify(reason.message || '真实模型诊断失败')
    } finally {
      setDiagnosisLoading(false)
      setDiagnosingClusterId(null)
    }
  }
  const studentStatus = selectedStudent?.status === 'risk'
    ? { text: '高风险', color: 'red', note: '近期任务完成度偏低，建议重点关注学习进度与提示依赖。' }
    : selectedStudent?.status === 'attention'
      ? { text: '需关注', color: 'gold', note: '部分知识点掌握不稳定，建议安排针对性练习与反馈。' }
      : { text: '学习稳定', color: 'green', note: '当前学习节奏稳定，任务完成与知识点掌握情况正常。' }
  if (!data) return <PageLoader />
  const weakestPoint = [...data.knowledge].sort((left: any, right: any) => left.mastery - right.mastery)[0]?.name || '当前薄弱知识点'
  const runIntervention = async (key: string, body: { action: string; title: string; content: string; knowledge_point?: string | null; student_id?: string | null }) => {
    const targetClassId = diagnosisClassId || classId
    if (!targetClassId) {
      notify('请先选择教学班')
      return
    }
    setInterventionLoading(key)
    try {
      const result = await api.createLearningIntervention({ course_id: courseId, class_id: targetClassId, ...body })
      const suffix = result.task_id ? '，专项练习已进入学生端任务' : result.feedback_id ? '，反馈已写入学生提交记录' : ''
      notify(`已触达 ${result.recipients} 名学生${suffix}`)
    } catch (reason: any) {
      notify(reason.message || '干预动作执行失败')
    } finally {
      setInterventionLoading(null)
    }
  }
  const riskRows = students.filter((item) => item.status === 'risk' || item.status === 'attention')
  const riskColumns: ColumnsType<ApiStudent> = [
    { title: '学生', render: (_, row) => <Space><Avatar size={28} className="exact-avatar">{row.name.slice(-1)}</Avatar><span><Text strong>{row.name}</Text><small>{row.number}</small></span></Space> },
    { title: '风险等级', render: (_, row) => <Tag color={row.status === 'risk' ? 'red' : 'gold'}>{row.status === 'risk' ? '高风险' : '需关注'}</Tag> },
    { title: '证据', render: (_, row) => `进度 ${row.progress}% · 提交 ${row.submissions} 次 · L${row.hint_level || 0}` },
    { title: '建议动作', render: (_, row) => row.status === 'risk' ? '发送学习提醒并补充教师反馈' : '推送薄弱点复习提醒' },
    { title: '操作', render: (_, row) => <Space><Button size="small" loading={interventionLoading === `risk-${row.id}`} onClick={() => void runIntervention(`risk-${row.id}`, { action: 'risk_reminder', title: '学习进度提醒', content: `${row.name}，你近期在${weakestPoint}相关任务中的进度偏慢，请先完成复习资料并在本周内提交一次修正版本。`, knowledge_point: weakestPoint, student_id: row.id })}>提醒</Button><Button size="small" type="link" loading={interventionLoading === `feedback-${row.id}`} onClick={() => void runIntervention(`feedback-${row.id}`, { action: 'student_feedback', title: '教师个性化反馈', content: `${row.name}，老师建议你优先复盘${weakestPoint}，重点说明每一步边界条件，再完成一次小练习验证。`, knowledge_point: weakestPoint, student_id: row.id })}>反馈</Button></Space> },
  ]
  const questionColumns: ColumnsType<ApiQuestionInsightCluster> = [
    { title: '疑问主题', dataIndex: 'topic', width: 280, render: (_, row) => <button className="question-topic-button" onClick={() => setSelectedQuestionId(row.id)}><strong>{row.topic}</strong><small>{row.representative_question}</small></button> },
    { title: '次数', dataIndex: 'ask_count', width: 82, sorter: (left, right) => left.ask_count - right.ask_count },
    { title: '学生', width: 82, render: (_, row) => `${row.student_count} 人` },
    { title: '覆盖', width: 82, render: (_, row) => `${row.coverage_rate}%` },
    { title: '追问', width: 82, render: (_, row) => `${row.repeat_followup_rate}%` },
    { title: '未解决', width: 90, render: (_, row) => <Tag color={row.unresolved_rate >= 30 ? 'red' : row.unresolved_rate >= 20 ? 'gold' : 'blue'}>{row.unresolved_rate}%</Tag> },
    { title: '操作', width: 96, render: (_, row) => <Button size="small" type="link" loading={diagnosisLoading && diagnosingClusterId === row.id} onClick={(event) => { event.stopPropagation(); setSelectedQuestionId(row.id); void generateQuestionDiagnosis(row.id) }}>AI 诊断</Button> },
  ]
  return <div className="exact-course-page exact-analytics">
    <div className="exact-page-title"><div><Text type="secondary">课程工作空间 / 学情分析</Text><Title level={2}>学情分析</Title><Text type="secondary">基于提交、评测、提示和成绩证据分析班级学习状态。</Text></div><Button icon={<Download size={14} />} onClick={() => notify('学情分析已导出')}>导出报告</Button></div>
    <div className="analytics-toolbar">
      <Segmented value={view} onChange={setView} options={['班级总览','个体诊断','高频疑问','预警中心']} />
      {view === '个体诊断' ? <div className="analytics-student-picker">
        <Select value={diagnosisClassId} onChange={(value) => { setDiagnosisClassId(value); setStudentSearch(''); setSelectedStudentId('') }} options={courseClasses.map((item) => ({ value: item.id, label: item.name }))} placeholder="选择班级" />
        <Input allowClear prefix={<Search size={14} />} value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="搜索姓名或学号" />
        <Select showSearch optionFilterProp="label" value={selectedStudentId || undefined} onChange={setSelectedStudentId} placeholder="选择学生" options={visibleStudents.map((item) => ({ value: item.id, label: `${item.name} · ${item.number}` }))} />
      </div> : view === '高频疑问' ? <div className="analytics-student-picker question-filter">
        <Select value={diagnosisClassId} onChange={(value) => { setDiagnosisClassId(value); setSelectedQuestionId(''); setShowQuestionDiagnosis(false); setQuestionDiagnosis(null); setDiagnosingClusterId(null) }} options={courseClasses.map((item) => ({ value: item.id, label: item.name }))} placeholder="选择班级" />
        <Button icon={<Bot size={14} />} type="primary" loading={diagnosisLoading} onClick={() => { void generateQuestionDiagnosis(null) }}>AI 诊断</Button>
      </div> : <Select defaultValue="all" options={[{ value: 'all', label: '全部任务' }]} />}
    </div>
    <div className="analytics-metrics">{[['平均完成率',data.summary.completion_rate + '%'],['平均得分',data.summary.average_score],['逾期率',data.summary.overdue_rate + '%'],['平均提示等级','L' + data.summary.average_hint_level],['风险学生',data.summary.risk_students + ' 人'],['薄弱知识点',data.summary.weak_points + ' 个']].map((item,index) => <span className={'m' + index} key={item[0]}><small>{item[0]}</small><strong>{item[1]}</strong><em>{index % 2 ? '较上周 +2' : '较上周 +6%'}</em></span>)}</div>
    {view === '班级总览' && <>
      <div className="analytics-charts"><section><strong>成绩分布</strong><SimpleBarPanel data={data.score_distribution} labelKey="range" color="#1677ff" /></section><section><strong>高频错误</strong><SimpleBarPanel data={data.errors} labelKey="name" color="#e4a42d" /></section></div>
      <div className="knowledge-analysis"><strong>知识点掌握度</strong>{data.knowledge.map((item: any) => <div key={item.id}><span>{item.name}</span><Progress percent={item.mastery} strokeColor={item.mastery < 60 ? '#d95f59' : item.mastery < 75 ? '#e4a42d' : '#1677ff'} /><b>{item.mastery}%</b><Tag color={item.mastery < 60 ? 'red' : item.mastery < 75 ? 'gold' : 'green'}>{item.mastery < 60 ? '薄弱' : item.mastery < 75 ? '需关注' : '稳定'}</Tag></div>)}</div>
      <section className="analytics-action-board">
        <div className="analytics-action-head"><div><strong>本周教学干预</strong><Text type="secondary">把班级共性问题直接转成学生端动作。</Text></div><Tag color="blue">闭环执行</Tag></div>
        <div className="analytics-action-grid">
          <article>
            <Sparkles size={18} />
            <div><b>下发专项练习</b><p>围绕{weakestPoint}生成一组短练习，并同步到当前班级学生端任务。</p></div>
            <Button type="primary" loading={interventionLoading === 'class-practice'} onClick={() => void runIntervention('class-practice', { action: 'class_practice', title: `${weakestPoint}专项练习`, content: `根据本周学情分析，当前班级在${weakestPoint}上掌握不稳定。请完成这组 15 分钟专项练习，重点检查边界条件和解题步骤。`, knowledge_point: weakestPoint })}>生成并下发</Button>
          </article>
          <article>
            <FileText size={18} />
            <div><b>推送复习提醒</b><p>把薄弱知识点和复习路径发送给学生，形成课后跟进。</p></div>
            <Button loading={interventionLoading === 'class-reminder'} onClick={() => void runIntervention('class-reminder', { action: 'class_reminder', title: `${weakestPoint}复习提醒`, content: `请本周优先复习${weakestPoint}，完成课程资料中的示例阅读，并整理 1 条仍不理解的问题带到下次课。`, knowledge_point: weakestPoint })}>发送提醒</Button>
          </article>
          <article>
            <MessageSquareText size={18} />
            <div><b>发起课堂讨论</b><p>把共性错因变成讨论题，让学生先解释再练习。</p></div>
            <Button loading={interventionLoading === 'class-discussion'} onClick={() => void runIntervention('class-discussion', { action: 'discussion', title: `${weakestPoint}错因讨论`, content: `请结合最近一次任务，说明你在${weakestPoint}上最容易出错的一步，并写出一条避免该错误的方法。`, knowledge_point: weakestPoint })}>发起讨论</Button>
          </article>
        </div>
      </section>
    </>}
    {view === '个体诊断' && (selectedStudent ? <div className="student-diagnosis-real">
      <aside>
        <Avatar size={54} className="exact-avatar">{selectedStudent.name.slice(-1)}</Avatar>
        <Title level={3}>{selectedStudent.name}</Title>
        <Text type="secondary">{selectedStudent.number}</Text>
        <Tag color={studentStatus.color}>{studentStatus.text}</Tag>
        <p>{studentStatus.note}</p>
        <small>最近活跃：{selectedStudent.last_active}</small>
        <div className="student-intervention-actions">
          <Button type="primary" block icon={<Send size={14} />} loading={interventionLoading === `student-feedback-${selectedStudent.id}`} onClick={() => void runIntervention(`student-feedback-${selectedStudent.id}`, { action: 'student_feedback', title: '教师个性化学习建议', content: `${selectedStudent.name}，结合你最近的提交和提示使用情况，老师建议你先复盘${weakestPoint}，再用一题短练习检查自己是否能独立说明关键步骤。`, knowledge_point: weakestPoint, student_id: selectedStudent.id })}>发送学习建议</Button>
          <Button block loading={interventionLoading === `student-reminder-${selectedStudent.id}`} onClick={() => void runIntervention(`student-reminder-${selectedStudent.id}`, { action: 'risk_reminder', title: '学习跟进提醒', content: `${selectedStudent.name}，请在本周完成${weakestPoint}相关复习，并把仍不清楚的问题提交到课程讨论区。`, knowledge_point: weakestPoint, student_id: selectedStudent.id })}>推送跟进提醒</Button>
        </div>
      </aside>
      <main>
        <Row gutter={16}><Col span={6}><Statistic title="课程进度" value={selectedStudent.progress} suffix="%" /></Col><Col span={6}><Statistic title="平均得分" value={selectedStudent.score || 0} /></Col><Col span={6}><Statistic title="提交次数" value={selectedStudent.submissions} /></Col><Col span={6}><Statistic title="最高提示" value={`L${selectedStudent.hint_level || 0}`} /></Col></Row>
        <Divider />
        {data.knowledge.map((item: any, index: number) => { const mastery = Math.max(20, Math.min(100, Math.round(item.mastery * .55 + selectedStudent.progress * .45 - index * 2))); return <div className="student-kp" key={item.id}><span>{item.name}</span><Progress percent={mastery} strokeColor={mastery < 60 ? '#d95f59' : mastery < 75 ? '#e4a42d' : '#1677ff'} /><b>{mastery}%</b></div> })}
        <section className="individual-action-board">
          <div><strong>个体干预记录</strong><Text type="secondary">发送后学生端会收到通知；若学生有提交记录，反馈也会写入最近一次提交。</Text></div>
          <div><span><b>{weakestPoint}</b><small>建议优先复盘的知识点</small></span><span><b>{selectedStudent.hint_level ? `L${selectedStudent.hint_level}` : '未使用'}</b><small>最高提示依赖</small></span><span><b>{selectedStudent.status === 'risk' ? '需要跟进' : '常规观察'}</b><small>干预状态</small></span></div>
        </section>
      </main>
    </div> : <EmptyPanel text="当前班级没有可诊断的学生" />)}
    {view === '高频疑问' && (questionInsights ? <div className="question-insight-layout">
      <main>
        <Alert className="question-source-note" type={questionInsights.data_status.source === 'real' ? 'success' : 'info'} showIcon message={questionInsights.data_status.label} description={questionInsights.data_status.description} />
        <div className="question-insight-summary">
          {[
            ['主题数', questionInsights.summary.question_cluster_count],
            ['总提问', questionInsights.summary.total_questions],
            ['学生覆盖', `${questionInsights.summary.unique_students}/${questionInsights.scope.student_count}`],
            ['人均', questionInsights.summary.avg_questions_per_student],
            ['未解决', questionInsights.summary.unresolved_questions],
            ['低置信', questionInsights.summary.low_confidence_questions],
          ].map((item) => <span key={item[0]}><small>{item[0]}</small><strong>{item[1]}</strong></span>)}
        </div>
        {showQuestionDiagnosis && <section className="question-ai-diagnosis">
          <div><Bot size={18} /><strong>{questionDiagnosis?.title || questionInsights.diagnosis_capability.label}</strong>{questionDiagnosis ? <><Tag color="geekblue">{questionDiagnosis.model.name}</Tag><Tag color="blue">{questionDiagnosis.confidence}%</Tag></> : <Tag color="blue">等待模型生成</Tag>}</div>
          <p>{questionDiagnosis?.summary || questionInsights.diagnosis_capability.description}</p>
          <div className="question-diagnosis-grid">
            <article><b>教学建议</b>{questionDiagnosis ? questionDiagnosis.teaching_suggestions.map((item) => <span key={item}><Sparkles size={13} />{item}</span>) : <span><Sparkles size={13} />点击 AI 诊断后由真实模型实时生成。</span>}</article>
            <article><b>依据</b>{questionDiagnosis ? questionDiagnosis.evidence.map((item) => <span key={item}><FileText size={13} />{item}</span>) : <span><FileText size={13} />将读取当前表格统计、问题样本和知识点数据。</span>}</article>
          </div>
          {questionDiagnosis && <div className="question-model-meta"><span>{questionDiagnosis.model.provider}</span><span>{questionDiagnosis.generated_at.replace('T', ' ')}</span>{questionDiagnosis.model.duration_ms ? <span>{questionDiagnosis.model.duration_ms} ms</span> : null}</div>}
          {questionDiagnosis?.data_gaps.length ? <Alert type="warning" showIcon message="数据限制" description={questionDiagnosis.data_gaps.join('；')} /> : null}
        </section>}
        <Table rowKey="id" columns={questionColumns} dataSource={questionInsights.clusters} pagination={false} tableLayout="fixed" onRow={(record) => ({ onClick: () => setSelectedQuestionId(record.id) })} />
      </main>
      <aside className="question-detail-panel">
        {selectedQuestion ? <div className="question-detail-scroll">
          <div className="question-detail-head">
            <Tag color={selectedQuestion.severity === 'HIGH' ? 'red' : selectedQuestion.severity === 'MEDIUM' ? 'gold' : 'blue'}>{selectedQuestion.severity === 'HIGH' ? '高频高风险' : selectedQuestion.severity === 'MEDIUM' ? '重点关注' : '观察中'}</Tag>
            <Title level={3}>{selectedQuestion.topic}</Title>
            <Text type="secondary">{selectedQuestion.representative_question}</Text>
          </div>
          <div className="question-detail-metrics">
            <span><small>提问次数</small><strong>{selectedQuestion.ask_count}</strong></span>
            <span><small>覆盖学生</small><strong>{selectedQuestion.student_count}</strong></span>
            <span><small>覆盖率</small><strong>{selectedQuestion.coverage_rate}%</strong></span>
            <span><small>未解决率</small><strong>{selectedQuestion.unresolved_rate}%</strong></span>
          </div>
          <section>
            <strong>关联知识点</strong>
            <Space size={[4, 4]} wrap>{selectedQuestion.knowledge_points.map((item) => <Tag key={item}>{item}</Tag>)}</Space>
          </section>
          <section>
            <strong>关联错因</strong>
            {selectedQuestion.related_errors.map((item) => <p key={item}><AlertTriangle size={13} />{item}</p>)}
          </section>
          <section>
            <strong>具体提问详情</strong>
            <div className="question-sample-list">{selectedQuestion.sample_questions.map((item) => <article key={item.id}>
              <div><Avatar size={26} className="exact-avatar">{item.student_name.slice(-1)}</Avatar><b>{item.student_name}</b><Tag color={item.resolved ? 'green' : 'orange'}>{item.resolved ? '已解决' : '仍在追问'}</Tag></div>
              <p>{item.question}</p>
              <div className="question-sample-meta"><span>{item.intent}</span><span>追问 {item.followups} 次</span><span>置信 {item.ai_confidence}%</span><span>{item.asked_at}</span></div>
            </article>)}</div>
          </section>
          <section className="cluster-diagnosis">
            <div><Bot size={15} /><strong>当前问题诊断</strong>{questionDiagnosis?.target.cluster_id === selectedQuestion.id ? <><Tag color="geekblue">{questionDiagnosis.model.name}</Tag><Tag color="blue">{questionDiagnosis.confidence}%</Tag></> : <Tag color="blue">实时生成</Tag>}</div>
            <p>{questionDiagnosis?.target.cluster_id === selectedQuestion.id ? questionDiagnosis.summary : '点击下方按钮后，系统会把该问题的统计、学生追问样本和关联知识点发送给真实模型生成诊断。'}</p>
            {questionDiagnosis?.target.cluster_id === selectedQuestion.id && <div className="cluster-practice-list">{questionDiagnosis.practice_suggestions.map((item) => <span key={item}>{item}</span>)}</div>}
            <Button type="primary" block loading={diagnosisLoading} icon={<MessageSquareText size={14} />} onClick={() => { void generateQuestionDiagnosis(selectedQuestion.id) }}>生成当前问题诊断</Button>
          </section>
        </div> : <EmptyPanel text="选择一个问题查看详情" />}
      </aside>
    </div> : <PageLoader />)}
    {view === '预警中心' && <div className="risk-table intervention-risk-center">
      <Alert type="warning" showIcon message="预警干预队列" description="风险不只用于展示。教师可直接给学生发送提醒或写入个性化反馈，学生端会收到站内通知。" />
      <div className="risk-action-strip">
        <span><strong>{riskRows.length}</strong><small>待跟进学生</small></span>
        <span><strong>{riskRows.filter((item) => item.status === 'risk').length}</strong><small>高风险</small></span>
        <span><strong>{weakestPoint}</strong><small>优先干预知识点</small></span>
        <Button type="primary" loading={interventionLoading === 'risk-batch'} onClick={() => void runIntervention('risk-batch', { action: 'class_reminder', title: '班级学习跟进提醒', content: `本周请重点复习${weakestPoint}，未完成任务的同学请优先补交，并在课程讨论区提交一个仍不理解的问题。`, knowledge_point: weakestPoint })}>批量提醒</Button>
      </div>
      <Table rowKey="id" pagination={false} dataSource={riskRows} columns={riskColumns} />
      {!riskRows.length && <EmptyPanel text="当前没有需要进入干预队列的学生" />}
    </div>}
  </div>
}

export function ExactReviews({ notify }: FlowProps) {
  const [rows, setRows] = useState<ApiReview[]>([])
  const [selected, setSelected] = useState<ApiReview | null>(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const load = () => api.reviews().then((items) => { setRows(items); setSelected((current) => current && items.find((item) => item.id === current.id) || items[0] || null) })
  useEffect(() => { void load() }, [])
  const action = async (status: string) => {
    if (!selected) return
    try {
      await api.reviewAction(selected.id, { status, reviewed_explanation: status === 'modified' ? text : null, comment: '' })
      notify(status === 'accepted' ? '诊断已接受' : status === 'rejected' ? '诊断已驳回' : '教师修订版已保存')
      setEditing(false); load()
    } catch (reason: any) { notify(reason.message) }
  }
  if (!rows.length) return <div className="exact-course-page"><EmptyPanel text="当前没有待审核诊断" /></div>
  return <div className="exact-course-page exact-reviews"><div className="exact-page-title"><div><Title level={2}>AI 审核中心</Title><Text type="secondary">审核低置信度、规则兜底和学生争议诊断。</Text></div></div><div className="review-layout-real"><aside><Segmented options={['待审核 ' + rows.filter((item) => item.status === 'pending').length,'全部记录']} />{rows.map((item) => <button className={selected?.id === item.id ? 'active' : ''} key={item.id} onClick={() => setSelected(item)}><div><strong>{item.student}</strong><Tag color={item.status === 'pending' ? 'orange' : 'green'}>{item.status === 'pending' ? '待审核' : '已处理'}</Tag></div><span>{item.task}</span><small>{item.type} · {item.confidence}%</small></button>)}</aside><main><div className="detail-header"><div><Tag color="orange">待审核</Tag><Title level={3}>{selected?.type}</Title><Text type="secondary">{selected?.student} · {selected?.task}</Text></div><Space><Button danger icon={<X size={14} />} onClick={() => action('rejected')}>驳回</Button><Button icon={<Edit3 size={14} />} onClick={() => { setText(selected?.explanation || ''); setEditing(true) }}>修改后接受</Button><Button type="primary" icon={<Check size={14} />} onClick={() => action('accepted')}>接受诊断</Button></Space></div><div className="ai-original"><div><Bot size={17} /><strong>AI 原始诊断</strong><Tag color={(selected?.confidence || 0) < 70 ? 'orange' : 'green'}>{selected?.confidence}% 置信度</Tag></div><Paragraph>{selected?.explanation}</Paragraph><span><FileText size={14} /> 引用来源：{selected?.source}</span></div><Alert type={selected?.fallback ? 'warning' : 'info'} showIcon message={selected?.fallback ? '规则兜底结果' : '模型诊断结果'} description="原始诊断不可覆盖，教师审核版本单独保存并记录审计日志。" /><Divider /><Timeline items={[{ color: 'green', children: 'AI 诊断生成 · ' + selected?.created_at.slice(0,16).replace('T',' ') },{ color: 'blue', children: '进入教师审核队列' }]} />{editing && <div className="review-editor"><strong>教师修订内容</strong><Input.TextArea rows={6} value={text} onChange={(event) => setText(event.target.value)} /><Space><Button onClick={() => setEditing(false)}>取消</Button><Button type="primary" onClick={() => action('modified')}>保存并接受</Button></Space></div>}</main></div></div>
}

export function ExactSettings({ notify, teacher }: FlowProps & { teacher: ApiTeacher }) {
  const [preferences, setPreferences] = useState<ApiTeacherPreference | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.preferences()
      .then(setPreferences)
      .catch((reason: any) => setError(reason.message || '教师偏好加载失败'))
  }, [])

  const updatePreference = (key: keyof Omit<ApiTeacherPreference, 'updated_at'>, value: boolean) => {
    setPreferences((current) => current ? { ...current, [key]: value } : current)
  }

  const save = async () => {
    if (!preferences) return
    setSaving(true)
    setError('')
    try {
      const saved = await api.savePreferences({
        notifications_enabled: preferences.notifications_enabled,
        ai_assistant_enabled: preferences.ai_assistant_enabled,
        email_digest: preferences.email_digest,
      })
      setPreferences(saved)
      notify('通知与 AI 偏好已写入数据库')
    } catch (reason: any) {
      setError(reason.message || '教师偏好保存失败')
    } finally {
      setSaving(false)
    }
  }

  return <div className="exact-course-page exact-settings"><div className="exact-page-title"><div><Title level={2}>个人设置</Title><Text type="secondary">管理教师资料、通知和 AI 助教偏好。</Text></div></div><div className="settings-real"><aside>{['个人资料','通知设置','AI 助教偏好','数据与隐私'].map((item,index) => <button className={index === 0 ? 'active' : ''} key={item}>{item}<ChevronRight size={14} /></button>)}</aside><main><Title level={3}>个人资料</Title><Form layout="vertical"><Row gutter={14}><Col span={12}><Form.Item label="姓名"><Input value={teacher.name} readOnly /></Form.Item></Col><Col span={12}><Form.Item label="教师编号"><Input value={teacher.number} readOnly /></Form.Item></Col></Row><Form.Item label="所属院系"><Input value={teacher.department} readOnly /></Form.Item><Form.Item label="邮箱"><Input value={teacher.email} readOnly /></Form.Item><Alert type="info" showIcon message="账号资料由数据库教师档案维护" />{preferences ? <div className="settings-preferences"><Form.Item label="站内通知"><Switch checked={preferences.notifications_enabled} onChange={(value) => updatePreference('notifications_enabled', value)} checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item><Form.Item label="AI 助教"><Switch checked={preferences.ai_assistant_enabled} onChange={(value) => updatePreference('ai_assistant_enabled', value)} checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item><Form.Item label="邮件摘要"><Switch checked={preferences.email_digest} onChange={(value) => updatePreference('email_digest', value)} checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item></div> : !error && <PageLoader />}{error && <Alert type="error" showIcon message={error} />}<Button type="primary" loading={saving} disabled={!preferences} onClick={() => void save()}>保存偏好</Button></Form></main></div></div>
}
