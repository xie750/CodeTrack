import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Card, Table, Button, Space, Input, Select, Tag, Modal, Form, Radio, DatePicker, message, Switch, Row, Col, Tooltip } from 'antd'
import { Plus, Pin, Undo2, Eye, BarChart3, CheckCircle2, FileEdit, Edit3, Trash2, Send, GripVertical } from 'lucide-react'
import PageHeader from '@admin/components/PageHeader'
import StatusTag from '@admin/components/StatusTag'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'
import type { Notice, NoticeAudience } from '@admin/types'

const audiences: NoticeAudience[] = ['全体学生', '全体教师', '全体师生', '人工智能专业师生']

export default function Notices() {
  const storedNotices = useAppStore((s) => s.notices)
  const students = useAppStore((s) => s.students)
  const teachers = useAppStore((s) => s.teachers)
  const currentUser = useAppStore((s) => s.currentUser)
  const [today, setToday] = useState(() => dayjs().format('YYYY-MM-DD'))
  useEffect(() => {
    const timer = window.setInterval(() => setToday(dayjs().format('YYYY-MM-DD')), 60000)
    return () => window.clearInterval(timer)
  }, [])
  const notices = useMemo(() => storedNotices.map((notice) => notice.status === '已发布' && notice.expireAt && notice.expireAt < today ? { ...notice, status: '已到期' as const } : notice), [storedNotices, today])
  const addNotice = useAppStore((s) => s.addNotice)
  const updateNotice = useAppStore((s) => s.updateNotice)
  const deleteNotice = useAppStore((s) => s.deleteNotice)
  const reorderNotices = useAppStore((s) => s.reorderNotices)
  const addLog = useAppStore((s) => s.addLog)

  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<string>()
  const [form] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [preview, setPreview] = useState<Notice | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Notice | null>(null)

  const sorted = useMemo(() => {
    const filtered = notices.filter((n) => {
      if (status && n.status !== status) return false
      if (keyword && !`${n.title} ${n.author}`.includes(keyword)) return false
      return true
    })
    return [...filtered].sort((a, b) => Number(b.pinned) - Number(a.pinned))
  }, [notices, keyword, status])

  const count = (st: string) => (st ? notices.filter((n) => n.status === st).length : notices.length)
  const pinnedCount = notices.filter((n) => n.pinned).length

  const togglePin = (n: Notice) => {
    updateNotice(n.id, { pinned: !n.pinned })
    message.success(!n.pinned ? '已置顶，排序优先' : '已取消置顶')
  }

  const publish = (n: Notice) => {
    if (n.expireAt && n.expireAt < dayjs().format('YYYY-MM-DD')) { message.error('有效期已过，请先编辑有效期'); return }
    updateNotice(n.id, { status: '已发布', publishAt: dayjs().format('YYYY-MM-DD HH:mm:ss'), readCount: n.status === '已发布' ? n.readCount : 0 })
    message.success('公告已发布')
    addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '创建', resourceType: '公告', resourceId: n.id, desc: `发布公告：${n.title}`, before: '草稿', after: '已发布', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: false })
  }

  const withdraw = (n: Notice) => {
    updateNotice(n.id, { status: '已撤回' })
    message.success('公告已撤回')
  }

  const handleDelete = (n: Notice) => {
    Modal.confirm({
      title: '确认删除', content: `确定要删除公告「${n.title}」吗？此操作不可恢复。`, okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true },
      onOk: () => { deleteNotice(n.id); message.success('公告已删除') },
    })
  }

  const handleCreate = () => {
    form.validateFields().then((v) => {
      const audience = v.audience
      const total = audience === '全体学生' ? students.length : audience === '全体教师' ? teachers.length : students.length + teachers.length
      const patch = {
        title: v.title.trim(),
        content: v.content.trim(),
        audience,
        totalCount: editing && editing.audience === audience ? editing.totalCount : total,
        expireAt: v.expireAt ? v.expireAt.format('YYYY-MM-DD') : undefined,
      }
      if (editing) {
        updateNotice(editing.id, patch)
      } else addNotice({
        ...patch,
        id: `N${crypto.randomUUID()}`,
        status: v.publishImmediately ? '已发布' : '草稿',
        pinned: false,
        readCount: 0,
        author: currentUser || '超级管理员',
        createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        publishAt: v.publishImmediately ? dayjs().format('YYYY-MM-DD HH:mm:ss') : undefined,
      })
      message.success(editing ? '公告已更新' : v.publishImmediately ? '公告已创建并发布' : '公告已保存为草稿')
      setCreateOpen(false)
    }).catch(() => { /* Form displays validation errors beside the fields. */ })
  }

  const handleReorder = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const src = notices.find((n) => n.id === dragId)
    const tgt = notices.find((n) => n.id === targetId)
    if (!src || !tgt) { setDragId(null); return }
    // 禁止跨区域拖拽：置顶与不置顶互不跨越
    if (src.pinned !== tgt.pinned) { setDragId(null); return }
    // 在完整 notices 中定位并重排
    const full = [...storedNotices]
    const srcFullIdx = full.findIndex((n) => n.id === src.id)
    const tgtFullIdx = full.findIndex((n) => n.id === tgt.id)
    const [moved] = full.splice(srcFullIdx, 1)
    full.splice(tgtFullIdx, 0, moved)
    reorderNotices(full)
    setDragId(null)
  }

  const columns = [
    {
      title: '', dataIndex: 'grip', width: 38,
      render: (_: unknown, record: Notice) => (
        <span
          draggable
          onDragStart={() => setDragId(record.id)}
          onDragEnd={() => setDragId(null)}
          onDragOver={(e: React.DragEvent) => e.preventDefault()}
          onDrop={(event) => { event.stopPropagation(); handleReorder(record.id) }}
          style={{ cursor: 'grab', color: '#C4CDD5', display: 'flex', padding: '2px 0' }}
        >
          <GripVertical size={16} />
        </span>
      ),
    },
    {
      title: '标题', dataIndex: 'title', width: 290,
      render: (v: string) => <b>{v}</b>,
    },
    { title: '目标受众', dataIndex: 'audience', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <StatusTag status={v} /> },
    {
      title: '已读追踪', width: 160,
      render: (_: unknown, r: Notice) => {
        const rate = r.totalCount ? Math.round((r.readCount / r.totalCount) * 100) : 0
        return (
          <div className="flex gap8" style={{ alignItems: 'center' }}>
            <BarChart3 size={13} style={{ color: colors.textMuted }} />
            <span style={{ fontSize: 12 }}>{r.readCount}/{r.totalCount} · {rate}%</span>
          </div>
        )
      },
    },
    { title: '发布人', dataIndex: 'author', width: 100 },
    { title: '发布时间', dataIndex: 'publishAt', width: 110, render: (v: string) => <span style={{ fontSize: 12, color: colors.textMuted }}>{v || '未发布'}</span> },
    { title: '有效期', dataIndex: 'expireAt', width: 110, render: (v: string) => v ? <span style={{ fontSize: 12, color: colors.textMuted }}>{v} 到期</span> : <span style={{ fontSize: 12, color: colors.textMuted }}>—</span> },
    {
      title: '操作', width: 180, fixed: 'right' as const,
      render: (_: unknown, r: Notice) => (
        <Space size={2}>
          <Tooltip title="查看" mouseEnterDelay={0.5}>
            <Button type="text" size="small" icon={<Eye size={15} />} onClick={() => setPreview(r)} style={{ color: '#6B7280' }} />
          </Tooltip>
          <Tooltip title={r.pinned ? '取消置顶' : '置顶'} mouseEnterDelay={0.5}>
            <Button type="text" size="small" icon={<Pin size={15} />} onClick={() => togglePin(r)} style={{ color: r.pinned ? colors.warning : '#9CA3AF' }} />
          </Tooltip>
          {r.status === '草稿' && (
            <Tooltip title="发布" mouseEnterDelay={0.5}>
              <Button type="text" size="small" icon={<Send size={14} />} onClick={() => publish(r)} style={{ color: colors.primary }} />
            </Tooltip>
          )}
          <Tooltip title="编辑" mouseEnterDelay={0.5}>
            <Button type="text" size="small" aria-label={`编辑公告 ${r.title}`} icon={<Edit3 size={14} />} onClick={() => {
              setEditing(r); form.resetFields(); form.setFieldsValue({ ...r, expireAt: r.expireAt ? dayjs(r.expireAt) : undefined }); setCreateOpen(true)
            }} style={{ color: '#6B7280' }} />
          </Tooltip>
          {r.status === '已发布' && (
            <Tooltip title="撤回" mouseEnterDelay={0.5}>
              <Button type="text" size="small" icon={<Undo2 size={14} />} onClick={() => withdraw(r)} style={{ color: '#F59E0B' }} />
            </Tooltip>
          )}
          <Tooltip title="删除" mouseEnterDelay={0.5}>
            <Button type="text" size="small" icon={<Trash2 size={14} />} onClick={() => handleDelete(r)} danger />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="通知公告" />
      <p style={{ color: colors.textMuted }}>当前为本次会话的公告演示数据，修改不会发送给师生，刷新后恢复。</p>

      {/* 汇总卡片 + 操作按钮同行 */}
      <Row gutter={12} style={{ marginBottom: 16 }} align="middle" justify="space-between">
        <Col>
          <Row gutter={12}>
            {[
              { icon: <CheckCircle2 size={22} />, label: '已发布', value: count('已发布'), color: colors.primary },
              { icon: <FileEdit size={22} />, label: '草稿', value: count('草稿'), color: colors.info },
              { icon: <Undo2 size={22} />, label: '已撤回', value: count('已撤回'), color: colors.warning },
              { icon: <Pin size={22} />, label: '置顶', value: pinnedCount, color: colors.purple },
            ].map((s) => {
              return (
                <Col key={s.label} style={{ width: 205 }}>
                  <div style={{
                    padding: '14px 16px', borderRadius: 10, background: 'var(--n-0)',
                    border: '1px solid var(--n-2)', display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: `${s.color}14`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {s.icon}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: 'var(--n-6)', fontWeight: 500, lineHeight: 1.4 }}>{s.label}</span>
                      <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color: 'var(--n-9)' }}>{s.value}</span>
                    </div>
                  </div>
                </Col>
              )
            })}
          </Row>
        </Col>
        <Col>
          <Button type="primary" icon={<Plus size={15} />} onClick={() => { setEditing(null); form.resetFields(); setCreateOpen(true) }}>新建公告</Button>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <Space wrap className="filter-bar">
          <Input.Search placeholder="标题/发布人" allowClear style={{ width: 240 }} onChange={(e) => setKeyword(e.target.value)} />
          <Select placeholder="状态" allowClear style={{ width: 120 }} onChange={setStatus} options={['草稿', '已发布', '已撤回', '已到期'].map((s) => ({ label: `${s} (${count(s)})`, value: s }))} />
        </Space>
        <Table
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={sorted}
          scroll={{ x: 1130 }}
          pagination={{ pageSize: 8, showTotal: (t) => `共 ${t} 条` }}
          onRow={(r: Notice) => ({
            onDragOver: (e: React.DragEvent) => { e.preventDefault() },
            onDrop: () => handleReorder(r.id),
            style: r.pinned ? { background: '#FFFBEB' } : undefined,
          })}
        />
      </Card>

      <Modal title={editing ? '编辑公告' : '新建公告'} open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)} destroyOnClose width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
          <Form.Item name="content" label="正文内容" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={5} /></Form.Item>
          <Form.Item name="audience" label="目标受众" rules={[{ required: true }]}><Radio.Group>{audiences.map((audience) => <Radio.Button key={audience} value={audience}>{audience}</Radio.Button>)}</Radio.Group></Form.Item>
          <Form.Item name="expireAt" label="有效期（到期自动失效）" rules={[{ validator: (_, value) => value && value.isBefore(dayjs(), 'day') ? Promise.reject(new Error('有效期不能早于今天')) : Promise.resolve() }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          {!editing && <Form.Item name="publishImmediately" label="发布方式" valuePropName="checked" initialValue={false}><Switch checkedChildren="立即发布" unCheckedChildren="保存草稿" /></Form.Item>}
        </Form>
      </Modal>

      <Modal title={`公告 · ${preview?.title}`} open={!!preview} onCancel={() => setPreview(null)} footer={null}>
        {preview && (
          <div>
            <div className="flex gap8" style={{ marginBottom: 12 }}>
              <Tag>{preview.audience}</Tag>
              <StatusTag status={preview.status} />
              {preview.pinned && <Tag color="warning"><Pin size={11} /> 置顶</Tag>}
            </div>
            <div style={{ color: colors.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{preview.content}</div>
            <div style={{ marginTop: 16, fontSize: 12, color: colors.textMuted }}>
              发布人：{preview.author} · 发布时间：{preview.publishAt || '未发布'}
              {preview.expireAt && ` · 有效期至 ${preview.expireAt}`}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
