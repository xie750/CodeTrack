import { useMemo, useState } from 'react'
import { Badge, Avatar, Dropdown, Popover, Button, Divider, Modal } from 'antd'
import { Bell, LogOut, ChevronDown, User, FolderKanban, ShieldCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/stores/useAppStore'
import PersonalCenter from '@/components/PersonalCenter'

const todoMeta = [
  { type: '科研项目审核', icon: <FolderKanban size={14} /> },
  { type: '合规审查', icon: <ShieldCheck size={14} /> },
]

// A1 全局顶栏：纯白 + 1px 浅灰底边，只放全局入口（搜索 / 状态徽标 / 通知 / 头像）
export default function Topbar() {
  const navigate = useNavigate()
  const currentUser = useAppStore((s) => s.currentUser)
  const logout = useAppStore((s) => s.logout)
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [allRead, setAllRead] = useState(false)

  const todos = useMemo(() => {
    const s = useAppStore.getState()
    const pendingProjects = s.projects.filter((p) => p.status === '待审核').length
    const pendingCompliance = s.compliance.filter((c) => c.status === '待处理').length
    return [
      { type: '科研项目审核', count: pendingProjects },
      { type: '合规审查', count: pendingCompliance },
    ]
  }, [open])

  const totalTodo = todos.reduce((s, t) => s + t.count, 0)
  const showBadge = !allRead && totalTodo > 0

  const userMenu = {
    items: [
      { key: 'profile', icon: <User size={14} />, label: '个人中心' },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogOut size={14} />, label: '退出登录', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') {
        logout()
        navigate('/login')
      } else if (key === 'profile') {
        setProfileOpen(true)
      }
    },
  }

  const todoContent = (
    <div style={{ width: 340 }}>
      {/* 头部：标题 + 全部已读 + X 关闭 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 10px' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>消息通知</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            onClick={() => setAllRead(true)}
            style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer', userSelect: 'none' }}
          >
            全部已读
          </span>
          <X
            size={14}
            onClick={() => setOpen(false)}
            style={{ cursor: 'pointer', color: 'var(--n-6)' }}
          />
        </div>
      </div>
      <Divider style={{ margin: '0 0 6px' }} />

      {/* 消息列表 */}
      {todos.map((t) => {
        const meta = todoMeta.find((m) => m.type === t.type)
        const desc =
          t.type === '科研项目审核'
            ? `有 ${t.count} 个新提交的科研立项申请等待审核处理`
            : `有 ${t.count} 项 AI 初检疑似违规内容需要人工复核处置`
        const time = t.type === '科研项目审核' ? '10 分钟前' : '32 分钟前'
        const isRead = allRead || t.count === 0

        return (
          <div
            key={t.type}
            onClick={() => {
              setOpen(false)
              navigate(`/dashboard?todo=${t.type}`)
            }}
            style={{
              padding: '10px 8px',
              borderRadius: 8,
              cursor: 'pointer',
              marginBottom: 4,
              transition: 'background .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--primary-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {/* 未读红点 */}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isRead ? 'transparent' : 'var(--c-danger)',
                  flexShrink: 0,
                  marginTop: 8,
                }}
              />

              {/* 图标块 */}
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: !isRead && t.count > 0 ? 'var(--c-danger-bg)' : 'var(--n-3)',
                  color: !isRead && t.count > 0 ? 'var(--c-danger)' : 'var(--n-6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {meta?.icon}
              </div>

              {/* 文字内容 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--n-8)', marginBottom: 2 }}>{t.type}</div>
                <div style={{ fontSize: 12, color: 'var(--n-7)', lineHeight: 1.5 }}>{desc}</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--n-5)' }}>{time}</span>
                </div>
              </div>

              {/* 前往按钮 */}
              <Button
                size="small"
                type="link"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  navigate(`/dashboard?todo=${t.type}`)
                }}
                style={{ flexShrink: 0, padding: 0, fontSize: 12, alignSelf: 'center' }}
              >
                前往
              </Button>
            </div>
          </div>
        )
      })}

      <Divider style={{ margin: '4px 0 8px' }} />
      {/* 底部：全部清空 */}
      <div style={{ textAlign: 'center' }}>
        <Button
          type="text"
          danger
          size="small"
          onClick={() => {
            Modal.confirm({
              title: '确认清空',
              content: '确定要清空所有消息通知吗？此操作不可恢复。',
              okText: '确认清空',
              cancelText: '取消',
              okButtonProps: { danger: true },
              onOk: () => {
                setAllRead(true)
                setOpen(false)
              },
            })
          }}
        >
          全部清空
        </Button>
      </div>
    </div>
  )

  return (
    <div className="app-header">
      {/* 右侧工具栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginLeft: 'auto', flexShrink: 0 }}>

      {/* 通知中心 */}
      <Badge dot={showBadge} offset={[-6, -2]}>
        <Popover
          open={open}
          onOpenChange={(visible) => {
            // 只响应打开，关闭由 X 按钮控制
            if (visible) setOpen(true)
          }}
          placement="bottomRight"
          trigger={[]}
          content={todoContent}
        >
          <Button
            type="text"
            icon={<Bell size={17} style={{ color: 'var(--n-7)' }} />}
            onClick={() => setOpen(!open)}
          />
        </Popover>
      </Badge>

      {/* 用户头像 + 下拉 */}
      <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
        <div className="header-user">
          <Avatar size={30} style={{ background: 'linear-gradient(135deg, #4A90D9, #5DA3E5)', fontSize: 13 }}>
            {currentUser?.slice(0, 1) || '管'}
          </Avatar>
          <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--n-8)' }}>{currentUser || '超级管理员'}</span>
          <ChevronDown size={13} style={{ color: 'var(--n-6)' }} />
        </div>
      </Dropdown>
      </div>

      {/* 个人中心 Modal */}
      <PersonalCenter open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  )
}
