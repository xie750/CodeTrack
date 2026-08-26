import { useEffect, useState } from 'react'
import { Modal, Input, Form, Alert, message } from 'antd'
import { ShieldCheck } from 'lucide-react'
import { colors } from '@admin/theme/themeConfig'

interface VerifyModalProps {
  open: boolean
  onCancel: () => void
  actionLabel: string
  onConfirm: () => void
}

// 敏感操作二次验证：删除 / 导出 / 权限变更等高风险操作前置验证
export default function VerifyModal({ open, onCancel, actionLabel, onConfirm }: VerifyModalProps) {
  const [method, setMethod] = useState<'password' | 'email'>('password')
  const [form] = Form.useForm()
  const [msg, setMsg] = useState<{ type: 'success' | 'info'; text: string } | null>(null)

  useEffect(() => {
    if (open) {
      form.resetFields()
      setMsg(null)
    }
  }, [open, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      // 原型：固定验证码 / 密码演示
      if (method === 'password' && values.password === 'admin123') {
        setMsg({ type: 'success', text: '身份验证通过，操作已放行。' })
        message.success('验证通过')
        onConfirm()
        onCancel()
      } else if (method === 'email' && values.code === '246810') {
        setMsg({ type: 'success', text: '邮箱验证通过，操作已放行。' })
        message.success('验证通过')
        onConfirm()
        onCancel()
      } else {
        message.error(method === 'password' ? '密码错误（演示密码 admin123）' : '验证码错误（演示验证码 246810）')
      }
    } catch {
      /* 校验未通过 */
    }
  }

  return (
    <Modal
      title={
        <span className="flex gap8">
          <ShieldCheck size={17} style={{ color: colors.warning }} />
          敏感操作二次验证 · {actionLabel}
        </span>
      }
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="确认执行"
      cancelText="取消"
    >
      <Alert
        type="warning"
        showIcon
        message="此操作属于高风险操作"
        description="删除、导出、权限变更等敏感操作已启用二次验证，操作将记录到操作日志。"
        style={{ marginBottom: 16 }}
      />
      <div className="flex gap8" style={{ marginBottom: 16 }}>
        <span
          onClick={() => setMethod('password')}
          style={{ cursor: 'pointer', color: method === 'password' ? colors.primary : colors.textMuted, fontWeight: method === 'password' ? 600 : 400 }}
        >
          密码验证
        </span>
        <span style={{ color: colors.border }}>|</span>
        <span
          onClick={() => setMethod('email')}
          style={{ cursor: 'pointer', color: method === 'email' ? colors.primary : colors.textMuted, fontWeight: method === 'email' ? 600 : 400 }}
        >
          邮箱验证码
        </span>
      </div>
      <Form form={form} layout="vertical">
        {method === 'password' ? (
          <Form.Item name="password" label="登录密码" rules={[{ required: true, message: '请输入登录密码' }]}>
            <Input.Password placeholder="请输入当前账号密码（演示：admin123）" />
          </Form.Item>
        ) : (
          <Form.Item name="code" label="邮箱验证码" rules={[{ required: true, message: '请输入验证码' }]}>
            <Input placeholder="演示验证码：246810" />
          </Form.Item>
        )}
      </Form>
      {msg && <Alert type={msg.type} showIcon message={msg.text} />}
    </Modal>
  )
}
