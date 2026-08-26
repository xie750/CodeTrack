import { useState, useRef, useEffect } from 'react'
import {
  Modal,
  Avatar,
  Button,
  Input,
  Form,
  message,
  Divider,
  Tag,
  Radio,
  Steps,
  Result,
} from 'antd'
import {
  Shield,
  Smartphone,
  Mail,
  MessageCircle,
  Monitor,
  Tablet,
  HelpCircle,
  Camera,
  Check,
  Send,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'
import type { VerifyMethod } from '@admin/types'

type View =
  | 'main'
  | 'account'
  | 'devices'
  | 'feedback'
  | 'changePhone'
  | 'changeQQ'
  | 'changeEmail'
  | 'changePassword'

// ==================== 子组件 ====================

// 可编辑行（始终可见输入框，右侧保存/取消）
function EditRow({
  label,
  value,
  onSave,
  placeholder,
  type = 'input',
}: {
  label: string
  value: string
  onSave: (v: string) => void
  placeholder?: string
  type?: 'input' | 'textarea'
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const handleSave = () => {
    if (draft.trim() && draft !== value) {
      onSave(draft.trim())
      message.success(`${label}已更新`)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: type === 'textarea' ? 'flex-start' : 'center' }}>
        {type === 'textarea' ? (
          <Input.TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            rows={6}
            style={{ flex: 1, resize: 'none' }}
          />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            style={{ flex: 1 }}
            onPressEnter={handleSave}
          />
        )}
        <Button size="small" type="primary" onClick={handleSave} icon={<Check size={14} />}>
          保存
        </Button>
        <Button size="small" onClick={() => setDraft(value)}>
          取消
        </Button>
      </div>
    </div>
  )
}

// 绑定条目行（账号与安全页内）
// 已绑定：显示值 + ChevronDown 展开露出「更换」按钮
// 未绑定：右侧显示红色「未绑定」标签
function BindRow({
  icon,
  label,
  value,
  onChangeClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onChangeClick: () => void
}) {
  const isBound = value !== '未绑定' && value !== ''
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ borderBottom: '1px solid #f0f0f0' }}>
      <div
        onClick={() => isBound ? setExpanded(!expanded) : onChangeClick()}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 0',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: colors.primary, marginRight: 12, display: 'flex' }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: colors.textPrimary }}>{label}</div>
          <div style={{ fontSize: 13, color: isBound ? colors.textMuted : colors.danger, marginTop: 2 }}>
            {isBound ? value : '未绑定'}
          </div>
        </div>
        {isBound ? (
          <ChevronDown
            size={16}
            style={{
              color: colors.textMuted,
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        ) : (
          <span style={{ fontSize: 13, color: colors.danger, fontWeight: 500 }}>未绑定</span>
        )}
      </div>
      {isBound && expanded && (
        <div style={{ padding: '0 0 12px 30px' }}>
          <Button size="small" onClick={(e) => { e.stopPropagation(); onChangeClick() }} style={{ borderRadius: 8 }}>
            更换
          </Button>
        </div>
      )}
    </div>
  )
}

// ==================== 验证码发送 Hook ====================
function useCountdown(initial = 0) {
  const [countdown, setCountdown] = useState(initial)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = (seconds = 60) => {
    setCountdown(seconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return { countdown, startCountdown }
}

// ==================== 更换手机号流程 ====================
function ChangePhoneFlow({ onBack }: { onBack: () => void }) {
  const profile = useAppStore((s) => s.profile)
  const bindPhone = useAppStore((s) => s.bindPhone)
  const [step, setStep] = useState(0)
  const [verifyMethod, setVerifyMethod] = useState<VerifyMethod>('sms')
  const [code, setCode] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newCode, setNewCode] = useState('')
  const { countdown: cd1, startCountdown: send1 } = useCountdown()
  const { countdown: cd2, startCountdown: send2 } = useCountdown()

  const handleComplete = () => {
    // 脱敏展示新手机号
    const masked = newPhone.slice(0, 3) + '****' + newPhone.slice(-4)
    bindPhone(masked)
    message.success('手机号更换成功')
    onBack()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, position: 'sticky', top: 0, background: '#fff', zIndex: 10, paddingTop: 4, paddingBottom: 8 }}>
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={step === 0 ? onBack : () => setStep(step - 1)}
        />
        <span style={{ fontSize: 16, fontWeight: 600 }}>更换手机号</span>
      </div>

      <Steps
        current={step}
        size="small"
        style={{ marginBottom: 32 }}
        items={[
          { title: '验证身份' },
          { title: '绑定新号' },
          { title: '完成' },
        ]}
      />

      {/* Step 0: 验证身份 */}
      {step === 0 && (
        <div>
          <div style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>
            为确保账号安全，请先验证您的身份。当前绑定手机号：
            <span style={{ fontWeight: 600, color: colors.textPrimary }}>{profile.phone}</span>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>选择验证方式</div>
            <Radio.Group
              value={verifyMethod}
              onChange={(e) => setVerifyMethod(e.target.value)}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <Radio value="sms">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Smartphone size={16} />
                  向原手机号 {profile.phone} 发送验证码
                </span>
              </Radio>
              {profile.qq !== '未绑定' && (
                <Radio value="qq">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MessageCircle size={16} />
                    通过QQ {profile.qq} 验证
                  </span>
                </Radio>
              )}
              {profile.email !== '未绑定' && (
                <Radio value="email">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mail size={16} />
                    通过邮箱 {profile.email} 验证
                  </span>
                </Radio>
              )}
            </Radio.Group>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="请输入验证码"
              style={{ flex: 1 }}
              maxLength={6}
            />
            <Button
              disabled={cd1 > 0}
              onClick={() => {
                send1()
                message.success(
                  `验证码已发送至${verifyMethod === 'sms' ? '原手机号' : verifyMethod === 'qq' ? 'QQ' : '邮箱'}（原型演示：123456）`
                )
              }}
            >
              {cd1 > 0 ? `${cd1}s 后重发` : '发送验证码'}
            </Button>
          </div>

          <Button
            type="primary"
            block
            style={{ marginTop: 32, borderRadius: 8, height: 42 }}
            disabled={code.length < 4}
            onClick={() => {
              if (code === '123456' || code.length === 6) {
                message.success('身份验证通过')
                setStep(1)
              } else {
                message.error('验证码错误（原型演示请输入 123456）')
              }
            }}
          >
            验证
          </Button>
        </div>
      )}

      {/* Step 1: 绑定新手机号 */}
      {step === 1 && (
        <div>
          <div style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>
            身份验证通过，请输入您要绑定的新手机号。
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>新手机号</div>
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="请输入新手机号"
              maxLength={11}
              size="large"
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="请输入短信验证码"
              style={{ flex: 1 }}
              maxLength={6}
            />
            <Button
              disabled={cd2 > 0 || newPhone.length < 11}
              onClick={() => {
                send2()
                message.success(`验证码已发送至 ${newPhone}（原型演示：123456）`)
              }}
            >
              {cd2 > 0 ? `${cd2}s 后重发` : '发送验证码'}
            </Button>
          </div>

          <Button
            type="primary"
            block
            style={{ marginTop: 32, borderRadius: 8, height: 42 }}
            disabled={newPhone.length < 11 || newCode.length < 4}
            onClick={() => {
              if (newCode === '123456' || newCode.length === 6) {
                handleComplete()
              } else {
                message.error('验证码错误（原型演示请输入 123456）')
              }
            }}
          >
            确认绑定
          </Button>
        </div>
      )}
    </div>
  )
}

// ==================== 更换 QQ 流程 ====================
function ChangeQQFlow({ onBack }: { onBack: () => void }) {
  const profile = useAppStore((s) => s.profile)
  const bindQQ = useAppStore((s) => s.bindQQ)
  const [step, setStep] = useState(0)
  const [verifyMethod, setVerifyMethod] = useState<VerifyMethod>('sms')
  const [code, setCode] = useState('')
  const [newQQ, setNewQQ] = useState('')
  const { countdown: cd1, startCountdown: send1 } = useCountdown()

  const handleComplete = () => {
    const masked = newQQ.slice(0, 2) + '****' + newQQ.slice(-2)
    bindQQ(masked)
    message.success('QQ号更换成功')
    onBack()
  }

  // 验证通过 → 直接到填新QQ
  const handleVerify = () => {
    if (code === '123456' || code.length === 6) {
      message.success('身份验证通过')
      setStep(1)
    } else {
      message.error('验证码错误（原型演示请输入 123456）')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, position: 'sticky', top: 0, background: '#fff', zIndex: 10, paddingTop: 4, paddingBottom: 8 }}>
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={step === 0 ? onBack : () => setStep(0)}
        />
        <span style={{ fontSize: 16, fontWeight: 600 }}>更换QQ</span>
      </div>

      {step === 0 && (
        <div>
          <div style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>
            当前绑定QQ：<span style={{ fontWeight: 600, color: colors.textPrimary }}>{profile.qq}</span>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>选择验证方式</div>
            <Radio.Group
              value={verifyMethod}
              onChange={(e) => setVerifyMethod(e.target.value)}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <Radio value="sms">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Smartphone size={16} />
                  向手机号 {profile.phone} 发送验证码
                </span>
              </Radio>
              <Radio value="email">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mail size={16} />
                  通过邮箱 {profile.email} 验证
                </span>
              </Radio>
            </Radio.Group>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="请输入验证码"
              style={{ flex: 1 }}
              maxLength={6}
            />
            <Button
              disabled={cd1 > 0}
              onClick={() => {
                send1()
                message.success('验证码已发送（原型演示：123456）')
              }}
            >
              {cd1 > 0 ? `${cd1}s 后重发` : '发送验证码'}
            </Button>
          </div>

          <Button
            type="primary"
            block
            style={{ marginTop: 32, borderRadius: 8, height: 42 }}
            disabled={code.length < 4}
            onClick={handleVerify}
          >
            验证
          </Button>
        </div>
      )}

      {step === 1 && (
        <div>
          <div style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>
            身份验证通过，请输入新的QQ号。
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>新QQ号</div>
            <Input
              value={newQQ}
              onChange={(e) => setNewQQ(e.target.value.replace(/\D/g, ''))}
              placeholder="请输入新QQ号"
              maxLength={11}
              size="large"
            />
          </div>
          <Button
            type="primary"
            block
            style={{ marginTop: 32, borderRadius: 8, height: 42 }}
            disabled={newQQ.length < 5}
            onClick={handleComplete}
          >
            确认绑定
          </Button>
        </div>
      )}
    </div>
  )
}

// ==================== 更换邮箱流程 ====================
function ChangeEmailFlow({ onBack }: { onBack: () => void }) {
  const profile = useAppStore((s) => s.profile)
  const bindEmail = useAppStore((s) => s.bindEmail)
  const [step, setStep] = useState(0)
  const [verifyMethod, setVerifyMethod] = useState<VerifyMethod>('sms')
  const [code, setCode] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newCode, setNewCode] = useState('')
  const { countdown: cd1, startCountdown: send1 } = useCountdown()
  const { countdown: cd2, startCountdown: send2 } = useCountdown()

  const handleVerify = () => {
    if (code === '123456' || code.length === 6) {
      message.success('身份验证通过')
      setStep(1)
    } else {
      message.error('验证码错误（原型演示请输入 123456）')
    }
  }

  const handleComplete = () => {
    const masked = newEmail.slice(0, 1) + '***@' + newEmail.split('@')[1]
    bindEmail(masked)
    message.success('邮箱更换成功')
    onBack()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, position: 'sticky', top: 0, background: '#fff', zIndex: 10, paddingTop: 4, paddingBottom: 8 }}>
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={step === 0 ? onBack : () => setStep(0)}
        />
        <span style={{ fontSize: 16, fontWeight: 600 }}>更换邮箱</span>
      </div>

      <Steps
        current={step}
        size="small"
        style={{ marginBottom: 32 }}
        items={[
          { title: '验证身份' },
          { title: '绑定新邮箱' },
        ]}
      />

      {step === 0 && (
        <div>
          <div style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>
            当前绑定邮箱：<span style={{ fontWeight: 600, color: colors.textPrimary }}>{profile.email}</span>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>选择验证方式</div>
            <Radio.Group
              value={verifyMethod}
              onChange={(e) => setVerifyMethod(e.target.value)}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <Radio value="sms">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Smartphone size={16} />
                  向手机号 {profile.phone} 发送验证码
                </span>
              </Radio>
              <Radio value="email">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mail size={16} />
                  向原邮箱 {profile.email} 发送验证码
                </span>
              </Radio>
            </Radio.Group>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="请输入验证码" style={{ flex: 1 }} maxLength={6} />
            <Button disabled={cd1 > 0} onClick={() => { send1(); message.success('验证码已发送（原型演示：123456）') }}>
              {cd1 > 0 ? `${cd1}s 后重发` : '发送验证码'}
            </Button>
          </div>

          <Button type="primary" block style={{ marginTop: 32, borderRadius: 8, height: 42 }} disabled={code.length < 4} onClick={handleVerify}>
            验证
          </Button>
        </div>
      )}

      {step === 1 && (
        <div>
          <div style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>
            身份验证通过，请输入您要绑定的新邮箱。
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>新邮箱地址</div>
            <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="请输入新邮箱" size="large" />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="请输入邮箱验证码" style={{ flex: 1 }} maxLength={6} />
            <Button disabled={cd2 > 0 || !newEmail.includes('@')} onClick={() => { send2(); message.success(`验证码已发送至 ${newEmail}（原型演示：123456）`) }}>
              {cd2 > 0 ? `${cd2}s 后重发` : '发送验证码'}
            </Button>
          </div>

          <Button type="primary" block style={{ marginTop: 32, borderRadius: 8, height: 42 }} disabled={!newEmail.includes('@') || newCode.length < 4}
            onClick={() => {
              if (newCode === '123456' || newCode.length === 6) { handleComplete() }
              else { message.error('验证码错误（原型演示请输入 123456）') }
            }}>
            确认绑定
          </Button>
        </div>
      )}
    </div>
  )
}

// ==================== 修改密码流程 ====================
function ChangePasswordFlow({ onBack }: { onBack: () => void }) {
  const changePassword = useAppStore((s) => s.changePassword)
  const profile = useAppStore((s) => s.profile)
  const [mode, setMode] = useState<'normal' | 'forgot'>('normal')
  const [step, setStep] = useState(0)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [verifyMethod, setVerifyMethod] = useState<VerifyMethod>('sms')
  const [code, setCode] = useState('')
  const { countdown: cd1, startCountdown: send1 } = useCountdown()

  const handleChange = () => {
    if (newPwd.length < 6) {
      message.error('密码长度不能少于6位')
      return
    }
    if (newPwd !== confirmPwd) {
      message.error('两次输入的密码不一致')
      return
    }
    changePassword(oldPwd, newPwd)
    message.success('密码修改成功，下次登录请使用新密码')
    onBack()
  }

  const handleForgotVerify = () => {
    if (code === '123456' || code.length === 6) {
      message.success('身份验证通过')
      setStep(1)
    } else {
      message.error('验证码错误（原型演示请输入 123456）')
    }
  }

  // 忘记密码模式的 Step 1：设置新密码
  const handleForgotComplete = () => {
    if (newPwd.length < 6) {
      message.error('密码长度不能少于6位')
      return
    }
    if (newPwd !== confirmPwd) {
      message.error('两次输入的密码不一致')
      return
    }
    changePassword('', newPwd)
    message.success('密码重置成功，下次登录请使用新密码')
    onBack()
  }

  if (mode === 'forgot') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, position: 'sticky', top: 0, background: '#fff', zIndex: 10, paddingTop: 4, paddingBottom: 8 }}>
          <Button type="text" icon={<ArrowLeft size={16} />}
            onClick={step === 0 ? () => setMode('normal') : () => setStep(0)} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>找回密码</span>
        </div>

        <Steps current={step} size="small" style={{ marginBottom: 32 }}
          items={[{ title: '验证身份' }, { title: '设置新密码' }]} />

        {step === 0 && (
          <div>
            <div style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>
              请选择验证方式找回您的密码。
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>选择验证方式</div>
              <Radio.Group value={verifyMethod} onChange={(e) => setVerifyMethod(e.target.value)}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Radio value="sms">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Smartphone size={16} />向手机号 {profile.phone} 发送验证码
                  </span>
                </Radio>
                <Radio value="email">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mail size={16} />向邮箱 {profile.email} 发送验证码
                  </span>
                </Radio>
              </Radio.Group>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="请输入验证码" style={{ flex: 1 }} maxLength={6} />
              <Button disabled={cd1 > 0} onClick={() => { send1(); message.success('验证码已发送（原型演示：123456）') }}>
                {cd1 > 0 ? `${cd1}s 后重发` : '发送验证码'}
              </Button>
            </div>
            <Button type="primary" block style={{ marginTop: 32, borderRadius: 8, height: 42 }} disabled={code.length < 4} onClick={handleForgotVerify}>
              验证
            </Button>
          </div>
        )}

        {step === 1 && (
          <div>
            <div style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>身份验证通过，请设置您的新密码。</div>
            <Form layout="vertical">
              <Form.Item label="新密码">
                <Input.Password value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="请输入新密码（至少6位）" size="large" />
              </Form.Item>
              <Form.Item label="确认新密码">
                <Input.Password value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="请再次输入新密码" size="large" />
              </Form.Item>
            </Form>
            <Button type="primary" block style={{ marginTop: 16, borderRadius: 8, height: 42 }} disabled={newPwd.length < 6 || confirmPwd.length < 6}
              onClick={handleForgotComplete}>
              重置密码
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, position: 'sticky', top: 0, background: '#fff', zIndex: 10, paddingTop: 4, paddingBottom: 8 }}>
        <Button type="text" icon={<ArrowLeft size={16} />} onClick={onBack} />
        <span style={{ fontSize: 16, fontWeight: 600 }}>修改密码</span>
      </div>

      <div style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 24 }}>
        请输入您的当前密码以验证身份。
      </div>

      <Form layout="vertical">
        <Form.Item label="当前密码">
          <Input.Password value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} placeholder="请输入当前密码" size="large" />
        </Form.Item>
        <Form.Item label="新密码">
          <Input.Password value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="请输入新密码（至少6位）" size="large" />
        </Form.Item>
        <Form.Item label="确认新密码">
          <Input.Password value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="请再次输入新密码" size="large" />
        </Form.Item>
      </Form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button type="link" style={{ padding: 0, color: colors.primary }} onClick={() => { setMode('forgot'); setStep(0); setCode(''); setOldPwd('') }}>
          忘记原密码？
        </Button>
      </div>

      <Button type="primary" block style={{ marginTop: 24, borderRadius: 8, height: 42 }}
        disabled={oldPwd.length < 1 || newPwd.length < 6 || confirmPwd.length < 6}
        onClick={handleChange}>
        确认修改
      </Button>
    </div>
  )
}

// ==================== 账号与安全子页面 ====================
function AccountSecurityView({ onChangeView }: { onBack: () => void; onChangeView: (v: View) => void }) {
  const profile = useAppStore((s) => s.profile)

  return (
    <div>
      <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
        管理您绑定的手机号、QQ、邮箱以及登录密码
      </div>

      <BindRow icon={<Smartphone size={18} />} label="绑定手机号" value={profile.phone} onChangeClick={() => onChangeView('changePhone')} />
      <BindRow icon={<MessageCircle size={18} />} label="绑定QQ" value={profile.qq} onChangeClick={() => onChangeView('changeQQ')} />
      <BindRow icon={<Mail size={18} />} label="绑定邮箱" value={profile.email} onChangeClick={() => onChangeView('changeEmail')} />

      <div style={{ marginTop: 8 }}>
        <div
          onClick={() => onChangeView('changePassword')}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 0',
            borderBottom: '1px solid #f0f0f0',
            cursor: 'pointer',
          }}
        >
          <span style={{ color: colors.primary, marginRight: 12, display: 'flex' }}>
            <Shield size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: colors.textPrimary }}>修改密码</div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>定期更换密码保护账号安全</div>
          </div>
          <ChevronRight size={16} style={{ color: colors.textMuted }} />
        </div>
      </div>
    </div>
  )
}

// ==================== 登录设备管理 ====================
function DevicesView() {
  const devices = useAppStore((s) => s.devices)

  const deviceIconMap: Record<string, React.ReactNode> = {
    pc: <Monitor size={20} />,
    mobile: <Smartphone size={20} />,
    tablet: <Tablet size={20} />,
  }

  return (
    <div>

      <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
        查看您最近登录过的设备，如发现异常登录请及时修改密码
      </div>

      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
      {devices.map((device) => (
        <div
          key={device.id}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            padding: '16px 0',
            borderBottom: '1px solid #f0f0f0',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: device.isCurrent ? colors.primaryBg : '#f5f5f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: device.isCurrent ? colors.primary : colors.textSecondary,
              flexShrink: 0,
            }}
          >
            {deviceIconMap[device.deviceIcon]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: colors.textPrimary }}>
                {device.deviceName}
              </span>
              {device.isCurrent && (
                <Tag color="success" style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>
                  当前设备
                </Tag>
              )}
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
              {device.location} · IP: {device.ip}
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
              登录时间：{device.loginTime}
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}

// ==================== 帮助与反馈 ====================
function FeedbackView() {
  const [form] = Form.useForm()
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    form.validateFields().then(() => {
      setSubmitted(true)
    })
  }

  if (submitted) {
    return (
      <Result
        status="success"
        title="反馈提交成功"
        subTitle="感谢您的反馈，我们会尽快处理。"
        extra={[
          <Button key="new" type="primary" onClick={() => { setSubmitted(false); form.resetFields() }}>
            继续反馈
          </Button>,
        ]}
      />
    )
  }

  return (
    <div>

      {/* 常见问题 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, marginBottom: 12 }}>
          常见问题
        </div>
        {[
          '如何修改绑定的手机号？',
          '忘记密码了怎么找回？',
          '如何查看登录设备历史？',
          '账号被盗了怎么办？',
        ].map((q) => (
          <div
            key={q}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              marginBottom: 6,
              background: '#fafafa',
              cursor: 'pointer',
              fontSize: 13,
              color: colors.textSecondary,
              transition: 'background 0.2s',
            }}
          >
            <HelpCircle size={14} style={{ marginRight: 8, verticalAlign: -2, color: colors.primary }} />
            {q}
          </div>
        ))}
      </div>

      <Divider />

      {/* 反馈表单 */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, marginBottom: 16 }}>
          意见反馈
        </div>
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="问题类型" rules={[{ required: true, message: '请选择问题类型' }]}>
            <Radio.Group>
              <Radio value="bug">功能异常</Radio>
              <Radio value="suggest">功能建议</Radio>
              <Radio value="other">其他问题</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="desc" label="问题描述" rules={[{ required: true, message: '请描述您的问题' }]}>
            <Input.TextArea placeholder="请详细描述您遇到的问题或建议..." rows={4} />
          </Form.Item>
          <Button type="primary" block style={{ borderRadius: 8, height: 42 }} onClick={handleSubmit}>
            提交反馈
          </Button>
        </Form>
      </div>
    </div>
  )
}

// ==================== 主个人中心 Modal ====================
export default function PersonalCenter({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const profile = useAppStore((s) => s.profile)
  const currentUser = useAppStore((s) => s.currentUser)
  const updateProfile = useAppStore((s) => s.updateProfile)
  const [view, setView] = useState<View>('main')
  const [mainTab, setMainTab] = useState<'profile' | 'account' | 'devices' | 'feedback'>('profile')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 重置视图
  useEffect(() => {
    if (open) { setView('main'); setMainTab('profile') }
  }, [open])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      updateProfile({ avatar: reader.result as string })
      message.success('头像已更新')
    }
    reader.readAsDataURL(file)
  }

  const titleMap: Record<View, string> = {
    main: '个人中心',
    account: '账号与安全',
    devices: '登录设备管理',
    feedback: '帮助与反馈',
    changePhone: '更换手机号',
    changeQQ: '更换QQ',
    changeEmail: '更换邮箱',
    changePassword: '修改密码',
  }

  const isSubView = view !== 'main'

  const renderContent = () => {
    switch (view) {
      case 'main':
        return (
          <div>
            {/* 4 个纯文字横向页签 —— 无方框，仅颜色+下划线区分激活态 */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--n-3)', marginBottom: 20 }}>
              {([
                { key: 'profile' as const, label: '个人信息' },
                { key: 'account' as const, label: '账号与安全' },
                { key: 'devices' as const, label: '登录设备' },
                { key: 'feedback' as const, label: '帮助反馈' },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setMainTab(tab.key)}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    padding: '8px 16px',
                    fontSize: 14,
                    color: mainTab === tab.key ? colors.primary : colors.textMuted,
                    fontWeight: mainTab === tab.key ? 600 : 400,
                    borderBottom: mainTab === tab.key ? `2px solid ${colors.primary}` : '2px solid transparent',
                    transition: 'all 0.2s',
                    outline: 'none',
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 个人信息页签 */}
            {mainTab === 'profile' && (
              <div>
                {/* 头像区域 */}
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div
                    style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Avatar
                      size={80}
                      src={profile.avatar}
                      style={{
                        background: 'linear-gradient(135deg, #4A90D9, #5DA3E5)',
                        fontSize: 28,
                      }}
                    >
                      {!profile.avatar && (currentUser?.slice(0, 1) || '管')}
                    </Avatar>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: colors.primary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid #fff',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                      }}
                    >
                      <Camera size={14} color="#fff" />
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleAvatarChange}
                  />
                  <div style={{ marginTop: 12, fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
                    {currentUser || '超级管理员'}
                  </div>
                </div>

                {/* 可编辑信息 */}
                <EditRow
                  label="昵称"
                  value={profile.nickname}
                  onSave={(v) => updateProfile({ nickname: v })}
                  placeholder="设置昵称"
                />
                <EditRow
                  label="姓名"
                  value={profile.realName}
                  onSave={(v) => updateProfile({ realName: v })}
                  placeholder="设置姓名"
                />
                <EditRow
                  label="个人简介"
                  value={profile.bio}
                  onSave={(v) => updateProfile({ bio: v })}
                  placeholder="介绍一下自己..."
                  type="textarea"
                />
              </div>
            )}

            {/* 账号与安全页签 */}
            {mainTab === 'account' && (
              <AccountSecurityView
                onBack={() => setMainTab('account')}
                onChangeView={setView}
              />
            )}

            {/* 登录设备页签 */}
            {mainTab === 'devices' && <DevicesView />}

            {/* 帮助反馈页签 */}
            {mainTab === 'feedback' && <FeedbackView />}
          </div>
        )

      case 'changePhone':
        return <ChangePhoneFlow onBack={() => { setView('main'); setMainTab('account') }} />

      case 'changeQQ':
        return <ChangeQQFlow onBack={() => { setView('main'); setMainTab('account') }} />

      case 'changeEmail':
        return <ChangeEmailFlow onBack={() => { setView('main'); setMainTab('account') }} />

      case 'changePassword':
        return <ChangePasswordFlow onBack={() => { setView('main'); setMainTab('account') }} />

      default:
        return null
    }
  }

  return (
    <Modal
      title={isSubView ? null : '个人中心'}
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
      destroyOnClose
      closable
      maskClosable={false}
      style={{ top: 40 }}
      styles={{ body: { minHeight: 420, maxHeight: '70vh', overflowY: 'auto' } }}
    >
      {renderContent()}
    </Modal>
  )
}
