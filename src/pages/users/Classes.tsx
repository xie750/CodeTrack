import { useMemo, useState } from 'react'
import { Button, Modal, Form, message, Row, Col, Select, Input, Descriptions, Tag, Tooltip } from 'antd'
import { Plus, BookOpen, Trash2, Edit3, Cpu, Hash, LogIn } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { useAppStore } from '@/stores/useAppStore'
import { colors } from '@/theme/themeConfig'
import type { CourseItem, CourseStatus } from '@/types'

const aiModels = ['暂无', 'DeepSeek-V3', 'DeepSeek-R1', 'DeepSeek-V4', 'GPT-4o', 'Claude-4']
const statusOptions: CourseStatus[] = ['进行中', '筹备中', '已归档']

const statusMeta: Record<CourseStatus, { color: string; bg: string }> = {
  '进行中': { color: '#10b981', bg: '#ecfdf5' },
  '筹备中': { color: '#f59e0b', bg: '#fffbeb' },
  '已归档': { color: '#6b7280', bg: '#f3f4f6' },
}

const cardGradients = [
  'linear-gradient(135deg, #dceefb 0%, #ffffff 50%, #e8f4fd 100%)',
  'linear-gradient(135deg, #e0e7ff 0%, #ffffff 50%, #eef2ff 100%)',
  'linear-gradient(135deg, #dbeafe 0%, #ffffff 50%, #e0f2fe 100%)',
  'linear-gradient(135deg, #e6edfe 0%, #ffffff 50%, #f0f5ff 100%)',
]

export default function Courses() {
  const courses = useAppStore((s) => s.courses)
  const addCourse = useAppStore((s) => s.addCourse)
  const updateCourse = useAppStore((s) => s.updateCourse)
  const deleteCourse = useAppStore((s) => s.deleteCourse)

  const [keyword, setKeyword] = useState('')
  const [form] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CourseItem | null>(null)
  const [viewing, setViewing] = useState<CourseItem | null>(null)

  const filtered = useMemo(
    () =>
      courses.filter((c) => {
        if (keyword && !`${c.name} ${c.id} ${c.teacher}`.includes(keyword)) return false
        return true
      }),
    [courses, keyword],
  )

  const handleSubmit = () => {
    form.validateFields().then((v) => {
      if (editing) {
        updateCourse(editing.id, { name: v.name, model: v.model, status: v.status })
        message.success('课程信息已更新')
      } else {
        addCourse({
          id: `CO${Date.now().toString().slice(-6)}`,
          name: v.name,
          teacher: '',
          semester: '2026-2027-1',
          hours: 0,
          model: v.model,
          status: v.status,
          studentCount: 0,
          classCount: 0,
          students: [],
          enrollmentChanges: [{ time: new Date().toLocaleString('zh-CN', { hour12: false }), studentId: '', name: '课程创建', action: '加入', operator: '超级管理员' }],
        })
        message.success('课程已创建')
      }
      setModalOpen(false)
    })
  }

  const handleDelete = (course: CourseItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除课程「${course.name}」吗？此操作不可恢复。`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        deleteCourse(course.id)
        message.success('课程已删除')
      },
    })
  }

  return (
    <div>
      {/* 顶栏 */}
      <PageHeader title="课程管理" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20, marginTop: -8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Input.Search placeholder="搜索课程名称 / ID" allowClear style={{ width: 260 }} onChange={(e) => setKeyword(e.target.value)} />
          <Button type="primary" icon={<Plus size={15} />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true) }}>新建课程</Button>
        </div>
      </div>

      {/* 课程卡片网格 */}
      <Row gutter={[16, 16]}>
        {filtered.map((c, idx) => {
          const meta = statusMeta[c.status]
          const gradient = cardGradients[idx % cardGradients.length]
          return (
            <Col xs={24} sm={12} lg={8} xl={6} key={c.id}>
              <div style={{
                borderRadius: 12,
                background: gradient,
                border: '1px solid rgba(59,130,246,.15)',
                overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                transition: 'box-shadow .2s, transform .2s',
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 24px rgba(59,130,246,.12)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
              >
                <div style={{ padding: '22px 22px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  {/* 状态标签 + 学期 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
                      background: meta.bg, color: meta.color, letterSpacing: 0.5,
                      boxShadow: `0 1px 2px ${meta.color}18`,
                    }}>
                      {c.status}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--n-5)', fontWeight: 500 }}>{c.semester}</span>
                  </div>

                  {/* 课程名称 */}
                  <div style={{
                    fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 8,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4,
                  }}>
                    {c.name}
                  </div>

                  {/* 课程编号 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', marginBottom: 14, fontFamily: 'monospace' }}>
                    <Hash size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    {c.id}
                  </div>

                  {/* AI 模型标签 */}
                  <div style={{ marginBottom: 16 }}>
                    <Tag color={c.model === '暂无' ? 'default' : 'blue'} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6 }}>
                      <Cpu size={11} style={{ marginRight: 4 }} />{c.model}
                    </Tag>
                  </div>

                  {/* 底部操作栏 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid rgba(59,130,246,.15)', paddingTop: 14, marginTop: 'auto' }}>
                    <Button type="primary" size="middle" icon={<LogIn size={14} />}
                      onClick={() => setViewing(c)}
                      style={{ flex: 1, fontSize: 13 }}
                    >
                      进入课程
                    </Button>
                    <Tooltip title="编辑" mouseEnterDelay={0.3}>
                      <Button type="text" size="middle" icon={<Edit3 size={16} />}
                        onClick={() => { setEditing(c); form.setFieldsValue(c); setModalOpen(true) }}
                        style={{ color: '#64748b' }}
                      />
                    </Tooltip>
                    <Tooltip title="删除" mouseEnterDelay={0.3}>
                      <Button type="text" size="middle" danger icon={<Trash2 size={16} />}
                        onClick={() => handleDelete(c)}
                      />
                    </Tooltip>
                  </div>
                </div>
              </div>
            </Col>
          )
        })}
      </Row>

      {/* 空态 */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--n-5)' }}>
          <BookOpen size={44} style={{ marginBottom: 14, opacity: 0.25 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>暂无课程</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>点击右上角「新建课程」开始创建</div>
        </div>
      )}

      {/* 新建/编辑弹窗 */}
      <Modal title={editing ? '编辑课程' : '新建课程'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="课程名称" rules={[{ required: true }]}>
            <Input placeholder="如 数据结构与程序设计基础" />
          </Form.Item>
          <Form.Item name="model" label="接入模型" rules={[{ required: true }]}>
            <Select options={aiModels.map((m) => ({ label: m, value: m }))} placeholder="选择 AI 模型" />
          </Form.Item>
          <Form.Item name="status" label="课程状态" rules={[{ required: true }]} initialValue="进行中">
            <Select options={statusOptions.map((s) => ({ label: s, value: s }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 课程详情 Modal */}
      <Modal
        title={
          <span style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={18} style={{ color: colors.primary }} />
            课程详情 · {viewing?.name}
          </span>
        }
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={null}
        width={480}
        destroyOnClose
      >
        {viewing && (
          <Descriptions column={1} bordered size="middle" labelStyle={{ fontWeight: 600, width: 100 }}>
            <Descriptions.Item label="课程名称">
              <b style={{ fontSize: 14 }}>{viewing.name}</b>
            </Descriptions.Item>
            <Descriptions.Item label="课程编号">{viewing.id}</Descriptions.Item>
            <Descriptions.Item label="课程状态">
              <Tag color={viewing.status === '进行中' ? 'success' : viewing.status === '筹备中' ? 'warning' : 'default'}>{viewing.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="接入模型">
              <Tag color={viewing.model === '暂无' ? 'default' : 'blue'} style={{ fontSize: 13 }}><Cpu size={12} style={{ marginRight: 4 }} />{viewing.model}</Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}
