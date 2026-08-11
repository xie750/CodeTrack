import { useMemo, useState } from 'react'
import { Card, Table, Input, Select, Button, Space, Modal, Form, Descriptions, Tabs, message, Drawer, Radio, Row, Col } from 'antd'
import { Plus, UploadCloud, RefreshCw, UserX, UserCheck, Eye, Sparkles, Users, Wifi, UserPlus, TrendingUp, TrendingDown } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import StatusTag from '@/components/StatusTag'
import VerifyModal from '@/components/VerifyModal'
import ImportModal from '@/components/ImportModal'
import { useAppStore } from '@/stores/useAppStore'
import { colors } from '@/theme/themeConfig'
import type { Teacher } from '@/types'

const titles = ['教授', '副教授', '讲师', '助教']

export default function Teachers() {
  const teachers = useAppStore((s) => s.teachers)
  const courses = useAppStore((s) => s.courses)
  const addTeacher = useAppStore((s) => s.addTeacher)
  const updateTeacher = useAppStore((s) => s.updateTeacher)
  const addLog = useAppStore((s) => s.addLog)

  const [keyword, setKeyword] = useState('')
  const [title, setTitle] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [activeTab, setActiveTab] = useState('all')
  const [form] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Teacher | null>(null)
  const [detail, setDetail] = useState<Teacher | null>(null)
  const [verify, setVerify] = useState<{ open: boolean; action: string; onOk: () => void }>({ open: false, action: '', onOk: () => {} })
  const [importOpen, setImportOpen] = useState(false)
  const [assetTarget, setAssetTarget] = useState<Teacher | null>(null)
  const [assetMethod, setAssetMethod] = useState('冻结')
  const [resetTarget, setResetTarget] = useState<Teacher | null>(null)

  const filtered = useMemo(() => {
    return teachers.filter((t) => {
      if (activeTab === 'active' && t.status !== '已启用') return false
      if (activeTab === 'pending' && t.status !== '待激活') return false
      if (activeTab === 'disabled' && t.status !== '已停用') return false
      if (title && t.title !== title) return false
      if (status && t.status !== status) return false
      if (keyword) {
        const ks = keyword.trim().split(/\s+/).filter(Boolean)
        const hay = `${t.id} ${t.name}`
        return ks.every((k) => hay.includes(k))
      }
      return true
    })
  }, [teachers, keyword, title, status, activeTab])

  const pendingCount = teachers.filter((t) => t.status === '待激活').length
  const activeCount = teachers.filter((t) => t.status === '已启用').length
  const disabledCount = teachers.filter((t) => t.status === '已停用').length
  const onlineCount = teachers.filter((t) => t.loginStatus === '在线').length

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }
  const openEdit = (t: Teacher) => {
    setEditing(t)
    form.setFieldsValue(t)
    setModalOpen(true)
  }

  const handleSubmit = () => {
    form.validateFields().then((v) => {
      if (editing) {
        updateTeacher(editing.id, v)
        message.success('教师信息已更新')
        addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '编辑', resourceType: '教师账号', resourceId: editing.id, desc: `编辑教师 ${editing.name} 信息`, before: '', after: '', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: false })
      } else {
        const t: Teacher = {
          id: v.id,
          name: v.name,
          dept: '',
          title: v.title,
          email: v.email,
          phone: v.phone,
          status: '待激活',
          loginStatus: '离线',
          lastActiveAt: '—',
          createdAt: '2026-08-08',
          assetCount: 0,
        }
        addTeacher(t)
        message.success('教师账号已创建，默认待激活，请前往「账号激活审核」启用')
        addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '创建', resourceType: '教师账号', resourceId: t.id, desc: `新建教师 ${t.name}`, before: '', after: '待激活', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: false })
      }
      setModalOpen(false)
    })
  }

  const doStop = (t: Teacher) => {
    setAssetTarget(t)
    setAssetMethod('冻结')
  }
  const confirmStop = () => {
    if (!assetTarget) return
    updateTeacher(assetTarget.id, { status: '已停用', loginStatus: '离线' })
    message.success(`教师已停用，名下 ${assetTarget.assetCount} 项资产已${assetMethod}`)
    addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '编辑', resourceType: '教师账号', resourceId: assetTarget.id, desc: `停用教师 ${assetTarget.name}，资产${assetMethod}`, before: '已启用', after: '已停用', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true })
    setAssetTarget(null)
  }

  const doActivate = (t: Teacher) => {
    updateTeacher(t.id, { status: '已启用' })
    message.success(`${t.name} 已启用`)
    addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '审核', resourceType: '教师账号', resourceId: t.id, desc: `激活审核通过 ${t.name}`, before: '待激活', after: '已启用', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true })
  }

  const doResetPwd = (t: Teacher) => {
    setResetTarget(t)
  }

  const confirmResetPwd = () => {
    if (!resetTarget) return
    addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '编辑', resourceType: '教师账号', resourceId: resetTarget.id, desc: `重置 ${resetTarget.name} 密码（随机高强度密码，站内通知+邮件推送）`, before: '', after: '', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true })
    message.success(`已成功重置密码，新密码已通过站内通知发送给 ${resetTarget.name}，请告知用户查看站内消息`)
    setResetTarget(null)
  }

  const columns = [
    { title: '工号', dataIndex: 'id', width: 90, render: (v: string) => <b>{v}</b> },
    { title: '姓名', dataIndex: 'name', width: 100, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: '职称', dataIndex: 'title', width: 90 },
    { title: '邮箱', dataIndex: 'email', width: 180, ellipsis: true },
    { title: '账号状态', dataIndex: 'status', width: 100, render: (v: string) => <StatusTag status={v} /> },
    {
      title: '登录状态', dataIndex: 'loginStatus', width: 100,
      render: (v: string, r: Teacher) => (
        <Space>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.loginStatus === '在线' ? 'var(--primary)' : 'var(--n-5)', display: 'inline-block' }} />
          <span style={{ color: r.loginStatus === '在线' ? colors.textPrimary : colors.textMuted }}>{v}</span>
        </Space>
      ),
    },
    { title: '最近活跃', dataIndex: 'lastActiveAt', width: 120, render: (v: string) => <span style={{ color: colors.textMuted, fontSize: 12 }}>{v}</span> },
    {
      title: '操作', width: 240,
      render: (_: unknown, r: Teacher) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDetail(r)}><Eye size={14} />详情</Button>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          {r.status === '待激活' && (
            <Button type="link" size="small" style={{ color: colors.primary }} onClick={() => doActivate(r)}><UserCheck size={14} />激活</Button>
          )}
          {r.status === '已启用' && (
            <Button type="link" size="small" style={{ color: colors.danger }} onClick={() => doStop(r)}><UserX size={14} />停用</Button>
          )}
          <Button type="link" size="small" onClick={() => doResetPwd(r)}><RefreshCw size={14} />重置密码</Button>
        </Space>
      ),
    },
  ]

  const detailTabs = detail ? (() => {
    const teacherName = detail.name
    // 该教师授课的课程
    const teacherClasses = courses.filter((c) => c.teacher === teacherName)
    // 该教师教授的所有课程
    const teacherCourses = teacherClasses
    return [
      {
        key: '1', label: '基本信息',
        children: (
          <Descriptions column={2} bordered size="middle">
            <Descriptions.Item label="工号"><b>{detail.id}</b></Descriptions.Item>
            <Descriptions.Item label="姓名"><b>{detail.name}</b></Descriptions.Item>
            <Descriptions.Item label="职称">{detail.title}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{detail.email}</Descriptions.Item>
            <Descriptions.Item label="手机">{detail.phone}</Descriptions.Item>
            <Descriptions.Item label="账号状态"><StatusTag status={detail.status} /></Descriptions.Item>
            <Descriptions.Item label="最近登录时间">{detail.lastActiveAt}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detail.createdAt}</Descriptions.Item>
            <Descriptions.Item label="名下资产"><b style={{ color: colors.primary }}>{detail.assetCount} 项</b></Descriptions.Item>
          </Descriptions>
        ),
      },
      {
        key: '2', label: `授课课程（${teacherClasses.length}）`,
        children: teacherClasses.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teacherClasses.map((c) => (
              <div key={c.id} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--n-3)', background: 'var(--n-1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--n-6)' }}>{c.semester}</span>
                  <span style={{ fontSize: 11, color: 'var(--n-5)' }}>{c.studentCount} 人</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--n-6)', lineHeight: 1.6 }}>
                  课时：{c.hours} 课时
                </div>
              </div>
            ))}
          </div>
        ) : <span style={{ color: 'var(--n-5)' }}>暂无授课课程</span>,
      },
      {
        key: '3', label: `教授课程（${teacherCourses.length}）`,
        children: teacherCourses.length > 0 ? (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={teacherCourses}
            columns={[
              { title: '课程名称', dataIndex: 'name', width: 180 },
              { title: '学期', dataIndex: 'semester', width: 120 },
              { title: '课时', dataIndex: 'hours', width: 80, render: (v: number) => `${v} 课时` },
              { title: '学生数', dataIndex: 'studentCount', width: 80, render: (v: number) => `${v} 人` },
            ]}
          />
        ) : <span style={{ color: 'var(--n-5)' }}>暂无教授课程</span>,
      },
      {
        key: '5', label: '课表',
        children: (() => {
          const weekdays = ['周一', '周二', '周三', '周四', '周五']
          const periods = ['第1-2节', '第3-4节', '第5-6节', '第7-8节']
          const mockSchedule: Record<string, Record<string, { name: string; room: string } | null>> = {
            '周一': { '第1-2节': { name: '数据结构与算法', room: '教3-401' }, '第3-4节': { name: '高等数学', room: '教1-205' }, '第5-6节': null, '第7-8节': null },
            '周二': { '第1-2节': null, '第3-4节': { name: '操作系统', room: '教3-402' }, '第5-6节': { name: '数据库原理', room: '实验楼A201' }, '第7-8节': null },
            '周三': { '第1-2节': { name: '计算机网络', room: '教1-108' }, '第3-4节': { name: '数据结构与算法', room: '教3-401' }, '第5-6节': null, '第7-8节': null },
            '周四': { '第1-2节': { name: '高等数学', room: '教1-205' }, '第3-4节': null, '第5-6节': { name: '操作系统', room: '实验楼B103' }, '第7-8节': null },
            '周五': { '第1-2节': null, '第3-4节': { name: '形势与政策', room: '教1-301' }, '第5-6节': null, '第7-8节': null },
          }
          return (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 6px', background: '#F3F4F6', border: '1px solid #E5E7EB', color: '#6B7280', fontWeight: 500, width: 64 }}>节次</th>
                    {weekdays.map((d) => (
                      <th key={d} style={{ padding: '8px 6px', background: '#F3F4F6', border: '1px solid #E5E7EB', color: '#374151', fontWeight: 600 }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p}>
                      <td style={{ padding: '8px 6px', border: '1px solid #E5E7EB', color: '#6B7280', textAlign: 'center', fontWeight: 500 }}>{p}</td>
                      {weekdays.map((d) => {
                        const cell = mockSchedule[d]?.[p]
                        return (
                          <td key={d + p} style={{
                            padding: '6px 8px', border: '1px solid #E5E7EB', textAlign: 'center',
                            background: cell ? '#EEF2FF' : '#FAFAFA',
                            color: cell ? '#1D2C3C' : '#D1D5DB',
                          }}>
                            {cell ? (
                              <>
                                <div style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.4 }}>{cell.name}</div>
                                <div style={{ color: '#9CA3AF', fontSize: 10, marginTop: 1 }}>{cell.room}</div>
                              </>
                            ) : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })(),
      },
      {
        key: '4', label: '名下资产',
        children: (
          <div>
            <p style={{ color: colors.textSecondary }}>停用账号时需指定资产处理方式，避免平台内容悬挂在离职人名下。</p>
            <Space wrap>
              <Radio.Group value={assetMethod} onChange={(e) => setAssetMethod(e.target.value)}>
                <Radio.Button value="移交他人">移交他人</Radio.Button>
                <Radio.Button value="冻结">冻结</Radio.Button>
                <Radio.Button value="归档">归档</Radio.Button>
              </Radio.Group>
              <Button size="small" type="primary" onClick={() => { setAssetTarget(detail); setVerify({ open: true, action: '停用账号与资产处置', onOk: confirmStop }) }}>处置名下 {detail.assetCount} 项资产</Button>
            </Space>
          </div>
        ),
      },
    ]
  })() : []

  return (
    <div>
      <PageHeader title="教师账号管理" />

      {/* 汇总卡片 + 操作按钮同行 */}
      <Row gutter={12} style={{ marginBottom: 16 }} align="middle" justify="space-between">
        <Col>
          <Row gutter={12}>
            {[
              { icon: <Users size={22} />, label: '教师总数', value: teachers.length, color: colors.primary, trend: 3, trendLabel: '较上月' },
              { icon: <Wifi size={22} />, label: '在线教师', value: onlineCount, color: colors.success, trend: 5, trendLabel: '较昨日' },
              { icon: <UserPlus size={22} />, label: '待激活', value: pendingCount, color: colors.warning, trend: -2, trendLabel: '较上周' },
              { icon: <UserX size={22} />, label: '已停用', value: disabledCount, color: colors.info, trend: 0, trendLabel: '较上周' },
            ].map((s) => {
              const isUp = (s.trend ?? 0) >= 0
              const trendColor = isUp ? 'var(--c-success)' : 'var(--c-danger)'
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
                      {s.trendLabel && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--n-6)', fontSize: 11, lineHeight: 1.4 }}>
                          {s.trendLabel}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: trendColor, fontWeight: 600 }}>
                            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {Math.abs(s.trend)}%
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </Col>
              )
            })}
          </Row>
        </Col>
        <Col>
          <Space>
            <Button icon={<UploadCloud size={15} />} onClick={() => setImportOpen(true)}>批量导入</Button>
            <Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>新建教师</Button>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ padding: '0 20px' }}
          items={[
            { key: 'all', label: `全部 (${teachers.length})` },
            { key: 'active', label: `已启用 (${activeCount})` },
            { key: 'pending', label: <span className="flex gap8"><Sparkles size={13} style={{ color: colors.warning }} />待激活 ({pendingCount})</span> },
            { key: 'disabled', label: `已停用 (${disabledCount})` },
          ]}
        />
        <div style={{ padding: '0 20px 16px' }}>
          <Space wrap className="filter-bar">
            <Input.Search placeholder="工号/姓名（空格多关键字）" allowClear style={{ width: 240 }} onChange={(e) => setKeyword(e.target.value)} />
            <Select placeholder="职称" allowClear style={{ width: 120 }} options={titles.map((t) => ({ label: t, value: t }))} onChange={setTitle} />
            <Select placeholder="账号状态" allowClear style={{ width: 120 }} options={['已启用', '待激活', '已停用'].map((s) => ({ label: s, value: s }))} onChange={setStatus} />
          </Space>
          <Table rowKey="id" size="middle" columns={columns} dataSource={filtered} scroll={{ x: 'max-content', y: 420 }} pagination={{ pageSize: 8, showTotal: (t) => `共 ${t} 条` }} />
        </div>
      </Card>

      {/* 新建/编辑 */}
      <Modal title={editing ? '编辑教师' : '新建教师'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ status: '待激活' }}>
          <Form.Item name="id" label="工号" rules={[{ required: true, message: '请输入工号' }]}>
            <Input disabled={!!editing} placeholder="如 T1001" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="title" label="职称" rules={[{ required: true }]}>
            <Select options={titles.map((t) => ({ label: t, value: t }))} />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入正确邮箱' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机" rules={[{ required: true, pattern: /^1[3-9]\d{9}$/, message: '请输入正确手机号' }]}>
            <Input />
          </Form.Item>
          {!editing && (
            <Form.Item name="password" label="初始密码" rules={[
              { required: true, message: '请输入或随机生成初始密码' },
              { min: 8, message: '密码至少 8 位' },
              { pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: '密码需包含字母和数字' },
            ]}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input.Password placeholder="输入密码或点击生成" style={{ flex: 1 }} />
                <Button onClick={() => {
                  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
                  let pwd = ''
                  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
                  form.setFieldValue('password', `Tch${pwd}`)
                }}>随机生成</Button>
              </div>
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 详情 */}
      <Drawer title={`教师详情 · ${detail?.name}`} open={!!detail} onClose={() => setDetail(null)} width={640}>
        {detail && <Tabs items={detailTabs} />}
      </Drawer>

      {/* 停用二次确认 + 资产处置 */}
      <Modal
        title={`停用教师 · ${assetTarget?.name}`}
        open={!!assetTarget}
        onOk={confirmStop}
        onCancel={() => setAssetTarget(null)}
        okText="确认停用"
        okButtonProps={{ danger: true }}
      >
        <p style={{ color: colors.textSecondary }}>
          停用后该账号将无法登录平台。其名下 <b style={{ color: colors.danger }}>{assetTarget?.assetCount}</b> 项资产需指定处理方式：
        </p>
        <Radio.Group value={assetMethod} onChange={(e) => setAssetMethod(e.target.value)} style={{ marginBottom: 8 }}>
          <Radio value="移交他人">移交他人</Radio>
          <Radio value="冻结">冻结</Radio>
          <Radio value="归档">归档</Radio>
        </Radio.Group>
        <div style={{ fontSize: 12, color: colors.textMuted }}>此操作为敏感操作，确认后需二次验证并写入操作日志。</div>
      </Modal>

      {/* 重置密码确认弹窗 */}
      <Modal
        title={`重置密码 · ${resetTarget?.name}`}
        open={!!resetTarget}
        onOk={confirmResetPwd}
        onCancel={() => setResetTarget(null)}
        okText="确认重置"
        okButtonProps={{ danger: true }}
      >
        <p>确认重置 <b>{resetTarget?.name}</b>（{resetTarget?.id}）的登录密码？</p>
        <p style={{ color: colors.textSecondary, fontSize: 13 }}>系统将自动生成随机高强度密码，并通过以下方式发送给用户：</p>
        <ul style={{ color: colors.textSecondary, fontSize: 13, paddingLeft: 20 }}>
          <li>站内消息推送（含明文新密码）</li>
          {resetTarget?.email && <li>邮箱发送至 {resetTarget.email}</li>}
        </ul>
        <p style={{ color: colors.warning, fontSize: 12 }}>⚠️ 管理员后台不展示明文密码，您无法获取该密码，请告知用户查看站内消息。</p>
      </Modal>

      <VerifyModal open={verify.open} actionLabel={verify.action} onCancel={() => setVerify({ open: false, action: '', onOk: () => {} })} onConfirm={verify.onOk} />

      <ImportModal open={importOpen} onCancel={() => setImportOpen(false)} kind="教师" onSuccess={() => {}} />
    </div>
  )
}
