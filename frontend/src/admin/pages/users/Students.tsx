import { useMemo, useState } from 'react'
import { Card, Table, Input, Select, Button, Space, Modal, Form, message, Drawer, Descriptions, Row, Col, Tabs, Tag } from 'antd'
import { Plus, UploadCloud, RefreshCw, UserX, UserCheck, Eye, Users, Wifi, UserPlus, Sparkles, TrendingUp, TrendingDown } from 'lucide-react'
import PageHeader from '@admin/components/PageHeader'
import StatusTag from '@admin/components/StatusTag'
import ImportModal from '@admin/components/ImportModal'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'
import type { Student } from '@admin/types'

const majors = ['人工智能']
const grades = ['2023级', '2024级', '2025级']
const classNames = ['机器学习', 'Python 程序设计', '数据结构']

export default function Students() {
  const students = useAppStore((s) => s.students)
  const courses = useAppStore((s) => s.courses)
  const addStudent = useAppStore((s) => s.addStudent)
  const updateStudent = useAppStore((s) => s.updateStudent)
  const addLog = useAppStore((s) => s.addLog)

  const [keyword, setKeyword] = useState('')
  const [grade, setGrade] = useState<string>()
  const [major, setMajor] = useState<string>()
  const [courseName, setCourseName] = useState<string>()
  const [tab, setTab] = useState('all')
  const [form] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [detail, setDetail] = useState<Student | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<Student | null>(null)
  const [stopTarget, setStopTarget] = useState<Student | null>(null)

  const filtered = useMemo(
    () =>
      students.filter((s) => {
        if (tab === 'active' && s.status !== '已启用') return false
        if (tab === 'pending' && s.status !== '待激活') return false
        if (tab === 'disabled' && s.status !== '已停用') return false
        if (grade && s.grade !== grade) return false
        if (major && s.dept !== major) return false
        if (courseName && s.courseName !== courseName) return false
        if (keyword) {
          const ks = keyword.trim().split(/\s+/).filter(Boolean)
          return ks.every((k) => `${s.id} ${s.name} ${s.dept} ${s.courseName}`.includes(k))
        }
        return true
      }),
    [students, keyword, grade, major, courseName, tab],
  )

  const count = (st: string) => students.filter((s) => s.status === st).length
  const onlineCount = students.filter((s) => s.loginStatus === '在线').length

  const handleSubmit = () => {
    form.validateFields().then((v) => {
      if (editing) {
        updateStudent(editing.id, v)
        message.success('学生信息已更新')
      } else {
        addStudent({ id: v.id, name: v.name, gender: v.gender, grade: v.grade, dept: v.dept, courseName: v.className, status: '待激活', loginStatus: '离线', lastActiveAt: '—', createdAt: '2026-08-08' })
        message.success('学生账号已创建，默认待激活')
      }
      setModalOpen(false)
    })
  }

  const doActivate = (s: Student) => {
    updateStudent(s.id, { status: '已启用' })
    message.success(`${s.name} 已启用`)
    addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '审核', resourceType: '学生账号', resourceId: s.id, desc: `激活审核通过 ${s.name}`, before: '待激活', after: '已启用', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true })
  }

  const doStop = (s: Student) => {
    setStopTarget(s)
  }

  const confirmStop = () => {
    if (!stopTarget) return
    updateStudent(stopTarget.id, { status: '已停用', loginStatus: '离线' })
    message.success(`${stopTarget.name} 已停用`)
    addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '编辑', resourceType: '学生账号', resourceId: stopTarget.id, desc: `停用学生 ${stopTarget.name}`, before: '已启用', after: '已停用', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true })
    setStopTarget(null)
  }

  const doResetPwd = (s: Student) => {
    setResetTarget(s)
  }

  const confirmResetPwd = () => {
    if (!resetTarget) return
    addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '编辑', resourceType: '学生账号', resourceId: resetTarget.id, desc: `重置 ${resetTarget.name} 密码（随机高强度密码，站内通知+邮件推送）`, before: '', after: '', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true })
    message.success(`已成功重置密码，新密码已通过站内通知发送给 ${resetTarget.name}，请告知用户查看站内消息`)
    setResetTarget(null)
  }

  const columns = [
    { title: '学号', dataIndex: 'id', width: 100, render: (v: string) => <b>{v}</b> },
    { title: '姓名', dataIndex: 'name', width: 75, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: '性别', dataIndex: 'gender', width: 50 },
    { title: '年级', dataIndex: 'grade', width: 70 },
    { title: '专业', dataIndex: 'dept', width: 130, ellipsis: true },
    { title: '课程', dataIndex: 'courseName', width: 110 },
    { title: '账号状态', dataIndex: 'status', width: 85, render: (v: string) => <StatusTag status={v} /> },
    { title: '最近活跃', dataIndex: 'lastActiveAt', width: 100, render: (v: string) => <span style={{ color: colors.textMuted, fontSize: 12 }}>{v}</span> },
    {
      title: '操作', width: 170,
      render: (_: unknown, r: Student) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDetail(r)}><Eye size={14} />详情</Button>
          <Button type="link" size="small" onClick={() => { setEditing(r); form.setFieldsValue(r); setModalOpen(true) }}>编辑</Button>
          {r.status === '待激活' && <Button type="link" size="small" style={{ color: colors.primary }} onClick={() => doActivate(r)}><UserCheck size={14} />激活</Button>}
          {r.status === '已启用' && <Button type="link" size="small" style={{ color: colors.danger }} onClick={() => doStop(r)}><UserX size={14} />停用</Button>}
          <Button type="link" size="small" onClick={() => doResetPwd(r)}><RefreshCw size={14} />重置</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="学生账号管理" />

      {/* 汇总卡片 + 操作按钮同行 */}
      <Row gutter={12} style={{ marginBottom: 16 }} align="middle" justify="space-between">
        <Col>
          <Row gutter={12}>
            {[
              { icon: <Users size={22} />, label: '学生总数', value: students.length, color: colors.primary, trend: 5, trendLabel: '较上月' },
              { icon: <Wifi size={22} />, label: '在线学生', value: onlineCount, color: colors.success, trend: 8, trendLabel: '较昨日' },
              { icon: <UserPlus size={22} />, label: '待激活', value: count('待激活'), color: colors.warning, trend: -3, trendLabel: '较上周' },
              { icon: <UserX size={22} />, label: '已停用', value: count('已停用'), color: colors.info, trend: 0, trendLabel: '较上周' },
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
            <Button type="primary" icon={<Plus size={15} />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true) }}>新建学生</Button>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          style={{ padding: '0 20px' }}
          items={[
            { key: 'all', label: `全部 (${students.length})` },
            { key: 'active', label: `已启用 (${count('已启用')})` },
            { key: 'pending', label: <span className="flex gap8"><Sparkles size={13} style={{ color: colors.warning }} />待激活 ({count('待激活')})</span> },
            { key: 'disabled', label: `已停用 (${count('已停用')})` },
          ]}
        />
        <div style={{ padding: '0 20px 16px' }}>
          <Space wrap className="filter-bar">
            <Input.Search placeholder="学号/姓名" allowClear style={{ width: 220 }} onChange={(e) => setKeyword(e.target.value)} />
            <Select placeholder="年级" allowClear style={{ width: 110 }} options={grades.map((g) => ({ label: g, value: g }))} onChange={setGrade} />
            <Select placeholder="专业" allowClear style={{ width: 190 }} options={majors.map((m) => ({ label: m, value: m }))} onChange={setMajor} />
            <Select placeholder="课程" allowClear style={{ width: 130 }} options={classNames.map((c) => ({ label: c, value: c }))} onChange={setCourseName} />
          </Space>
          <Table rowKey="id" size="middle" columns={columns} dataSource={filtered} scroll={{ x: 'max-content', y: 420 }} pagination={{ pageSize: 8, showTotal: (t) => `共 ${t} 条` }} />
        </div>
      </Card>

      <Modal title={editing ? '编辑学生' : '新建学生'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="id" label="学号" rules={[{ required: true, message: '请输入学号' }]}>
            <Input disabled={!!editing} placeholder="如 U2024001" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="gender" label="性别" rules={[{ required: true }]}>
            <Select options={[{ label: '男', value: '男' }, { label: '女', value: '女' }]} />
          </Form.Item>
          <Form.Item name="grade" label="年级" rules={[{ required: true }]}>
            <Select options={grades.map((g) => ({ label: g, value: g }))} />
          </Form.Item>
          <Form.Item name="dept" label="专业" rules={[{ required: true }]}>
            <Select options={majors.map((m) => ({ label: m, value: m }))} />
          </Form.Item>
          <Form.Item name="className" label="课程" rules={[{ required: true }]}>
            <Select options={classNames.map((c) => ({ label: c, value: c }))} />
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
                  form.setFieldValue('password', `Stu${pwd}`)
                }}>随机生成</Button>
              </div>
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Drawer title={`学生详情 · ${detail?.name}`} open={!!detail} onClose={() => setDetail(null)} width={640}>
        {detail && (() => {
          const studentCourse = courses.find((c) => c.name === detail.courseName)
          const courseDetail = studentCourse

          const weekdays = ['周一', '周二', '周三', '周四', '周五']
          const periods = ['第1-2节', '第3-4节', '第5-6节', '第7-8节']
          const mockSchedule: Record<string, Record<string, { name: string; room: string } | null>> = {
            '周一': { '第1-2节': { name: '数据结构', room: '教3-401' }, '第3-4节': { name: 'Python 程序设计', room: '实验楼A201' }, '第5-6节': null, '第7-8节': null },
            '周二': { '第1-2节': null, '第3-4节': { name: '机器学习', room: '教3-402' }, '第5-6节': null, '第7-8节': null },
            '周三': { '第1-2节': { name: 'Python 程序设计', room: '实验楼A201' }, '第3-4节': { name: '数据结构', room: '教3-401' }, '第5-6节': null, '第7-8节': null },
            '周四': { '第1-2节': { name: '机器学习', room: '教3-402' }, '第3-4节': null, '第5-6节': { name: '数据结构', room: '教3-401' }, '第7-8节': null },
            '周五': { '第1-2节': null, '第3-4节': { name: 'Python 程序设计', room: '实验楼A201' }, '第5-6节': null, '第7-8节': null },
          }

          return (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>基本信息</div>
              <Descriptions column={2} bordered size="small" style={{ marginBottom: 24 }}>
                <Descriptions.Item label="学号">{detail.id}</Descriptions.Item>
                <Descriptions.Item label="姓名">{detail.name}</Descriptions.Item>
                <Descriptions.Item label="性别">{detail.gender}</Descriptions.Item>
                <Descriptions.Item label="年级">{detail.grade}</Descriptions.Item>
                <Descriptions.Item label="专业" span={2}>{detail.dept}</Descriptions.Item>
                <Descriptions.Item label="课程" span={2}>{detail.courseName}</Descriptions.Item>
                <Descriptions.Item label="账号状态"><StatusTag status={detail.status} /></Descriptions.Item>
                <Descriptions.Item label="最近活跃">{detail.lastActiveAt}</Descriptions.Item>
              </Descriptions>

              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>课程信息</div>
              {courseDetail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.primary, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#1D2C3C' }}>{courseDetail.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontSize: 12, color: '#6B7280' }}>{courseDetail.teacher}</span>
                      <span style={{ fontSize: 12, color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: 4 }}>{courseDetail.hours} 课时</span>
                      <Tag style={{ margin: 0 }}>{courseDetail.semester}</Tag>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 13, marginBottom: 24 }}>暂无课程数据</div>
              )}

              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>课程表</div>
              <div style={{ overflowX: 'auto', marginBottom: 8 }}>
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
                                  <div style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>{cell.room}</div>
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
            </div>
          )
        })()}
      </Drawer>

      {/* 停用二次确认 */}
      <Modal
        title={`停用学生 · ${stopTarget?.name}`}
        open={!!stopTarget}
        onOk={confirmStop}
        onCancel={() => setStopTarget(null)}
        okText="确认停用"
        okButtonProps={{ danger: true }}
      >
        <p>确认停用学生 <b>{stopTarget?.name}</b>（{stopTarget?.id}）？</p>
        <p style={{ color: colors.textSecondary, fontSize: 13 }}>停用后该学生将无法登录平台，其账户数据保留可查。</p>
        <p style={{ color: colors.warning, fontSize: 12 }}>⚠️ 此操作为敏感操作，将写入操作日志。</p>
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
        </ul>
        <p style={{ color: colors.warning, fontSize: 12 }}>⚠️ 管理员后台不展示明文密码，您无法获取该密码，请告知用户查看站内消息。</p>
      </Modal>

      <ImportModal open={importOpen} onCancel={() => setImportOpen(false)} kind="学生" onSuccess={() => {}} />
    </div>
  )
}
