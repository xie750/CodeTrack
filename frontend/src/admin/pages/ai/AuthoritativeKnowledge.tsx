import { useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Drawer, Form, Input, Modal, Progress, Row, Select, Space, Table, Tag, Tooltip, message } from 'antd'
import {
  BookOpenCheck,
  CheckCircle2,
  DatabaseZap,
  FileCheck2,
  GitBranch,
  Layers3,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import PageHeader from '@admin/components/PageHeader'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'
import type { AuthoritativeKnowledgeBase, AuthoritativeKnowledgeSource, AuthoritativeSourceKind } from '@admin/types'

const sourceKindOptions: AuthoritativeSourceKind[] = ['课程标准', '教材', '教师审定讲义', '公开规范', '题库解析']

function statusColor(status: string) {
  if (status === '已发布' || status === '已审定') return 'success'
  if (status === '待审核') return 'warning'
  if (status === '需复核') return 'error'
  return 'default'
}

function MetricCard({
  icon,
  label,
  value,
  note,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  note: string
  color: string
}) {
  return (
    <div className="ai-usage-stat">
      <div className="ai-usage-stat-icon" style={{ color, background: `${color}14` }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="ai-usage-stat-label">{label}</div>
        <div className="ai-usage-stat-value">{value}</div>
        <div className="ai-usage-stat-note">{note}</div>
      </div>
    </div>
  )
}

export default function AuthoritativeKnowledge() {
  const knowledgeBases = useAppStore((s) => s.authoritativeKnowledgeBases)
  const publishKnowledgeBase = useAppStore((s) => s.publishAuthoritativeKnowledgeBase)
  const addKnowledgeSource = useAppStore((s) => s.addAuthoritativeKnowledgeSource)
  const reviewKnowledgeSource = useAppStore((s) => s.reviewAuthoritativeKnowledgeSource)
  const courses = useAppStore((s) => s.courses)

  const [keyword, setKeyword] = useState('')
  const [courseName, setCourseName] = useState('')
  const [selectedBaseId, setSelectedBaseId] = useState(knowledgeBases[0]?.id ?? '')
  const [detailOpen, setDetailOpen] = useState(false)
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [sourceForm] = Form.useForm()

  const selectedBase = knowledgeBases.find((kb) => kb.id === selectedBaseId) ?? knowledgeBases[0]

  const filteredBases = useMemo(() => {
    return knowledgeBases.filter((kb) => {
      const matchesCourse = !courseName || kb.courseName === courseName
      const text = `${kb.subject} ${kb.courseName} ${kb.status} ${kb.owner} ${kb.sources.map((s) => s.title).join(' ')}`
      const matchesKeyword = !keyword || text.toLowerCase().includes(keyword.toLowerCase())
      return matchesCourse && matchesKeyword
    })
  }, [knowledgeBases, courseName, keyword])

  const totalSources = knowledgeBases.reduce((sum, kb) => sum + kb.sourceCount, 0)
  const totalChunks = knowledgeBases.reduce((sum, kb) => sum + kb.chunkCount, 0)
  const avgCoverage = Math.round(knowledgeBases.reduce((sum, kb) => sum + kb.coverageRate, 0) / Math.max(knowledgeBases.length, 1))
  const avgCitationPass = Math.round(knowledgeBases.reduce((sum, kb) => sum + kb.citationPassRate, 0) / Math.max(knowledgeBases.length, 1))
  const pendingSources = knowledgeBases.flatMap((kb) => kb.sources).filter((s) => s.status !== '已审定').length
  const publishedCount = knowledgeBases.filter((kb) => kb.status === '已发布').length

  const openSourceModal = (base?: AuthoritativeKnowledgeBase) => {
    sourceForm.resetFields()
    sourceForm.setFieldsValue({
      baseId: base?.id ?? selectedBase?.id,
      kind: '教师审定讲义',
      publisher: '人工智能学院课程组',
      chapter: '',
      chunkCount: 20,
    })
    setSourceModalOpen(true)
  }

  const handleAddSource = () => {
    sourceForm.validateFields().then((values) => {
      const source: Omit<AuthoritativeKnowledgeSource, 'id'> = {
        title: values.title,
        kind: values.kind,
        publisher: values.publisher,
        chapter: values.chapter,
        status: '待审核',
        reviewer: '待分配',
        chunkCount: Number(values.chunkCount || 0),
        qualityScore: 86,
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      addKnowledgeSource(values.baseId, source)
      setSelectedBaseId(values.baseId)
      setSourceModalOpen(false)
      message.success('权威来源已加入待审核队列')
    })
  }

  const baseColumns = [
    {
      title: '课程知识库',
      dataIndex: 'courseName',
      render: (_: string, item: AuthoritativeKnowledgeBase) => (
        <div>
          <div style={{ fontWeight: 600 }}>{item.courseName}</div>
          <div style={{ fontSize: 12, color: 'var(--n-6)' }}>{item.subject} · {item.version}</div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: '覆盖率',
      dataIndex: 'coverageRate',
      width: 150,
      render: (value: number) => <Progress percent={value} size="small" />,
    },
    {
      title: '权威来源',
      dataIndex: 'sourceCount',
      width: 116,
      render: (_: number, item: AuthoritativeKnowledgeBase) => `${item.sourceCount} 份 / ${item.chunkCount} 片段`,
    },
    {
      title: '引用通过率',
      dataIndex: 'citationPassRate',
      width: 116,
      render: (value: number) => <span style={{ color: value >= 95 ? colors.success : colors.warning, fontWeight: 600 }}>{value}%</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      render: (_: unknown, item: AuthoritativeKnowledgeBase) => {
        const hasPending = item.sources.some((source) => source.status !== '已审定')
        return (
          <Space size={6}>
            <Button
              size="small"
              onClick={() => {
                setSelectedBaseId(item.id)
                setDetailOpen(true)
              }}
            >
              详情
            </Button>
            <Tooltip title={hasPending ? '仍有来源未审定，不能发布' : '发布后学生端 AI 可优先引用'}>
              <Button
                size="small"
                type="primary"
                disabled={item.status === '已发布' || hasPending}
                onClick={() => {
                  publishKnowledgeBase(item.id)
                  message.success(`${item.courseName} 权威知识库已发布`)
                }}
              >
                发布
              </Button>
            </Tooltip>
          </Space>
        )
      },
    },
  ]

  const sourceColumns = [
    { title: '来源名称', dataIndex: 'title', ellipsis: true },
    { title: '类型', dataIndex: 'kind', width: 116, render: (value: string) => <Tag>{value}</Tag> },
    { title: '章节', dataIndex: 'chapter', width: 160, ellipsis: true },
    { title: '片段', dataIndex: 'chunkCount', width: 72 },
    {
      title: '质量',
      dataIndex: 'qualityScore',
      width: 96,
      render: (value: number) => <Progress percent={value} size="small" showInfo={false} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 92,
      render: (_: unknown, item: AuthoritativeKnowledgeSource) => (
        <Button
          size="small"
          disabled={!selectedBase || item.status === '已审定'}
          onClick={() => {
            reviewKnowledgeSource(selectedBase.id, item.id)
            message.success('来源已标记为审定')
          }}
        >
          审定
        </Button>
      ),
    },
  ]

  return (
    <div className="admin-page-fill">
      <PageHeader
        title="权威知识库"
        desc="管理员端维护平台内置学科知识源，为垂类模型、课程诊断和 AI 助学提供默认可信依据。"
        extra={
          <Space>
            <Tag color="processing">管理员治理</Tag>
            <Tag color="success">RAG 可信底座</Tag>
            <Button type="primary" icon={<Plus size={14} />} onClick={() => openSourceModal()}>
              新增权威来源
            </Button>
          </Space>
        }
      />

      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="建议采用三层知识来源"
        description="平台权威知识库作为默认可信源；教师端资料用于课程补充；学生自建知识库只作为个人学习上下文。AI 输出必须展示来源类型、引用片段、置信度和下一步动作。"
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard icon={<DatabaseZap size={21} />} label="已发布课程库" value={`${publishedCount}/${knowledgeBases.length}`} note="首版三门演示课程" color={colors.primary} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard icon={<BookOpenCheck size={21} />} label="平均知识覆盖" value={`${avgCoverage}%`} note={`${totalSources} 份权威来源`} color={colors.success} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard icon={<FileCheck2 size={21} />} label="可引用片段" value={totalChunks.toLocaleString()} note={`平均引用通过率 ${avgCitationPass}%`} color={colors.warning} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <MetricCard icon={<ShieldCheck size={21} />} label="待审核来源" value={pendingSources.toString()} note="发布前必须完成审定" color={pendingSources > 0 ? colors.danger : colors.info} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card style={{ borderRadius: 8 }} styles={{ body: { padding: 14 } }}>
            <div className="ai-usage-filter" style={{ marginBottom: 14 }}>
              <Input
                allowClear
                prefix={<Search size={14} />}
                placeholder="搜索课程 / 来源 / 负责人"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ width: 260 }}
              />
              <Select
                value={courseName}
                onChange={setCourseName}
                style={{ width: 180 }}
                options={[{ label: '全部课程', value: '' }, ...courses.map((c) => ({ label: c.name, value: c.name }))]}
              />
            </div>
            <Table
              rowKey="id"
              size="middle"
              dataSource={filteredBases}
              columns={baseColumns}
              pagination={false}
              onRow={(record) => ({ onClick: () => setSelectedBaseId(record.id) })}
              rowClassName={(record) => (record.id === selectedBase?.id ? 'admin-kb-selected-row' : '')}
            />
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Card
            title={<span className="flex gap8"><SlidersHorizontal size={16} style={{ color: colors.primary }} />检索与引用策略</span>}
            style={{ borderRadius: 8, marginBottom: 16 }}
            styles={{ body: { padding: 16 } }}
          >
            {[
              { icon: <LockKeyhole size={15} />, title: '默认可信源', text: '学生端和教师端 AI 优先检索平台已发布权威库。' },
              { icon: <GitBranch size={15} />, title: '补充召回', text: '教师发布资料、学生自建资料只在命中不足或上下文相关时补充。' },
              { icon: <CheckCircle2 size={15} />, title: '引用守卫', text: '无来源、低质量来源或虚构来源会触发低置信与复核提示。' },
            ].map((item) => (
              <div key={item.title} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--n-3)' }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: colors.primary, background: colors.primaryBg, flexShrink: 0 }}>
                  {item.icon}
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                  <div style={{ color: 'var(--n-6)', fontSize: 12, lineHeight: 1.7 }}>{item.text}</div>
                </div>
              </div>
            ))}
          </Card>

          {selectedBase && (
            <Card
              title={<span className="flex gap8"><Layers3 size={16} style={{ color: colors.success }} />当前课程库</span>}
              style={{ borderRadius: 8 }}
              extra={<Button size="small" onClick={() => openSourceModal(selectedBase)}>补充来源</Button>}
              styles={{ body: { padding: 16 } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedBase.courseName}</div>
                  <div style={{ fontSize: 12, color: 'var(--n-6)' }}>{selectedBase.owner} · {selectedBase.lastUpdatedAt}</div>
                </div>
                <Tag color={statusColor(selectedBase.status)} style={{ alignSelf: 'flex-start' }}>{selectedBase.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: 'var(--n-7)', lineHeight: 1.8, marginBottom: 12 }}>
                {selectedBase.retrievalPolicy}
              </div>
              <Space size={[6, 6]} wrap>
                {selectedBase.qualityGates.map((gate) => <Tag key={gate}>{gate}</Tag>)}
              </Space>
              <Button block style={{ marginTop: 14 }} onClick={() => setDetailOpen(true)}>
                查看来源明细
              </Button>
            </Card>
          )}
        </Col>
      </Row>

      <Drawer
        title={selectedBase ? `${selectedBase.courseName} 权威知识库` : '权威知识库详情'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={720}
      >
        {selectedBase && (
          <>
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <MetricCard icon={<BookOpenCheck size={18} />} label="覆盖率" value={`${selectedBase.coverageRate}%`} note={selectedBase.version} color={colors.primary} />
              </Col>
              <Col span={8}>
                <MetricCard icon={<DatabaseZap size={18} />} label="切片数" value={selectedBase.chunkCount.toString()} note={`${selectedBase.sourceCount} 份来源`} color={colors.success} />
              </Col>
              <Col span={8}>
                <MetricCard icon={<ShieldCheck size={18} />} label="引用通过" value={`${selectedBase.citationPassRate}%`} note="引用守卫校验" color={colors.warning} />
              </Col>
            </Row>

            <Card title="来源审核" style={{ borderRadius: 8, marginBottom: 16 }} styles={{ body: { padding: 8 } }}>
              <Table rowKey="id" size="small" dataSource={selectedBase.sources} columns={sourceColumns} pagination={false} />
            </Card>

            <Card title="质检门槛" style={{ borderRadius: 8 }} styles={{ body: { padding: 16 } }}>
              <Space size={[8, 8]} wrap>
                {selectedBase.qualityGates.map((gate) => <Tag color="blue" key={gate}>{gate}</Tag>)}
              </Space>
              <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'var(--n-2)', color: 'var(--n-7)', fontSize: 13, lineHeight: 1.8 }}>
                {selectedBase.retrievalPolicy}
              </div>
            </Card>
          </>
        )}
      </Drawer>

      <Modal
        title="新增权威来源"
        open={sourceModalOpen}
        onCancel={() => setSourceModalOpen(false)}
        onOk={handleAddSource}
        okText="加入待审核"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Form form={sourceForm} layout="vertical">
          <Form.Item name="baseId" label="归属课程库" rules={[{ required: true, message: '请选择归属课程库' }]}>
            <Select options={knowledgeBases.map((kb) => ({ label: `${kb.courseName} · ${kb.version}`, value: kb.id }))} />
          </Form.Item>
          <Form.Item name="title" label="来源名称" rules={[{ required: true, message: '请输入来源名称' }]}>
            <Input placeholder="例如：监督学习与模型评估讲义" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="kind" label="来源类型" rules={[{ required: true }]}>
                <Select options={sourceKindOptions.map((item) => ({ label: item, value: item }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="publisher" label="发布/审定单位" rules={[{ required: true, message: '请输入发布单位' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name="chapter" label="章节或知识单元" rules={[{ required: true, message: '请输入章节或知识单元' }]}>
                <Input placeholder="例如：监督学习 / 模型评估" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="chunkCount" label="预计切片数">
                <Input type="number" min={1} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
