import { useEffect, useState } from 'react'
import { Menu, Tooltip, message } from 'antd'
import { SunMoon, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { navModules } from './nav'
import { useAppStore } from '@/stores/useAppStore'

// 二级子菜单项：缩进 + 小圆点前缀，不允许无层级平铺
function dot(label: string) {
  return (
    <span className="nav-item-label">
      <span className="nav-dot" />
      {label}
    </span>
  )
}

// A2 左侧导航栏：浅色 #FAFBFC、组间细灰分隔线、选中态主色圆角矩形 + 白字白图标、
// 底部放管理员账号信息 / 主题切换 / 退出登录
export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const logout = useAppStore((s) => s.logout)

  const activeModule = navModules.find(
    (m) => location.pathname === m.key || location.pathname.startsWith(m.key + '/'),
  )

  // 当前模块始终展开，其余折叠
  const [openKeys, setOpenKeys] = useState<string[]>(activeModule ? [activeModule.key] : [])
  useEffect(() => {
    if (activeModule) {
      setOpenKeys((prev) => (prev.includes(activeModule.key) ? prev : [...prev, activeModule.key]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // 单页模块（如 工作台）渲染为叶子项；多页模块渲染为内嵌折叠子菜单 + 圆点前缀
  const items = navModules.flatMap((m, i) => [
    ...(i > 0 ? [{ type: 'divider' as const }] : []),
    m.entries.length === 1 && m.entries[0].key === m.key
      ? { key: m.key, icon: m.icon, label: m.label }
      : {
          key: m.key,
          icon: m.icon,
          label: m.label,
          children: m.entries.map((e) => ({ key: e.key, label: dot(e.label) })),
        },
  ])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部品牌区：系统 Logo + 项目名 + 收起按钮 */}
      <div className="sider-brand" style={{ justifyContent: collapsed ? 'center' : 'space-between', padding: collapsed ? 0 : '0 12px 0 16px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10 }}>
          <div className="sider-brand-mark">CT</div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div className="sider-brand-name">CodeTrack</div>
              <div className="sider-brand-sub">管理员端</div>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onToggle}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--n-6)', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--n-2)'; e.currentTarget.style.color = 'var(--n-8)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--n-6)' }}
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {/* 收起态的品牌区显示展开按钮 */}
      {collapsed && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <button
            onClick={onToggle}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--n-6)', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--n-2)'; e.currentTarget.style.color = 'var(--n-8)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--n-6)' }}
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}

      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        items={items}
        selectedKeys={[location.pathname]}
        openKeys={collapsed ? [] : openKeys}
        onOpenChange={setOpenKeys}
        onClick={({ key }) => navigate(key)}
        style={{ flex: 1, overflowY: 'auto', borderInlineEnd: 'none', padding: '16px 0 8px' }}
      />

      <div className="sider-footer">
        <div className="sider-actions">
          <Tooltip title="主题切换（原型演示）" placement="top">
            <button className="sider-action-btn" onClick={() => message.info('主题切换（原型演示）')}>
              <SunMoon size={16} />
            </button>
          </Tooltip>
          <Tooltip title="退出登录" placement="top">
            <button className="sider-action-btn" onClick={handleLogout}>
              <LogOut size={16} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
