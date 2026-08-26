import { useMemo, useState } from 'react'
import { Card, Row, Col, Table, Segmented } from 'antd'
import { BadgeCheck, Heart, Clock3, Timer, Users } from 'lucide-react'
import PageHeader from '@admin/components/PageHeader'
import StatCard from '@admin/components/StatCard'
import StatusTag from '@admin/components/StatusTag'
import EChart from '@admin/components/charts/EChart'
import { colors } from '@admin/theme/themeConfig'
import { useAppStore } from '@admin/stores/useAppStore'
import type { EChartsOption } from 'echarts'

export default function ResearchStats() {
  const projects = useAppStore((s) => s.projects)
  const compliance = useAppStore((s) => s.compliance)
  const [range, setRange] = useState('近12个月')

  const disciplineData = useMemo(() => {
    const map: Record<string, number> = {}
    projects.forEach((p) => { map[p.discipline] = (map[p.discipline] || 0) + 1 })
    return Object.entries(map)
  }, [projects])

  const complyRate = useMemo(() => {
    const total = compliance.length
    if (!total) return 100
    const done = compliance.filter((c) => c.status === '已处置').length
    return Math.round((done / total) * 100)
  }, [compliance])

  // ① 学科项目分布 · 横向条形
  const disciplineOption: EChartsOption = useMemo(
    () => ({
      color: [colors.primary],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 16, right: 36, bottom: 24, left: 8 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: disciplineData.map(([name]) => name) },
      series: [
        {
          type: 'bar',
          barWidth: 14,
          data: disciplineData.map(([, value]) => value),
          itemStyle: { borderRadius: [0, 8, 8, 0] },
          label: { show: true, position: 'right', color: colors.textSecondary, fontSize: 12 },
        },
      ],
    }),
    [disciplineData],
  )

  // ② AI 调用功能分布 · 环形
  const aiDistOption: EChartsOption = useMemo(
    () => ({
      color: [colors.primary, colors.purple, colors.warning, colors.info],
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['45%', '68%'],
        center: ['50%', '44%'],
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b}\n{d}%' },
        data: [
          { name: '文献调研', value: 38 },
          { name: '数据分析', value: 30 },
          { name: '报告生成', value: 22 },
          { name: '热点图谱', value: 10 },
        ],
      }],
    }),
    [],
  )

  // ③ 产出类型分布 · 横向条形
  const outputOption: EChartsOption = useMemo(
    () => ({
      color: [colors.purple],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 16, right: 36, bottom: 24, left: 8 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: ['热点图谱', '论文框架', '数据分析报告', '文献综述', '前沿报告'] },
      series: [{
        type: 'bar',
        barWidth: 14,
        data: [12, 18, 26, 21, 15],
        itemStyle: { borderRadius: [0, 8, 8, 0] },
        label: { show: true, position: 'right', color: colors.textSecondary, fontSize: 12 },
      }],
    }),
    [],
  )

  // ④ AI 调用月度趋势（近 12 个月）· 面积折线
  const trendOption: EChartsOption = useMemo(
    () => ({
      color: [colors.primary],
      tooltip: { trigger: 'axis' },
      grid: { top: 20, right: 20, bottom: 30, left: 44 },
      xAxis: { type: 'category', data: ['9月', '10月', '11月', '12月', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月'], boundaryGap: false },
      yAxis: { type: 'value', name: '调用量' },
      series: [{ name: 'AI 科研调用量', type: 'line', smooth: true, areaStyle: { opacity: 0.12 }, data: [1200, 1800, 2400, 3100, 2600, 1900, 3600, 4200, 4800, 5400, 4900, 6200] }],
    }),
    [],
  )

  return (
    <div>
      <PageHeader
        title="科研统计"
        extra={<Segmented options={['近12个月', '本学期', '本年度']} value={range} onChange={setRange} />}
      />

      {/* 核心指标 */}
      <Row gutter={16}>
        <Col xs={24} sm={12} lg={8} xl={{ flex: 1 }}>
          <StatCard icon={<BadgeCheck size={22} />} label="合规率" value={`${complyRate}%`} trend={4} />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={{ flex: 1 }}>
          <StatCard icon={<Heart size={22} />} tone="purple" label="科研满意度" value="92%" trend={1} />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={{ flex: 1 }}>
          <StatCard icon={<Clock3 size={22} />} tone="info" label="平均科研周期" value="6.4 月" trend={-8} />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={{ flex: 1 }}>
          <StatCard icon={<Timer size={22} />} tone="warning" label="AI 节省工时" value="1,280h" trend={18} />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={{ flex: 1 }}>
          <StatCard icon={<Users size={22} />} label="教师参与率" value="68%" trend={6} />
        </Col>
      </Row>

      {/* 4 张图 · 2 列网格 */}
      <Row gutter={16} className="mt16">
        <Col xs={24} xl={12}>
          <Card title="学科项目分布" style={{ borderRadius: 12 }} extra={<span style={{ fontSize: 12, color: colors.textMuted }}>横向条形</span>}>
            <EChart option={disciplineOption} height={300} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="AI 调用功能分布" style={{ borderRadius: 12 }} extra={<span style={{ fontSize: 12, color: colors.textMuted }}>环形图</span>}>
            <EChart option={aiDistOption} height={300} />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} className="mt16">
        <Col xs={24} xl={12}>
          <Card title="产出类型分布" style={{ borderRadius: 12 }} extra={<span style={{ fontSize: 12, color: colors.textMuted }}>横向条形</span>}>
            <EChart option={outputOption} height={300} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="AI 调用月度趋势（近 12 个月）" style={{ borderRadius: 12 }} extra={<span style={{ fontSize: 12, color: colors.textMuted }}>折线 / 面积</span>}>
            <EChart option={trendOption} height={300} />
          </Card>
        </Col>
      </Row>

      {/* 明细层 · 科研项目 AI 辅助明细（通栏兜底） */}
      <Card className="mt16" title="科研项目 AI 辅助明细" style={{ borderRadius: 12 }}>
        <Table
          rowKey="id"
          size="small"
          dataSource={projects}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: '项目名称', dataIndex: 'name', render: (v: string) => <b>{v}</b> },
            { title: '学科', dataIndex: 'discipline', width: 160 },
            { title: '负责人', dataIndex: 'leader', width: 140 },
            { title: '产出数', width: 100, render: (_: unknown, p: (typeof projects)[0]) => <span style={{ color: colors.primary, fontWeight: 600 }}>{p.outputs.length}</span> },
            { title: 'AI 生成产出', width: 120, render: (_: unknown, p: (typeof projects)[0]) => <span>{p.outputs.filter((o) => o.aiGenerated).length}</span> },
            { title: '状态', dataIndex: 'status', width: 110, render: (v: string) => <StatusTag status={v} /> },
          ]}
        />
      </Card>
    </div>
  )
}
