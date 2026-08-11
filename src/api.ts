const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1'

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
  teacher: { id: string; name: string; email: string; department: string }
  courses: ApiCourse[]
  classes: ApiClass[]
  selected_course_id: string
  selected_class_id: string
  notifications: ApiNotification[]
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
  grade: null | { id: string; score: number; status: string; comment: string }
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

async function uploadMaterial(courseId: string, file: File, chapterLabel = '绗?2 绔?绾挎€ц〃') {
  const body = new FormData()
  body.append('course_id', courseId)
  body.append('chapter_label', chapterLabel)
  body.append('visibility', 'teacher')
  body.append('file', file)
  const response = await fetch(API_BASE + '/teacher/materials/upload', {
    method: 'POST',
    headers: { 'X-User-Id': 'teacher-01' },
    body,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(payload.detail || 'Upload failed', response.status)
  return payload.data
}
export const api = {
  health: () => request<{ status: string }>('/health'),
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
  joinClass: (joinCode: string) => request<{ class_id: string; class_name: string; joined: boolean }>('/classes/' + encodeURIComponent(joinCode) + '/join', { method: 'POST' }, 'student-01'),
  importStudents: (classId: string, students: Array<{ name: string; number: string }>) => request<any>('/teacher/classes/' + classId + '/students/import', { method: 'POST', body: JSON.stringify({ students }) }),
  students: (classId: string) => request<ApiStudent[]>('/teacher/classes/' + classId + '/students'),
  classJoinStatus: (classId: string) => request<ApiClassJoinStatus>('/teacher/classes/' + classId + '/join-status'),
  chapters: (courseId: string) => request<any[]>('/teacher/courses/' + courseId + '/chapters'),
  createChapter: (courseId: string, body: unknown) => request<any>('/teacher/courses/' + courseId + '/chapters', { method: 'POST', body: JSON.stringify(body) }),
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
  discussions: (courseId: string, classId?: string) => request<ApiDiscussion[]>('/teacher/discussions?course_id=' + courseId + (classId ? '&class_id=' + classId : '')),
  createDiscussion: (body: { course_id: string; class_id: string; title: string; content: string; publish: boolean }) => request<ApiDiscussion>('/teacher/discussions', { method: 'POST', body: JSON.stringify(body) }),
  publishDiscussion: (discussionId: string) => request<ApiDiscussion>('/teacher/discussions/' + discussionId + '/publish', { method: 'POST' }),
  endDiscussion: (discussionId: string) => request<ApiDiscussion>('/teacher/discussions/' + discussionId + '/end', { method: 'POST' }),
  studentDiscussions: () => request<ApiDiscussion[]>('/student/discussions', {}, 'student-03'),
  replyDiscussion: (discussionId: string, content: string) => request<ApiDiscussion>('/student/discussions/' + discussionId + '/replies', { method: 'POST', body: JSON.stringify({ content }) }, 'student-03'),
  submissions: (taskId: string) => request<ApiSubmission[]>('/teacher/submissions?task_id=' + taskId),
  submission: (submissionId: string) => request<ApiSubmission>('/teacher/submissions/' + submissionId),
  saveGrade: (submissionId: string, body: unknown) => request<any>('/teacher/submissions/' + submissionId + '/grade', { method: 'PUT', body: JSON.stringify(body) }),
  publishGrade: (submissionId: string) => request<any>('/teacher/submissions/' + submissionId + '/grade/publish', { method: 'POST' }),
  feedback: (submissionId: string, body: unknown) => request<any>('/teacher/submissions/' + submissionId + '/feedback', { method: 'POST', body: JSON.stringify(body) }),
  reviews: () => request<ApiReview[]>('/teacher/ai-reviews'),
  reviewAction: (reviewId: string, body: unknown) => request<any>('/teacher/ai-reviews/' + reviewId + '/action', { method: 'POST', body: JSON.stringify(body) }),
  analytics: (courseId: string, classId: string) => request<any>('/teacher/analytics/overview?course_id=' + courseId + '&class_id=' + classId),
  markNotification: (notificationId: string) => request<any>('/teacher/notifications/' + notificationId, { method: 'PATCH', body: JSON.stringify({ read: true }) }),
  studentSubmit: (taskId: string, sourceCode: string) => request<ApiSubmission>('/student/tasks/' + taskId + '/submissions', { method: 'POST', body: JSON.stringify({ source_code: sourceCode, hint_level: 1 }) }, 'student-03'),
}

