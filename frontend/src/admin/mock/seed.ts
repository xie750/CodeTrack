import type {
  Teacher,
  Student,
  CourseItem,
  SubjectRoute,
  SwitchHistory,
  SubjectAvailability,
  ConnectedModel,
  ModelVersion,
  AiCallLog,
  AiAlert,
  AlertRule,
  AISafetyConfig,
  AuthoritativeKnowledgeBase,
  Semester,
  ParamGroup,
  Notice,
  OperationLog,
} from '@admin/types'

// ===================== 用户与组织 =====================
export const seedTeachers: Teacher[] = [
  { id: 'T1001', name: '王老师', dept: '人工智能学院', title: '教授', email: 'wang@codetrack.edu.cn', phone: '13800001001', status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 09:41', createdAt: '2025-03-01', assetCount: 24 },
  { id: 'T1002', name: '李老师', dept: '人工智能学院', title: '副教授', email: 'li@codetrack.edu.cn', phone: '13800001002', status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-07 22:15', createdAt: '2025-03-01', assetCount: 17 },
  { id: 'T1003', name: '陈老师', dept: '人工智能学院', title: '讲师', email: 'chen@codetrack.edu.cn', phone: '13800001003', status: '待激活', loginStatus: '离线', lastActiveAt: '—', createdAt: '2026-08-05', assetCount: 0 },
]

export const seedStudents: Student[] = [
  { id: 'U2024001', name: '王同学', gender: '女', grade: '2024级', dept: '人工智能', className: '人工智能 1 班', courseName: '数据结构', enrolledCourses: ['机器学习', 'Python 程序设计', '数据结构'], status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 09:12', createdAt: '2026-02-20' },
  { id: 'U2024002', name: '刘同学', gender: '男', grade: '2024级', dept: '人工智能', className: '人工智能 2 班', courseName: '数据结构', enrolledCourses: ['数据结构'], status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-07 21:36', createdAt: '2026-02-20' },
  { id: 'U2024003', name: '张同学', gender: '男', grade: '2024级', dept: '人工智能', className: '人工智能 1 班', courseName: 'Python 程序设计', enrolledCourses: ['机器学习', 'Python 程序设计', '数据结构'], status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 08:47', createdAt: '2026-02-20' },
  { id: 'U2024004', name: '赵同学', gender: '男', grade: '2024级', dept: '人工智能', className: '人工智能 1 班', courseName: '机器学习', enrolledCourses: ['机器学习', 'Python 程序设计', '数据结构'], status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-06 20:15', createdAt: '2026-02-20' },
  { id: 'U2024005', name: '陈同学', gender: '女', grade: '2024级', dept: '人工智能', className: '人工智能 1 班', courseName: '机器学习', enrolledCourses: ['机器学习', 'Python 程序设计', '数据结构'], status: '待激活', loginStatus: '离线', lastActiveAt: '—', createdAt: '2026-08-05' },
]

export const seedCourses: CourseItem[] = [
  {
    id: 'course_ds_001', name: '数据结构', teacher: '王老师', majorName: '人工智能', semester: '2026-demo', hours: 64, model: '数据结构课程垂类模型', status: '进行中', studentCount: 2, classCount: 2,
    classNames: ['人工智能 1 班', '人工智能 2 班'],
    knowledgePoints: ['链表', '栈与队列', '二叉树', '递归'],
    taskCount: 5,
    knowledgeBaseStatus: '已开放',
    studentPortalStatus: '已开放',
    teacherWorkspaceStatus: '已绑定',
    students: [
      { id: 'U2024001', name: '王同学', gender: '女' },
      { id: 'U2024002', name: '刘同学', gender: '男' },
    ],
    enrollmentChanges: [
      { time: '2026-08-02', studentId: 'U2024002', name: '刘同学', action: '加入', operator: '管理员' },
      { time: '2026-07-15', studentId: 'U2024018', name: '何同学', action: '移除', operator: '王老师' },
    ],
  },
  {
    id: 'course_network_001', name: 'Python 程序设计', teacher: '李老师', majorName: '人工智能', semester: '2026-demo', hours: 48, model: 'Python 程序设计课程垂类模型', status: '进行中', studentCount: 3, classCount: 1,
    classNames: ['人工智能 1 班'],
    knowledgePoints: ['函数', '列表字典', 'NumPy 数组', 'Pandas 数据处理'],
    taskCount: 1,
    knowledgeBaseStatus: '已开放',
    studentPortalStatus: '已开放',
    teacherWorkspaceStatus: '已绑定',
    students: [
      { id: 'U2024001', name: '王同学', gender: '女' },
      { id: 'U2024003', name: '张同学', gender: '男' },
      { id: 'U2024004', name: '赵同学', gender: '男' },
    ],
    enrollmentChanges: [],
  },
  {
    id: 'course_arch_001', name: '机器学习', teacher: '王老师', majorName: '人工智能', semester: '2026-demo', hours: 56, model: '机器学习课程垂类模型', status: '进行中', studentCount: 3, classCount: 1,
    classNames: ['人工智能 1 班'],
    knowledgePoints: ['监督学习', '模型评估', '过拟合', '正则化', '数据集划分'],
    taskCount: 2,
    knowledgeBaseStatus: '待发布',
    studentPortalStatus: '已开放',
    teacherWorkspaceStatus: '已绑定',
    students: [
      { id: 'U2024001', name: '王同学', gender: '女' },
      { id: 'U2024004', name: '赵同学', gender: '男' },
      { id: 'U2024005', name: '陈同学', gender: '女' },
    ],
    enrollmentChanges: [],
  },
]

// ===================== AI 运维管控 =====================

export const seedSubjectRoutes: SubjectRoute[] = [
  { id: 'SR1', subject: '人工智能', primaryModel: '人工智能专业垂类大模型', primaryVersion: 'v2.1', fallbackModel: '通用大模型', fallbackVersion: 'v3.0', currentModel: 'primary', triggerConfig: {
    toFallback: { timeoutMs: 10000, consecutiveFailures: 3, http5xx: true, authFailure: true, successRateThreshold: 90 },
    toPrimary: { timeoutMs: 30000, consecutiveFailures: 5, http5xx: false, authFailure: false, successRateThreshold: 95 },
  }, connectivity: '主可用', online: true },
]

export const seedSwitchHistories: SwitchHistory[] = [
  { id: 'SH1', time: '2026-08-09 09:45:00', subject: '人工智能', fromModel: '人工智能专业垂类大模型 v2.1', toModel: '通用大模型 v3.0', type: '自动', reason: '连续 5 次 HTTP 500 错误，自动触发兜底切换', operator: '系统自动' },
  { id: 'SH2', time: '2026-08-08 14:30:00', subject: '人工智能', fromModel: '通用大模型 v3.0', toModel: '人工智能专业垂类大模型 v2.1', type: '手动', reason: '垂类模型恢复，手动切回', operator: '管理员' },
  { id: 'SH3', time: '2026-08-06 20:00:00', subject: '人工智能', fromModel: '人工智能专业垂类大模型 v2.1', toModel: '通用大模型 v3.0', type: '自动', reason: '成功率降至 78%，低于阈值 85%', operator: '系统自动' },
]

export const seedConnectedModels: ConnectedModel[] = [
  { id: 'CM1', subjectRouteId: 'SR1', modelType: 'primary', nickname: '人工智能专业垂类', modelName: 'ai-major-vertical-v2.1', version: 'v2.1', releaseDate: '2026-08-01', notes: '主路由模型，用于人工智能专业学习诊断、代码审阅与资源生成', url: 'https://api.codetrack.ai/vertical/ai-major/v2.1', apiKey: 'sk-ct-****a1b2', enabled: true },
  // 课程垂类大模型
  { id: 'CM3', subjectRouteId: 'SR1', modelType: 'primary', nickname: 'Python程序设计', modelName: 'course-python-v2.3', version: 'v2.3', releaseDate: '2026-07-18', notes: 'Python语言课程专用垂类模型', url: 'https://api.codetrack.ai/course/python/v2.3', apiKey: 'sk-ct-****p3t4', enabled: true },
  { id: 'CM5', subjectRouteId: 'SR1', modelType: 'primary', nickname: '机器学习', modelName: 'course-machine-learning-v3.1', version: 'v3.1', releaseDate: '2026-08-05', notes: '机器学习课程专用垂类模型', url: 'https://api.codetrack.ai/course/machine-learning/v3.1', apiKey: 'sk-ct-****m7l8', enabled: true },
  { id: 'CM6', subjectRouteId: 'SR1', modelType: 'primary', nickname: '数据结构', modelName: 'course-data-structure-v2.0', version: 'v2.0', releaseDate: '2026-07-10', notes: '数据结构课程专用垂类模型', url: 'https://api.codetrack.ai/course/data-structure/v2.0', apiKey: 'sk-ct-****d9s0', enabled: true },
  { id: 'CM2', subjectRouteId: 'SR1', modelType: 'fallback', nickname: '通用大模型', modelName: 'general-v3.0', version: 'v3.0', releaseDate: '2026-07-20', notes: '', url: 'https://api.codetrack.ai/general/v3.0', apiKey: 'sk-ct-****c3d4', enabled: false },
]

export const seedModelVersions: ModelVersion[] = [
  { id: 'MV1', connectedModelId: 'CM1', version: 'v2.1', releaseDate: '2026-08-01', changelog: '优化代码生成质量，修复长文本截断问题，新增多语言支持', isCurrent: true },
  { id: 'MV2', connectedModelId: 'CM1', version: 'v2.0', releaseDate: '2026-07-15', changelog: '升级底层推理引擎，引入上下文感知机制，提升复杂场景准确率 12%', isCurrent: false },
  { id: 'MV3', connectedModelId: 'CM1', version: 'v1.8', releaseDate: '2026-06-20', changelog: '修复内存泄漏，优化并发处理能力', isCurrent: false },
  { id: 'MV4', connectedModelId: 'CM1', version: 'v1.7', releaseDate: '2026-05-10', changelog: '初始生产版本', isCurrent: false },
]

export const seedSubjectAvailabilities: SubjectAvailability[] = [
  { id: 'SA1', subject: '人工智能', open: true, allowedScope: '全体学生', dailyCallLimit: 10000, dailyTokenLimit: 5000000, singleUserConcurrency: 5 },
]

export const seedAiCallLogs: AiCallLog[] = [
  { id: 'CL1', requestId: 'req-20260809-a001', time: '2026-08-09 10:23:15', user: '王老师', subject: '人工智能', feature: '数据结构代码诊断', planModel: '人工智能专业垂类大模型', actualModel: '人工智能专业垂类大模型', fallbackTriggered: false, fallbackLevel: 0, status: '成功', latency: '1.2s', tokenUsed: 2048 },
  { id: 'CL2', requestId: 'req-20260809-a002', time: '2026-08-09 10:22:48', user: '王同学', subject: '人工智能', feature: '机器学习概念问答', planModel: '人工智能专业垂类大模型', actualModel: '通用大模型', fallbackTriggered: true, fallbackLevel: 1, status: '成功', latency: '3.1s', tokenUsed: 512 },
  { id: 'CL3', requestId: 'req-20260809-a003', time: '2026-08-09 10:21:33', user: '李老师', subject: '人工智能', feature: 'Python 练习诊断', planModel: '人工智能专业垂类大模型', actualModel: '人工智能专业垂类大模型', fallbackTriggered: false, fallbackLevel: 0, status: '超时', latency: '12.4s', tokenUsed: 0, errorInfo: '请求超时 >10s' },
  { id: 'CL4', requestId: 'req-20260809-a004', time: '2026-08-09 10:20:12', user: '系统', subject: '人工智能', feature: '知识问答', planModel: '通用大模型', actualModel: '通用大模型', fallbackTriggered: false, fallbackLevel: 0, status: '成功', latency: '0.9s', tokenUsed: 4096 },
  { id: 'CL5', requestId: 'req-20260809-a005', time: '2026-08-09 10:18:55', user: '刘洋', subject: '人工智能', feature: '学习画像建议', planModel: '人工智能专业垂类大模型', actualModel: '通用大模型', fallbackTriggered: true, fallbackLevel: 1, status: '失败', latency: '—', tokenUsed: 0, errorInfo: '500 Internal Server Error' },
  { id: 'CL6', requestId: 'req-20260809-a006', time: '2026-08-09 10:17:40', user: '李老师', subject: '人工智能', feature: '学习资料生成', planModel: '通用大模型', actualModel: '通用大模型', fallbackTriggered: false, fallbackLevel: 0, status: '限流', latency: '0.1s', tokenUsed: 0, errorInfo: 'QPS 超限' },
]

export const seedAiAlerts: AiAlert[] = [
  { id: 'AL1', time: '2026-08-10 10:21:35', subject: '人工智能', level: '警告', type: '兜底切换', summary: '垂类模型连续 5 次 500 错误，已自动切至通用大模型', detail: '人工智能专业垂类大模型持续返回 HTTP 500，已触发自动熔断切换至通用大模型 v3.0。请排查垂类模型服务状态。', status: '待处理' },
  { id: 'AL2', time: '2026-08-10 09:45:00', subject: '人工智能', level: '严重', type: '服务失联', summary: '垂类模型服务失联，已自动切换', detail: '人工智能专业垂类大模型主链路连续 5 次心跳检测失败，已触发自动熔断切换至通用大模型 v3.0。', status: '已认领', claimedBy: '王老师', claimedAt: '2026-08-10 09:50:00' },
  { id: 'AL3', time: '2026-08-09 21:30:00', subject: '人工智能', level: '提示', type: '并发过载', summary: '瞬时并发接近上限', detail: '21:28-21:30 期间人工智能专业垂类并发量接近上限，建议关注是否需扩容或调整配额', status: '处理中', claimedBy: '管理员', claimedAt: '2026-08-09 21:35:00', handler: '管理员', handlingRecords: [
    { time: '2026-08-09 21:35:00', operator: '管理员', content: '已认领告警，开始排查并发来源' },
    { time: '2026-08-09 21:45:00', operator: '管理员', content: '确认瞬时峰值来自代码审查批量任务，已临时限流' },
  ]},
  { id: 'AL4', time: '2026-08-09 14:10:00', subject: '人工智能', level: '警告', type: '接口超时', summary: '垂类模型接口响应时间超过阈值', detail: '13:50-14:10 期间人工智能专业垂类接口多次超时超过 10s，触发告警。经排查为下游资源波动，已恢复。', status: '已解决', claimedBy: '李老师', claimedAt: '2026-08-09 14:15:00', handler: '李老师', handledBy: '管理员', handledAt: '2026-08-09 15:30:00', handlingRecords: [
    { time: '2026-08-09 14:15:00', operator: '李老师', content: '已认领，开始排查下游服务状态' },
    { time: '2026-08-09 14:30:00', operator: '李老师', content: '定位到下游 GPU 资源池波动，已联系基础设施团队' },
    { time: '2026-08-09 15:00:00', operator: '李老师', content: '下游资源已恢复，模型响应时间恢复正常' },
  ]},
  { id: 'AL5', time: '2026-08-08 11:00:00', subject: '人工智能', level: '提示', type: '其他异常', summary: 'API Key 调用频率接近限额', detail: '近1小时 API Key 使用量已达配额的 85%，建议关注是否需要提升配额', status: '已关闭', handledBy: '管理员', handledAt: '2026-08-08 12:00:00' },
]

export const seedAlertRules: AlertRule[] = [
  { id: 'AR1', metric: '延迟', threshold: 3000, statisticalWindow: '5分钟', alertLevel: '警告', enabled: true, subject: '人工智能', createdAt: '2026-08-01' },
  { id: 'AR2', metric: '成功率', threshold: 95, statisticalWindow: '1分钟', alertLevel: '严重', enabled: true, subject: '人工智能', createdAt: '2026-08-02' },
  { id: 'AR3', metric: '错误率', threshold: 5, statisticalWindow: '15分钟', alertLevel: '警告', enabled: false, subject: '人工智能', createdAt: '2026-08-03' },
  { id: 'AR4', metric: '调用量', threshold: 10000, statisticalWindow: '1小时', alertLevel: '提示', enabled: true, subject: '人工智能', createdAt: '2026-08-04' },
  { id: 'AR5', metric: '延迟', threshold: 5000, statisticalWindow: '1小时', alertLevel: '提示', enabled: true, subject: '人工智能', createdAt: '2026-08-05' },
]

export const seedAISafetyConfig: AISafetyConfig = {
  sensitiveWordsEnabled: true,
  ioSafetyCheckEnabled: true,
  personalInfoDesensitize: true,
  logRetentionDays: 180,
}

export const seedAuthoritativeKnowledgeBases: AuthoritativeKnowledgeBase[] = [
  {
    id: 'AKB-ML-001',
    subject: '人工智能专业',
    courseName: '机器学习',
    version: '2026.09',
    status: '待审核',
    owner: '王老师',
    coverageRate: 78,
    sourceCount: 5,
    chunkCount: 186,
    citationPassRate: 94,
    retrievalPriority: 1,
    publishScope: '人工智能 1 班 / 机器学习课程任务 / AI 导师问答',
    lastUpdatedAt: '2026-09-02 16:20',
    retrievalPolicy: '优先召回平台权威知识源；命中不足时补充教师发布资料；学生自建库仅作为个人上下文补充。',
    qualityGates: ['来源身份已登记', '章节与知识点已映射', '引用片段可回溯', '低置信回答触发复核'],
    sources: [
      { id: 'MLS-1', title: '机器学习课程核心知识点大纲', kind: '课程标准', publisher: '人工智能学院', chapter: '课程目标与知识单元', status: '已审定', reviewer: '王老师', chunkCount: 34, qualityScore: 96, updatedAt: '2026-09-01' },
      { id: 'MLS-2', title: '监督学习与模型评估讲义', kind: '教师审定讲义', publisher: '机器学习课程组', chapter: '监督学习 / 评估指标', status: '已审定', reviewer: '李老师', chunkCount: 48, qualityScore: 94, updatedAt: '2026-09-02' },
      { id: 'MLS-3', title: '过拟合与正则化专题材料', kind: '教材', publisher: '课程指定教材', chapter: '模型选择', status: '待审核', reviewer: '王老师', chunkCount: 41, qualityScore: 88, updatedAt: '2026-09-02' },
    ],
  },
  {
    id: 'AKB-PY-001',
    subject: '人工智能专业',
    courseName: 'Python 程序设计',
    version: '2026.09',
    status: '已发布',
    owner: '李老师',
    coverageRate: 86,
    sourceCount: 6,
    chunkCount: 224,
    citationPassRate: 97,
    retrievalPriority: 1,
    publishScope: '人工智能专业学生 / Python 任务诊断 / 自主学习内容生成',
    lastUpdatedAt: '2026-09-03 10:10',
    retrievalPolicy: '函数、列表字典、NumPy 与 Pandas 问答先检索平台权威库，再补充教师任务资料。',
    qualityGates: ['代码示例可运行', '输入输出说明完整', '来源片段含章节信息', '生成练习必须绑定知识点'],
    sources: [
      { id: 'PYS-1', title: 'Python 函数与参数传递规范讲义', kind: '教师审定讲义', publisher: 'Python 课程组', chapter: '函数', status: '已审定', reviewer: '李老师', chunkCount: 39, qualityScore: 98, updatedAt: '2026-09-01' },
      { id: 'PYS-2', title: '列表、字典与数据处理基础', kind: '教材', publisher: '课程指定教材', chapter: '内置数据结构', status: '已审定', reviewer: '陈老师', chunkCount: 57, qualityScore: 95, updatedAt: '2026-09-02' },
      { id: 'PYS-3', title: 'NumPy 数组与 Pandas 数据清洗案例', kind: '题库解析', publisher: 'Python 课程组', chapter: '数据分析入门', status: '已审定', reviewer: '李老师', chunkCount: 44, qualityScore: 93, updatedAt: '2026-09-03' },
    ],
  },
  {
    id: 'AKB-DS-001',
    subject: '人工智能专业',
    courseName: '数据结构',
    version: '2026.09',
    status: '已发布',
    owner: '王老师',
    coverageRate: 91,
    sourceCount: 7,
    chunkCount: 268,
    citationPassRate: 98,
    retrievalPriority: 1,
    publishScope: '人工智能专业学生 / 数据结构课程任务 / 代码诊断',
    lastUpdatedAt: '2026-09-04 09:35',
    retrievalPolicy: '代码诊断必须先使用平台权威库中的算法概念、边界条件和样例说明，再结合测试结果生成诊断。',
    qualityGates: ['算法复杂度已标注', '代码片段与解释不拆断', '样例输入输出可追踪', '三级提示不泄露完整答案'],
    sources: [
      { id: 'DSS-1', title: '单链表边界处理讲义', kind: '教师审定讲义', publisher: '数据结构课程组', chapter: '线性表', status: '已审定', reviewer: '王老师', chunkCount: 46, qualityScore: 99, updatedAt: '2026-09-01' },
      { id: 'DSS-2', title: '栈与队列核心概念和典型题', kind: '题库解析', publisher: '数据结构课程组', chapter: '栈与队列', status: '已审定', reviewer: '李老师', chunkCount: 52, qualityScore: 96, updatedAt: '2026-09-03' },
      { id: 'DSS-3', title: '二叉树遍历与递归过程说明', kind: '教材', publisher: '课程指定教材', chapter: '树与二叉树', status: '需复核', reviewer: '王老师', chunkCount: 43, qualityScore: 82, updatedAt: '2026-09-04' },
    ],
  },
]

// ===================== 系统设置 =====================
export const seedSemesters: Semester[] = [
  { id: 'S1', name: '2025-2026学年 第一学期', year: '2025-2026', start: '2025-09-01', end: '2026-01-18', status: '已结束', isCurrent: false },
  { id: 'S2', name: '2025-2026学年 第二学期', year: '2025-2026', start: '2026-02-23', end: '2026-07-05', status: '已结束', isCurrent: false },
  { id: 'S3', name: '2026-2027学年 第一学期', year: '2026-2027', start: '2026-09-01', end: '2027-01-17', status: '进行中', isCurrent: true },
]

export const seedParamGroups: ParamGroup[] = [
  {
    key: 'password', label: '密码策略', desc: '全校统一密码强度要求', fields: [
      { key: 'minLength', label: '最小长度', type: 'slider', value: 8, suffix: '位', min: 6, max: 16 },
      { key: 'validDays', label: '有效期', type: 'number', value: 90, suffix: '天' },
      { key: 'complexity', label: '复杂度要求', type: 'select', value: '字母+数字', options: [{ label: '字母+数字', value: '字母+数字' }, { label: '字母+数字+符号', value: '字母+数字+符号' }] },
    ],
    history: [
      { time: '2026-07-01', operator: '超级管理员', changes: '最小长度 6 → 8', values: { minLength: 8 } },
    ],
  },
  {
    key: 'upload', label: '上传限制', desc: '资源上传容量限制', fields: [
      { key: 'maxFile', label: '单文件最大大小', type: 'select', value: '500 MB', options: [{ label: '200 MB', value: '200 MB' }, { label: '500 MB', value: '500 MB' }, { label: '1 GB', value: '1 GB' }] },
      { key: 'storageCap', label: '单用户存储上限', type: 'select', value: '10 GB', options: [{ label: '5 GB', value: '5 GB' }, { label: '10 GB', value: '10 GB' }, { label: '20 GB', value: '20 GB' }] },
    ],
    history: [
      { time: '2026-06-15', operator: '超级管理员', changes: '单文件上限 200MB → 500MB', values: { maxFile: '500 MB' } },
    ],
  },
  {
    key: 'session', label: '会话管理', desc: '登录会话有效期与锁定策略', fields: [
      { key: 'sessionHours', label: '会话有效期', type: 'number', value: 12, suffix: '小时' },
      { key: 'lockCount', label: '登录超时锁定次数', type: 'number', value: 5, suffix: '次' },
    ],
    history: [],
  },
  {
    key: 'notice', label: '通知设置', desc: '消息触达渠道开关', fields: [
      { key: 'emailNotify', label: '邮箱通知', type: 'switch', value: true },
      { key: 'innerNotify', label: '站内通知', type: 'switch', value: true },
    ],
    history: [],
  },
  {
    key: 'logRetention', label: '日志与数据保留', desc: '操作日志 / 登录日志保存周期与清理', fields: [
      { key: 'opLogDays', label: '用户操作日志保存周期', type: 'select', value: '180 天', options: [{ label: '90 天', value: '90 天' }, { label: '180 天', value: '180 天' }, { label: '365 天', value: '365 天' }, { label: '永久', value: '永久' }] },
      { key: 'loginLogDays', label: '登录日志保存周期', type: 'select', value: '90 天', options: [{ label: '30 天', value: '30 天' }, { label: '90 天', value: '90 天' }, { label: '180 天', value: '180 天' }] },
      { key: 'autoClean', label: '过期数据自动清理', type: 'switch', value: true },
    ],
    history: [],
  },
  {
    key: 'alertConfig', label: '告警与通知配置', desc: '系统告警阈值参数', fields: [
      { key: 'cpuThreshold', label: 'CPU 使用率告警阈值', type: 'slider', value: 80, suffix: '%', min: 50, max: 100 },
      { key: 'memThreshold', label: '内存使用率告警阈值', type: 'slider', value: 85, suffix: '%', min: 50, max: 100 },
      { key: 'diskThreshold', label: '磁盘使用率告警阈值', type: 'slider', value: 90, suffix: '%', min: 50, max: 100 },
      { key: 'latencyThreshold', label: 'API 响应延迟告警阈值', type: 'number', value: 3000, suffix: 'ms' },
      { key: 'errorRateThreshold', label: '接口错误率告警阈值', type: 'number', value: 5, suffix: '%' },
      { key: 'alertSilence', label: '重复告警静默窗口', type: 'select', value: '30 分钟', options: [{ label: '15 分钟', value: '15 分钟' }, { label: '30 分钟', value: '30 分钟' }, { label: '1 小时', value: '1 小时' }, { label: '4 小时', value: '4 小时' }] },
    ],
    history: [],
  },
]

export const seedNotices: Notice[] = [
  { id: 'N1', title: '关于启用 2026-demo 演示学期的通知', content: '平台将于 9 月 1 日正式启用人工智能专业助学演示学期，请各位老师核对课程、行政班、任务模板和知识库开放状态。', audience: '全体师生', status: '已发布', pinned: true, readCount: 1240, totalCount: 2386, author: '超级管理员', createdAt: '2026-08-01 10:00', publishAt: '2026-08-01 10:00', expireAt: '2026-09-30' },
  { id: 'N2', title: '机器学习课程知识库待发布提醒', content: '机器学习课程知识库当前处于待发布状态，请负责教师完成引用片段确认后开放给学生端 AI 助学。', audience: '人工智能专业师生', status: '已发布', pinned: false, readCount: 86, totalCount: 164, author: '超级管理员', createdAt: '2026-08-05 09:30', publishAt: '2026-08-05 09:30', expireAt: '2026-08-31' },
  { id: 'N3', title: '平台 AI 服务升级维护公告（草稿）', content: '平台将于本周六 22:00-24:00 进行垂类模型升级维护，期间 AI 辅助功能将切换至兜底模型。', audience: '全体师生', status: '草稿', pinned: false, readCount: 0, totalCount: 2386, author: '超级管理员', createdAt: '2026-08-07 16:20' },
  { id: 'N4', title: '上学期平台使用情况通报', content: '上学期平台整体运行平稳，资源访问量同比增长 32%，感谢全体师生的使用与反馈。', audience: '全体教师', status: '已撤回', pinned: false, readCount: 0, totalCount: 312, author: '超级管理员', createdAt: '2026-07-20 14:00', publishAt: '2026-07-20 14:00' },
  { id: 'N5', title: '关于规范 AI 助学内容标识的通知', content: '学生端 AI 诊断、概念讲解和资料生成内容必须展示 AI 生成标识、引用来源、置信度和下一步动作。', audience: '全体师生', status: '已发布', pinned: true, readCount: 2310, totalCount: 2386, author: '超级管理员', createdAt: '2026-07-15 09:00', publishAt: '2026-07-15 09:00', expireAt: '2026-12-31' },
]

export const seedLogs: OperationLog[] = [
  { id: 'L1', operator: '超级管理员', actionType: '权限变更', resourceType: '教师账号', resourceId: 'T1001', desc: '调整王老师的人工智能专业课程数据权限', before: '仅本人数据', after: '人工智能专业演示课程数据', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-08 10:02:11', sensitive: true },
  { id: 'L2', operator: '超级管理员', actionType: '处置', resourceType: 'AI模型路由', resourceId: 'CM3', desc: '处置 Python 程序设计模型调用超时告警', before: '待处理', after: '已处置（切换兜底）', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-07 15:30:42', sensitive: true },
  { id: 'L3', operator: '超级管理员', actionType: '审核', resourceType: '班级课程', resourceId: 'course_arch_001', desc: '确认机器学习课程开放给人工智能 1 班', before: '未开放', after: '已开放', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-07 11:22:05', sensitive: false },
  { id: 'L4', operator: '超级管理员', actionType: '导出', resourceType: '操作日志', resourceId: '—', desc: '导出近 7 天操作日志', before: '—', after: '—', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-06 17:08:33', sensitive: true },
  { id: 'L5', operator: '超级管理员', actionType: '创建', resourceType: '公告', resourceId: 'N2', desc: '发布机器学习课程知识库待发布提醒', before: '草稿', after: '已发布', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-05 09:31:10', sensitive: false },
  { id: 'L6', operator: '超级管理员', actionType: '删除', resourceType: '课程知识库', resourceId: 'KB1004', desc: '移除重复资源：链表边界处理旧版讲义', before: '正常', after: '已删除', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-04 14:20:18', sensitive: true },
  { id: 'L7', operator: 'T1001', actionType: '登录', resourceType: '账号', resourceId: 'T1001', desc: '账号登录成功', before: '—', after: '—', ip: '10.20.3.22', ua: 'Chrome/126 Windows', time: '2026-08-08 09:41:02', sensitive: false },
  { id: 'L8', operator: '超级管理员', actionType: '编辑', resourceType: '基础参数', resourceId: 'upload', desc: '调整单文件上传上限', before: '200 MB', after: '500 MB', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-06-15 10:00:00', sensitive: true },
]

// 平台运营指标（按时间范围）—— 用函数生成避免数据过于静态
// 核心指标：用户总量 / AI 调用总量 / 班级课程关系 / 学习资料生成量
export function genOpsMetrics(range: '本月' | '本学期' | '本年度' | '全部') {
  const factor: Record<string, { users: number; ai: number; projects: number; research: number }> = {
    本月: { users: 268, ai: 18240, projects: 12, research: 38 },
    本学期: { users: 3240, ai: 234500, projects: 86, research: 426 },
    本年度: { users: 4560, ai: 890200, projects: 210, research: 1192 },
    全部: { users: 7820, ai: 1520000, projects: 356, research: 2140 },
  }
  const f = factor[range]
  return { ...f }
}
