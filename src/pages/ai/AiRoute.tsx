import { useState } from 'react'
import { Button, Tag, Modal, Form, Input, message, Row, Col, Tooltip, Drawer, Select } from 'antd'
import { Settings, Server, Plus, ArrowLeft, X, Edit3, Copy, Activity, Trash2, Cpu, Hash } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { useAppStore } from '@/stores/useAppStore'
import { colors } from '@/theme/themeConfig'
import type { ConnectedModel } from '@/types'

const cardGradients = [
  'linear-gradient(135deg, #dceefb 0%, #ffffff 50%, #e8f4fd 100%)',
  'linear-gradient(135deg, #e0e7ff 0%, #ffffff 50%, #eef2ff 100%)',
  'linear-gradient(135deg, #dbeafe 0%, #ffffff 50%, #e0f2fe 100%)',
  'linear-gradient(135deg, #e6edfe 0%, #ffffff 50%, #f0f5ff 100%)',
]

export default function AiRoute() {
  const subjectRoutes = useAppStore((s) => s.subjectRoutes)
  const updateSubjectRoute = useAppStore((s) => s.updateSubjectRoute)
  const connectedModels = useAppStore((s) => s.connectedModels)
  const addConnectedModel = useAppStore((s) => s.addConnectedModel)
  const updateConnectedModel = useAppStore((s) => s.updateConnectedModel)
  const removeConnectedModel = useAppStore((s) => s.removeConnectedModel)
  const toggleModelEnable = useAppStore((s) => s.toggleModelEnable)
  const copyConnectedModel = useAppStore((s) => s.copyConnectedModel)
  const testConnectivity = useAppStore((s) => s.testConnectivity)
  const courses = useAppStore((s) => s.courses)

  const route = subjectRoutes[0]

  // 接入模型弹窗状态
  const [connectOpen, setConnectOpen] = useState(false)
  const [connectView, setConnectView] = useState<'add' | 'edit'>('add')
  const [editingModel, setEditingModel] = useState<ConnectedModel | null>(null)
  const [addForm] = Form.useForm()

  // 学科垂类大模型详情抽屉
  const [subjectDetailOpen, setSubjectDetailOpen] = useState(false)
  const [subjectForm] = Form.useForm()

  // 搜索关键词
  const [keyword, setKeyword] = useState('')

  // 当前学科路由对应的课程垂类大模型列表
  const courseModels = connectedModels.filter(
    (m) => m.subjectRouteId === route?.id && m.modelType === 'primary',
  )

  // 搜索过滤
  const filteredModels = keyword
    ? courseModels.filter((m) =>
        `${m.nickname} ${m.modelName} ${m.version} ${m.notes}`
          .toLowerCase()
          .includes(keyword.toLowerCase()),
      )
    : courseModels

  // --- 接入模型：添加 ---
  const handleAddModel = () => {
    addForm.validateFields().then((v) => {
      addConnectedModel({
        subjectRouteId: route.id,
        modelType: 'primary',
        nickname: v.nickname,
        modelName: v.modelName,
        version: v.version || '',
        releaseDate: v.releaseDate || '',
        notes: v.notes || '',
        url: v.url,
        apiKey: v.apiKey,
        enabled: false,
      })
      message.success('课程垂类模型已接入')
      addForm.resetFields()
      setConnectOpen(false)
    })
  }

  // --- 接入模型：编辑 ---
  const handleEditModel = () => {
    addForm.validateFields().then((v) => {
      if (!editingModel) return
      updateConnectedModel(editingModel.id, {
        nickname: v.nickname,
        modelName: v.modelName,
        version: v.version || '',
        releaseDate: v.releaseDate || '',
        notes: v.notes || '',
        url: v.url,
        apiKey: v.apiKey,
      })
      message.success('模型已更新')
      addForm.resetFields()
      setEditingModel(null)
      setConnectOpen(false)
    })
  }

  // --- 接入模型：删除 ---
  const handleDeleteModel = (model: ConnectedModel) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要移除模型「${model.nickname || model.modelName}」吗？此操作不可恢复。`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        removeConnectedModel(model.id)
        message.success('模型已移除')
      },
    })
  }

  // --- 接入模型：复制 ---
  const handleCopyModel = (model: ConnectedModel) => {
    copyConnectedModel(model.id)
    message.success('模型已复制')
  }

  // --- 打开添加模型弹窗 ---
  const openAddModal = () => {
    addForm.resetFields()
    setEditingModel(null)
    setConnectView('add')
    setConnectOpen(true)
  }

  // --- 打开编辑模型弹窗 ---
  const openEditModal = (model: ConnectedModel) => {
    setEditingModel(model)
    addForm.setFieldsValue({
      nickname: model.nickname,
      modelName: model.modelName,
      version: model.version,
      releaseDate: model.releaseDate,
      notes: model.notes,
      url: model.url,
      apiKey: model.apiKey,
    })
    setConnectView('edit')
    setConnectOpen(true)
  }

  if (!route) return null

  return (
    <div>
      <PageHeader title="模型管理" />

      {/* 操作栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginBottom: 20,
          marginTop: -8,
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Input.Search
            placeholder="搜索模型名称 / 昵称"
            allowClear
            style={{ width: 260 }}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button type="primary" icon={<Plus size={15} />} onClick={openAddModal}>
            接入模型
          </Button>
        </div>
      </div>

      {/* 课程垂类大模型卡片网格 */}
      <Row gutter={[16, 16]}>
        {filteredModels.map((model, idx) => {
          const gradient = cardGradients[idx % cardGradients.length]
          return (
            <Col xs={24} sm={12} lg={8} xl={6} key={model.id}>
              <div
                style={{
                  borderRadius: 12,
                  background: gradient,
                  border: '1px solid rgba(59,130,246,.15)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'box-shadow .2s, transform .2s',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow =
                    '0 6px 24px rgba(59,130,246,.12)'
                  ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                  ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                }}
              >
                <div
                  style={{
                    padding: '22px 22px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                  }}
                >
                  {/* 状态标签 + 版本号 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 14,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 10,
                        background: model.enabled ? '#ecfdf5' : '#f3f4f6',
                        color: model.enabled ? '#10b981' : '#6b7280',
                        letterSpacing: 0.5,
                        boxShadow: model.enabled
                          ? '0 1px 2px rgba(16,185,129,0.12)'
                          : 'none',
                      }}
                    >
                      {model.enabled ? '已启用' : '已停用'}
                    </span>
                    {model.version && (
                      <span
                        style={{ fontSize: 11, color: 'var(--n-5)', fontWeight: 500 }}
                      >
                        {model.version}
                      </span>
                    )}
                  </div>

                  {/* 模型昵称 */}
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#1e293b',
                      marginBottom: 8,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.4,
                    }}
                  >
                    {model.nickname || model.modelName}
                  </div>

                  {/* 模型名称 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      color: '#64748b',
                      marginBottom: 14,
                      fontFamily: 'monospace',
                    }}
                  >
                    <Hash size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    {model.modelName}
                  </div>

                  {/* 模型类型标签 + 备注 */}
                  <div
                    style={{
                      marginBottom: 16,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Tag
                      color="purple"
                      style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6 }}
                    >
                      <Cpu size={11} style={{ marginRight: 4 }} />
                      课程垂类
                    </Tag>
                    {model.notes && (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{model.notes}</span>
                    )}
                  </div>

                  {/* 底部操作栏 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      borderTop: '1px solid rgba(59,130,246,.15)',
                      paddingTop: 14,
                      marginTop: 'auto',
                    }}
                  >
                    {/* 启用开关 */}
                    <Tooltip
                      title={model.enabled ? '点击停用' : '点击启用'}
                      mouseEnterDelay={0.3}
                    >
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleModelEnable(model.id)
                          message.success(
                            model.enabled
                              ? `已停用「${model.nickname || model.modelName}」`
                              : `已启用「${model.nickname || model.modelName}」`,
                          )
                        }}
                        style={{
                          width: 38,
                          height: 22,
                          borderRadius: 11,
                          background: model.enabled ? colors.success : '#D1D5DB',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 2px',
                          transition: 'background .2s',
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            transform: model.enabled
                              ? 'translateX(14px)'
                              : 'translateX(0)',
                            transition: 'transform .2s',
                          }}
                        />
                      </div>
                    </Tooltip>

                    <div style={{ flex: 1 }} />

                    <Tooltip title="编辑" mouseEnterDelay={0.3}>
                      <Button
                        type="text"
                        size="middle"
                        icon={<Edit3 size={16} />}
                        onClick={() => openEditModal(model)}
                        style={{ color: '#64748b' }}
                      />
                    </Tooltip>
                    <Tooltip title="复制" mouseEnterDelay={0.3}>
                      <Button
                        type="text"
                        size="middle"
                        icon={<Copy size={16} />}
                        onClick={() => handleCopyModel(model)}
                        style={{ color: '#64748b' }}
                      />
                    </Tooltip>
                    <Tooltip title="检测连通" mouseEnterDelay={0.3}>
                      <Button
                        type="text"
                        size="middle"
                        icon={<Activity size={16} />}
                        onClick={() => {
                          message.loading({
                            content: `检测 ${model.modelName} 连通性...`,
                            key: 'cm',
                            duration: 1.2,
                          })
                          setTimeout(() => {
                            testConnectivity(route.id)
                            message.success({
                              content: `${model.modelName} 连通正常`,
                              key: 'cm',
                            })
                          }, 1200)
                        }}
                        style={{ color: '#64748b' }}
                      />
                    </Tooltip>
                    <Tooltip title="删除" mouseEnterDelay={0.3}>
                      <Button
                        type="text"
                        size="middle"
                        danger
                        icon={<Trash2 size={16} />}
                        onClick={() => handleDeleteModel(model)}
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
      {filteredModels.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--n-5)' }}>
          <Server size={44} style={{ marginBottom: 14, opacity: 0.25 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>暂无接入模型</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            点击右上角「接入模型」开始添加
          </div>
        </div>
      )}

      {/* ==================== 接入模型弹窗（添加 / 编辑） ==================== */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="text"
              icon={<ArrowLeft size={17} />}
              onClick={() => {
                addForm.resetFields()
                setEditingModel(null)
                setConnectOpen(false)
              }}
              style={{ padding: 0, color: 'var(--n-7)' }}
            />
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {editingModel ? '编辑模型' : '添加模型'}
            </span>
          </div>
        }
        closeIcon={
          <Button
            type="text"
            icon={<X size={16} />}
            onClick={() => {
              setConnectOpen(false)
              addForm.resetFields()
              setEditingModel(null)
            }}
            style={{ color: 'var(--n-6)' }}
          />
        }
        open={connectOpen}
        maskClosable={false}
        footer={null}
        width={520}
        destroyOnClose
        styles={{
          body: { maxHeight: '60vh', overflowY: 'auto', minHeight: 200, paddingTop: 4 },
        }}
      >
        <Form form={addForm} layout="vertical">
            <Form.Item
              name="nickname"
              label="昵称（选择课程）"
              rules={[{ required: true, message: '请选择课程' }]}
            >
              <Select
                placeholder="选择已有课程"
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
                options={courses.map((c) => ({ label: c.name, value: c.name }))}
              />
            </Form.Item>
            <Form.Item
              name="modelName"
              label="接入模型名称"
              rules={[{ required: true, message: '请输入接入模型名称' }]}
            >
              <Input placeholder="例如：course-python-v2.3" />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={12}>
                <Form.Item name="version" label="版本号">
                  <Input placeholder="例如：v2.1" />
                </Form.Item>
              </Col>
              <Col xs={12}>
                <Form.Item name="releaseDate" label="发布时间">
                  <Input placeholder="例如：2026-08-01" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="notes" label="备注">
              <Input placeholder="选填，如：用于代码生成与审阅" />
            </Form.Item>
            <Form.Item
              name="url"
              label="连接地址"
              rules={[{ required: true, message: '请输入连接地址' }]}
            >
              <Input placeholder="https://api.codetrack.ai/vertical/cs-code/v2.1" />
            </Form.Item>
            <Form.Item
              name="apiKey"
              label="API Key"
              rules={[{ required: true, message: '请输入 API Key' }]}
            >
              <Input.Password placeholder="sk-xxxxxxxxxxxxxxxx" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Button
                type="primary"
                onClick={editingModel ? handleEditModel : handleAddModel}
              >
                {editingModel ? '保存修改' : '添加'}
              </Button>
            </Form.Item>
          </Form>
      </Modal>

      {/* ==================== 学科垂类大模型详情抽屉 ==================== */}
      <Drawer
        title="学科垂类大模型详情"
        open={subjectDetailOpen}
        onClose={() => setSubjectDetailOpen(false)}
        width={480}
        destroyOnClose
      >
        <Form form={subjectForm} layout="vertical">
          <Form.Item name="subject" label="所属学科">
            <Select
              options={subjectRoutes.map((s) => ({
                label: s.subject,
                value: s.subject,
              }))}
              onChange={(v) => {
                const target = subjectRoutes.find((s) => s.subject === v)
                if (target) {
                  subjectForm.setFieldsValue({
                    modelName: target.primaryModel,
                    version: target.primaryVersion,
                  })
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="modelName"
            label="模型名称"
            rules={[{ required: true, message: '请输入模型名称' }]}
          >
            <Input placeholder="学科垂类大模型名称" />
          </Form.Item>
          <Form.Item name="version" label="版本号">
            <Input placeholder="例如：v2.1" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button
              type="primary"
              onClick={() => {
                subjectForm.validateFields().then((v) => {
                  const targetRoute = subjectRoutes.find(
                    (s) => s.subject === v.subject,
                  )
                  if (targetRoute) {
                    updateSubjectRoute(targetRoute.id, {
                      primaryModel: v.modelName,
                      primaryVersion: v.version || '',
                    })
                    message.success('学科垂类大模型信息已更新')
                  }
                  setSubjectDetailOpen(false)
                })
              }}
            >
              保存修改
            </Button>
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
