import { useMemo, useState } from 'react'
import { Card, Table, Button, Space, Modal, Form, Input, Select, Tabs, Tag, Drawer, Descriptions, Timeline, Progress, message, Empty, Radio, Row, Col } from 'antd'
import { Plus, Eye, CheckCircle, XCircle, Send, Trophy, Users, AlertTriangle, GitBranch, FolderKanban, Activity, Clock3 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '@admin/components/PageHeader'
import StatCard from '@admin/components/StatCard'
import StatusTag from '@admin/components/StatusTag'
import VerifyModal from '@admin/components/VerifyModal'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'
import type { ProjectItem, ProjectStatus } from '@admin/types'

const disciplines = ['教育大数据', '计算化学', '人工智能', '管理科学', '教育技术']
const statuses: ProjectStatus[] = ['草稿', '待审核', '进行中', '已结项', '已驳回']
const outputTypes = ['前沿报告', '文献综述', '数据分析报告', '论文框架', '热点图谱']

export default function Projects() {
  const projects = useAppStore((s) => s.projects)
  const addProject = useAppStore((s) => s.addProject)
  const updateProject = useAppStore((s) => s.updateProject)
  const addLog = useAppStore((s) => s.addLog)

  const [searchParams] = useSearchParams()
  const initStatus = searchParams.get('status')
  const [tab, setTab] = useState(initStatus || 'all')
  const [keyword, setKeyword] = useState('')
  const [form] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [detail, setDetail] = useState<ProjectItem | null>(null)
  const [auditTarget, setAuditTarget] = useState<ProjectItem | null>(null)
  const [auditResult, setAuditResult] = useState<'通过' | '驳回'>('通过')
  const [rejectReason, setRejectReason] = useState('')
  const [verify, setVerify] = useState<{ open: boolean; onOk: () => void }>({ open: false, onOk: () => {} })

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        if (tab !== 'all' && p.status !== tab) return false
        if (keyword && !`${p.name} ${p.leader} ${p.discipline}`.includes(keyword)) return false
        return true
      }),
    [projects, tab, keyword],
  )

  const count = (st: string) => (st === 'all' ? projects.length : projects.filter((p) => p.status === st).length)

  const handleCreate = () => {
    form.validateFields().then((v) => {
      addProject({
        id: `P${Date.now().toString().slice(-7)}`,
        name: v.name,
        discipline: v.discipline,
        leader: v.leader,
        status: '草稿',
        members: [{ name: v.leader, id: 'T1001', role: '负责人' }],
        outputs: [],
        milestones: [],
        changes: [],
        createdAt: '2026-08-08',
        updatedAt: '2026-08-08',
        stageProgress: 5,
      })
      message.success('科研项目已创建为草稿，可发布进入待审核')
      setCreateOpen(false)
    })
  }

  const publish = (p: ProjectItem) => {
    updateProject(p.id, { status: '待审核' })
    message.success('已发布，等待审核')
    addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '审批', resourceType: '科研项目', resourceId: p.id, desc: `发布项目 ${p.name}`, before: '草稿', after: '待审核', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: false })
  }

  const submitAudit = () => {
    if (!auditTarget) return
    if (auditResult === '通过') {
      updateProject(auditTarget.id, { status: '进行中' })
      message.success('审核通过，项目进入进行中')
    } else {
      if (!rejectReason.trim()) {
        message.error('驳回需填写原因说明')
        return
      }
      updateProject(auditTarget.id, { status: '已驳回', rejectReason })
      message.success('已驳回，原因已通知项目负责人')
    }
    addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '审核', resourceType: '科研项目', resourceId: auditTarget.id, desc: `${auditResult}项目 ${auditTarget.name}`, before: '待审核', after: auditResult === '通过' ? '进行中' : '已驳回', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: false })
    setAuditTarget(null)
    setRejectReason('')
  }

  const submitClose = (p: ProjectItem) => {
    // 结项审核：需提交结项材料，避免「提交即结项」
    setVerify({
      open: true,
      onOk: () => {
        updateProject(p.id, {
          status: '已结项',
          outputs: p.outputs.map((o) => ({ ...o, status: '已入库' })),
          changes: [{ time: '2026-08-08', content: '结项审核通过，产出已归档进知识库', operator: '超级管理员' }, ...p.changes],
        })
        message.success('结项审核通过，产出已一键归档进知识库，形成平台知识沉淀')
        addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '审批', resourceType: '科研项目', resourceId: p.id, desc: `结项审核通过 ${p.name}，产出入库`, before: '进行中', after: '已结项', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true })
      },
    })
  }

  const opsFor = (p: ProjectItem) => {
    switch (p.status) {
      case '待审核':
        return (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => { setAuditResult('通过'); setAuditTarget(p) }}><CheckCircle size={14} style={{ color: colors.success }} />审核</Button>
            <Button type="link" size="small" onClick={() => { setDetail(p) }}>编辑</Button>
          </Space>
        )
      case '进行中':
        return (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => { setDetail(p) }}>编辑</Button>
            <Button type="link" size="small" style={{ color: colors.primary }} onClick={() => submitClose(p)}><Trophy size={14} />结项</Button>
            <Button type="link" size="small" onClick={() => { setDetail(p) }}><Users size={14} />团队</Button>
          </Space>
        )
      case '已结项':
        return (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => { setDetail(p) }}><Users size={14} />团队</Button>
            <Button type="link" size="small" onClick={() => { setDetail(p) }}>查看产出</Button>
          </Space>
        )
      case '草稿':
        return (
          <Space size={0}>
            <Button type="link" size="small" style={{ color: colors.primary }} onClick={() => publish(p)}><Send size={14} />发布</Button>
            <Button type="link" size="small" onClick={() => { setDetail(p) }}>编辑</Button>
          </Space>
        )
      default:
        return <Button type="link" size="small" onClick={() => { setDetail(p) }}>查看</Button>
    }
  }

  const columns = [
    { title: '项目名称', dataIndex: 'name', width: 300, render: (v: string, r: ProjectItem) => (<div><b>{v}</b>{r.warning && <Tag color="error" style={{ marginLeft: 6 }}><AlertTriangle size={11} /> 进度停滞</Tag>}</div>) },
    { title: '学科', dataIndex: 'discipline', width: 110 },
    { title: '负责人', dataIndex: 'leader', width: 90 },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <StatusTag status={v} /> },
    { title: '阶段进度', dataIndex: 'stageProgress', width: 160, render: (v: number, r: ProjectItem) => <Progress percent={v} size="small" strokeColor={v >= 100 ? colors.success : colors.primary} /> },
    { title: '产出数', width: 80, render: (_: unknown, r: ProjectItem) => r.outputs.length },
    { title: '更新时间', dataIndex: 'updatedAt', width: 110, render: (v: string) => <span style={{ color: colors.textMuted, fontSize: 12 }}>{v}</span> },
    { title: '操作', width: 200, fixed: 'right' as const, render: (_: unknown, r: ProjectItem) => (<div className="flex gap8">{opsFor(r)}<Button type="link" size="small" onClick={() => setDetail(r)}><Eye size={14} />详情</Button></div>) },
  ]

  const detailTabs = detail ? [
    {
      key: '1', label: `产出管理 (${detail.outputs.length})`,
      children: detail.outputs.length ? (
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={detail.outputs}
          columns={[
            { title: '类型', dataIndex: 'type', width: 120, render: (v: string) => <Tag>{v}</Tag> },
            { title: '标题', dataIndex: 'title' },
            { title: 'AI 生成', dataIndex: 'aiGenerated', width: 90, render: (v: boolean) => v ? <Tag color="purple"><SparklesMini /> AI 生成</Tag> : <Tag>人工</Tag> },
            { title: '入库状态', dataIndex: 'status', width: 90, render: (v: string) => <StatusTag status={v} /> },
            { title: '引用', dataIndex: 'refCount', width: 70 },
          ]}
        />
      ) : (
        <Empty description="暂无科研产出，可在项目推进中由 AI 辅助生成" />
      ),
    },
    {
      key: '2', label: '阶段目标',
      children: detail.milestones.length ? (
        detail.milestones.map((m, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div className="flex-between" style={{ marginBottom: 4 }}>
              <b style={{ fontSize: 13 }}>{m.name}</b>
              <span style={{ fontSize: 13 }}>{m.progress}% · 截止 {m.dueDate}</span>
            </div>
            <Progress percent={m.progress} size="small" strokeColor={m.progress >= 100 ? colors.success : colors.primary} />
          </div>
        ))
      ) : (
        <Empty description="尚未设定阶段目标" />
      ),
    },
    {
      key: '3', label: '团队管理',
      children: (
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={detail.members}
          columns={[
            { title: '姓名', dataIndex: 'name' },
            { title: '工号/学号', dataIndex: 'id' },
            { title: '角色', dataIndex: 'role', render: (v: string) => <Tag color={v === '负责人' ? 'gold' : 'default'}>{v}</Tag> },
          ]}
        />
      ),
    },
    {
      key: '4', label: '变更记录',
      children: (
        <Timeline
          items={detail.changes.map((c) => ({
            children: (
              <div>
                <b>{c.content}</b>
                <div style={{ fontSize: 12, color: colors.textMuted }}>{c.time} · {c.operator}</div>
              </div>
            ),
          }))}
        />
      ),
    },
  ] : []

  const SparklesMini = () => <span style={{ marginRight: 2 }}>✨</span>

  return (
    <div>
      <PageHeader
        title="科研项目管理"
        extra={<Button type="primary" icon={<Plus size={15} />} onClick={() => { form.resetFields(); setCreateOpen(true) }}>新建科研项目</Button>}
      />

      {/* 核心汇总指标 */}
      <Row gutter={16}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard icon={<FolderKanban size={22} />} label="项目总数" value={projects.length} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard icon={<Activity size={22} />} tone="success" label="进行中" value={count('进行中')} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard icon={<Clock3 size={22} />} tone="warning" label="待审核" value={count('待审核')} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard icon={<Trophy size={22} />} tone="purple" label="已结项" value={count('已结项')} />
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          style={{ padding: '0 20px' }}
          items={[
            { key: 'all', label: `全部 (${count('all')})` },
            { key: '待审核', label: <span className="flex gap8"><AlertTriangle size={13} style={{ color: colors.warning }} />待审核 ({count('待审核')})</span> },
            { key: '进行中', label: `进行中 (${count('进行中')})` },
            { key: '已结项', label: `已结项 (${count('已结项')})` },
            { key: '已驳回', label: `已驳回 (${count('已驳回')})` },
            { key: '草稿', label: `草稿 (${count('草稿')})` },
          ]}
        />
        <div style={{ padding: '0 20px 16px' }}>
          <div className="filter-bar">
            <Input.Search placeholder="项目名称/负责人/学科" allowClear style={{ width: 280 }} onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <Table rowKey="id" size="middle" columns={columns} dataSource={filtered} scroll={{ x: 900 }} pagination={{ pageSize: 8, showTotal: (t) => `共 ${t} 条` }} />
        </div>
      </Card>

      {/* 新建 */}
      <Modal title="新建科研项目" open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="项目名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="discipline" label="学科" rules={[{ required: true }]}><Select options={disciplines.map((d) => ({ label: d, value: d }))} /></Form.Item>
          <Form.Item name="leader" label="负责人" rules={[{ required: true }]}><Input placeholder="负责人姓名" /></Form.Item>
        </Form>
      </Modal>

      {/* 详情 */}
      <Drawer title={`科研项目 · ${detail?.name}`} open={!!detail} onClose={() => setDetail(null)} width={760}>
        {detail && (
          <>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="状态" span={2}><StatusTag status={detail.status} />{detail.rejectReason && <Tag color="error" style={{ marginLeft: 8 }}>驳回原因：{detail.rejectReason}</Tag>}</Descriptions.Item>
              <Descriptions.Item label="学科">{detail.discipline}</Descriptions.Item>
              <Descriptions.Item label="负责人">{detail.leader}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detail.createdAt}</Descriptions.Item>
              <Descriptions.Item label="阶段进度">{detail.stageProgress}%</Descriptions.Item>
              <Descriptions.Item label="团队成员" span={2}>{detail.members.map((m) => m.name).join('、')}</Descriptions.Item>
            </Descriptions>
            <Tabs items={detailTabs} />
          </>
        )}
      </Drawer>

      {/* 审核 */}
      <Modal
        title={`项目审核 · ${auditTarget?.name}`}
        open={!!auditTarget}
        onOk={submitAudit}
        onCancel={() => { setAuditTarget(null); setRejectReason('') }}
        okText={auditResult === '通过' ? '审核通过' : '确认驳回'}
        okButtonProps={{ danger: auditResult === '驳回' }}
      >
        <Radio.Group value={auditResult} onChange={(e) => setAuditResult(e.target.value)} style={{ marginBottom: 16 }}>
          <Radio value="通过">通过</Radio>
          <Radio value="驳回">驳回</Radio>
        </Radio.Group>
        {auditResult === '驳回' && (
          <Input.TextArea rows={3} placeholder="请填写驳回原因说明（必填），将通知项目负责人" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        )}
      </Modal>

      <VerifyModal open={verify.open} actionLabel="结项审核与产出入库" onCancel={() => setVerify({ open: false, onOk: () => {} })} onConfirm={verify.onOk} />
    </div>
  )
}
