import { useState } from 'react'
import { Card, Form, Input, Button, Checkbox, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { Sparkles } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'
import brandLogo from '../../../assets/ui-home/logo-img.png'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAppStore((s) => s.login)
  const [loading, setLoading] = useState(false)

  const onFinish = (values: { username: string; password: string }) => {
    setLoading(true)
    setTimeout(() => {
      login(values.username)
      message.success('登录成功，欢迎回来！')
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin/dashboard'
      navigate(from, { replace: true })
    }, 500)
  }

  return (
    <div
      style={{
        height: 'var(--app-viewport-height, 100vh)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 55%, #3B82F6 130%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 装饰光斑 */}
      <div style={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.35), transparent 70%)', top: -80, right: -80 }} />
      <div style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.3), transparent 70%)', bottom: -60, left: -60 }} />

      <Card
        style={{ width: 400, borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
        styles={{ body: { padding: '36px 32px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img src={brandLogo} alt="CodeTrack" style={{ width: 56, height: 50, objectFit: 'contain' }} />
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>CodeTrack</h1>
          <div className="ai-badge" style={{ marginTop: 6 }}>
            <Sparkles size={12} /> 教学研管平台 · 管理员端
          </div>
        </div>

        <Form onFinish={onFinish} initialValues={{ username: 'admin', password: 'admin123', remember: true }}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined style={{ color: colors.textMuted }} />} placeholder="工号 / 学号 / 管理员账号" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: colors.textMuted }} />} placeholder="密码" size="large" />
          </Form.Item>
          <Form.Item>
            <div className="flex-between">
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>记住我</Checkbox>
              </Form.Item>
              <a style={{ color: colors.primary }}>忘记密码？</a>
            </div>
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ height: 44 }}>
            登录管理员端
          </Button>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: colors.textMuted }}>
          演示账号：admin / admin123 · 登录即代表同意平台使用规范
        </div>
      </Card>
    </div>
  )
}
