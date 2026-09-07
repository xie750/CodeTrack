import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Row, Segmented, Select, Skeleton, Space, Table, Tag, Tooltip, message } from 'antd'
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Gauge,
  RefreshCcw,
  Users,
} from 'lucide-react'
import type { EChartsOption } from 'echarts'
import PageHeader from '@admin/components/PageHeader'
import EChart from '@admin/components/charts/EChart'
import { colors } from '@admin/theme/themeConfig'
import { useAppStore } from '@admin/stores/useAppStore'
import { api, type AdminAiUsagePayload } from '../../../api'

type RangeKey = '7d' | '30d' | 'semester' | 'all'

const roleOptions = [
  { label: '全部角色', value: '' },
  { label: '学生', value: 'STUDENT' },
  { label: '教师', value: 'TEACHER' },
  { label: '系统任务', value: 'SYSTEM' },
]

const workflowOptions = [
  { label: '全部功能', value: '' },
  { label: 'AI 导师问答', value: 'student_ai_tutor_chat' },
  { label: '代码诊断', value: 'code_diagnosis' },
  { label: '带引用 AI 诊断', value: 'code_diagnosis_coach' },
  { label: '学习资料生成', value: 'student_resource_generation' },
  { label: 'PPT 大纲生成', value: 'student_ppt_generation' },
]

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString()
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(1)}%`
}

function formatLatency(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
  return `${value}ms`
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function SummaryCard({
  icon,
  label,
  value,
  note,
  color,
  tooltip,
}: {
  icon: React.ReactNode
  label: string
  value: string
  note: string
  color: string
  tooltip?: string
}) {
  return (
    <div className="ai-usage-stat">
      <div className="ai-usage-stat-icon" style={{ color, background: `${color}14` }}>
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="ai-usage-stat-label">
          {label}
          {tooltip && (
            <Tooltip title={tooltip} mouseEnterDelay={0.4}>
              <span className="ai-usage-help">?</span>
            </Tooltip>
          )}
        </div>
        <div className="ai-usage-stat-value">{value}</div>
        <div className="ai-usage-stat-note">{note}</div>
      </div>
    </div>
  )
}

export default function AiUsage() {
  const courses = useAppStore((s) => s.courses)
  const connectedModels = useAppStore((s) => s.connectedModels)
  const [range, setRange] = useState<RangeKey>('30d')
  const [courseId, setCourseId] = useState('')
  const [role, setRole] = useState('')
  const [workflowType, setWorkflowType] = useState('')
  const [modelName, setModelName] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [data, setData] = useState<AdminAiUsagePayload | null>(null)

  const loadData = (showLoading = true) => {
    if (showLoading) setLoading(true)
    else setRefreshing(true)
    api.getAdminAiUsage({
      range,
      course_id: courseId,
      role,
      workflow_type: workflowType,
      model_name: modelName,
    })
      .then((payload) => {
        setData(payload)
        setError('')
        setLastUpdatedAt(new Date())
      })
      .catch((err) => {
        const text = err instanceof Error ? err.message : '后端统计接口暂不可用'
        setError(text)
        message.error('AI 使用分析接口请求失败，未展示前端模拟数据')
      })
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }

  useEffect(() => {
    loadData(true)
    const timer = window.setInterval(() => loadData(false), 10000)
    return () => window.clearInterval(timer)
  }, [range, courseId, role, workflowType, modelName])

  const trends = data?.trends ?? []
  const courseBreakdown = data?.course_breakdown ?? []
  const featureBreakdown = data?.feature_breakdown ?? []

  const trendOption: EChartsOption = useMemo(() => ({
    color: ['#4A90D9', '#5DC59F', '#FFB54A'],
    tooltip: { trigger: 'axis' },
    legend: { data: ['调用次数', '使用人数', '成功率'], top: 0, textStyle: { color: '#5A6B7C', fontSize: 12 } },
    grid: { top: 42, right: 48, bottom: 30, left: 54 },
    xAxis: { type: 'category', data: trends.map((item) => item.bucket), axisTick: { show: false }, axisLine: { lineStyle: { color: '#E8EDF2' } }, axisLabel: { color: '#A0B2C6' } },
    yAxis: [
      { type: 'value', name: '次数/人数', nameTextStyle: { color: '#A0B2C6', fontSize: 11 }, splitLine: { lineStyle: { color: '#F0F2F5', type: 'dashed' } }, axisLabel: { color: '#A0B2C6' } },
      { type: 'value', name: '成功率', min: 0, max: 100, axisLabel: { color: '#A0B2C6', formatter: '{value}%' }, splitLine: { show: false } },
    ],
    series: [
      { name: '调用次数', type: 'bar', data: trends.map((item) => item.calls), barWidth: 24, itemStyle: { borderRadius: [4, 4, 0, 0] } },
      { name: '使用人数', type: 'line', data: trends.map((item) => item.users), smooth: true, symbol: 'circle', symbolSize: 6 },
      { name: '成功率', type: 'line', yAxisIndex: 1, data: trends.map((item) => item.success_rate), smooth: true, symbol: 'circle', symbolSize: 6 },
    ],
  }), [trends])

  const courseOption: EChartsOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    grid: { top: 24, right: 24, bottom: 30, left: 54 },
    xAxis: { type: 'category', data: courseBreakdown.map((item) => item.course_name), axisTick: { show: false }, axisLine: { lineStyle: { color: '#E8EDF2' } }, axisLabel: { color: '#5A6B7C', interval: 0 } },
    yAxis: { type: 'value', axisLabel: { color: '#A0B2C6' }, splitLine: { lineStyle: { color: '#F0F2F5', type: 'dashed' } } },
    series: [
      {
        name: 'AI 调用次数',
        type: 'bar',
        data: courseBreakdown.map((item) => item.calls),
        barWidth: 32,
        itemStyle: { color: '#4A90D9', borderRadius: [4, 4, 0, 0] },
      },
    ],
  }), [courseBreakdown])

  const featureOption: EChartsOption = useMemo(() => ({
    tooltip: { trigger: 'item', formatter: '{b}<br/>调用：{c} 次<br/>占比：{d}%' },
    legend: { bottom: 0, type: 'scroll', textStyle: { color: '#5A6B7C', fontSize: 12 } },
    series: [
      {
        name: '功能分布',
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '44%'],
        label: { color: '#1D2C3C', formatter: '{b}' },
        data: featureBreakdown.map((item, index) => ({
          name: item.label,
          value: item.calls,
          itemStyle: { color: ['#4A90D9', '#5DC59F', '#FFB54A', '#A78BFA', '#36C2CF'][index % 5] },
        })),
      },
    ],
  }), [featureBreakdown])

  const logColumns = [
    { title: 'Run ID', dataIndex: 'id', width: 150, render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
    { title: '时间', dataIndex: 'time', width: 150, render: (v: string | null) => <span style={{ fontSize: 12 }}>{formatTime(v)}</span> },
    { title: '用户', dataIndex: 'user_name', width: 110 },
    { title: '角色', dataIndex: 'role', width: 76, render: (v: string) => <Tag>{v === 'STUDENT' ? '学生' : v === 'TEACHER' ? '教师' : '系统'}</Tag> },
    { title: '课程', dataIndex: 'course_name', width: 128 },
    { title: 'AI 功能', dataIndex: 'feature', width: 150 },
    { title: '模型', dataIndex: 'model_name', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 86, render: (v: string) => <Tag color={v === 'SUCCEEDED' ? 'success' : 'error'}>{v === 'SUCCEEDED' ? '成功' : '失败'}</Tag> },
    { title: '耗时', dataIndex: 'latency_ms', width: 86, render: (v: number | null) => formatLatency(v) },
    { title: 'Token', dataIndex: 'tokens', width: 90, render: (v: number) => v.toLocaleString() },
  ]

  return (
    <div className="admin-page-fill ai-usage-page">
      <PageHeader
        title="AI 使用分析"
        desc="从调用规模、使用深度、成本消耗、质量效果和风险状态观察平台 AI 助学能力。"
        extra={
          <Space>
            <Tag color="success">真实后端接口</Tag>
            <Tag color="processing">10 秒自动刷新</Tag>
            {lastUpdatedAt && <Tag>{formatTime(lastUpdatedAt.toISOString())}</Tag>}
            <Button loading={refreshing} icon={<RefreshCcw size={14} />} onClick={() => loadData(false)}>刷新</Button>
          </Space>
        }
      />

      <Card style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: 14 } }}>
        <div className="ai-usage-filter">
          <Segmented
            options={[
              { label: '近 7 天', value: '7d' },
              { label: '近 30 天', value: '30d' },
              { label: '本学期', value: 'semester' },
              { label: '全部', value: 'all' },
            ]}
            value={range}
            onChange={(v) => setRange(v as RangeKey)}
          />
          <Select
            value={courseId}
            onChange={setCourseId}
            style={{ width: 180 }}
            options={[{ label: '全部课程', value: '' }, ...courses.map((c) => ({ label: c.name, value: c.id }))]}
          />
          <Select value={role} onChange={setRole} style={{ width: 140 }} options={roleOptions} />
          <Select value={workflowType} onChange={setWorkflowType} style={{ width: 180 }} options={workflowOptions} />
          <Select
            value={modelName}
            onChange={setModelName}
            style={{ width: 220 }}
            options={[{ label: '全部模型', value: '' }, ...connectedModels.map((m) => ({ label: m.nickname || m.modelName, value: m.modelName }))]}
          />
        </div>
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="AI 使用分析接口请求失败"
          description={`${error}。当前页面不会使用前端模拟数据兜底，请确认后端服务与管理员身份。`}
        />
      )}

      {loading && !data ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : data ? (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <SummaryCard icon={<Gauge size={21} />} label="AI 使用率" value={formatPercent(data.summary.ai_usage_rate)} note={`${data.summary.unique_users}/${data.summary.active_users} 名活跃用户`} color={colors.primary} tooltip="使用过 AI 的去重用户数 / 当前筛选下活跃用户数" />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <SummaryCard icon={<Activity size={21} />} label="调用次数" value={formatNumber(data.summary.total_calls)} note="所选范围内 AI 工作流运行数" color="#36C2CF" />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <SummaryCard icon={<Users size={21} />} label="使用人数" value={formatNumber(data.summary.unique_users)} note="按用户去重统计" color={colors.purple} />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <SummaryCard icon={<DatabaseZap size={21} />} label="Token 消耗" value={formatNumber(data.summary.total_tokens)} note="输入与输出 Token 合计" color={colors.warning} />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <SummaryCard icon={<CheckCircle2 size={21} />} label="成功率" value={formatPercent(data.summary.success_rate)} note={`失败率 ${formatPercent(data.summary.failure_rate)}`} color={colors.success} />
            </Col>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <SummaryCard icon={<Clock3 size={21} />} label="平均响应" value={formatLatency(data.summary.avg_latency_ms)} note={`P95 ${formatLatency(data.summary.p95_latency_ms)}`} color={colors.info} />
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={15}>
              <Card
                title={<span className="flex gap8"><BarChart3 size={16} style={{ color: colors.primary }} />调用趋势</span>}
                style={{ borderRadius: 12 }}
                styles={{ body: { padding: '8px 16px 12px' } }}
              >
                <EChart option={trendOption} height={300} />
              </Card>
            </Col>
            <Col xs={24} lg={9}>
              <Card
                title={<span className="flex gap8"><BrainCircuit size={16} style={{ color: colors.purple }} />价值与质量</span>}
                style={{ borderRadius: 12, height: '100%' }}
                styles={{ body: { padding: '12px 16px' } }}
              >
                <div className="ai-usage-quality-grid">
                  <div>
                    <span>有效使用率</span>
                    <b>{formatPercent(data.summary.effective_rate)}</b>
                  </div>
                  <div>
                    <span>引用支撑占比</span>
                    <b>{formatPercent(data.summary.citation_rate)}</b>
                  </div>
                  <div>
                    <span>低置信回答占比</span>
                    <b style={{ color: data.summary.low_confidence_rate > 20 ? colors.danger : 'var(--n-8)' }}>{formatPercent(data.summary.low_confidence_rate)}</b>
                  </div>
                </div>
                <div className="ai-usage-insights">
                  {data.insights.map((item) => (
                    <div key={item}>
                      <BrainCircuit size={14} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <Card
                title={<span className="flex gap8"><BookOpenCheck size={16} style={{ color: colors.primary }} />课程使用分布</span>}
                style={{ borderRadius: 12 }}
                styles={{ body: { padding: '8px 16px 12px' } }}
              >
                <EChart option={courseOption} height={300} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                title={<span className="flex gap8"><Activity size={16} style={{ color: colors.success }} />功能调用分布</span>}
                style={{ borderRadius: 12 }}
                styles={{ body: { padding: '8px 16px 12px' } }}
              >
                <EChart option={featureOption} height={300} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <Card title="课程明细" style={{ borderRadius: 12 }} styles={{ body: { padding: '8px 12px' } }}>
                <Table
                  rowKey="course_id"
                  size="small"
                  pagination={false}
                  dataSource={data.course_breakdown}
                  columns={[
                    { title: '课程', dataIndex: 'course_name' },
                    { title: '调用', dataIndex: 'calls', width: 88, render: formatNumber },
                    { title: '使用率', dataIndex: 'usage_rate', width: 88, render: formatPercent },
                    { title: '成功率', dataIndex: 'success_rate', width: 88, render: formatPercent },
                    { title: 'Token', dataIndex: 'tokens', width: 100, render: formatNumber },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="模型明细" style={{ borderRadius: 12 }} styles={{ body: { padding: '8px 12px' } }}>
                <Table
                  rowKey="model_name"
                  size="small"
                  pagination={false}
                  dataSource={data.model_breakdown}
                  columns={[
                    { title: '模型', dataIndex: 'model_name', ellipsis: true },
                    { title: '调用', dataIndex: 'calls', width: 88, render: formatNumber },
                    { title: '成功率', dataIndex: 'success_rate', width: 88, render: formatPercent },
                    { title: '均耗时', dataIndex: 'avg_latency_ms', width: 88, render: formatLatency },
                    { title: 'Token', dataIndex: 'tokens', width: 100, render: formatNumber },
                  ]}
                />
              </Card>
            </Col>
          </Row>

          {data.summary.total_calls === 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="当前筛选范围暂无 AI 调用记录"
              description="学生 AI 导师、代码诊断、资料生成或知识库处理产生 AgentRun 后，这里会自动出现统计结果。"
            />
          )}

          <Card title="最近 AI 调用明细" style={{ borderRadius: 12 }} styles={{ body: { padding: '8px 12px' } }}>
            <Table
              rowKey="id"
              size="small"
              columns={logColumns}
              dataSource={data.recent_logs}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={{ x: 1120 }}
            />
          </Card>
        </>
      ) : null}
    </div>
  )
}
