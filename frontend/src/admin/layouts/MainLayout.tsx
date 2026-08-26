import { useState } from 'react'
import { Layout } from 'antd'
import { Outlet } from 'react-router-dom'
import Topbar from './Topbar'
import Sidebar from './Sidebar'


const { Sider, Content } = Layout

// 固定三段式骨架：左侧导航栏（全高，Logo 顶 / 账号底）+ 顶部 Header + 主内容工作区
// 与教师端同构：同一产品的不同角色端。所有业务页复用同一骨架
export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={232}
        collapsedWidth={64}
        trigger={null}
        className="app-sider"
      >
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </Sider>
      <Layout>
        <Topbar />
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
