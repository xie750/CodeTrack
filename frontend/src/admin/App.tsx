import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Spin } from 'antd'
import MainLayout from '@admin/layouts/MainLayout'
import '@admin/theme/global.css'

const Login = lazy(() => import('@admin/pages/login'))
const Dashboard = lazy(() => import('@admin/pages/dashboard'))
const Teachers = lazy(() => import('@admin/pages/users/Teachers'))
const Students = lazy(() => import('@admin/pages/users/Students'))
const Classes = lazy(() => import('@admin/pages/users/Classes'))
const Projects = lazy(() => import('@admin/pages/research/Projects'))
const Compliance = lazy(() => import('@admin/pages/research/Compliance'))
const ResearchStats = lazy(() => import('@admin/pages/research/ResearchStats'))
const AiRoute = lazy(() => import('@admin/pages/ai/AiRoute'))
const AiMonitor = lazy(() => import('@admin/pages/ai/AiMonitor'))
const SystemConfig = lazy(() => import('@admin/pages/system/SystemConfig'))
const Notices = lazy(() => import('@admin/pages/system/Notices'))
const Logs = lazy(() => import('@admin/pages/system/Logs'))

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '120px 0' }}>
      <Spin size="large" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route element={<MainLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users">
            <Route index element={<Navigate to="teachers" replace />} />
            <Route path="teachers" element={<Teachers />} />
            <Route path="students" element={<Students />} />
            <Route path="classes" element={<Classes />} />
          </Route>
          <Route path="research">
            <Route index element={<Navigate to="projects" replace />} />
            <Route path="projects" element={<Projects />} />
            <Route path="compliance" element={<Compliance />} />
            <Route path="statistics" element={<ResearchStats />} />
          </Route>
          <Route path="ai">
            <Route index element={<Navigate to="route" replace />} />
            <Route path="route" element={<AiRoute />} />
            <Route path="monitor" element={<AiMonitor />} />
          </Route>
          <Route path="system">
            <Route index element={<Navigate to="config" replace />} />
            <Route path="config" element={<SystemConfig />} />
            <Route path="notices" element={<Notices />} />
            <Route path="logs" element={<Logs />} />
          </Route>
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
