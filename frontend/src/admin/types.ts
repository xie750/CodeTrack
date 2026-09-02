// ===== 全局通用类型 =====

export type AccountStatus = '已启用' | '待激活' | '已停用'
export type LoginStatus = '在线' | '离线'

export interface Teacher {
  id: string // 工号
  name: string
  dept: string
  title: string
  email: string
  phone: string
  status: AccountStatus
  loginStatus: LoginStatus
  lastActiveAt: string
  createdAt: string
  assetCount: number // 名下资源/条目数（停用处置时用）
}

export interface Student {
  id: string // 学号
  name: string
  gender: '男' | '女'
  grade: string
  dept: string
  className?: string
  courseName: string
  enrolledCourses?: string[]
  status: AccountStatus
  loginStatus: LoginStatus
  lastActiveAt: string
  createdAt: string
}

export interface EnrolledStudent {
  id: string
  name: string
  gender: '男' | '女'
}

export interface EnrollmentChange {
  time: string
  studentId: string
  name: string
  action: '加入' | '移除'
  operator: string
}

export type CourseStatus = '进行中' | '筹备中' | '已归档'

export interface CourseItem {
  id: string
  name: string
  teacher: string
  majorName?: string
  semester: string
  hours: number
  model: string
  status: CourseStatus
  studentCount: number
  classCount: number
  classNames?: string[]
  knowledgePoints?: string[]
  taskCount?: number
  knowledgeBaseStatus?: '未配置' | '待发布' | '已开放'
  studentPortalStatus?: '未开放' | '已开放'
  teacherWorkspaceStatus?: '未绑定' | '已绑定'
  students: EnrolledStudent[]
  enrollmentChanges: EnrollmentChange[]
}

// ===== 科研管理 =====
export type ProjectStatus = '草稿' | '待审核' | '进行中' | '已结项' | '已驳回'
export type OutputType = '前沿报告' | '文献综述' | '数据分析报告' | '论文框架' | '热点图谱'

export interface ProjectMember {
  name: string
  id: string
  role: '负责人' | '核心成员' | '参与学生' | '外部协作'
}

export interface ProjectOutput {
  id: string
  type: OutputType
  title: string
  status: '已入库' | '待入库'
  aiGenerated: boolean
  generatedAt: string
  refCount: number
}

export interface ProjectMilestone {
  name: string
  progress: number // 完成度 %
  dueDate: string
}

export interface ProjectChange {
  time: string
  content: string
  operator: string
}

export interface ProjectItem {
  id: string
  name: string
  discipline: string
  leader: string
  status: ProjectStatus
  members: ProjectMember[]
  outputs: ProjectOutput[]
  milestones: ProjectMilestone[]
  changes: ProjectChange[]
  createdAt: string
  updatedAt: string
  stageProgress: number
  warning?: string // 进度停滞预警
  rejectReason?: string
}

export type ComplianceDimension =
  | '数据合规'
  | '引用真实性'
  | 'AI 标识'
  | '学术伦理'
  | '伪造检测'
export type Severity = '高' | '中' | '低'
export type ComplianceStatus = '待处理' | '已处置'

export interface ComplianceItem {
  id: string
  projectName: string
  outputTitle: string
  dimension: ComplianceDimension
  result: '疑似违规' | '合规'
  severity: Severity
  status: ComplianceStatus
  aiDetected: boolean
  summary: string
  aiHints: string[]
  issue: string
  detectedAt: string
  handledAt?: string
  handler?: string
  handleMethod?: '修改' | '下架' | '通知整改'
}

// ===== AI 运维管控 =====

// 已接入的模型实例
export interface ConnectedModel {
  id: string
  subjectRouteId: string
  modelType: 'primary' | 'fallback'
  nickname: string      // 昵称（显示用，如"Python程序设计"）
  modelName: string     // 接入模型名称（技术标识）
  version: string
  releaseDate: string
  notes: string
  url: string
  apiKey: string
  enabled: boolean
}

// 模型版本
export interface ModelVersion {
  id: string
  connectedModelId: string
  version: string
  releaseDate: string
  changelog: string
  isCurrent: boolean
}

// 学科模型路由
export interface TriggerConfig {
  timeoutMs: number
  consecutiveFailures: number
  http5xx: boolean
  authFailure: boolean
  successRateThreshold: number
}

export interface SubjectRoute {
  id: string
  subject: string
  primaryModel: string
  primaryVersion: string
  fallbackModel: string
  fallbackVersion: string
  currentModel: 'primary' | 'fallback' | 'general_fallback' | 'unavailable'
  triggerConfig: {
    toFallback: TriggerConfig   // 垂类→通用 的触发条件
    toPrimary: TriggerConfig    // 通用→垂类 的触发条件（回切）
  }
  connectivity: '未测试' | '主可用' | '兜底可用' | '均不可用' | '仅兜底可用'
  online: boolean
}

// 模型切换历史
export interface SwitchHistory {
  id: string
  time: string
  subject: string
  fromModel: string
  toModel: string
  type: '自动' | '手动'
  reason: string
  operator?: string
}

// 学科可用范围配置
export interface SubjectAvailability {
  id: string
  subject: string
  open: boolean
  allowedScope: string
  dailyCallLimit: number
  dailyTokenLimit: number
  singleUserConcurrency: number
}

// AI 调用日志
export interface AiCallLog {
  id: string
  requestId: string
  time: string
  user: string
  subject: string
  feature: string
  planModel: string
  actualModel: string
  fallbackTriggered: boolean
  fallbackLevel: 0 | 1 | 2 | 3
  status: '成功' | '失败' | '超时' | '限流'
  latency: string
  tokenUsed: number
  errorInfo?: string
}

// 告警处置记录
export interface AlertHandlingRecord {
  time: string
  operator: string
  content: string
}

// 告警状态
export type AlertStatus = '待处理' | '已认领' | '处理中' | '已解决' | '已关闭'

// 异常告警
export interface AiAlert {
  id: string
  time: string
  subject: string
  level: '严重' | '警告' | '提示'
  type: '服务失联' | '大面积报错' | '并发过载' | '接口超时' | '兜底切换' | '其他异常'
  summary: string
  detail: string
  status: AlertStatus
  handledBy?: string
  handledAt?: string
  claimedBy?: string
  claimedAt?: string
  handler?: string
  handlingRecords?: AlertHandlingRecord[]
}

// 告警规则配置
export interface AlertRule {
  id: string
  metric: '延迟' | '成功率' | '错误率' | '调用量'
  threshold: number
  statisticalWindow: '1分钟' | '5分钟' | '15分钟' | '1小时'
  alertLevel: '提示' | '警告' | '严重'
  enabled: boolean
  subject: string
  createdAt: string
}

// AI 内容安全与数据留存配置
export interface AISafetyConfig {
  sensitiveWordsEnabled: boolean
  ioSafetyCheckEnabled: boolean
  personalInfoDesensitize: boolean
  logRetentionDays: number
}

// ===== 系统设置 =====
export interface Semester {
  id: string
  name: string
  year: string
  start: string
  end: string
  status: '未开始' | '进行中' | '已结束'
  isCurrent: boolean
}

export interface ParamHistory {
  time: string
  operator: string
  changes: string
  values: Record<string, unknown>
}

export interface ParamGroup {
  key: string
  label: string
  desc: string
  fields: {
    key: string
    label: string
    type: 'input' | 'switch' | 'slider' | 'select' | 'number'
    value: unknown
    options?: { label: string; value: string }[]
    suffix?: string
    min?: number
    max?: number
  }[]
  history: ParamHistory[]
}

export type NoticeStatus = '草稿' | '已发布' | '已撤回' | '已到期'
export type NoticeAudience = '全体学生' | '全体教师' | '全体师生' | '人工智能专业师生'

export interface Notice {
  id: string
  title: string
  content: string
  audience: NoticeAudience
  status: NoticeStatus
  pinned: boolean
  readCount: number
  totalCount: number
  author: string
  createdAt: string
  publishAt?: string
  expireAt?: string
}

export type LogActionType =
  | '创建'
  | '编辑'
  | '删除'
  | '审核'
  | '导出'
  | '权限变更'
  | '登录'
  | '处置'
  | '审批'

export interface OperationLog {
  id: string
  operator: string
  actionType: LogActionType
  resourceType: string
  resourceId: string
  desc: string
  before: string
  after: string
  ip: string
  ua: string
  time: string
  sensitive: boolean
}

// ===== 个人中心 =====
export interface UserProfile {
  avatar?: string // base64 data URL
  nickname: string
  realName: string
  bio: string
  phone: string // 脱敏展示，如 138****8888
  qq: string // 脱敏展示，如 12****90
  email: string // 脱敏展示，如 a***@qq.com
}

export interface LoginDevice {
  id: string
  deviceName: string
  deviceIcon: 'pc' | 'mobile' | 'tablet'
  os: string
  browser: string
  ip: string
  location: string
  loginTime: string
  isCurrent: boolean
}

export type VerifyMethod = 'sms' | 'qq' | 'email'

// ===== 工作台 =====
export type TimeRange = '本月' | '本学期' | '本年度' | '全部'

export interface TodoItem {
  id: string
  type: '教学安排待补齐' | '知识库待开放' | 'AI 服务告警'
  title: string
  count: number
  severity: Severity | 'info'
  target: string // 跳转路径
  filter: Record<string, string> // 预筛选参数
}
