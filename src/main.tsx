import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter } from 'react-router-dom'

import ExactApp from './exact/ExactApp'
import { setCurrentUser } from './api'
import { reservedStudentRoute, type ReservedStudentIntegration } from './reserved/studentIntegration'
import './exact/exact.css'

function ReservedStudentEntry({ contract }: { contract: ReservedStudentIntegration }) {
  return <main className="student-join-entry"><section>
    <div className="student-join-brand"><span>&lt;/&gt;</span><strong>CodeTrack</strong></div>
    <small>师生协同接口</small>
    <h1>学生端暂未启用</h1>
    <p>教师端已经保留此入口与接口契约，当前版本不会向学生端后端发送请求。</p>
    <code>{contract.method} {contract.path}</code>
    <button onClick={() => { window.location.href = '/' }}>返回教师端</button>
  </section></main>
}

const reservedRoute = reservedStudentRoute(window.location.pathname)
const TEACHER_SESSION_KEY = 'codetrack_teacher_session_v3'

function AppRoot() {
  const [loggedIn, setLoggedIn] = React.useState(() => {
    localStorage.removeItem('codetrack_user')
    localStorage.removeItem('codetrack_teacher_session_v2')
    const saved = localStorage.getItem(TEACHER_SESSION_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (typeof parsed.id === 'string' && typeof parsed.name === 'string') {
          setCurrentUser(parsed.id, parsed.name)
          return true
        }
      } catch { /* ignore corrupt data */ }
      localStorage.removeItem(TEACHER_SESSION_KEY)
    }
    setCurrentUser('teacher-01', '王老师')
    return false
  })
  const [appKey, setAppKey] = React.useState(0)

  const handleLogin = (userId: string, name: string) => {
    setCurrentUser(userId, name)
    localStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify({ id: userId, name }))
    setLoggedIn(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('codetrack_user')
    localStorage.removeItem('codetrack_teacher_session_v2')
    localStorage.removeItem(TEACHER_SESSION_KEY)
    setCurrentUser('teacher-01', '王老师')
    setLoggedIn(false)
    setAppKey((n) => n + 1)
  }

  if (reservedRoute) return <ReservedStudentEntry contract={reservedRoute} />

  const effectiveLoggedIn = loggedIn && Boolean(localStorage.getItem(TEACHER_SESSION_KEY))
  return <ExactApp key={appKey} loggedIn={effectiveLoggedIn} onLogin={handleLogin} onLogout={handleLogout} />
}

const app = <AppRoot />

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#43b81a',
          colorInfo: '#43b81a',
          colorSuccess: '#379d1e',
          colorWarning: '#e0a12b',
          colorError: '#d45f55',
          colorText: '#19221b',
          colorTextSecondary: '#778279',
          colorBorder: '#dfe6dc',
          colorBgLayout: '#f7f9f6',
          borderRadius: 5,
          controlHeight: 34,
          fontSize: 12,
          fontFamily: "Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Button: { fontWeight: 550 },
          Table: { headerBg: '#f7f9f6', headerColor: '#657168', cellPaddingBlock: 10, cellPaddingInline: 11 },
          Tabs: { itemSelectedColor: '#3a9e20', inkBarColor: '#43b81a' },
          Form: { labelFontSize: 11, itemMarginBottom: 13 },
        },
      }}
    >
      <BrowserRouter>{app}</BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
)
