import { create } from 'zustand'
import type {
  Teacher,
  Student,
  CourseItem,
  ProjectItem,
  ComplianceItem,
  SubjectRoute,
  SwitchHistory,
  SubjectAvailability,
  ConnectedModel,
  ModelVersion,
  AiCallLog,
  AiAlert,
  AlertRule,
  AISafetyConfig,
  Semester,
  ParamGroup,
  Notice,
  OperationLog,
  UserProfile,
  LoginDevice,
} from '@/types'
import {
  seedTeachers,
  seedStudents,
  seedCourses,
  seedProjects,
  seedCompliance,
  seedSubjectRoutes,
  seedSwitchHistories,
  seedSubjectAvailabilities,
  seedConnectedModels,
  seedModelVersions,
  seedAlertRules,
  seedAiCallLogs,
  seedAiAlerts,
  seedAISafetyConfig,
  seedSemesters,
  seedParamGroups,
  seedNotices,
  seedLogs,
} from '@/mock/seed'

// 个人中心 mock 数据
const seedProfile: UserProfile = {
  nickname: '超级管理员',
  realName: '张明轩',
  bio: 'CodeTrack 平台超级管理员，负责平台整体运营与管理。',
  phone: '138****8888',
  qq: '12****90',
  email: 'admin@codetrack.cn',
}

const seedDevices: LoginDevice[] = [
  { id: 'D1', deviceName: 'Windows · Chrome 126', deviceIcon: 'pc', os: 'Windows 11', browser: 'Chrome 126', ip: '10.20.1.8', location: '深圳·广东', loginTime: '2026-08-08 09:30:00', isCurrent: true },
  { id: 'D2', deviceName: 'iPhone 15 · Safari', deviceIcon: 'mobile', os: 'iOS 18', browser: 'Safari', ip: '10.20.1.9', location: '深圳·广东', loginTime: '2026-08-07 14:15:00', isCurrent: false },
  { id: 'D3', deviceName: 'MacBook Pro · Chrome 125', deviceIcon: 'pc', os: 'macOS 14', browser: 'Chrome 125', ip: '10.20.2.5', location: '广州·广东', loginTime: '2026-08-05 18:00:00', isCurrent: false },
  { id: 'D4', deviceName: 'iPad Air · Safari', deviceIcon: 'tablet', os: 'iPadOS 18', browser: 'Safari', ip: '10.20.1.8', location: '深圳·广东', loginTime: '2026-08-03 08:45:00', isCurrent: false },
]

export const useAppStore = create<{
  // 登录
  loggedIn: boolean
  currentUser: string
  login: (name: string) => void
  logout: () => void

  // 个人中心
  profile: UserProfile
  devices: LoginDevice[]
  updateProfile: (patch: Partial<UserProfile>) => void
  bindPhone: (phone: string) => void
  bindQQ: (qq: string) => void
  bindEmail: (email: string) => void
  changePassword: (oldPwd: string, newPwd: string) => boolean

  // 用户与组织
  teachers: Teacher[]
  addTeacher: (t: Teacher) => void
  updateTeacher: (id: string, patch: Partial<Teacher>) => void
  removeTeacher: (id: string) => void

  students: Student[]
  addStudent: (s: Student) => void
  updateStudent: (id: string, patch: Partial<Student>) => void

  courses: CourseItem[]
  addCourse: (c: CourseItem) => void
  updateCourse: (id: string, patch: Partial<CourseItem>) => void
  deleteCourse: (id: string) => void

  // 科研
  projects: ProjectItem[]
  addProject: (p: ProjectItem) => void
  updateProject: (id: string, patch: Partial<ProjectItem>) => void

  compliance: ComplianceItem[]
  updateCompliance: (id: string, patch: Partial<ComplianceItem>) => void
  addCompliance: (c: ComplianceItem) => void

  // AI 运维管控
  subjectRoutes: SubjectRoute[]
  updateSubjectRoute: (id: string, patch: Partial<SubjectRoute>) => void
  manualSwitchRoute: (id: string, toModel: 'primary' | 'fallback' | 'general_fallback', reason: string) => void
  testConnectivity: (id: string) => void
  switchHistories: SwitchHistory[]
  subjectAvailabilities: SubjectAvailability[]
  updateAvailability: (id: string, patch: Partial<SubjectAvailability>) => void
  aiSafetyConfig: AISafetyConfig
  updateSafetyConfig: (patch: Partial<AISafetyConfig>) => void
  aiCallLogs: AiCallLog[]
  aiAlerts: AiAlert[]
  handleAlert: (id: string, status: import('@/types').AlertStatus, meta?: { operator?: string; content?: string }) => void

  alertRules: AlertRule[]
  addAlertRule: (r: Omit<AlertRule, 'id'>) => void
  updateAlertRule: (id: string, patch: Partial<AlertRule>) => void
  removeAlertRule: (id: string) => void
  toggleAlertRule: (id: string) => void

  connectedModels: ConnectedModel[]
  addConnectedModel: (m: Omit<ConnectedModel, 'id'>) => void
  updateConnectedModel: (id: string, patch: Partial<ConnectedModel>) => void
  removeConnectedModel: (id: string) => void
  toggleModelEnable: (id: string) => void
  copyConnectedModel: (id: string) => void
  reorderConnectedModels: (ordered: ConnectedModel[]) => void

  modelVersions: ModelVersion[]
  markCurrentVersion: (versionId: string) => void
  rollbackVersion: (versionId: string) => void

  // 系统
  semesters: Semester[]
  addSemester: (s: Semester) => void
  updateSemester: (id: string, patch: Partial<Semester>) => void
  setCurrentSemester: (id: string) => void
  paramGroups: ParamGroup[]
  saveParamGroup: (key: string, values: Record<string, unknown>) => void
  rollbackParamGroup: (key: string) => void
  notices: Notice[]
  addNotice: (n: Notice) => void
  updateNotice: (id: string, patch: Partial<Notice>) => void
  deleteNotice: (id: string) => void
  reorderNotices: (reordered: Notice[]) => void
  logs: OperationLog[]
  addLog: (l: OperationLog) => void
}>((set, get) => ({
  loggedIn: false,
  currentUser: '',
  login: (name) => set({ loggedIn: true, currentUser: name }),
  logout: () => set({ loggedIn: false, currentUser: '' }),

  profile: { ...seedProfile },
  devices: [...seedDevices],
  updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
  bindPhone: (phone) =>
    set((s) => ({
      profile: { ...s.profile, phone },
      logs: [
        {
          id: `L${Date.now()}`,
          operator: s.currentUser || '超级管理员',
          actionType: '编辑',
          resourceType: '个人中心',
          resourceId: 'phone',
          desc: '更换绑定手机号',
          before: s.profile.phone,
          after: phone,
          ip: '10.20.1.8',
          ua: 'Chrome/126',
          time: new Date().toLocaleString('zh-CN', { hour12: false }),
          sensitive: true,
        },
        ...s.logs,
      ],
    })),
  bindQQ: (qq) =>
    set((s) => ({
      profile: { ...s.profile, qq },
      logs: [
        {
          id: `L${Date.now()}`,
          operator: s.currentUser || '超级管理员',
          actionType: '编辑',
          resourceType: '个人中心',
          resourceId: 'qq',
          desc: '更换绑定QQ',
          before: s.profile.qq,
          after: qq,
          ip: '10.20.1.8',
          ua: 'Chrome/126',
          time: new Date().toLocaleString('zh-CN', { hour12: false }),
          sensitive: true,
        },
        ...s.logs,
      ],
    })),
  bindEmail: (email) =>
    set((s) => ({
      profile: { ...s.profile, email },
      logs: [
        {
          id: `L${Date.now()}`,
          operator: s.currentUser || '超级管理员',
          actionType: '编辑',
          resourceType: '个人中心',
          resourceId: 'email',
          desc: '更换绑定邮箱',
          before: s.profile.email,
          after: email,
          ip: '10.20.1.8',
          ua: 'Chrome/126',
          time: new Date().toLocaleString('zh-CN', { hour12: false }),
          sensitive: true,
        },
        ...s.logs,
      ],
    })),
  changePassword: (_oldPwd, _newPwd) => {
    set((s) => ({
      logs: [
        {
          id: `L${Date.now()}`,
          operator: s.currentUser || '超级管理员',
          actionType: '编辑',
          resourceType: '个人中心',
          resourceId: 'password',
          desc: '修改登录密码',
          before: '******',
          after: '******',
          ip: '10.20.1.8',
          ua: 'Chrome/126',
          time: new Date().toLocaleString('zh-CN', { hour12: false }),
          sensitive: true,
        },
        ...s.logs,
      ],
    }))
    return true
  },

  teachers: seedTeachers,
  addTeacher: (t) => set((s) => ({ teachers: [t, ...s.teachers] })),
  updateTeacher: (id, patch) =>
    set((s) => ({ teachers: s.teachers.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  removeTeacher: (id) => set((s) => ({ teachers: s.teachers.filter((t) => t.id !== id) })),

  students: seedStudents,
  addStudent: (st) => set((s) => ({ students: [st, ...s.students] })),
  updateStudent: (id, patch) =>
    set((s) => ({ students: s.students.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  courses: seedCourses,
  addCourse: (c) => set((s) => ({ courses: [c, ...s.courses] })),
  updateCourse: (id, patch) =>
    set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  deleteCourse: (id) => set((s) => ({ courses: s.courses.filter((c) => c.id !== id) })),

  projects: seedProjects,
  addProject: (p) => set((s) => ({ projects: [p, ...s.projects] })),
  updateProject: (id, patch) =>
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

  compliance: seedCompliance,
  updateCompliance: (id, patch) =>
    set((s) => ({ compliance: s.compliance.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  addCompliance: (c) => set((s) => ({ compliance: [c, ...s.compliance] })),

  subjectRoutes: seedSubjectRoutes,
  updateSubjectRoute: (id, patch) =>
    set((s) => ({ subjectRoutes: s.subjectRoutes.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  manualSwitchRoute: (id, toModel, reason) =>
    set((s) => {
      const route = s.subjectRoutes.find((r) => r.id === id)
      if (!route) return s
      const modelMap: Record<string, string> = { primary: `${route.primaryModel} ${route.primaryVersion}`, fallback: `${route.fallbackModel} ${route.fallbackVersion}`, general_fallback: '通用大模型 v3.0' }
      const fromLabel = route.currentModel === 'primary' ? `${route.primaryModel} ${route.primaryVersion}` : route.currentModel === 'fallback' ? `${route.fallbackModel} ${route.fallbackVersion}` : '通用大模型 v3.0'
      const toLabel = modelMap[toModel]
      const history: SwitchHistory = { id: `SH${Date.now()}`, time: new Date().toLocaleString('zh-CN', { hour12: false }), subject: route.subject, fromModel: fromLabel, toModel: toLabel, type: '手动', reason, operator: s.currentUser || '超级管理员' }
      const currentModel = toModel === 'primary' ? 'primary' as const : toModel === 'fallback' ? 'fallback' as const : 'general_fallback' as const
      return {
        subjectRoutes: s.subjectRoutes.map((r) => (r.id === id ? { ...r, currentModel } : r)),
        switchHistories: [history, ...s.switchHistories],
        logs: [{ id: `L${Date.now()}`, operator: s.currentUser || '超级管理员', actionType: '处置', resourceType: 'AI模型路由', resourceId: id, desc: `手动切换 ${route.subject} 模型：${fromLabel} → ${toLabel}，原因：${reason}`, before: fromLabel, after: toLabel, ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true }, ...s.logs],
      }
    }),
  testConnectivity: (id) =>
    set((s) => ({
      subjectRoutes: s.subjectRoutes.map((r) => {
        if (r.id !== id) return r
        const rand = Math.random()
        const connectivity = rand > 0.7 ? '均不可用' : rand > 0.4 ? '仅兜底可用' : '主可用'
        return { ...r, connectivity }
      }),
    })),
  switchHistories: seedSwitchHistories,
  subjectAvailabilities: seedSubjectAvailabilities,
  updateAvailability: (id, patch) =>
    set((s) => ({ subjectAvailabilities: s.subjectAvailabilities.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
  aiSafetyConfig: seedAISafetyConfig,
  updateSafetyConfig: (patch) =>
    set((s) => ({ aiSafetyConfig: { ...s.aiSafetyConfig, ...patch } })),
  aiCallLogs: seedAiCallLogs,
  aiAlerts: seedAiAlerts,
  handleAlert: (id, status, meta) =>
    set((s) => ({
      aiAlerts: s.aiAlerts.map((a) => {
        if (a.id !== id) return a
        const now = new Date().toLocaleString('zh-CN', { hour12: false })
        const op = meta?.operator || '管理员'
        const records = a.handlingRecords || []
        const newRecord = meta?.content ? [...records, { time: now, operator: op, content: meta.content }] : records
        const updates: Partial<AiAlert> = { status }
        if (status === '已解决') {
          updates.handledBy = op
          updates.handledAt = now
          updates.handlingRecords = newRecord
        } else if (status === '已认领') {
          updates.claimedBy = op
          updates.claimedAt = now
        } else if (status === '处理中') {
          updates.handler = op
        } else if (status === '已关闭') {
          updates.handledBy = op
          updates.handledAt = now
        }
        if (meta?.content && status !== '已解决') {
          updates.handlingRecords = newRecord
        }
        return { ...a, ...updates }
      }),
    })),

  connectedModels: seedConnectedModels,
  addConnectedModel: (m) =>
    set((s) => ({
      connectedModels: [...s.connectedModels, { ...m, id: `CM${Date.now()}` }],
    })),
  updateConnectedModel: (id, patch) =>
    set((s) => ({
      connectedModels: s.connectedModels.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  removeConnectedModel: (id) =>
    set((s) => ({
      connectedModels: s.connectedModels.filter((m) => m.id !== id),
    })),
  toggleModelEnable: (id) =>
    set((s) => {
      const target = s.connectedModels.find((x) => x.id === id)
      if (!target) return s
      return {
        connectedModels: s.connectedModels.map((m) =>
          m.id === id ? { ...m, enabled: !m.enabled } : m
        ),
      }
    }),
  copyConnectedModel: (id) =>
    set((s) => {
      const source = s.connectedModels.find((m) => m.id === id)
      if (!source) return s
      const copy: ConnectedModel = {
        ...source,
        id: `CM${Date.now()}`,
        enabled: false,
        modelName: source.modelName + ' (副本)',
        version: source.version,
        releaseDate: source.releaseDate,
      }
      return { connectedModels: [...s.connectedModels, copy] }
    }),

  reorderConnectedModels: (ordered) => set({ connectedModels: ordered }),

  modelVersions: seedModelVersions,
  markCurrentVersion: (versionId) =>
    set((s) => ({
      modelVersions: s.modelVersions.map((v) => {
        if (v.id === versionId) return { ...v, isCurrent: true }
        if (v.isCurrent && v.connectedModelId === s.modelVersions.find((x) => x.id === versionId)?.connectedModelId)
          return { ...v, isCurrent: false }
        return v
      }),
    })),
  rollbackVersion: (versionId) =>
    set((s) => {
      const target = s.modelVersions.find((v) => v.id === versionId)
      if (!target) return s
      return {
        modelVersions: s.modelVersions.map((v) => {
          if (v.id === versionId) return { ...v, isCurrent: true }
          if (v.isCurrent && v.connectedModelId === target.connectedModelId)
            return { ...v, isCurrent: false }
          return v
        }),
      }
    }),

  alertRules: seedAlertRules,
  addAlertRule: (r) =>
    set((s) => ({
      alertRules: [...s.alertRules, { ...r, id: `AR${Date.now()}` }],
    })),
  updateAlertRule: (id, patch) =>
    set((s) => ({
      alertRules: s.alertRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),
  removeAlertRule: (id) =>
    set((s) => ({
      alertRules: s.alertRules.filter((r) => r.id !== id),
    })),
  toggleAlertRule: (id) =>
    set((s) => ({
      alertRules: s.alertRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    })),

  semesters: seedSemesters,
  addSemester: (sem) => set((s) => ({ semesters: [...s.semesters, sem] })),
  updateSemester: (id, patch) =>
    set((s) => ({
      semesters: s.semesters.map((sem) => (sem.id === id ? { ...sem, ...patch } : sem)),
    })),
  setCurrentSemester: (id) =>
    set((s) => ({
      semesters: s.semesters.map((sem) => {
        if (sem.id === id) return { ...sem, status: '进行中' as const, isCurrent: true }
        if (sem.isCurrent) return { ...sem, status: '已结束' as const, isCurrent: false }
        return sem
      }),
    })),
  paramGroups: seedParamGroups,
  saveParamGroup: (key, values) =>
    set((s) => ({
      paramGroups: s.paramGroups.map((g) => {
        if (g.key !== key) return g
        const now = new Date().toLocaleString('zh-CN', { hour12: false })
        return {
          ...g,
          fields: g.fields.map((f) => ({ ...f, value: values[f.key] ?? f.value })),
          history: [
            { time: now, operator: get().currentUser || '超级管理员', changes: '参数配置变更', values: { ...values } },
            ...g.history,
          ],
        }
      }),
    })),
  rollbackParamGroup: (key) =>
    set((s) => ({
      paramGroups: s.paramGroups.map((g) => {
        if (g.key !== key || g.history.length === 0) return g
        const [latest, ...rest] = g.history
        return {
          ...g,
          fields: g.fields.map((f) => ({ ...f, value: latest.values[f.key] ?? f.value })),
          history: rest,
        }
      }),
    })),
  notices: seedNotices,
  addNotice: (n) => set((s) => ({ notices: [n, ...s.notices] })),
  updateNotice: (id, patch) =>
    set((s) => ({ notices: s.notices.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
  deleteNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  reorderNotices: (reordered) => set({ notices: reordered }),

  logs: seedLogs,
  addLog: (l) => set((s) => ({ logs: [l, ...s.logs] })),
}))
