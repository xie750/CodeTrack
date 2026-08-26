import { useState, useMemo, useEffect } from 'react'
import { Card, Row, Col, Table, Button, Tag, Space, message, Segmented, Modal, Descriptions, Select, Form, Input, InputNumber, Steps, Timeline, Switch, Tooltip } from 'antd'
import { BellRing, TrendingUp, Settings, Plus, Edit3, Trash2, RotateCcw, ArrowRightCircle, Eye, UserCheck, XCircle, Play, Share2, FileText, CheckCircle } from 'lucide-react'
import EChart from '@admin/components/charts/EChart'
import type { EChartsOption } from 'echarts'
import PageHeader from '@admin/components/PageHeader'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'
import type { AiAlert, AlertRule, AlertStatus } from '@admin/types'

// ===== 状态流程定义 =====
const STATUS_STEPS = [
  { title: '告警产生', status: 'process' as const },
  { title: '已认领', status: 'wait' as const },
  { title: '处理中', status: 'wait' as const },
  { title: '已解决', status: 'wait' as const },
  { title: '已关闭', status: 'wait' as const },
]

const STATUS_ORDER: AlertStatus[] = ['待处理', '已认领', '处理中', '已解决', '已关闭']

function statusStep(status: AlertStatus): number {
  return STATUS_ORDER.indexOf(status)
}

function statusColor(status: AlertStatus): string {
  const map: Record<AlertStatus, string> = {
    '待处理': 'error', '已认领': 'warning', '处理中': 'processing', '已解决': 'success', '已关闭': 'default',
  }
  return map[status] || 'default'
}

function metricUnit(metric: AlertRule['metric']) {
  const map = { '延迟': 'ms', '成功率': '%', '错误率': '%', '调用量': '次/窗口' }
  return map[metric]
}

// ===== 确定性伪随机（基于索引 + seed，同参数永远返回相同值）=====
function pseudoRandom(idx: number, seed: number) {
  const x = Math.sin(idx * 12.9898 + seed * 78.233) * 43758.5453
  return x - Math.floor(x)
}

// 根据筛选生成稳定的趋势数据
function genTrendData(length: number, baseValue: number, amplitude: number, seed: number) {
  return Array.from({ length }, (_, i) => Math.round((baseValue + pseudoRandom(i, seed) * amplitude) * 10) / 10)
}

export default function AiMonitor() {
  const alerts = useAppStore((s) => s.aiAlerts)
  const handleAlert = useAppStore((s) => s.handleAlert)
  const alertRules = useAppStore((s) => s.alertRules)
  const addAlertRule = useAppStore((s) => s.addAlertRule)
  const updateAlertRule = useAppStore((s) => s.updateAlertRule)
  const removeAlertRule = useAppStore((s) => s.removeAlertRule)
  const toggleAlertRule = useAppStore((s) => s.toggleAlertRule)
  const subjectRoutes = useAppStore((s) => s.subjectRoutes)
  const manualSwitchRoute = useAppStore((s) => s.manualSwitchRoute)
  const connectedModels = useAppStore((s) => s.connectedModels)

  const [alertTab, setAlertTab] = useState('全部')
  const [alertDetail, setAlertDetail] = useState<AiAlert | null>(null)

  // ===== 课程垂类大模型列表（共用） =====
  const route = subjectRoutes[0]
  const courseModels = connectedModels.filter(
    (m) => m.subjectRouteId === route?.id && m.modelType === 'primary',
  )

  // 性能趋势状态
  const [trendRange, setTrendRange] = useState('24小时')
  const [trendModel, setTrendModel] = useState<string>('')
  const trendModelOptions = useMemo(() => {
    return courseModels.map((m) => ({ label: m.nickname || m.modelName, value: m.modelName }))
  }, [courseModels])
  const trendModelLabel = useMemo(() => {
    const m = courseModels.find((c) => c.modelName === trendModel)
    return m?.nickname || trendModel
  }, [courseModels, trendModel])
  useEffect(() => {
    if (!trendModel && trendModelOptions.length > 0) {
      setTrendModel(trendModelOptions[0].value)
    }
  }, [trendModel, trendModelOptions])

  // ===== 模型性能看板状态 =====
  const [perfCourse, setPerfCourse] = useState<string>('')
  const perfCourseOptions = useMemo(() => {
    return courseModels.map((m) => ({ label: m.nickname || m.modelName, value: m.modelName }))
  }, [courseModels])
  const perfCourseLabel = useMemo(() => {
    const m = courseModels.find((c) => c.modelName === perfCourse)
    return m?.nickname || perfCourse
  }, [courseModels, perfCourse])
  useEffect(() => {
    if (!perfCourse && perfCourseOptions.length > 0) {
      setPerfCourse(perfCourseOptions[0].value)
    }
  }, [perfCourse, perfCourseOptions])
  const perfSeed = useMemo(() => {
    let s = 0
    for (let i = 0; i < perfCourse.length; i++) s += perfCourse.charCodeAt(i)
    return s
  }, [perfCourse])

  // 模型性能看板专用伪随机（与页面级 pseudoRandom 签名不同）
  function modelPerfRandom(seed: number) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return x - Math.floor(x)
  }

  // 告警规则弹窗状态
  const [ruleOpen, setRuleOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null)
  const [ruleForm] = Form.useForm()

  // 处置记录弹窗
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordTarget, setRecordTarget] = useState<AiAlert | null>(null)
  const [recordContent, setRecordContent] = useState('')

  const filteredAlerts = alerts.filter((a) => alertTab === '全部' || a.status === alertTab)

  // ===== 性能趋势数据（确定性生成，随筛选变化）=====
  const trendXLabels = useMemo(() => {
    switch (trendRange) {
      case '1小时': return Array.from({ length: 12 }, (_, i) => `${i * 5}分`)
      case '24小时': return Array.from({ length: 24 }, (_, i) => `${(i % 24)}日`)
      case '7天': return ['08/04', '08/05', '08/06', '08/07', '08/08', '08/09', '08/10']
      case '30天': return Array.from({ length: 30 }, (_, i) => `${7 + Math.floor(i / 3)}/${11 + (i % 3)}`)
      default: return ['08/04', '08/05', '08/06', '08/07', '08/08', '08/09', '08/10']
    }
  }, [trendRange])

  // 根据课程模型+时间范围计算 seed，使不同筛选呈现不同但稳定的数据
  const dataSeed = useMemo(() => {
    let s = 0
    for (let i = 0; i < trendModel.length; i++) s += trendModel.charCodeAt(i)
    for (let i = 0; i < trendRange.length; i++) s += trendRange.charCodeAt(i)
    return s
  }, [trendModel, trendRange])

  const n = trendXLabels.length

  // 模型配色
  const CC = '#10B981'   // 课程垂类大模型 绿

  // ===== 左图：接口调用总次数 — 渐变半透明面积图 =====
  const callsVolumeOption: EChartsOption = useMemo(() => ({
    grid: { left: 52, right: 20, top: 10, bottom: 34 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: '#E5E7EB',
      borderWidth: 1,
      padding: [12, 16],
      extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,0.08);border-radius:8px',
      textStyle: { fontSize: 13, color: '#374151' },
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        const t = params[0]?.axisValue || ''
        const c = params.find((p: any) => p.seriesName === '课程垂类大模型')
        let html = `<div style="font-weight:600;font-size:13px;margin-bottom:8px;color:#111827;padding-bottom:6px;border-bottom:1px solid #F3F4F6">${t}</div>`
        if (c) html += `<div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${CC}"></span><span style="color:#6B7280;font-size:12px">课程垂类大模型</span><b style="margin-left:auto;padding-left:24px;font-size:13px">${c.value?.toLocaleString()} 次</b></div>`
        return html
      },
    },
    xAxis: {
      type: 'category', data: trendXLabels,
      axisLabel: { fontSize: 13, color: '#6B7280', interval: n > 14 ? Math.floor(n / 7) : 0 },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value', name: '请求数',
      nameTextStyle: { fontSize: 13, color: '#6B7280', padding: [0, 44, 0, 0] },
      axisLabel: { fontSize: 13, color: '#6B7280' },
      splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed', width: 0.5 } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: '课程垂类大模型', type: 'line' as const,
        data: genTrendData(n, 1800, 800, dataSeed + 2).map((v) => Math.round(v)),
        smooth: true, symbol: 'none',
        lineStyle: { width: 2.5, color: CC },
        areaStyle: {
          color: {
            type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16,185,129,0.28)' },
              { offset: 1, color: 'rgba(16,185,129,0.02)' },
            ],
          },
        },
        emphasis: { focus: 'series' as const },
      },
    ],
  }), [trendXLabels, dataSeed, n])

  // ===== 中图：请求响应等待时长 — 带圆点标记折线图，高耗时点位视觉突出 =====
  const latencyLineOption: EChartsOption = useMemo(() => {
    const cData = genTrendData(n, 560, 280, dataSeed + 4).map((v) => Math.round(v))
    const sorted = [...cData].sort((a, b) => a - b)
    const p80 = sorted[Math.floor(sorted.length * 0.8)] || 9999

    const fmt = (val: number, baseColor: string) =>
      val > p80
        ? { value: val, symbolSize: 13, itemStyle: { color: '#EF4444', borderColor: '#FCA5A5', borderWidth: 2 } }
        : { value: val, symbolSize: 6, itemStyle: { color: baseColor } }

    return {
      grid: { left: 52, right: 20, top: 10, bottom: 34 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: [12, 16],
        extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,0.08);border-radius:8px',
        textStyle: { fontSize: 13, color: '#374151' },
        formatter: (params: any) => {
          if (!Array.isArray(params)) return ''
          const t = params[0]?.axisValue || ''
          const c = params.find((p: any) => p.seriesName === '课程垂类大模型')
          let html = `<div style="font-weight:600;font-size:13px;margin-bottom:8px;color:#111827;padding-bottom:6px;border-bottom:1px solid #F3F4F6">${t}</div>`
          if (c) {
            const isHigh = c.value > p80
            html += `<div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${isHigh ? '#EF4444' : CC}"></span><span style="color:#6B7280;font-size:12px">课程垂类大模型</span>${isHigh ? '<span style="font-size:10px;color:#EF4444;margin-left:4px">⚠ 高耗时</span>' : ''}<b style="margin-left:auto;padding-left:24px;font-size:13px">${c.value} ms</b></div>`
          }
          return html
        },
      },
      xAxis: {
        type: 'category', data: trendXLabels,
        axisLabel: { fontSize: 13, color: '#6B7280', interval: n > 14 ? Math.floor(n / 7) : 0 },
        axisLine: { lineStyle: { color: '#E5E7EB' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value', name: 'ms',
        nameTextStyle: { fontSize: 13, color: '#6B7280', padding: [0, 40, 0, 0] },
        axisLabel: { fontSize: 13, color: '#6B7280' },
        splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed', width: 0.5 } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: '课程垂类大模型', type: 'line' as const,
          data: cData.map((val) => fmt(val, CC)),
          smooth: false,
          symbol: 'circle',
          lineStyle: { width: 2, color: CC },
          emphasis: { scale: 1.5, focus: 'series' as const },
        },
      ],
    }
  }, [trendXLabels, dataSeed, n])

  // ===== 右图：文本生成速度 — 普通平滑折线图 =====
  const tokenSmoothOption: EChartsOption = useMemo(() => ({
    grid: { left: 52, right: 20, top: 10, bottom: 34 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: '#E5E7EB',
      borderWidth: 1,
      padding: [12, 16],
      extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,0.08);border-radius:8px',
      textStyle: { fontSize: 13, color: '#374151' },
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        const t = params[0]?.axisValue || ''
        const c = params.find((p: any) => p.seriesName === '课程垂类大模型')
        let html = `<div style="font-weight:600;font-size:13px;margin-bottom:8px;color:#111827;padding-bottom:6px;border-bottom:1px solid #F3F4F6">${t}</div>`
        if (c) html += `<div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${CC}"></span><span style="color:#6B7280;font-size:12px">课程垂类大模型</span><b style="margin-left:auto;padding-left:24px;font-size:13px">${c.value?.toLocaleString()} Token/s</b></div>`
        return html
      },
    },
    xAxis: {
      type: 'category', data: trendXLabels,
      axisLabel: { fontSize: 13, color: '#6B7280', interval: n > 14 ? Math.floor(n / 7) : 0 },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value', name: 'Token/s',
      nameTextStyle: { fontSize: 13, color: '#6B7280', padding: [0, 54, 0, 0] },
      axisLabel: { fontSize: 13, color: '#6B7280' },
      splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed', width: 0.5 } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: '课程垂类大模型', type: 'line' as const,
        data: genTrendData(n, 3100, 1000, dataSeed + 2).map((v) => Math.round(v)),
        smooth: true, symbol: 'none',
        lineStyle: { width: 2.5, color: CC },
        emphasis: { focus: 'series' as const },
      },
    ],
  }), [trendXLabels, dataSeed, n])

  // ===== 模型性能看板：效果质量指标柱状图 =====
  const qualityBarOption: EChartsOption = useMemo(() => {
    const courseR = (offset: number) =>
      Math.round((75 + modelPerfRandom(perfSeed + offset) * 22) * 10) / 10
    return {
      grid: { left: 48, right: 20, top: 30, bottom: 36 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: unknown) =>
          typeof v === 'number' ? `${v.toFixed(1)}%` : String(v),
      },
      legend: {
        data: [{ name: '课程垂类大模型', icon: 'roundRect' }],
        top: 2,
        textStyle: { fontSize: 12, color: '#1D2C3C' },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 24,
      },
      xAxis: {
        type: 'category',
        data: ['准确率', 'F1 值', '召回率'],
        axisLabel: { fontSize: 12, color: '#1D2C3C', fontWeight: 500 },
        axisLine: { lineStyle: { color: '#E8EDF2' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 75,
        max: 100,
        axisLabel: { fontSize: 10, color: '#A0B2C6', formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#E8EDF2', type: 'dashed', width: 0.5 } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: '课程垂类大模型',
          type: 'bar',
          barWidth: 32,
          data: [courseR(4), courseR(5), courseR(6)],
          itemStyle: { color: colors.purple, borderRadius: [4, 4, 0, 0] },
          label: {
            show: true,
            position: 'top',
            distance: 4,
            fontSize: 12,
            fontWeight: 600,
            color: colors.purple,
            formatter: '{c}%',
          },
        },
      ],
    }
  }, [perfSeed])

  // ===== 模型性能看板：多维度综合能力雷达图 =====
  const radarOption: EChartsOption = useMemo(() => {
    const courseR = (offset: number) =>
      Math.round((70 + modelPerfRandom(perfSeed + offset) * 28) * 10) / 10
    return {
      radar: {
        center: ['50%', '54%'],
        radius: '55%',
        nameGap: 8,
        indicator: [
          { name: '领域适配性', max: 100 },
          { name: '文本通顺度', max: 100 },
          { name: '逻辑推理', max: 100 },
          { name: '指令遵循', max: 100 },
          { name: '抗干扰能力', max: 100 },
        ],
        axisName: { color: '#1D2C3C', fontSize: 11, fontWeight: 600 },
        splitArea: { areaStyle: { color: ['#ffffff', '#FAFBFC'] } },
        splitLine: { lineStyle: { color: '#DDE3EB', width: 0.5 } },
        axisLine: { lineStyle: { color: '#C8D2DD', width: 1 } },
      },
      tooltip: { trigger: 'item' },
      legend: {
        data: [{ name: '课程垂类大模型', icon: 'diamond' }],
        top: 2,
        textStyle: { fontSize: 12, color: '#1D2C3C' },
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 24,
      },
      series: [
        {
          type: 'radar',
          emphasis: { lineStyle: { width: 3 } },
          data: [
            {
              name: '课程垂类大模型',
              value: [courseR(12), courseR(13), courseR(14), courseR(15), courseR(16)],
              symbol: 'diamond',
              symbolSize: 6,
              lineStyle: { width: 2, color: colors.purple },
              areaStyle: {
                color: {
                  type: 'linear' as const,
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: 'rgba(167,139,250,0.22)' },
                    { offset: 1, color: 'rgba(167,139,250,0.03)' },
                  ],
                },
              },
              itemStyle: { color: colors.purple },
            },
          ],
        },
      ],
    }
  }, [perfSeed])

  // ===== 告警规则表格列 =====
  const ruleColumns = [
    {
      title: '告警指标', dataIndex: 'metric', width: 90,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '阈值', dataIndex: 'threshold', width: 100,
      render: (v: number, r: AlertRule) => <span style={{ fontSize: 12, fontWeight: 500 }}>{v.toLocaleString()} {metricUnit(r.metric)}</span>,
    },
    { title: '统计窗口', dataIndex: 'statisticalWindow', width: 90 },
    {
      title: '告警级别', dataIndex: 'alertLevel', width: 80,
      render: (v: string) => <Tag color={v === '严重' ? 'error' : v === '警告' ? 'warning' : 'default'}>{v}</Tag>,
    },
    {
      title: '启用', dataIndex: 'enabled', width: 60,
      render: (v: boolean, r: AlertRule) => <Switch size="small" checked={v} onChange={() => toggleAlertRule(r.id)} />,
    },
    {
      title: '操作', width: 80,
      render: (_: unknown, r: AlertRule) => (
        <Space size={2}>
          <Tooltip title="编辑" mouseEnterDelay={0.5}>
            <Button type="text" size="small" icon={<Edit3 size={14} />} onClick={() => { setEditingRule(r); ruleForm.setFieldsValue(r); setRuleOpen(true) }} style={{ color: '#A0B2C6' }} />
          </Tooltip>
          <Tooltip title="删除" mouseEnterDelay={0.5}>
            <Button type="text" size="small" icon={<Trash2 size={14} />} danger onClick={() => {
              Modal.confirm({
                title: '确认删除', content: `确定要删除该告警规则吗？`, okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true },
                onOk: () => { removeAlertRule(r.id); message.success('告警规则已删除') },
              })
            }} />
          </Tooltip>
        </Space>
      ),
    },
  ]

  // ===== 告警表格列（精简版：时间、级别、类型 + 图标操作） =====
  const alertColumns = [
    { title: '时间', dataIndex: 'time', width: 150, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
    {
      title: '级别', dataIndex: 'level', width: 60,
      render: (v: string) => <Tag color={v === '严重' ? 'error' : v === '警告' ? 'warning' : 'default'}>{v}</Tag>,
    },
    { title: '类型', dataIndex: 'type', width: 85 },
    {
      title: '操作', width: 150,
      render: (_: unknown, r: AiAlert) => (
        <Space size={2}>
          {r.status === '待处理' && (
            <>
              <Tooltip title="认领" mouseEnterDelay={0.5}>
                <Button type="text" size="small" icon={<UserCheck size={15} />} onClick={() => { handleAlert(r.id, '已认领'); message.success('告警已认领') }} style={{ color: colors.primary }} />
              </Tooltip>
              <Tooltip title="关闭" mouseEnterDelay={0.5}>
                <Button type="text" size="small" icon={<XCircle size={15} />} onClick={() => { handleAlert(r.id, '已关闭'); message.success('告警已关闭') }} danger />
              </Tooltip>
            </>
          )}
          {r.status === '已认领' && (
            <>
              <Tooltip title="开始处理" mouseEnterDelay={0.5}>
                <Button type="text" size="small" icon={<Play size={15} />} onClick={() => { handleAlert(r.id, '处理中'); message.success('已开始处理') }} style={{ color: colors.primary }} />
              </Tooltip>
              <Tooltip title="转派" mouseEnterDelay={0.5}>
                <Button type="text" size="small" icon={<Share2 size={14} />} onClick={() => message.info('转派功能开发中')} style={{ color: '#6B7280' }} />
              </Tooltip>
            </>
          )}
          {r.status === '处理中' && (
            <>
              <Tooltip title="处置记录" mouseEnterDelay={0.5}>
                <Button type="text" size="small" icon={<FileText size={14} />} onClick={() => { setRecordTarget(r); setRecordOpen(true) }} style={{ color: '#6B7280' }} />
              </Tooltip>
              <Tooltip title="标记已解决" mouseEnterDelay={0.5}>
                <Button type="text" size="small" icon={<CheckCircle size={15} />} onClick={() => {
                  Modal.confirm({
                    title: '确认标记已解决', content: '确定将当前告警标记为已解决？', okText: '确认', cancelText: '取消',
                    onOk: () => { handleAlert(r.id, '已解决'); message.success('告警已解决') },
                  })
                }} style={{ color: colors.success }} />
              </Tooltip>
            </>
          )}
          <Tooltip title="详情" mouseEnterDelay={0.5}>
            <Button type="text" size="small" icon={<Eye size={15} />} onClick={() => setAlertDetail(r)} style={{ color: '#6B7280' }} />
          </Tooltip>
        </Space>
      ),
    },
  ]

  const handleRuleSubmit = () => {
    ruleForm.validateFields().then((v: Record<string, unknown>) => {
      const data = {
        metric: v.metric as AlertRule['metric'],
        threshold: v.threshold as number,
        statisticalWindow: v.statisticalWindow as AlertRule['statisticalWindow'],
        alertLevel: v.alertLevel as AlertRule['alertLevel'],
        enabled: true,
        subject: '计算机科学与技术',
        createdAt: new Date().toISOString().slice(0, 10),
      }
      if (editingRule) {
        updateAlertRule(editingRule.id, data)
        message.success('告警规则已更新')
      } else {
        addAlertRule(data)
        message.success('告警规则已创建')
      }
      ruleForm.resetFields()
      setEditingRule(null)
      setRuleOpen(false)
    })
  }

  return (
    <div>
      <PageHeader title="运行观测与告警处置" />

      {/* ===== 实时性能趋势 ===== */}
      <Card
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}><TrendingUp size={16} style={{ color: colors.primary }} />实时性能趋势</span>}
        extra={<Segmented options={['1小时', '24小时', '7天', '30天']} value={trendRange} onChange={(v) => setTrendRange(v as string)} />}
        style={{ borderRadius: 12, marginBottom: 16 }}
      >
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <Select
            value={trendModel}
            onChange={setTrendModel}
            style={{ width: 220 }}
            options={trendModelOptions}
            placeholder="选择课程垂类大模型"
          />
        </div>

        {/* 图例 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 14, padding: '8px 14px', background: '#F9FAFB', borderRadius: 8 }}>
          <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>图例</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', fontWeight: 500 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#10B981' }} />
            课程垂类大模型
          </span>
        </div>

        <Row gutter={16}>
          <Col xs={24} lg={8}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2 }}>接口调用总次数</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>模型 API 请求量</div>
            <EChart option={callsVolumeOption} height={200} />
          </Col>
          <Col xs={24} lg={8}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2 }}>请求响应等待时长</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>响应延迟监控（ms）</div>
            <EChart option={latencyLineOption} height={200} />
          </Col>
          <Col xs={24} lg={8}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2 }}>文本生成速度</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>每秒产出 Token 数</div>
            <EChart option={tokenSmoothOption} height={200} />
          </Col>
        </Row>
      </Card>

      {/* ===== 模型性能看板 ===== */}
      <Card
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
            <TrendingUp size={16} style={{ color: colors.primary }} />
            模型性能看板
          </span>
        }
        style={{ borderRadius: 12, marginBottom: 16 }}
        extra={
          <Select
            value={perfCourse}
            onChange={setPerfCourse}
            style={{ width: 180 }}
            size="small"
            options={perfCourseOptions}
            placeholder="选择课程"
          />
        }
      >
        <Row gutter={20}>
          <Col xs={24} md={12}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--n-8)', marginBottom: 4 }}>
              效果质量指标{perfCourseLabel ? ` · ${perfCourseLabel}` : ''}
            </div>
            <EChart option={qualityBarOption} height={340} />
          </Col>
          <Col xs={24} md={12}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--n-8)', marginBottom: 4 }}>
              多维度综合能力{perfCourseLabel ? ` · ${perfCourseLabel}` : ''}
            </div>
            <EChart option={radarOption} height={340} />
          </Col>
        </Row>
      </Card>

      {/* ===== 告警规则 + 异常告警 同行 ===== */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}><Settings size={14} style={{ color: colors.warning }} />告警规则配置</span>}
            extra={<Button type="primary" size="small" icon={<Plus size={14} />} onClick={() => { ruleForm.resetFields(); setEditingRule(null); setRuleOpen(true) }} />}
            style={{ borderRadius: 12 }}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <Table
              rowKey="id"
              columns={ruleColumns}
              dataSource={alertRules}
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无告警规则' }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={<span className="flex gap8"><BellRing size={16} style={{ color: colors.danger }} />异常告警处置</span>}
            style={{ borderRadius: 12 }}
            extra={<Segmented options={['待处理', '已认领', '处理中', '已解决', '已关闭', '全部']} value={alertTab} onChange={(v) => setAlertTab(v as string)} size="small" />}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              <Table rowKey="id" columns={alertColumns} dataSource={filteredAlerts} pagination={false} size="small" />
            </div>
          </Card>
        </Col>
      </Row>

      {/* ===== 告警详情弹窗 ===== */}
      <Modal
        title={`告警详情 · ${alertDetail?.type}`}
        open={!!alertDetail}
        maskClosable={false}
        onCancel={() => setAlertDetail(null)}
        width={620}
        footer={null}
      >
        {alertDetail && (
          <>
            <Steps
              current={statusStep(alertDetail.status)}
              size="small"
              style={{ marginBottom: 16 }}
              items={STATUS_STEPS.map((s, i) => ({
                ...s,
                status: i <= statusStep(alertDetail.status) ? ('finish' as const) : ('wait' as const),
              }))}
            />

            <Descriptions column={2} bordered size="small" style={{ marginBottom: 12 }}>
              <Descriptions.Item label="时间">{alertDetail.time}</Descriptions.Item>
              <Descriptions.Item label="学科">{alertDetail.subject}</Descriptions.Item>
              <Descriptions.Item label="级别">
                <Tag color={alertDetail.level === '严重' ? 'error' : alertDetail.level === '警告' ? 'warning' : 'default'}>{alertDetail.level}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="类型">{alertDetail.type}</Descriptions.Item>
              <Descriptions.Item label="摘要" span={2}>{alertDetail.summary}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColor(alertDetail.status)}>{alertDetail.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="处理人">{alertDetail.handler || alertDetail.claimedBy || alertDetail.handledBy || '—'}</Descriptions.Item>
            </Descriptions>

            {alertDetail.handlingRecords && alertDetail.handlingRecords.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--n-7)', marginBottom: 8 }}>处置记录</div>
                <Timeline items={alertDetail.handlingRecords.map((r) => ({
                  children: (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--n-5)' }}>{r.time} · {r.operator}</div>
                      <div style={{ fontSize: 12, color: 'var(--n-7)', marginTop: 2 }}>{r.content}</div>
                    </div>
                  ),
                }))} />
              </div>
            )}

            <div style={{ padding: 12, background: 'var(--n-1)', borderRadius: 8, fontSize: 13, lineHeight: 1.8, marginBottom: 12 }}>
              {alertDetail.detail}
            </div>

            {alertDetail.type === '兜底切换' && (
              <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                <Button size="small" icon={<RotateCcw size={13} />} onClick={() => {
                  const route = subjectRoutes.find((r) => r.subject === alertDetail?.subject)
                  if (route) { manualSwitchRoute(route.id, 'primary', '告警处置：切回主模型'); message.success(`已切回 ${route.primaryModel}`) }
                }}>切回主模型</Button>
                <Button size="small" icon={<ArrowRightCircle size={13} />} onClick={() => {
                  const route = subjectRoutes.find((r) => r.subject === alertDetail?.subject)
                  if (route) { manualSwitchRoute(route.id, 'general_fallback', '告警处置：切到通用兜底'); message.success('已切到通用大模型') }
                }}>切到通用兜底</Button>
              </div>
            )}

            {/* 底部操作按钮 */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--n-2)' }}>
              {alertDetail.status === '待处理' && (
                <>
                  <Button onClick={() => { handleAlert(alertDetail.id, '已关闭'); setAlertDetail(null); message.success('告警已关闭') }}>关闭</Button>
                  <Button type="primary" onClick={() => { handleAlert(alertDetail.id, '已认领'); setAlertDetail(null); message.success('告警已认领') }}>认领</Button>
                </>
              )}
              {alertDetail.status === '已认领' && (
                <>
                  <Button onClick={() => { setRecordTarget(alertDetail); setRecordOpen(true); setAlertDetail(null) }}>转派</Button>
                  <Button type="primary" onClick={() => { handleAlert(alertDetail.id, '处理中'); setAlertDetail(null); message.success('已开始处理') }}>开始处理</Button>
                </>
              )}
              {alertDetail.status === '处理中' && (
                <>
                  <Button onClick={() => { setRecordTarget(alertDetail); setRecordOpen(true); setAlertDetail(null) }}>添加处置记录</Button>
                  <Button type="primary" onClick={() => {
                    Modal.confirm({
                      title: '确认标记已解决', content: '确定将当前告警标记为已解决？', okText: '确认', cancelText: '取消',
                      onOk: () => { handleAlert(alertDetail.id, '已解决'); setAlertDetail(null); message.success('告警已解决') },
                    })
                  }}>标记已解决</Button>
                </>
              )}
              {alertDetail.status === '已解决' && (
                <Button onClick={() => setAlertDetail(null)}>关闭</Button>
              )}
              {alertDetail.status === '已关闭' && (
                <Button onClick={() => setAlertDetail(null)}>关闭</Button>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* ===== 处置记录弹窗 ===== */}
      <Modal
        title="添加处置记录"
        open={recordOpen}
        onOk={() => {
          if (!recordContent.trim()) { message.warning('请输入处置内容'); return }
          handleAlert(recordTarget!.id, recordTarget!.status, { content: recordContent.trim() })
          message.success('处置记录已添加')
          setRecordContent('')
          setRecordTarget(null)
          setRecordOpen(false)
        }}
        onCancel={() => { setRecordContent(''); setRecordTarget(null); setRecordOpen(false) }}
        okText="提交"
        cancelText="取消"
      >
        <div style={{ marginBottom: 8, fontSize: 12, color: '#A0B2C6' }}>
          告警：{recordTarget?.summary}
        </div>
        <Input.TextArea
          value={recordContent}
          onChange={(e) => setRecordContent(e.target.value)}
          placeholder="请输入处置内容和处理进展..."
          rows={4}
        />
      </Modal>

      {/* ===== 告警规则新建/编辑弹窗 ===== */}
      <Modal
        title={editingRule ? '编辑告警规则' : '新建告警规则'}
        open={ruleOpen}
        onOk={handleRuleSubmit}
        onCancel={() => { ruleForm.resetFields(); setEditingRule(null); setRuleOpen(false) }}
        okText={editingRule ? '保存修改' : '创建规则'}
        cancelText="取消"
        destroyOnClose
        width={480}
      >
        <Form form={ruleForm} layout="vertical">
          <Form.Item name="metric" label="告警指标" rules={[{ required: true, message: '请选择告警指标' }]} initialValue="延迟">
            <Select options={[
              { label: '延迟（ms）', value: '延迟' },
              { label: '成功率（%）', value: '成功率' },
              { label: '错误率（%）', value: '错误率' },
              { label: '调用量（次/窗口）', value: '调用量' },
            ]} />
          </Form.Item>
          <Form.Item name="threshold" label="阈值" rules={[{ required: true, message: '请输入阈值' }]} initialValue={3000}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="statisticalWindow" label="统计窗口" rules={[{ required: true, message: '请选择统计窗口' }]} initialValue="5分钟">
            <Select options={[
              { label: '1分钟', value: '1分钟' },
              { label: '5分钟', value: '5分钟' },
              { label: '15分钟', value: '15分钟' },
              { label: '1小时', value: '1小时' },
            ]} />
          </Form.Item>
          <Form.Item name="alertLevel" label="告警级别" rules={[{ required: true, message: '请选择告警级别' }]} initialValue="警告">
            <Select options={[
              { label: '提示', value: '提示' },
              { label: '警告', value: '警告' },
              { label: '严重', value: '严重' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
