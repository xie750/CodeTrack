import { authHeaders } from '../authSession'

export const TEACHER_API_BASE = import.meta.env.VITE_TEACHER_API_BASE || '/api/v1'
const UNIFIED_TASK_API_BASE = '/api/unified'

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

  constructor(message: unknown, status: number) {
    const normalizedMessage = Array.isArray(message)
      ? message.map((item: any) => typeof item === 'string' ? item : item?.msg || item?.message || JSON.stringify(item)).join('; ')
      : message && typeof message === 'object'
        ? (message as any).message || JSON.stringify(message)
        : String(message || 'Request failed')
    super(normalizedMessage)
    this.status = status
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  userId?: string,
): Promise<T> {
  const response = await fetch(TEACHER_API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId ?? _currentUserId,
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(payload.error?.message || payload.detail || '请求失败', response.status)
  }
  return payload.data as T
}

const unifiedCourseIds: Record<string, string> = {
  'course-ds': 'course_ds_001',
}

const unifiedClassIds: Record<string, string> = {
  'class-se1': 'class_se_001',
}

const legacyClassIds: Record<string, string> = Object.fromEntries(
  Object.entries(unifiedClassIds).map(([legacyId, unifiedId]) => [unifiedId, legacyId]),
)

function unifiedUserId(userId: string) {
  if (userId === 'teacher-01') return 'user_teacher_001'
  if (userId === 'teacher-02') return 'user_teacher_002'
  return userId
}

function unifiedCourseId(courseId: string) {
  return unifiedCourseIds[courseId] || courseId
}

function unifiedClassId(classId: string) {
  return unifiedClassIds[classId] || classId
}

function legacyTaskStatus(contentStatus: string, rawStatus: string) {
  if (contentStatus === 'PUBLISHED') return 'published'
  if (contentStatus === 'CLOSED') return 'closed'
  if (rawStatus === 'DRAFT') return 'draft'
  return 'scheduled'
}

function unifiedTaskToLegacy(row: any): ApiTask {
  const publication = row.publications?.find((item: any) => item.class_id === 'class_se_001') || row.publications?.[0]
  const testCaseCount = Math.max(row.required_test_case_count || row.test_case_count || 0, 1)
  return {
    id: row.task_id,
    course_id: 'course-ds',
    class_id: legacyClassIds[publication?.class_id] || null,
    title: row.title,
    type: row.workspace_type === 'CODING' ? 'programming' : 'quiz',
    chapter: row.learning_objectives?.[0] || '链表',
    description: row.description || '',
    starter_code: row.interface_spec || '',
    status: legacyTaskStatus(row.content_status, row.raw_status),
    difficulty: '进阶',
    total_score: 100,
    created_at: publication?.published_at || undefined,
    publish_at: publication?.published_at || null,
    due_at: publication?.deadline || '2026-12-30T23:59:00',
    submitted: row.submitted_count || 0,
    total: row.roster_total || 0,
    completion: row.completion_rate ? row.completion_rate * 100 : 0,
    test_cases: Array.from({ length: testCaseCount }, (_, index) => ({
      id: `${row.task_id}-case-${index + 1}`,
      name: `测试用例 ${index + 1}`,
      hidden: index >= (row.public_test_case_count || 0),
      weight: Math.round(100 / testCaseCount),
    })),
  }
}

function createUnifiedTaskPayload(body: any) {
  const taskType = body.type || 'programming'
  const isCoding = taskType === 'programming' || taskType === 'project'
  const chapter = Array.isArray(body.chapter_label) ? body.chapter_label : [body.chapter_label || '链表']
  const testCases = Array.isArray(body.test_cases) ? body.test_cases : []
  const outputSummary = (value: unknown) => {
    if (typeof value === 'string') return value
    if (value == null) return ''
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return {
    course_id: unifiedCourseId(body.course_id),
    title: body.title || '未命名任务',
    description: body.description || '请完成本次课程任务。',
    workspace_type: isCoding ? 'CODING' : 'QUESTION_SET',
    language: 'CPP',
    interface_spec: body.starter_code || 'ListNode* deleteAt(ListNode* head, int position);',
    learning_objectives: chapter,
    capability_ids: ['cap_linked_list_boundary'],
    test_cases: isCoding
      ? (testCases.length ? testCases : [{ name: '基础用例', input_data: {}, expected_output: null }]).map((item: any) => ({
          name: item.name || '测试用例',
          visibility: item.hidden ? 'HIDDEN' : 'PUBLIC',
          input_data: item.input_data || {},
          expected_output: item.expected_output ?? null,
          expected_output_summary: outputSummary(item.expected_output),
          error_tag: 'UNKNOWN_OR_LOW_CONFIDENCE',
        }))
      : [],
    questions: isCoding ? [] : [{
      question_type: taskType === 'true_false' ? 'TRUE_FALSE' : taskType === 'multiple_choice' ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
      stem: body.description || body.title || '请完成本题。',
      analysis: '',
      knowledge_points: chapter,
      difficulty: 'BASIC',
      score: body.total_score || 100,
      options: [
        { label: 'A', content: '正确', is_correct: true },
        { label: 'B', content: '错误', is_correct: false },
      ],
    }],
  }
}

function unifiedCreatedTaskToLegacy(data: any, body: any): ApiTask {
  return unifiedTaskToLegacy({
    task_id: data.task_id,
    title: data.title || body.title,
    description: body.description || '',
    workspace_type: data.workspace_type || (body.type === 'programming' ? 'CODING' : 'QUESTION_SET'),
    raw_status: data.status || 'OPEN',
    content_status: 'READY',
    learning_objectives: Array.isArray(body.chapter_label) ? body.chapter_label : [body.chapter_label || '链表'],
    publications: [],
    test_case_count: Array.isArray(body.test_cases) ? body.test_cases.length : 0,
  })
}

function isUnifiedTaskId(taskId: string) {
  return taskId.includes('_')
}

async function unifiedTaskRequest<T>(path: string, options: RequestInit = {}) {
  const tokenHeaders = authHeaders()
  const response = await fetch(UNIFIED_TASK_API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(Object.keys(tokenHeaders).length ? tokenHeaders : { 'X-Demo-User-Id': unifiedUserId(_currentUserId) }),
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(payload.error?.message || payload.detail || '任务请求失败', response.status)
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

export interface ApiTeacherAiCitation {
  id: string
  label: string
  kind: string
  record_count: number
}

export interface ApiTeacherAiChatResponse {
  id: string
  role: 'assistant'
  content: string
  confidence: number
  citations: ApiTeacherAiCitation[]
  suggested_actions: string[]
  data_gaps: string[]
  model: {
    provider: string
    name: string
    prompt_version: string
    duration_ms: number | null
    token_prompt: number | null
    token_completion: number | null
  }
  context: {
    scope: {
      course_id: string
      course_name: string
      class_id: string | null
      class_name: string | null
    }
    analytics_summary: {
      students: number
      assigned_tasks: number
      average_score: number | null
      risk_students: number
      attention_students: number
      pending_ai_reviews: number
    }
    sources: ApiTeacherAiCitation[]
    generated_at: string
  }
  session?: ApiTeacherAiSession
  user_message_id?: string
  assistant_message_id?: string
}

export interface ApiTeacherAiHistoryMessage {
  role: 'assistant' | 'teacher'
  content: string
}

export interface ApiTeacherAiSession {
  id: string
  teacher_id: string
  course_id: string
  class_id: string | null
  title: string
  summary: string
  status: string
  message_count: number
  created_at: string | null
  updated_at: string | null
  last_message_at: string | null
}

export interface ApiTeacherAiStoredMessage {
  id: string
  session_id: string
  role: 'assistant' | 'teacher' | string
  content: string
  status: string
  metadata: Partial<ApiTeacherAiChatResponse> & {
    confidence?: number
    citations?: ApiTeacherAiCitation[]
    suggested_actions?: string[]
    data_gaps?: string[]
    model_provider?: string
    model_name?: string
    error?: { code: string; message: string; details: Record<string, unknown> }
  }
  created_at: string | null
}

export interface ApiTeacherAiSessionDetail {
  session: ApiTeacherAiSession
  messages: ApiTeacherAiStoredMessage[]
}

export type ApiTeacherAiStreamEvent =
  | { event: 'session'; data: { session: ApiTeacherAiSession; user_message: ApiTeacherAiStoredMessage } }
  | { event: 'assistant_start'; data: { session_id: string } }
  | { event: 'delta'; data: { content: string } }
  | { event: 'final'; data: ApiTeacherAiChatResponse & { session?: ApiTeacherAiSession; assistant_message_id?: string } }
  | { event: 'error'; data: { code: string; message: string; details: Record<string, unknown> } }

function parseTeacherSseFrame(frame: string): ApiTeacherAiStreamEvent | null {
  const lines = frame.split(/\r?\n/)
  const eventLine = lines.find((line) => line.startsWith('event:'))
  const dataLines = lines.filter((line) => line.startsWith('data:'))
  const event = eventLine?.slice('event:'.length).trim()
  const dataText = dataLines.map((line) => line.slice('data:'.length).trimStart()).join('\n')
  if (!event || !dataText) return null
  return { event, data: JSON.parse(dataText) } as ApiTeacherAiStreamEvent
}

async function streamTeacherAiChat(
  body: {
    course_id: string
    class_id: string | null
    session_id?: string | null
    message: string
    history: ApiTeacherAiHistoryMessage[]
  },
  onEvent: (event: ApiTeacherAiStreamEvent) => void,
) {
  const response = await fetch(TEACHER_API_BASE + '/teacher/ai-assistant/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': _currentUserId,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}))
    throw new ApiError(payload.detail || response.statusText || '真实模型请求失败', response.status)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    const frames = buffer.split(/\n\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const parsed = parseTeacherSseFrame(frame.trim())
      if (parsed) onEvent(parsed)
    }
    if (done) break
  }
  const tail = parseTeacherSseFrame(buffer.trim())
  if (tail) onEvent(tail)
}

function teacherAiSessionsUrl(courseId: string, classId?: string | null, query?: string) {
  const params = new URLSearchParams({ course_id: courseId })
  if (classId) params.set('class_id', classId)
  if (query?.trim()) params.set('q', query.trim())
  return '/teacher/ai-assistant/sessions?' + params.toString()
}

async function uploadMaterial(courseId: string, file: File, chapterLabel = '未分类', visibility = 'teacher') {
  const body = new FormData()
  body.append('course_id', courseId)
  body.append('chapter_label', chapterLabel)
  body.append('visibility', visibility)
  body.append('file', file)
  const response = await fetch(TEACHER_API_BASE + '/teacher/materials/upload', {
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
  const response = await fetch(TEACHER_API_BASE + '/teacher/knowledge-graphs/from-files', {
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
  tasks: async (courseId: string) => {
    if (!unifiedCourseIds[courseId]) return request<ApiTask[]>('/teacher/tasks?course_id=' + courseId)
    const query = `?course_id=${encodeURIComponent(unifiedCourseId(courseId))}&class_id=${encodeURIComponent(unifiedClassId('class-se1'))}&page_size=100`
    const payload = await unifiedTaskRequest<{ items: any[] }>(`/teacher/tasks${query}`)
    return payload.items.map(unifiedTaskToLegacy)
  },
  aiTaskDraft: async (body: any) => {
    if (!unifiedCourseIds[body?.course_id]) {
      return request<any>('/teacher/tasks/ai-draft', { method: 'POST', body: JSON.stringify(body) })
    }
    const prompt = String(body?.prompt || '')
    const isQuiz = /选择|判断|填空|题组|quiz/i.test(prompt)
    return {
      id: '',
      title: isQuiz ? '链表边界条件诊断题组' : '单链表指定位置节点删除',
      type: isQuiz ? 'single_choice' : 'programming',
      chapter: ['链表', '链表删除'],
      description: isQuiz
        ? '围绕人工智能 1 班近期任务中的链表边界条件问题，完成本组诊断题。'
        : '给定单链表和目标位置，删除指定位置节点并返回新的链表头结点，注意空链表、头结点和越界位置处理。',
    }
  },
  createTask: async (body: any) => {
    if (!unifiedCourseIds[body.course_id]) return request<ApiTask>('/teacher/tasks', { method: 'POST', body: JSON.stringify(body) })
    const payload = await unifiedTaskRequest<any>('/teacher/tasks', { method: 'POST', body: JSON.stringify(createUnifiedTaskPayload(body)) })
    return unifiedCreatedTaskToLegacy(payload, body)
  },
  publishTask: async (taskId: string, body: any) => {
    if (!isUnifiedTaskId(taskId)) return request<ApiTask>('/teacher/tasks/' + taskId + '/publish', { method: 'POST', body: JSON.stringify(body) })
    const payload = await unifiedTaskRequest<any>('/teacher/tasks/' + taskId + '/publish', {
      method: 'POST',
      body: JSON.stringify({
        class_ids: [unifiedClassId(body.class_id || 'class-se1')],
        assignment_mode: 'PRACTICE',
        allow_hint_level_3: true,
        deadline: body.due_at || null,
      }),
    })
    return payload
  },
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
  submissions: (taskId: string) => isUnifiedTaskId(taskId)
    ? unifiedTaskRequest<ApiSubmission[]>('/teacher/submissions?task_id=' + encodeURIComponent(taskId))
    : request<ApiSubmission[]>('/teacher/submissions?task_id=' + taskId),
  submission: (submissionId: string) => isUnifiedTaskId(submissionId)
    ? unifiedTaskRequest<ApiSubmission>('/teacher/submissions/' + encodeURIComponent(submissionId))
    : request<ApiSubmission>('/teacher/submissions/' + submissionId),
  saveGrade: (submissionId: string, body: unknown) => isUnifiedTaskId(submissionId)
    ? unifiedTaskRequest<any>('/teacher/submissions/' + encodeURIComponent(submissionId) + '/grade', { method: 'PUT', body: JSON.stringify(body) })
    : request<any>('/teacher/submissions/' + submissionId + '/grade', { method: 'PUT', body: JSON.stringify(body) }),
  publishGrade: (submissionId: string) => isUnifiedTaskId(submissionId)
    ? unifiedTaskRequest<any>('/teacher/submissions/' + encodeURIComponent(submissionId) + '/grade/publish', { method: 'POST' })
    : request<any>('/teacher/submissions/' + submissionId + '/grade/publish', { method: 'POST' }),
  feedback: (submissionId: string, body: unknown) => isUnifiedTaskId(submissionId)
    ? unifiedTaskRequest<any>('/teacher/submissions/' + encodeURIComponent(submissionId) + '/feedback', { method: 'POST', body: JSON.stringify(body) })
    : request<any>('/teacher/submissions/' + submissionId + '/feedback', { method: 'POST', body: JSON.stringify(body) }),
  reviews: () => request<ApiReview[]>('/teacher/ai-reviews'),
  reviewAction: (reviewId: string, body: unknown) => request<any>('/teacher/ai-reviews/' + reviewId + '/action', { method: 'POST', body: JSON.stringify(body) }),
  analytics: (courseId: string, classId: string) => request<any>('/teacher/analytics/overview?course_id=' + courseId + '&class_id=' + classId),
  teacherAiChat: (body: { course_id: string; class_id: string | null; session_id?: string | null; message: string; history: ApiTeacherAiHistoryMessage[] }) =>
    request<ApiTeacherAiChatResponse>('/teacher/ai-assistant/chat', { method: 'POST', body: JSON.stringify(body) }),
  streamTeacherAiChat,
  listTeacherAiSessions: (courseId: string, classId?: string | null, query?: string) =>
    request<ApiTeacherAiSession[]>(teacherAiSessionsUrl(courseId, classId, query)),
  createTeacherAiSession: (body: { course_id: string; class_id?: string | null; first_message?: string; title?: string }) =>
    request<ApiTeacherAiSession>('/teacher/ai-assistant/sessions', { method: 'POST', body: JSON.stringify(body) }),
  getTeacherAiSession: (sessionId: string) =>
    request<ApiTeacherAiSessionDetail>('/teacher/ai-assistant/sessions/' + encodeURIComponent(sessionId)),
  deleteTeacherAiSession: (sessionId: string) =>
    request<{ id: string; deleted: boolean }>('/teacher/ai-assistant/sessions/' + encodeURIComponent(sessionId), { method: 'DELETE' }),
  markNotification: (notificationId: string) => request<any>('/teacher/notifications/' + notificationId, { method: 'PATCH', body: JSON.stringify({ read: true }) }),
}
