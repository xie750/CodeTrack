import { useMemo, useState } from 'react'
import { Card, Table, Button, Space, Select, Input, Tabs, Tag, Drawer, Descriptions, message, Modal, Radio, Rate, Alert, Row, Col } from 'antd'
import { ShieldCheck, Sparkles, Eye, CheckCircle, XCircle, Bot, AlertOctagon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import StatusTag from '@/components/StatusTag'
import { useAppStore } from '@/stores/useAppStore'
import { colors } from '@/theme/themeConfig'
import type { ComplianceItem, ComplianceDimension, Severity } from '@/types'

const dimensions: ComplianceDimension[] = ['数据合规', '引用真实性', 'AI 标识', '学术伦理', '伪造检测']

export default function Compliance() {
  const compliance = useAppStore((s) => s.compliance)
  const updateCompliance = useAppStore((s) => s.updateCompliance)
  const addLog = useAppStore((s) => s.addLog)

  const [searchParams] = useSearchParams()
  const initStatus = searchParams.get('status')
  const [tab, setTab] = useState(initStatus === '待处理' ? 'pending' : 'all')
  const [dimension, setDimension] = useState<ComplianceDimension>()
  const [severity, setSeverity] = useState<Severity>()
  const [keyword, setKeyword] = useState('')
  const [detail, setDetail] = useState<ComplianceItem | null>(null)
  const [handleTarget, setHandleTarget] = useState<ComplianceItem | null>(null)
  const [handleMethod, setHandleMethod] = useState<'修改' | '下架' | '通知整改'>('修改')
  const [rulesOpen, setRulesOpen] = useState(false)

  const filtered = useMemo(
    () =>
      compliance.filter((c) => {
        if (tab === 'pending' && c.status !== '待处理') return false
        if (tab === 'done' && c.status !== '已处置') return false
        if (dimension && c.dimension !== dimension) return false
        if (severity && c.severity !== severity) return false
        if (keyword && !`${c.projectName} ${c.outputTitle}`.includes(keyword)) return false
        return true
      }),
    [compliance, tab, dimension, severity, keyword],
  )

  const pendingCount = compliance.filter((c) => c.status === '待处理').length
  const doneCount = compliance.filter((c) => c.status === '已处置').length
  const aiCount = compliance.filter((c) => c.aiDetected).length
  const highCount = compliance.filter((c) => c.severity === '高').length

  const handle = (c: ComplianceItem) => {
    if (!handleTarget) return
    updateCompliance(handleTarget.id, {
      status: '已处置',
      handledAt: '2026-08-08',
      handler: '超级管理员',
      handleMethod,
      aiHints: handleTarget.aiHints,
    })
    message.success(`已处置（${handleMethod}），待处理数清零`)
    addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '处置', resourceType: '合规审查', resourceId: handleTarget.id, desc: `处置 ${handleTarget.outputTitle}（${handleMethod}）`, before: '待处理', after: '已处置', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true })
    setHandleTarget(null)
  }

  const columns = [
    { title: '项目 / 产出', width: 300, render: (_: unknown, r: ComplianceItem) => (<div><b>{r.outputTitle}</b><div style={{ fontSize: 12, color: colors.textMuted }}>{r.projectName}</div></div>) },
    { title: '审查维度', dataIndex: 'dimension', width: 110, render: (v: string) => <Tag color="purple">{v}</Tag> },
    { title: '结果', dataIndex: 'result', width: 100, render: (v: string) => <StatusTag status={v} /> },
    { title: '严重等级', dataIndex: 'severity', width: 90, render: (v: Severity) => <Tag color={v === '高' ? 'error' : v === '中' ? 'warning' : 'default'}>{v}</Tag> },
    { title: 'AI 初检', dataIndex: 'aiDetected', width: 90, render: (v: boolean) => v ? <Tag color="purple"><Sparkles size={11} /> AI 标记</Tag> : <Tag>人工</Tag> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <StatusTag status={v} /> },
    { title: '检出时间', dataIndex: 'detectedAt', width: 140, render: (v: string) => <span style={{ fontSize: 12, color: colors.textMuted }}>{v}</span> },
    {
      title: '操作', width: 140, fixed: 'right' as const,
      render: (_: unknown, r: ComplianceItem) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDetail(r)}><Eye size={14} />复核</Button>
          {r.status === '待处理' && <Button type="link" size="small" style={{ color: colors.primary }} onClick={() => { setHandleTarget(r); setHandleMethod('修改') }}>处置</Button>}
        </Space>
      ),
    },
  ]

  const detailTabs = detail ? [
    {
      key: '1', label: '审查详情',
      children: (
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="审查维度"><Tag color="purple">{detail.dimension}</Tag></Descriptions.Item>
          <Descriptions.Item label="严重等级"><Tag color={detail.severity === '高' ? 'error' : detail.severity === '中' ? 'warning' : 'default'}>{detail.severity}</Tag></Descriptions.Item>
          <Descriptions.Item label="问题详情">{detail.issue}</Descriptions.Item>
          <Descriptions.Item label="处置状态"><StatusTag status={detail.status} /></Descriptions.Item>
          {detail.handledAt && <Descriptions.Item label="处置记录">已通过「{detail.handleMethod}」方式处置 · {detail.handler} · {detail.handledAt}</Descriptions.Item>}
        </Descriptions>
      ),
    },
    {
      key: '2', label: 'AI 辅助审查摘要',
      children: (
        <div>
          <Alert type="info" showIcon icon={<Bot size={14} />} message="AI 只做辅助、不做判定" description="以下为 AI 自动初检结果，需经管理员人工复核确认后才计入违规。" style={{ marginBottom: 16 }} />
          {detail.aiHints.map((h, i) => (
            <div key={i} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--n-3)' }}>
              <span className="flex gap8"><Sparkles size={13} style={{ color: colors.purple }} />{h}</span>
              <Rate disabled defaultValue={i < 2 ? 4 : 3} style={{ fontSize: 14 }} />
            </div>
          ))}
        </div>
      ),
    },
  ] : []

  return (
    <div>
      <PageHeader
        title="科研合规审查"
        extra={<Button icon={<Sparkles size={15} />} onClick={() => message.success('已触发一轮 AI 自动初检（原型演示）')}>发起 AI 抽检</Button>}
      />

      {/* 核心汇总指标 */}
      <Row gutter={16}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard icon={<XCircle size={22} />} label="待处理" value={pendingCount} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard icon={<CheckCircle size={22} />} tone="success" label="已处置" value={doneCount} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard icon={<Sparkles size={22} />} tone="purple" label="疑似违规（AI 标记）" value={aiCount} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard icon={<AlertOctagon size={22} />} tone="warning" label="高严重级" value={highCount} />
        </Col>
      </Row>

      <Card style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: '16px 18px' } }}>
        <div className="flex" style={{ gap: 32, flexWrap: 'wrap' }}>
          {dimensions.map((d) => {
            const count = compliance.filter((c) => c.dimension === d && c.status === '待处理').length
            return (
              <div key={d} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: count ? colors.danger : colors.success }}>{count}</div>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>{d}</div>
              </div>
            )
          })}
          <div style={{ width: 1, background: 'var(--n-4)', alignSelf: 'stretch' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: colors.primary }}>{aiCount}</div>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>AI 初检标记</div>
          </div>
        </div>
      </Card>

      <Card style={{ borderRadius: 12 }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'all', label: `全部 (${compliance.length})` },
            { key: 'pending', label: <span className="flex gap8"><XCircle size={13} style={{ color: colors.danger }} />待处理 ({pendingCount})</span> },
            { key: 'done', label: `已处置 (${doneCount})` },
          ]}
        />
        <Space wrap className="filter-bar">
          <Input.Search placeholder="项目/产出名称" allowClear style={{ width: 240 }} onChange={(e) => setKeyword(e.target.value)} />
          <Select placeholder="审查维度" allowClear style={{ width: 130 }} options={dimensions.map((d) => ({ label: d, value: d }))} onChange={setDimension} />
          <Select placeholder="严重等级" allowClear style={{ width: 110 }} options={['高', '中', '低'].map((s) => ({ label: s, value: s }))} onChange={setSeverity} />
          <Button onClick={() => setRulesOpen(true)} icon={<ShieldCheck size={14} />}>抽检规则配置</Button>
        </Space>
        <Table rowKey="id" size="middle" columns={columns} dataSource={filtered} scroll={{ x: 900 }} pagination={{ pageSize: 8, showTotal: (t) => `共 ${t} 条` }} />
      </Card>

      {/* 复核详情 */}
      <Drawer title={`合规复核 · ${detail?.outputTitle}`} open={!!detail} onClose={() => setDetail(null)} width={680}>
        {detail && <Tabs items={detailTabs} />}
      </Drawer>

      {/* 处置 */}
      <Modal
        title={`处置 · ${handleTarget?.outputTitle}`}
        open={!!handleTarget}
        onOk={() => handle(handleTarget!)}
        onCancel={() => setHandleTarget(null)}
        okText="确认处置"
      >
        <Alert type="warning" showIcon message="处置闭环" description="处置时记录处理方式（修改 / 下架 / 通知整改），支持复核，保证「待处理」能真正清零。" style={{ marginBottom: 16 }} />
        <Radio.Group value={handleMethod} onChange={(e) => setHandleMethod(e.target.value)}>
          <Radio value="修改">修改</Radio>
          <Radio value="下架">下架</Radio>
          <Radio value="通知整改">通知整改</Radio>
        </Radio.Group>
      </Modal>

      {/* 抽检规则配置 */}
      <Modal title="抽检规则配置" open={rulesOpen} onOk={() => { message.success('抽检规则已保存'); setRulesOpen(false) }} onCancel={() => setRulesOpen(false)}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="抽检比例">15% （随机抽取）</Descriptions.Item>
          <Descriptions.Item label="抽检维度">五维度全量（数据合规 / 引用真实性 / AI 标识 / 学术伦理 / 伪造检测）</Descriptions.Item>
          <Descriptions.Item label="抽检频率">每周自动一轮 + 结项强制全检</Descriptions.Item>
        </Descriptions>
      </Modal>
    </div>
  )
}
