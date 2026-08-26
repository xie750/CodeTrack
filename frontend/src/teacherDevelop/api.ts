const API_BASE = import.meta.env.VITE_TEACHER_API_BASE || 'http://127.0.0.1:8001/api/v1'

let _currentUserId = 'teacher-01'
let _currentUserName = '王老师'

export function setCurrentUser(userId: string, name: string) {
  _currentUserId = userId
  _currentUserName = name
}

export function getCurrentUserId() {
  return _currentUserId
}

export function getCurrentUserName() {
  return _currentUserName
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  userId?: string,
): Promise<T> {
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId ?? _currentUserId,
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(payload.detail || '璇锋眰澶辫触', response.status)
  }
  return payload.data as T
}

export interface BootstrapData {
  teacher: ApiTeacher
  courses: ApiCourse[]
  classes: ApiClass[]
  selected_course_id: string
  selected_class_id: string
  notifications: ApiNotification[]
}

export interface ApiTeacher {
  id: string
  name: string
  number: string
  email: string
  department: string
}

export interface ApiTeacherPreference {
  notifications_enabled: boolean
  ai_assistant_enabled: boolean
  email_digest: boolean
  updated_at: string
}

export interface ApiAnnouncement {
  id: string
  title: string
  summary: string
  content: string[]
  date: string
  published_at: string
  author: string
  audience: string
  pinned: boolean
  read: boolean
}

export interface ApiCourse {
  id: string
  name: string
  code: string
  term: string
  description: string
  status: string
  student_visible: boolean
  progress: number
  classes: number
  students: number
  task_count: number
  created_at?: string
  updated_at?: string
}

export interface ApiClass {
  id: string
  course_id: string
  name: string
  grade: string
  major: string
  schedule: string
  mentor: string
  join_code: string
  students: number
  capacity?: number
  status: string
  completion?: number
  active_rate?: number
  risk_count?: number
}

export interface ApiStudent {
  id: string
  name: string
  number: string
  progress: number
  score: number
  status: string
  last_active: string
  submissions: number
  hint_level: number
}

export interface ApiStudentJoin {
  id: string
  name: string
  number: string
  join_status: 'joined' | 'pending' | 'invited'
  join_method: string
  joined_at: string | null
  last_active: string
}

export interface ApiClassJoinStatus {
  class_id: string
  class_name: string
  capacity: number
  summary: { joined: number; pending: number; invited: number; available_slots: number }
  rows: ApiStudentJoin[]
}

export interface ApiTask {
  id: string
  course_id: string
  class_id: string | null
  title: string
  type: string
  chapter: string
  description: string
  starter_code: string
  status: string
  difficulty: string
  total_score: number
  created_at?: string
  publish_at: string | null
  due_at: string
  submitted: number
  total: number
  completion: number
  test_cases: Array<{ id: string; name: string; hidden: boolean; weight: number }>
}

export interface ApiMaterial {
  id: string
  course_id: string
  title: string
  type: string
  chapter: string
  size: string
  visibility: string
  status: string
  citations: number
  knowledge_points?: Array<{ id: string; name: string }>
  content_url?: string | null
  updated_at: string
}

export interface ApiKnowledgePoint {
  id: string
  name: string
  description: string
  difficulty: string
  mastery: number
}

export interface ApiChapter {
  id: string
  title: string
  description: string
  position: number
  teaching_mode: string
  status: 'draft' | 'published'
  knowledge_points: ApiKnowledgePoint[]
}

export interface ApiStudentChapter extends ApiChapter {
  materials: Array<{ id: string; title: string; type: string; size: string; content_url: string | null }>
  tasks: Array<{ id: string; title: string; type: string; due_at: string; difficulty: string }>
}

export interface ApiSubmission {
  id: string
  task_id: string
  student: { id: string; name: string; number: string }
  version: number
  source_code: string
  status: string
  hint_level: number
  submitted_at: string
  evaluation: null | {
    passed_tests: number
    total_tests: number
    runtime_ms: number
    score: number
    details: Array<{ name: string; passed: boolean; hidden?: boolean }>
  }
  diagnosis: null | {
    id: string
    type: string
    explanation: string
    confidence: number
    source: string
    fallback: boolean
    needs_teacher_review: boolean
    review_status: string | null
  }
  grade: null | { id: string; score: number; status: string; comment: string; dimensions?: { autoTest: number; codeQuality: number; report: number; participation: number } | null }
  feedback: Array<{ id: string; content: string; status: string; student_visible: boolean }>
}

export interface ApiReview {
  id: string
  diagnosis_id: string
  student: string
  task: string
  submission_id: string
  type: string
  confidence: number
  source: string
  fallback: boolean
  explanation: string
  status: string
  reviewed_explanation: string | null
  created_at: string
}

export interface ApiNotification {
  id: string
  type: string
  title: string
  content: string
  read: boolean
  created_at: string
}

export interface ApiDiscussionReply {
  id: string
  student_id: string
  student_name: string
  content: string
  created_at: string
}

export interface ApiDiscussion {
  id: string
  course_id: string
  class_id: string
  class_name: string
  title: string
  content: string
  status: 'draft' | 'published' | 'ended'
  participant_count: number
  reply_count: number
  created_at: string
  published_at: string | null
  replies: ApiDiscussionReply[]
}

async function uploadMaterial(courseId: string, file: File, chapterLabel = '未分类', visibility = 'teacher') {
  const body = new FormData()
  body.append('course_id', courseId)
  body.append('chapter_label', chapterLabel)
  body.append('visibility', visibility)
  body.append('file', file)
  const response = await fetch(API_BASE + '/teacher/materials/upload', {
    method: 'POST',
    headers: { 'X-User-Id': _currentUserId },
    body,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(payload.detail || 'Upload failed', response.status)
  return payload.data
}

async function createTeacherGraphFromFiles(files: File[], fields: { title: string; description: string; target_classes: string }) {
  const body = new FormData()
  files.forEach((file) => body.append('files', file))
  body.append('title', fields.title)
  body.append('description', fields.description)
  body.append('target_classes', fields.target_classes)
  const response = await fetch(API_BASE + '/teacher/knowledge-graphs/from-files', {
    method: 'POST',
    headers: { 'X-User-Id': _currentUserId },
    body,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(payload.detail || '图谱生成失败', response.status)
  return payload.data
}
export const api = {
  health: () => request<{ status: string }>('/health'),
  teacherAccounts: () => request<ApiTeacher[]>('/teacher/auth/accounts'),
  teacherLogin: (username: string, password: string) =>
    request<ApiTeacher>('/teacher/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  courseDraft: () => request<Record<string, unknown> | null>('/teacher/course-draft'),
  saveCourseDraft: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>('/teacher/course-draft', { method: 'PUT', body: JSON.stringify({ payload }) }),
  deleteCourseDraft: () => request<{ deleted: boolean }>('/teacher/course-draft', { method: 'DELETE' }),
  announcements: (courseId: string) => request<ApiAnnouncement[]>('/teacher/courses/' + courseId + '/announcements'),
  markAnnouncementRead: (announcementId: string) =>
    request<{ id: string; read: boolean }>('/teacher/announcements/' + announcementId + '/read', { method: 'PATCH' }),
  preferences: () => request<ApiTeacherPreference>('/teacher/preferences'),
  savePreferences: (body: Omit<ApiTeacherPreference, 'updated_at'>) =>
    request<ApiTeacherPreference>('/teacher/preferences', { method: 'PUT', body: JSON.stringify(body) }),
  bootstrap: (courseId = 'course-ds', classId = 'class-se1') =>
    request<BootstrapData>('/teacher/bootstrap?course_id=' + courseId + '&class_id=' + classId),
  dashboard: (courseId: string, classId: string) =>
    request<any>('/teacher/dashboard?course_id=' + courseId + '&class_id=' + classId),
  courses: () => request<ApiCourse[]>('/teacher/courses'),
  createCourse: (body: unknown) => request<ApiCourse>('/teacher/courses', { method: 'POST', body: JSON.stringify(body) }),
  updateCourse: (courseId: string, body: unknown) => request<ApiCourse>('/teacher/courses/' + courseId, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCourse: (courseId: string) => request<{ id: string; deleted: boolean }>('/teacher/courses/' + courseId, { method: 'DELETE' }),
  classes: (courseId: string) => request<ApiClass[]>('/teacher/classes?course_id=' + courseId),
  createClass: (body: unknown) => request<ApiClass>('/teacher/classes', { method: 'POST', body: JSON.stringify(body) }),
  regenerateJoinCode: (classId: string) => request<{ class_id: string; join_code: string }>('/teacher/classes/' + classId + '/join-code', { method: 'POST' }),
  importStudents: (classId: string, students: Array<{ name: string; number: string }>) => request<any>('/teacher/classes/' + classId + '/students/import', { method: 'POST', body: JSON.stringify({ students }) }),
  students: (classId: string) => request<ApiStudent[]>('/teacher/classes/' + classId + '/students'),
  classJoinStatus: (classId: string) => request<ApiClassJoinStatus>('/teacher/classes/' + classId + '/join-status'),
  chapters: (courseId: string) => request<ApiChapter[]>('/teacher/courses/' + courseId + '/chapters'),
  createChapter: (courseId: string, body: unknown) => request<ApiChapter>('/teacher/courses/' + courseId + '/chapters', { method: 'POST', body: JSON.stringify(body) }),
  updateChapter: (chapterId: string, body: unknown) => request<ApiChapter>('/teacher/chapters/' + chapterId, { method: 'PATCH', body: JSON.stringify(body) }),
  createKnowledgePoint: (body: unknown) => request<any>('/teacher/knowledge-points', { method: 'POST', body: JSON.stringify(body) }),
  tasks: (courseId: string) => request<ApiTask[]>('/teacher/tasks?course_id=' + courseId),
  aiTaskDraft: (body: unknown) => request<any>('/teacher/tasks/ai-draft', { method: 'POST', body: JSON.stringify(body) }),
  createTask: (body: unknown) => request<ApiTask>('/teacher/tasks', { method: 'POST', body: JSON.stringify(body) }),
  publishTask: (taskId: string, body: unknown) => request<ApiTask>('/teacher/tasks/' + taskId + '/publish', { method: 'POST', body: JSON.stringify(body) }),
  trashMaterial: (materialId: string) => request<ApiMaterial>('/teacher/materials/' + materialId, { method: 'DELETE' }),
  restoreMaterial: (materialId: string) => request<ApiMaterial>('/teacher/materials/' + materialId + '/restore', { method: 'POST' }),
  trashMaterials: (courseId: string) => request<ApiMaterial[]>('/teacher/materials/trash?course_id=' + courseId),
  deleteMaterial: (materialId: string) => request<ApiMaterial>('/teacher/materials/' + materialId, { method: 'DELETE' }),
  updateMaterial: (materialId: string, body: unknown) => request<any>('/teacher/materials/' + materialId, { method: 'PATCH', body: JSON.stringify(body) }),
  materialFolders: (courseId: string) => request<any[]>('/teacher/material-folders?course_id=' + courseId),
  trashedMaterialFolders: (courseId: string) => request<any[]>('/teacher/material-folders/trash?course_id=' + courseId),
  createMaterialFolder: (body: unknown) => request<any>('/teacher/material-folders', { method: 'POST', body: JSON.stringify(body) }),
  deleteMaterialFolder: (folderId: string) => request<any>('/teacher/material-folders/' + folderId, { method: 'DELETE' }),
  restoreMaterialFolder: (folderId: string) => request<any>('/teacher/material-folders/' + folderId + '/restore', { method: 'POST' }),
  keepDeletedFolderMaterial: (folderId: string, materialId: string, targetFolderId?: string) => request<any>('/teacher/material-folders/' + folderId + '/materials/' + materialId + '/keep', { method: 'POST', body: JSON.stringify({ target_folder_id: targetFolderId || null }) }),
  aiMaterialOutline: (courseId: string) => request<any>('/teacher/material-folders/ai-outline', { method: 'POST', body: JSON.stringify({ course_id: courseId }) }),
  confirmMaterialOutline: (courseId: string, folders: string[]) => request<any>('/teacher/material-folders/confirm-outline', { method: 'POST', body: JSON.stringify({ course_id: courseId, folders }) }),
  uploadMaterial,
  materials: (courseId: string) => request<ApiMaterial[]>('/teacher/materials?course_id=' + courseId),
  createMaterial: (body: unknown) => request<any>('/teacher/materials', { method: 'POST', body: JSON.stringify(body) }),
  importMaterialToGraph: (materialId: string, body: { knowledge_point_ids: string[]; create_from_material: boolean }) => request<any>('/teacher/materials/' + materialId + '/knowledge-graph', { method: 'POST', body: JSON.stringify(body) }),
  aiGraphCandidates: (courseId: string) => request<any>('/teacher/knowledge-graph/ai-candidates', { method: 'POST', body: JSON.stringify({ course_id: courseId }) }),
  confirmGraphCandidates: (courseId: string, candidates: unknown[]) => request<any>('/teacher/knowledge-graph/confirm', { method: 'POST', body: JSON.stringify({ course_id: courseId, candidates }) }),
  updateGraphNode: (nodeId: string, body: unknown) => request<any>('/teacher/knowledge-graph/nodes/' + nodeId, { method: 'PUT', body: JSON.stringify(body) }),
  graph: (courseId: string) => request<any>('/teacher/knowledge-graph?course_id=' + courseId),
  teacherGraphs: () => request<any[]>('/teacher/knowledge-graphs'),
  teacherGraph: (graphId: number) => request<any>('/teacher/knowledge-graphs/' + graphId),
  createTeacherGraph: (body: unknown) => request<any>('/teacher/knowledge-graphs', { method: 'POST', body: JSON.stringify(body) }),
  createTeacherGraphFromFiles,
  saveTeacherGraph: (graphId: number, body: unknown) => request<any>('/teacher/knowledge-graphs/' + graphId, { method: 'PUT', body: JSON.stringify(body) }),
  publishTeacherGraph: (graphId: number) => request<any>('/teacher/knowledge-graphs/' + graphId + '/publish', { method: 'POST' }),
  deleteTeacherGraph: (graphId: number) => request<any>('/teacher/knowledge-graphs/' + graphId, { method: 'DELETE' }),
  discussions: (courseId: string, classId?: string) => request<ApiDiscussion[]>('/teacher/discussions?course_id=' + courseId + (classId ? '&class_id=' + classId : '')),
  createDiscussion: (body: { course_id: string; class_id: string; title: string; content: string; publish: boolean }) => request<ApiDiscussion>('/teacher/discussions', { method: 'POST', body: JSON.stringify(body) }),
  publishDiscussion: (discussionId: string) => request<ApiDiscussion>('/teacher/discussions/' + discussionId + '/publish', { method: 'POST' }),
  endDiscussion: (discussionId: string) => request<ApiDiscussion>('/teacher/discussions/' + discussionId + '/end', { method: 'POST' }),
  submissions: (taskId: string) => request<ApiSubmission[]>('/teacher/submissions?task_id=' + taskId),
  submission: (submissionId: string) => request<ApiSubmission>('/teacher/submissions/' + submissionId),
  saveGrade: (submissionId: string, body: unknown) => request<any>('/teacher/submissions/' + submissionId + '/grade', { method: 'PUT', body: JSON.stringify(body) }),
  publishGrade: (submissionId: string) => request<any>('/teacher/submissions/' + submissionId + '/grade/publish', { method: 'POST' }),
  feedback: (submissionId: string, body: unknown) => request<any>('/teacher/submissions/' + submissionId + '/feedback', { method: 'POST', body: JSON.stringify(body) }),
  reviews: () => request<ApiReview[]>('/teacher/ai-reviews'),
  reviewAction: (reviewId: string, body: unknown) => request<any>('/teacher/ai-reviews/' + reviewId + '/action', { method: 'POST', body: JSON.stringify(body) }),
  analytics: (courseId: string, classId: string) => request<any>('/teacher/analytics/overview?course_id=' + courseId + '&class_id=' + classId),
  markNotification: (notificationId: string) => request<any>('/teacher/notifications/' + notificationId, { method: 'PATCH', body: JSON.stringify({ read: true }) }),
}
