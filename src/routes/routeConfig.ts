import type { ExactView } from '../exact/components'

export interface MatchedRoute {
  view: ExactView
  courseId?: string
  courseMode: boolean
}

const globalPaths: Record<string, ExactView> = {
  '/teacher/dashboard': 'dashboard',
  '/teacher/courses': 'courses',
  '/teacher/courses/new': 'create-course',
  // Legacy global URLs now resolve inside the global course-list shell before
  // ExactApp redirects them. Course management only exists under a course URL.
  '/teacher/classes': 'courses',
  '/teacher/tasks': 'courses',
  '/teacher/materials': 'courses',
  '/teacher/analytics': 'courses',
  '/teacher/settings': 'settings',
}

const courseViews = new Set<ExactView>([
  'workspace', 'classes', 'invite', 'tasks', 'materials', 'graph',
  'monitor', 'grading', 'analytics', 'reviews',
  'course-settings',
])

export function matchTeacherRoute(pathname: string): MatchedRoute {
  const normalized = pathname.replace(/\/$/, '') || '/'
  const globalView = globalPaths[normalized]
  if (globalView) return { view: globalView, courseMode: false }
  const match = normalized.match(/^\/teacher\/courses\/([^/]+)(?:\/([^/]+))?$/)
  if (match) {
    const view = (match[2] || 'workspace') as ExactView
    if (courseViews.has(view)) return { view, courseId: decodeURIComponent(match[1]), courseMode: true }
  }
  return { view: 'dashboard', courseMode: false }
}

export function teacherPath(view: ExactView, courseId: string, courseMode: boolean): string {
  if (view === 'dashboard') return '/teacher/dashboard'
  if (view === 'courses') return '/teacher/courses'
  if (view === 'create-course') return '/teacher/courses/new'
  if (courseMode) return `/teacher/courses/${encodeURIComponent(courseId)}/${view}`
  return `/teacher/${view}`
}
