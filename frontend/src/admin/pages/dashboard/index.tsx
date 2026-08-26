import { useEffect, useMemo, useState } from 'react'
import { Card, Row, Col, Tag, Badge, Button, Modal, Select, Input, message } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  GraduationCap,
  Users,
  School,
  FlaskConical,
  Zap,
  Server,
  Megaphone,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Activity,
  TrendingUp,
  TrendingDown,
  Edit3,
  Save,
  Trash2,
} from 'lucide-react'
import EChart from '@admin/components/charts/EChart'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'
import type { Notice } from '@admin/types'
import type { EChartsOption } from 'echarts'

// ===== 时间问候 =====
function greet(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function fmtDate(): string {
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${week[d.getDay()]}`
}

// ===== 迷你指标卡（左图标 + 右三行文字：标签 → 数值 → 变化描述） =====
function MiniStat({ icon, label, value, color, trend, trendLabel, onClick }: {
  icon: React.ReactNode; label: string; value: string | number; color: string; trend?: number; trendLabel?: string; onClick?: () => void;
}) {
  const isUp = (trend ?? 0) >= 0
  const trendColor = trend === undefined ? 'transparent' : isUp ? 'var(--c-success)' : 'var(--c-danger)'
  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 16px', borderRadius: 10, background: 'var(--n-0)',
        cursor: onClick ? 'pointer' : 'default', border: '1px solid var(--n-2)',
        display: 'flex', alignItems: 'center', gap: 14, height: '100%',
      }}
    >
      {/* 左侧图标 */}
      <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}14`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'center' }}>
        {icon}
      </div>
      {/* 右侧三行文字：标签在顶部，趋势在底部 */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, height: 64, flex: 1 }}>
        {/* 行1：标签 */}
        <span style={{ fontSize: 12, color: 'var(--n-6)', fontWeight: 500, lineHeight: 1.4 }}>{label}</span>
        {/* 行2：数值 */}
        <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color: 'var(--n-9)' }}>{value}</span>
        {/* 行3：变化描述（始终占位） */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--n-6)', fontSize: 11, lineHeight: 1.4, minHeight: 16 }}>
          {trend !== undefined && trendLabel ? (
            <>
              {trendLabel}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: trendColor, fontWeight: 600 }}>
                {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {Math.abs(trend)}%
              </span>
            </>
          ) : null}
        </span>
      </div>
    </div>
  )
}

// 待办/预警区固定卡片高度
const GOLDEN_CARD_HEIGHT = 240

export default function Dashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const todoParam = searchParams.get('todo')

  const profile = useAppStore((s) => s.profile)
  const teachers = useAppStore((s) => s.teachers)
  const students = useAppStore((s) => s.students)
  const courses = useAppStore((s) => s.courses)
  const projects = useAppStore((s) => s.projects)
  const compliance = useAppStore((s) => s.compliance)
  const subjectRoutes = useAppStore((s) => s.subjectRoutes)
  const connectedModels = useAppStore((s) => s.connectedModels)
  const callLogs = useAppStore((s) => s.aiCallLogs)
  const aiAlerts = useAppStore((s) => s.aiAlerts)
  const notices = useAppStore((s) => s.notices)
  const updateNotice = useAppStore((s) => s.updateNotice)
  const deleteNotice = useAppStore((s) => s.deleteNotice)
  const logs = useAppStore((s) => s.logs)

  // ===== 聚合 =====
  const studentCount = students.length
  const teacherCount = teachers.length
  const courseCount = courses.length
  const modelOnline = connectedModels.filter((m) => m.enabled && m.modelType === 'primary').length
  const modelTotal = connectedModels.filter((m) => m.modelType === 'primary').length
  const avgSuccess = useMemo(() => {
    if (!callLogs.length) return '—'
    const successCount = callLogs.filter((l) => l.status === '成功').length
    return ((successCount / callLogs.length) * 100).toFixed(1)
  }, [callLogs])
  const projectTodo = projects.filter((p) => p.status === '待审核').length
  const complianceTodo = compliance.filter((c) => c.status === '待处理').length

  // 今日活跃
  const today = new Date().toISOString().slice(0, 10) // 2026-08-10
  const activeStudentsToday = useMemo(
    () => students.filter((s) => s.lastActiveAt.startsWith(today)).length,
    [students, today],
  )
  const activeTeachersToday = useMemo(
    () => teachers.filter((t) => t.lastActiveAt.startsWith(today)).length,
    [teachers, today],
  )
  // 今日日志数
  const todayLogCount = useMemo(
    () => logs.filter((l) => l.time.startsWith(today)).length,
    [logs, today],
  )
  const publishedNotices = useMemo(() => notices.filter((n) => n.status === '已发布'), [notices])
  const draftNotices = useMemo(() => notices.filter((n) => n.status === '草稿'), [notices])
  const recentLogs = useMemo(() => logs.slice(0, 6), [logs])

  // 公告区：标签页切换 + 弹窗查看内容
  const [noticeTab, setNoticeTab] = useState<'已发布' | '草稿'>('已发布')
  const [viewingNotice, setViewingNotice] = useState<Notice | null>(null)
  const [editingDraft, setEditingDraft] = useState(false)
  const [editContent, setEditContent] = useState('')

  // 待办 + 预警空态
  const hasTodoItems = projectTodo > 0 || complianceTodo > 0

  // ===== 图表色板 =====
  const CHART_BLUE = colors.primary

  // 公共坐标轴弱化样式
  const faintAxis = {
    axisLine: { lineStyle: { color: '#E5E7EB' } },
    axisTick: { show: false },
    axisLabel: { color: '#9CA3AF', fontSize: 12 },
    splitLine: { lineStyle: { color: '#F3F4F6', type: 'dashed' as const } },
  }

  // ===== 图 1：AI模型运行观测 — 课程垂类大模型调用量 + 失败率折线 =====
  const AI_CHART_CYAN = '#36C2CF'
  const AI_CHART_ORANGE = '#F59E0B'
  const days = ['08/04', '08/05', '08/06', '08/07', '08/08', '08/09', '08/10']

  // 课程垂类大模型筛选
  const route = subjectRoutes[0]
  const courseModelOptions = useMemo(() => {
    if (!route) return []
    return connectedModels
      .filter((m) => m.subjectRouteId === route.id && m.modelType === 'primary')
      .map((m) => ({ label: m.nickname || m.modelName, value: m.modelName }))
  }, [connectedModels, route])
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  useEffect(() => {
    if (!selectedCourse && courseModelOptions.length > 0) {
      setSelectedCourse(courseModelOptions[0].value)
    }
  }, [selectedCourse, courseModelOptions])

  // 确定性伪随机 — 根据课程名 seed 生成稳定数据
  const courseSeed = useMemo(() => {
    let s = 0
    for (let i = 0; i < selectedCourse.length; i++) s += selectedCourse.charCodeAt(i)
    return s
  }, [selectedCourse])
  function dashRandom(seed: number) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return x - Math.floor(x)
  }

  // 根据 seed 动态生成调用量数据
  const courseCalls = useMemo(
    () => days.map((_, i) => Math.round(700 + dashRandom(courseSeed + i * 3) * 500)),
    [courseSeed],
  )
  const failRates = useMemo(
    () => days.map((_, i) => Math.round((1.5 + dashRandom(courseSeed + i * 7) * 3) * 10) / 10),
    [courseSeed],
  )

  // 汇总指标
  const courseCallTotal = courseCalls.reduce((a, b) => a + b, 0)
  const avgFailRate = (failRates.reduce((a, b) => a + b, 0) / failRates.length).toFixed(1)

  const selectedCourseLabel =
    courseModelOptions.find((o) => o.value === selectedCourse)?.label || selectedCourse

  const activityOption: EChartsOption = useMemo(() => {
    return {
      color: [AI_CHART_CYAN, AI_CHART_ORANGE],
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#E5E7EB',
        textStyle: { color: '#374151', fontSize: 13 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params : [params]
          const lines = p.map((d: any) => {
            const unit = d.seriesName.includes('率') ? '%' : ' 次'
            return `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${d.color};margin-right:6px;"></span>${d.seriesName}：<b>${d.value}${unit}</b>`
          })
          return `<b>${p[0]?.axisValue}</b><br/>${lines.join('<br/>')}`
        },
      },
      legend: {
        data: ['课程垂类大模型调用量', '接口失败率'],
        left: 'center', top: 0,
        textStyle: { fontSize: 12, color: '#6B7280' },
        itemWidth: 14, itemHeight: 10,
      },
      grid: { top: 40, right: 48, bottom: 28, left: 52 },
      xAxis: { type: 'category', data: days, boundaryGap: true, ...faintAxis },
      yAxis: [
        {
          type: 'value',
          name: '调用次数',
          nameTextStyle: { color: '#9CA3AF', fontSize: 11 },
          ...faintAxis,
        },
        {
          type: 'value',
          name: '失败率 %',
          nameTextStyle: { color: '#9CA3AF', fontSize: 11 },
          min: 0,
          max: 10,
          interval: 2,
          axisLabel: { color: '#9CA3AF', fontSize: 12, formatter: '{value}%' },
          axisLine: { lineStyle: { color: '#E5E7EB' } },
          axisTick: { show: false },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '课程垂类大模型调用量',
          type: 'bar',
          data: courseCalls,
          barWidth: 24,
          itemStyle: { color: AI_CHART_CYAN, borderRadius: [4, 4, 0, 0] },
        },
        {
          name: '接口失败率',
          type: 'line',
          yAxisIndex: 1,
          data: failRates,
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 2, color: AI_CHART_ORANGE, type: 'dashed' },
          itemStyle: { color: AI_CHART_ORANGE, borderColor: '#fff', borderWidth: 2 },
        },
      ],
    }
  }, [courseCalls, failRates])

  useEffect(() => {
    if (todoParam) {
      const t: Record<string, string> = { '科研项目审核': '/admin/research/projects', '合规审查': '/admin/research/compliance' }
      if (t[todoParam]) navigate(`${t[todoParam]}?todo=1`)
    }
  }, [todoParam, navigate])

  // ===== 渲染 =====
  const todoItems = [
    { label: '科研项目审核', desc: '新提交的立项申请等待审核', count: projectTodo, path: '/admin/research/projects?status=待审核' },
    { label: '合规审查处置', desc: 'AI 初检疑似违规需人工复核', count: complianceTodo, path: '/admin/research/compliance?status=待处理' },
  ]
  const pendingAlertList = aiAlerts.filter((a) => a.status === '待处理')
  const displayName = profile.realName || profile.nickname

  return (
    <div>
      {/* ====== 问候 ====== */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--n-9)' }}>
          {greet()}，{displayName}
        </div>
        <div style={{ fontSize: 13, color: 'var(--n-6)', marginTop: 4 }}>
          {fmtDate()} · 平台运行概况
        </div>
      </div>

      {/* ====== 迷你指标卡（6 卡一行） ====== */}
      <Row gutter={12}>
        <Col xs={24} sm={12} md={4}>
          <MiniStat icon={<GraduationCap size={22} />} label="学生总数" value={studentCount.toLocaleString()} color={colors.primary} trend={5} trendLabel="较上月" onClick={() => navigate('/admin/users/students')} />
        </Col>
        <Col xs={24} sm={12} md={4}>
          <MiniStat icon={<Users size={22} />} label="教师总数" value={teacherCount.toLocaleString()} color={colors.purple} trend={3} trendLabel="较上月" onClick={() => navigate('/admin/users/teachers')} />
        </Col>
        <Col xs={24} sm={12} md={4}>
          <MiniStat icon={<School size={22} />} label="课程总数" value={courseCount.toLocaleString()} color={colors.info} trend={2} trendLabel="较上月" onClick={() => navigate('/admin/users/classes')} />
        </Col>
        <Col xs={24} sm={12} md={4}>
          <MiniStat icon={<FlaskConical size={22} />} label="科研项目" value={projects.length} color={colors.warning} trend={8} trendLabel="较上周" onClick={() => navigate('/admin/research/projects')} />
        </Col>
        <Col xs={24} sm={12} md={4}>
          <MiniStat icon={<Zap size={22} />} label="模型成功率" value={`${avgSuccess}%`} color={colors.purple} trend={0.3} trendLabel="较昨日" onClick={() => navigate('/admin/ai/monitor')} />
        </Col>
        <Col xs={24} sm={12} md={4}>
          <MiniStat icon={<Server size={22} />} label="模型在线" value={`${modelOnline}/${modelTotal}`} color={colors.success} trend={3} trendLabel="课程垂类" onClick={() => navigate('/admin/ai/route')} />
        </Col>
      </Row>

      {/* ====== 主内容区：左流式 + 右贯穿 ====== */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {/* ─── 左栏 ─── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 待办 + 预警 — 等高、固定高度、内容滚动 */}
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Card
                style={{ borderRadius: 12, height: GOLDEN_CARD_HEIGHT, display: 'flex', flexDirection: 'column' }}
                styles={{ body: { padding: '14px 18px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldAlert size={15} style={{ color: 'var(--c-danger)' }} />待办事项
                  </span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  {hasTodoItems ? (
                    todoItems.map((t) => (
                    <div
                      key={t.label}
                      style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 8, transition: 'background .15s', background: 'var(--n-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{t.label}</span>
                          {t.count > 0 && <Badge count={t.count} size="small" />}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--n-6)' }}>{t.desc}</div>
                      </div>
                      <Button size="small" type="primary" onClick={() => navigate(t.path)} style={{ flexShrink: 0 }}>去处理</Button>
                    </div>
                    ))
                  ) : (
                    <div style={{ padding: '32px 0', textAlign: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--n-2)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShieldAlert size={20} style={{ color: 'var(--n-4)', opacity: 0.5 }} />
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--n-5)', fontWeight: 500, marginBottom: 4 }}>暂无待办事项</div>
                      <div style={{ fontSize: 12, color: 'var(--n-4)' }}>所有任务都已处理完毕，可以休息一下 ☕</div>
                    </div>
                  )}
                </div>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card
                style={{ borderRadius: 12, height: GOLDEN_CARD_HEIGHT, display: 'flex', flexDirection: 'column' }}
                styles={{ body: { padding: '14px 18px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={15} style={{ color: 'var(--c-warning)' }} />运行预警
                  </span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  {pendingAlertList.length > 0 ? (
                    pendingAlertList.map((a) => (
                      <div
                        key={a.id}
                        style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 8, transition: 'background .15s', background: 'var(--n-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Tag color={a.level === '严重' ? 'error' : 'warning'} style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>{a.level}</Tag>
                            <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.summary}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--n-6)', marginTop: 2 }}>{a.subject} · {a.time}</div>
                        </div>
                        <Button size="small" type="primary" onClick={() => navigate('/admin/ai/monitor')} style={{ flexShrink: 0 }}>去处理</Button>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '32px 0', textAlign: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--c-warning-bg)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <AlertTriangle size={20} style={{ color: 'var(--c-warning)', opacity: 0.4 }} />
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--n-5)', fontWeight: 500, marginBottom: 4 }}>暂无异常告警</div>
                      <div style={{ fontSize: 12, color: 'var(--n-4)' }}>系统运行平稳，一切正常 ✨</div>
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          {/* AI模型运行观测 */}
          <Card
            title={
              <span style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={15} style={{ color: colors.primary }} />AI模型运行观测
              </span>
            }
            extra={
              <Select
                value={selectedCourse}
                onChange={setSelectedCourse}
                style={{ width: 200 }}
                size="small"
                options={courseModelOptions}
                placeholder="选择课程垂类大模型"
              />
            }
            style={{ borderRadius: 12, marginTop: 16 }}
            styles={{ body: { padding: '0 20px 8px' } }}
          >
            {/* 头部汇总指标 */}
            <div style={{ display: 'flex', gap: 24, padding: '10px 0 6px', borderBottom: '1px solid var(--n-3)', marginBottom: 8 }}>
              {[
                { label: `${selectedCourseLabel} 总调用`, value: courseCallTotal.toLocaleString() + ' 次', color: AI_CHART_CYAN },
                { label: '日均调用量', value: Math.round(courseCallTotal / 7).toLocaleString() + ' 次', color: CHART_BLUE },
                { label: '平均失败率', value: avgFailRate + ' %', color: AI_CHART_ORANGE },
              ].map((s) => (
                <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--n-6)', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: s.color, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                </div>
              ))}
            </div>
            {/* 图表区 */}
            <EChart option={activityOption} height={280} />
          </Card>
        </div>

        {/* ─── 右栏 贯穿，flex列撑满 ─── */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 公告 — 已发布 / 草稿 标签页 */}
          <Card
            title={<span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Megaphone size={14} style={{ color: colors.primary }} />平台公告</span>}
            style={{ borderRadius: 12, flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            styles={{ body: { padding: '6px 14px 10px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
            extra={<a onClick={() => navigate('/admin/system/notices')} style={{ fontSize: 12 }}>详情</a>}
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              {/* 小型标签页切换 */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexShrink: 0 }}>
              <div
                onClick={() => setNoticeTab('已发布')}
                style={{
                  flex: 1, textAlign: 'center', fontSize: 12, fontWeight: noticeTab === '已发布' ? 600 : 400,
                  padding: '4px 0', borderRadius: 6, cursor: 'pointer', transition: 'all .15s',
                  background: noticeTab === '已发布' ? 'var(--primary)' : 'var(--n-2)',
                  color: noticeTab === '已发布' ? '#fff' : 'var(--n-7)',
                }}
              >
                已发布 {publishedNotices.length ? `(${publishedNotices.length})` : ''}
              </div>
              <div
                onClick={() => setNoticeTab('草稿')}
                style={{
                  flex: 1, textAlign: 'center', fontSize: 12, fontWeight: noticeTab === '草稿' ? 600 : 400,
                  padding: '4px 0', borderRadius: 6, cursor: 'pointer', transition: 'all .15s',
                  background: noticeTab === '草稿' ? 'var(--primary)' : 'var(--n-2)',
                  color: noticeTab === '草稿' ? '#fff' : 'var(--n-7)',
                }}
              >
                草稿 {draftNotices.length ? `(${draftNotices.length})` : ''}
              </div>
            </div>
            {/* 列表区 */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {noticeTab === '已发布' ? (
              publishedNotices.length > 0 ? (
                publishedNotices.map((n) => (
                  <div key={n.id} onClick={() => setViewingNotice(n)} style={{ padding: '7px 0', borderBottom: '1px solid var(--n-2)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {n.pinned && <span style={{ color: 'var(--c-danger)', fontSize: 14, lineHeight: 1 }}>●</span>}
                      <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--n-6)', marginTop: 2 }}>{n.publishAt || n.createdAt}</div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--n-2)', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Megaphone size={16} style={{ color: 'var(--n-4)', opacity: 0.4 }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--n-5)' }}>暂无已发布公告</div>
                  <div style={{ fontSize: 11, color: 'var(--n-4)', marginTop: 2 }}>发布第一条公告通知吧 📢</div>
                </div>
              )
            ) : (
              draftNotices.length > 0 ? (
                draftNotices.map((n) => (
                  <div key={n.id} onClick={() => setViewingNotice(n)} style={{ padding: '7px 0', borderBottom: '1px solid var(--n-2)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--n-6)', marginTop: 2 }}>{n.createdAt}</div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--n-2)', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Megaphone size={16} style={{ color: 'var(--n-4)', opacity: 0.4 }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--n-5)' }}>暂无草稿公告</div>
                  <div style={{ fontSize: 11, color: 'var(--n-4)', marginTop: 2 }}>当前没有待发布的公告 ✍️</div>
                </div>
              )
            )}
            </div>
            </div>
          </Card>

          {/* 最新动态 */}
          <Card
            title={<span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} style={{ color: colors.primary }} />最新动态</span>}
            style={{ borderRadius: 12, flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            styles={{ body: { padding: '6px 14px 10px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
            extra={<a onClick={() => navigate('/admin/system/logs')} style={{ fontSize: 12 }}>详情</a>}
          >
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {recentLogs.map((l) => (
              <div key={l.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--n-2)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: 'var(--n-6)', marginTop: 1, flexShrink: 0 }}>
                  <Activity size={11} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--n-8)' }}>{l.desc}</span>
                  <div style={{ fontSize: 11, color: 'var(--n-6)', marginTop: 1 }}>{l.time}</div>
                </div>
              </div>
            ))}
            </div>
          </Card>
        </div>
      </div>

      {/* 公告内容弹窗 */}
      <Modal
        title={viewingNotice?.title}
        open={!!viewingNotice}
        onCancel={() => { setViewingNotice(null); setEditingDraft(false); setEditContent('') }}
        footer={null}
        width={480}
        styles={{ body: { padding: '0 24px 24px', fontSize: 14, lineHeight: 1.8, color: 'var(--n-7)' } }}
      >
        {viewingNotice && (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 12, color: 'var(--n-5)' }}>
              <span>状态：<Tag color={viewingNotice.status === '已发布' ? 'success' : 'default'} style={{ fontSize: 11 }}>{viewingNotice.status}</Tag></span>
              <span>发布人：{viewingNotice.author}</span>
              <span>{viewingNotice.publishAt || viewingNotice.createdAt}</span>
            </div>
            {editingDraft && viewingNotice.status === '草稿' ? (
              <Input.TextArea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
                style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}
              />
            ) : (
              <div style={{ padding: '12px 16px', background: 'var(--n-1)', borderRadius: 8, fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>
                {viewingNotice.content}
              </div>
            )}

            {/* 草稿：编辑 / 保存 / 删除按钮 */}
            {viewingNotice.status === '草稿' && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {editingDraft ? (
                  <>
                    <Button
                      onClick={() => {
                        setEditingDraft(false)
                        setEditContent('')
                      }}
                    >
                      取消
                    </Button>
                    <Button
                      type="primary"
                      icon={<Save size={14} />}
                      onClick={() => {
                        updateNotice(viewingNotice.id, { content: editContent })
                        message.success('公告内容已保存')
                        setViewingNotice({ ...viewingNotice, content: editContent })
                        setEditingDraft(false)
                      }}
                    >
                      保存
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      icon={<Edit3 size={14} />}
                      onClick={() => {
                        setEditContent(viewingNotice.content)
                        setEditingDraft(true)
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      danger
                      icon={<Trash2 size={14} />}
                      onClick={() => {
                        Modal.confirm({
                          title: '确认删除',
                          content: `确定要删除公告「${viewingNotice.title}」吗？`,
                          okText: '确认删除',
                          cancelText: '取消',
                          okButtonProps: { danger: true },
                          onOk: () => {
                            deleteNotice(viewingNotice.id)
                            message.success('公告已删除')
                            setViewingNotice(null)
                          },
                        })
                      }}
                    >
                      删除
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
