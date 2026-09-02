import { useMemo, useState } from 'react'
import { Button, Col, Descriptions, Form, Input, InputNumber, message, Modal, Row, Select, Space, Tag, Tooltip } from 'antd'
import { BookOpen, CheckCircle2, Cpu, DatabaseZap, Edit3, Eye, Hash, Link2, Plus, School, Trash2 } from 'lucide-react'
import PageHeader from '@admin/components/PageHeader'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'
import type { CourseItem, CourseStatus } from '@admin/types'

const aiModels = ['暂无', '机器学习课程垂类模型', 'Python 程序设计课程垂类模型', '数据结构课程垂类模型', '人工智能专业垂类大模型']
const statusOptions: CourseStatus[] = ['进行中', '筹备中', '已归档']
const majorOptions = ['人工智能']
const classOptions = ['人工智能 1 班', '人工智能 2 班']

const knowledgeByCourse: Record<string, string[]> = {
  机器学习: ['监督学习', '模型评估', '过拟合', '正则化', '数据集划分'],
  'Python 程序设计': ['函数', '列表字典', 'NumPy 数组', 'Pandas 数据处理'],
  数据结构: ['链表', '栈与队列', '二叉树', '递归'],
}

const statusMeta: Record<CourseStatus, { color: string; bg: string }> = {
  进行中: { color: '#10b981', bg: '#ecfdf5' },
  筹备中: { color: '#f59e0b', bg: '#fffbeb' },
  已归档: { color: '#6b7280', bg: '#f3f4f6' },
}

function knowledgeStatusColor(status?: CourseItem['knowledgeBaseStatus']) {
  if (status === '已开放') return 'success'
  if (status === '待发布') return 'warning'
  return 'default'
}

function portalStatusColor(status?: CourseItem['studentPortalStatus']) {
  return status === '已开放' ? 'success' : 'default'
}

export default function Courses() {
  const courses = useAppStore((s) => s.courses)
  const teachers = useAppStore((s) => s.teachers)
  const addCourse = useAppStore((s) => s.addCourse)
  const updateCourse = useAppStore((s) => s.updateCourse)
  const deleteCourse = useAppStore((s) => s.deleteCourse)
  const addLog = useAppStore((s) => s.addLog)

  const [keyword, setKeyword] = useState('')
  const [courseStatus, setCourseStatus] = useState<CourseStatus | undefined>()
  const [form] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CourseItem | null>(null)
  const [viewing, setViewing] = useState<CourseItem | null>(null)

  const activeTeachers = useMemo(
    () => teachers.filter((t) => t.status === '已启用').map((t) => ({ label: t.name, value: t.name })),
    [teachers],
  )

  const filtered = useMemo(
    () =>
      courses.filter((c) => {
        if (courseStatus && c.status !== courseStatus) return false
        if (keyword) {
          const hay = `${c.name} ${c.id} ${c.teacher} ${c.majorName ?? ''} ${(c.classNames ?? []).join(' ')}`
          return keyword.trim().split(/\s+/).filter(Boolean).every((k) => hay.includes(k))
        }
        return true
      }),
    [courses, courseStatus, keyword],
  )

  const relationCount = courses.reduce((sum, c) => sum + (c.classNames?.length ?? c.classCount), 0)
  const openKnowledgeCount = courses.filter((c) => c.knowledgeBaseStatus === '已开放').length
  const taskTemplateCount = courses.reduce((sum, c) => sum + (c.taskCount ?? 0), 0)

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      majorName: '人工智能',
      semester: '2026-demo',
      hours: 48,
      status: '筹备中',
      model: '暂无',
      classNames: ['人工智能 1 班'],
      knowledgeBaseStatus: '未配置',
      studentPortalStatus: '未开放',
      teacherWorkspaceStatus: '未绑定',
      taskCount: 0,
    })
    setModalOpen(true)
  }

  const openEdit = (course: CourseItem) => {
    setEditing(course)
    form.setFieldsValue({
      ...course,
      classNames: course.classNames ?? [],
      knowledgePoints: course.knowledgePoints ?? knowledgeByCourse[course.name] ?? [],
    })
    setModalOpen(true)
  }

  const handleSubmit = () => {
    form.validateFields().then((v) => {
      const classNames = v.classNames ?? []
      const patch: Partial<CourseItem> = {
        name: v.name,
        teacher: v.teacher,
        majorName: v.majorName,
        semester: v.semester,
        hours: v.hours,
        model: v.model,
        status: v.status,
        classNames,
        classCount: classNames.length,
        knowledgePoints: v.knowledgePoints ?? [],
        taskCount: v.taskCount ?? 0,
        knowledgeBaseStatus: v.knowledgeBaseStatus,
        studentPortalStatus: v.studentPortalStatus,
        teacherWorkspaceStatus: v.teacherWorkspaceStatus,
      }

      if (editing) {
        updateCourse(editing.id, patch)
        message.success('班级课程配置已更新')
        addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '编辑', resourceType: '班级课程', resourceId: editing.id, desc: `更新 ${editing.name} 的班课对接配置`, before: '', after: '', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: false })
      } else {
        const course: CourseItem = {
          id: `course_admin_${Date.now().toString().slice(-6)}`,
          name: patch.name ?? '',
          teacher: patch.teacher ?? '',
          majorName: patch.majorName,
          semester: patch.semester ?? '2026-demo',
          hours: patch.hours ?? 0,
          model: patch.model ?? '暂无',
          status: patch.status ?? '筹备中',
          classNames: patch.classNames,
          classCount: patch.classCount ?? 0,
          knowledgePoints: patch.knowledgePoints,
          taskCount: patch.taskCount,
          knowledgeBaseStatus: patch.knowledgeBaseStatus,
          studentPortalStatus: patch.studentPortalStatus,
          teacherWorkspaceStatus: patch.teacherWorkspaceStatus,
          studentCount: 0,
          students: [],
          enrollmentChanges: [{ time: new Date().toLocaleString('zh-CN', { hour12: false }), studentId: '', name: '课程创建', action: '加入', operator: '超级管理员' }],
        }
        addCourse(course)
        message.success('班级课程已创建，请继续在教师端完成任务发布')
        addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '创建', resourceType: '班级课程', resourceId: course.id, desc: `创建 ${course.name} 班级课程配置`, before: '', after: '筹备中', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: false })
      }
      setModalOpen(false)
    })
  }

  const handleDelete = (course: CourseItem) => {
    Modal.confirm({
      title: '确认移除课程配置',
      content: `确定要移除「${course.name}」吗？若教师端或学生端仍在使用，建议先改为「已归档」。`,
      okText: '确认移除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        deleteCourse(course.id)
        message.success('课程配置已移除')
      },
    })
  }

  return (
    <div className="admin-page-fill">
      <PageHeader
        title="班级课程与教学安排"
        extra={<span style={{ fontSize: 13, color: colors.textMuted }}>对齐教师端课程工作区、学生端班级课程入口和 AI 知识引用范围</span>}
      />

      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { icon: <School size={20} />, label: '首版课程', value: courses.length, sub: '机器学习 / Python / 数据结构', color: colors.primary },
          { icon: <Link2 size={20} />, label: '班级课程关系', value: relationCount, sub: '行政班 + 课程 + 教师', color: colors.info },
          { icon: <DatabaseZap size={20} />, label: '知识库已开放', value: `${openKnowledgeCount}/${courses.length}`, sub: '供学生端 AI 引用', color: colors.success },
          { icon: <BookOpen size={20} />, label: '任务模板', value: taskTemplateCount, sub: '供教师端下发', color: colors.purple },
        ].map((item) => (
          <Col xs={24} md={6} key={item.label}>
            <div style={{ minHeight: 96, padding: 16, borderRadius: 8, border: '1px solid var(--n-3)', background: 'var(--n-0)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: `${item.color}14`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {item.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--n-6)' }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--n-8)', lineHeight: 1.2 }}>{item.value}</div>
                <div style={{ fontSize: 12, color: 'var(--n-7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sub}</div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <Space wrap>
          <Input.Search placeholder="搜索课程 / 教师 / 行政班 / ID" allowClear style={{ width: 280 }} onChange={(e) => setKeyword(e.target.value)} />
          <Select placeholder="课程状态" allowClear style={{ width: 128 }} options={statusOptions.map((s) => ({ label: s, value: s }))} onChange={setCourseStatus} />
        </Space>
        <Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>新建班级课程</Button>
      </div>

      <Row gutter={[16, 16]} style={{ flex: 1, alignContent: 'stretch' }}>
        {filtered.map((c) => {
          const meta = statusMeta[c.status]
          return (
            <Col xs={24} lg={12} xl={8} key={c.id} style={{ display: 'flex' }}>
              <div style={{ borderRadius: 8, background: 'var(--n-0)', border: '1px solid var(--n-3)', padding: 18, minHeight: 0, width: '100%', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--n-8)' }}>{c.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: meta.bg, color: meta.color }}>{c.status}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--n-6)', fontFamily: 'monospace' }}>
                      <Hash size={13} />{c.id}
                    </div>
                  </div>
                  <Tag color={portalStatusColor(c.studentPortalStatus)} style={{ margin: 0 }}>{c.studentPortalStatus ?? '未开放'}</Tag>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--n-6)' }}>负责教师</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.teacher || '未绑定'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--n-6)' }}>行政班</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{(c.classNames ?? []).join('、') || '未配置'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--n-6)' }}>任务模板</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.taskCount ?? 0} 个</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--n-6)' }}>学生规模</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.studentCount} 人</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Tag color={knowledgeStatusColor(c.knowledgeBaseStatus)} style={{ margin: 0 }}>
                    <DatabaseZap size={12} style={{ marginRight: 4 }} />知识库：{c.knowledgeBaseStatus ?? '未配置'}
                  </Tag>
                  <Tag color={c.teacherWorkspaceStatus === '已绑定' ? 'processing' : 'default'} style={{ margin: 0 }}>
                    教师端：{c.teacherWorkspaceStatus ?? '未绑定'}
                  </Tag>
                  <Tag color={c.model === '暂无' ? 'default' : 'blue'} style={{ margin: 0 }}>
                    <Cpu size={12} style={{ marginRight: 4 }} />{c.model}
                  </Tag>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 28 }}>
                  {(c.knowledgePoints ?? []).slice(0, 5).map((point) => (
                    <Tag key={point} style={{ margin: 0 }}>{point}</Tag>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--n-2)', paddingTop: 12, marginTop: 'auto' }}>
                  <Button type="primary" icon={<Eye size={14} />} onClick={() => setViewing(c)} style={{ flex: 1 }}>查看对接</Button>
                  <Tooltip title="编辑配置">
                    <Button icon={<Edit3 size={15} />} onClick={() => openEdit(c)} />
                  </Tooltip>
                  <Tooltip title="移除配置">
                    <Button danger icon={<Trash2 size={15} />} onClick={() => handleDelete(c)} />
                  </Tooltip>
                </div>
              </div>
            </Col>
          )
        })}
      </Row>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--n-5)' }}>
          <BookOpen size={44} style={{ marginBottom: 14, opacity: 0.25 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>暂无匹配课程</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>调整筛选条件或新建班级课程配置</div>
        </div>
      )}

      <Modal title={editing ? '编辑班级课程' : '新建班级课程'} open={modalOpen} onOk={handleSubmit} onCancel={() => setModalOpen(false)} destroyOnClose width={680}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="课程名称" rules={[{ required: true, message: '请输入课程名称' }]}>
                <Select
                  showSearch
                  placeholder="选择首版课程"
                  options={Object.keys(knowledgeByCourse).map((name) => ({ label: name, value: name }))}
                  onChange={(name) => form.setFieldValue('knowledgePoints', knowledgeByCourse[name] ?? [])}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="majorName" label="专业方向" rules={[{ required: true }]}>
                <Select options={majorOptions.map((m) => ({ label: m, value: m }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="teacher" label="负责教师" rules={[{ required: true, message: '请选择负责教师' }]}>
                <Select showSearch options={activeTeachers} placeholder="选择教师端账号" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="classNames" label="授课行政班" rules={[{ required: true, message: '请选择行政班' }]}>
                <Select mode="multiple" options={classOptions.map((name) => ({ label: name, value: name }))} placeholder="选择行政班" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="semester" label="演示学期" rules={[{ required: true }]}>
                <Input placeholder="如 2026-demo" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="hours" label="课时" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="taskCount" label="任务模板数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="knowledgePoints" label="课程知识点">
                <Select mode="tags" placeholder="输入或选择知识点" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="model" label="接入模型" rules={[{ required: true }]}>
                <Select options={aiModels.map((m) => ({ label: m, value: m }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="status" label="课程状态" rules={[{ required: true }]}>
                <Select options={statusOptions.map((s) => ({ label: s, value: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="teacherWorkspaceStatus" label="教师端工作区">
                <Select options={['未绑定', '已绑定'].map((s) => ({ label: s, value: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="studentPortalStatus" label="学生端入口">
                <Select options={['未开放', '已开放'].map((s) => ({ label: s, value: s }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="knowledgeBaseStatus" label="课程知识库">
                <Select options={['未配置', '待发布', '已开放'].map((s) => ({ label: s, value: s }))} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={
          <span style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={18} style={{ color: colors.primary }} />
            班级课程对接 · {viewing?.name}
          </span>
        }
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={null}
        width={760}
        destroyOnClose
      >
        {viewing && (
          <div>
            <Descriptions column={2} bordered size="middle" labelStyle={{ fontWeight: 600, width: 120 }}>
              <Descriptions.Item label="课程名称"><b>{viewing.name}</b></Descriptions.Item>
              <Descriptions.Item label="课程编号">{viewing.id}</Descriptions.Item>
              <Descriptions.Item label="专业方向">{viewing.majorName ?? '人工智能'}</Descriptions.Item>
              <Descriptions.Item label="负责教师">{viewing.teacher || '未绑定'}</Descriptions.Item>
              <Descriptions.Item label="行政班" span={2}>{(viewing.classNames ?? []).join('、') || '未配置'}</Descriptions.Item>
              <Descriptions.Item label="学生端入口"><Tag color={portalStatusColor(viewing.studentPortalStatus)}>{viewing.studentPortalStatus ?? '未开放'}</Tag></Descriptions.Item>
              <Descriptions.Item label="教师端工作区"><Tag color={viewing.teacherWorkspaceStatus === '已绑定' ? 'processing' : 'default'}>{viewing.teacherWorkspaceStatus ?? '未绑定'}</Tag></Descriptions.Item>
              <Descriptions.Item label="课程知识库"><Tag color={knowledgeStatusColor(viewing.knowledgeBaseStatus)}>{viewing.knowledgeBaseStatus ?? '未配置'}</Tag></Descriptions.Item>
              <Descriptions.Item label="任务模板">{viewing.taskCount ?? 0} 个</Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--n-3)', borderRadius: 8, background: 'var(--n-1)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--n-8)', marginBottom: 10 }}>端侧对齐检查</div>
              {[
                { label: '教师端可进入课程工作区并下发任务', done: viewing.teacherWorkspaceStatus === '已绑定' && !!viewing.teacher },
                { label: '学生端按行政班课程显示入口和任务', done: viewing.studentPortalStatus === '已开放' && !!viewing.classNames?.length },
                { label: 'AI 诊断与问答可引用课程知识库', done: viewing.knowledgeBaseStatus === '已开放' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28, color: item.done ? 'var(--n-8)' : 'var(--n-7)' }}>
                  <CheckCircle2 size={15} style={{ color: item.done ? 'var(--c-success)' : 'var(--n-5)' }} />
                  <span style={{ fontSize: 13 }}>{item.label}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--n-8)', marginBottom: 8 }}>知识点范围</div>
              <Space size={[6, 6]} wrap>
                {(viewing.knowledgePoints ?? []).map((point) => <Tag key={point}>{point}</Tag>)}
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
