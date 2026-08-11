import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import MainLayout from '@/layouts/MainLayout'
import { useAppStore } from '@/stores/useAppStore'

const Login = lazy(() => import('@/pages/login'))
const Dashboard = lazy(() => import('@/pages/dashboard'))
const Teachers = lazy(() => import('@/pages/users/Teachers'))
const Students = lazy(() => import('@/pages/users/Students'))
const Classes = lazy(() => import('@/pages/users/Classes'))
const Projects = lazy(() => import('@/pages/research/Projects'))
const Compliance = lazy(() => import('@/pages/research/Compliance'))
const ResearchStats = lazy(() => import('@/pages/research/ResearchStats'))
const AiRoute = lazy(() => import('@/pages/ai/AiRoute'))
const AiMonitor = lazy(() => import('@/pages/ai/AiMonitor'))
const SystemConfig = lazy(() => import('@/pages/system/SystemConfig'))
const Notices = lazy(() => import('@/pages/system/Notices'))
const Logs = lazy(() => import('@/pages/system/Logs'))

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '120px 0' }}>
      <Spin size="large" />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const loggedIn = useAppStore((s) => s.loggedIn)
  const location = useLocation()
  if (!loggedIn) return <Navigate to="/login" replace state={{ from: location }} />
  return <>{children}</>
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <MainLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users">
            <Route index element={<Navigate to="/users/teachers" replace />} />
            <Route path="teachers" element={<Teachers />} />
            <Route path="students" element={<Students />} />
            <Route path="classes" element={<Classes />} />
          </Route>
          <Route path="research">
            <Route index element={<Navigate to="/research/projects" replace />} />
            <Route path="projects" element={<Projects />} />
            <Route path="compliance" element={<Compliance />} />
            <Route path="statistics" element={<ResearchStats />} />
          </Route>
          <Route path="ai">
            <Route index element={<Navigate to="/ai/route" replace />} />
            <Route path="route" element={<AiRoute />} />
            <Route path="monitor" element={<AiMonitor />} />
          </Route>
          <Route path="system">
            <Route index element={<Navigate to="/system/config" replace />} />
            <Route path="config" element={<SystemConfig />} />
            <Route path="notices" element={<Notices />} />
            <Route path="logs" element={<Logs />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
