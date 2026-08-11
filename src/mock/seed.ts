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
} from '@/types'

// ===================== 用户与组织 =====================
export const seedTeachers: Teacher[] = [
  { id: 'T1001', name: '张伟明', dept: '计算机科学与技术学院', title: '教授', email: 'zhangwm@hust.edu.cn', phone: '13800001001', status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 09:41', createdAt: '2025-03-01', assetCount: 24 },
  { id: 'T1002', name: '李慧', dept: '计算机科学与技术学院', title: '副教授', email: 'lihui@hust.edu.cn', phone: '13800001002', status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-07 22:15', createdAt: '2025-03-01', assetCount: 17 },
  { id: 'T1003', name: '王建国', dept: '人工智能学院', title: '教授', email: 'wangjg@hust.edu.cn', phone: '13800001003', status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 10:02', createdAt: '2025-04-12', assetCount: 31 },
  { id: 'T1004', name: '陈晓燕', dept: '人工智能学院', title: '讲师', email: 'chenxy@hust.edu.cn', phone: '13800001004', status: '待激活', loginStatus: '离线', lastActiveAt: '—', createdAt: '2026-08-06', assetCount: 0 },
  { id: 'T1005', name: '刘强', dept: '数学与统计学院', title: '副教授', email: 'liuqiang@hust.edu.cn', phone: '13800001005', status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-05 16:30', createdAt: '2025-05-20', assetCount: 12 },
  { id: 'T1006', name: '赵敏', dept: '数学与统计学院', title: '教授', email: 'zhaomin@hust.edu.cn', phone: '13800001006', status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 09:55', createdAt: '2025-03-15', assetCount: 29 },
  { id: 'T1007', name: '孙鹏', dept: '物理学院', title: '讲师', email: 'sunpeng@hust.edu.cn', phone: '13800001007', status: '已停用', loginStatus: '离线', lastActiveAt: '2026-06-20 11:08', createdAt: '2025-06-01', assetCount: 8 },
  { id: 'T1008', name: '周丽华', dept: '化学与化工学院', title: '副教授', email: 'zhoulh@hust.edu.cn', phone: '13800001008', status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-06 19:44', createdAt: '2025-03-28', assetCount: 15 },
  { id: 'T1009', name: '吴勇', dept: '经济与管理学院', title: '教授', email: 'wuyong@hust.edu.cn', phone: '13800001009', status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 10:11', createdAt: '2025-04-02', assetCount: 20 },
  { id: 'T1010', name: '郑芳', dept: '外国语学院', title: '讲师', email: 'zhengfang@hust.edu.cn', phone: '13800001010', status: '待激活', loginStatus: '离线', lastActiveAt: '—', createdAt: '2026-08-07', assetCount: 0 },
  { id: 'T1011', name: '马涛', dept: '计算机科学与技术学院', title: '讲师', email: 'matao@hust.edu.cn', phone: '13800001011', status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-01 14:20', createdAt: '2025-07-15', assetCount: 6 },
  { id: 'T1012', name: '林静', dept: '生命科学与技术学院', title: '副教授', email: 'linjing@hust.edu.cn', phone: '13800001012', status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 09:20', createdAt: '2025-04-18', assetCount: 22 },
]

export const seedStudents: Student[] = [
  { id: 'U2024001', name: '王芳', gender: '女', grade: '2024级', dept: '计算机科学与技术', courseName: '数据结构与算法', status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 09:12', createdAt: '2026-02-20' },
  { id: 'U2024002', name: '李浩', gender: '男', grade: '2024级', dept: '计算机科学与技术', courseName: '数据结构与算法', status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-07 21:36', createdAt: '2026-02-20' },
  { id: 'U2024003', name: '张磊', gender: '男', grade: '2024级', dept: '计算机科学与技术', courseName: '操作系统', status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 08:47', createdAt: '2026-02-20' },
  { id: 'U2024004', name: '刘洋', gender: '男', grade: '2024级', dept: '人工智能', courseName: '机器学习导论', status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-06 20:15', createdAt: '2026-02-20' },
  { id: 'U2024005', name: '陈思思', gender: '女', grade: '2024级', dept: '人工智能', courseName: '机器学习导论', status: '待激活', loginStatus: '离线', lastActiveAt: '—', createdAt: '2026-08-05' },
  { id: 'U2023001', name: '赵文博', gender: '男', grade: '2023级', dept: '计算机科学与技术', courseName: '数据库系统', status: '已启用', loginStatus: '在线', lastActiveAt: '2026-08-08 10:05', createdAt: '2025-02-25' },
  { id: 'U2023002', name: '孙婷婷', gender: '女', grade: '2024级', dept: '物联网工程', courseName: '传感器原理与应用', status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-04 17:22', createdAt: '2025-02-25' },
  { id: 'U2023003', name: '周杰', gender: '男', grade: '2024级', dept: '软件工程', courseName: '软件工程导论', status: '已停用', loginStatus: '离线', lastActiveAt: '2026-05-18 10:40', createdAt: '2025-02-25' },
  { id: 'U2025001', name: '吴倩', gender: '女', grade: '2024级', dept: '物联网工程', courseName: '传感器原理与应用', status: '已启用', loginStatus: '离线', lastActiveAt: '2026-08-06 18:09', createdAt: '2026-08-01' },
  { id: 'U2025002', name: '郑凯', gender: '男', grade: '2024级', dept: '软件工程', courseName: '软件工程导论', status: '待激活', loginStatus: '离线', lastActiveAt: '—', createdAt: '2026-08-03' },
]

export const seedCourses: CourseItem[] = [
  {
    id: 'CO001', name: '数据结构与算法', teacher: '张伟明', semester: '2025-2026-2', hours: 64, model: 'DeepSeek-V3', status: '进行中', studentCount: 82, classCount: 3,
    students: [
      { id: 'U2024001', name: '王芳', gender: '女' },
      { id: 'U2024002', name: '李浩', gender: '男' },
    ],
    enrollmentChanges: [
      { time: '2026-08-02', studentId: 'U2024002', name: '李浩', action: '加入', operator: '管理员' },
      { time: '2026-07-15', studentId: 'U2024018', name: '何雨', action: '移除', operator: '张伟明' },
    ],
  },
  {
    id: 'CO002', name: '操作系统', teacher: '李慧', semester: '2026-2027-1', hours: 48, model: 'DeepSeek-V3', status: '进行中', studentCount: 40, classCount: 2,
    students: [
      { id: 'U2024003', name: '张磊', gender: '男' },
    ],
    enrollmentChanges: [],
  },
  {
    id: 'CO003', name: '机器学习导论', teacher: '王建国', semester: '2026-2027-1', hours: 56, model: 'DeepSeek-R1', status: '进行中', studentCount: 90, classCount: 4,
    students: [
      { id: 'U2024004', name: '刘洋', gender: '男' },
      { id: 'U2024005', name: '陈思思', gender: '女' },
    ],
    enrollmentChanges: [],
  },
  {
    id: 'CO004', name: '数据库系统', teacher: '李慧', semester: '2026-2027-1', hours: 48, model: 'DeepSeek-V3', status: '筹备中', studentCount: 38, classCount: 2,
    students: [
      { id: 'U2023001', name: '赵文博', gender: '男' },
    ],
    enrollmentChanges: [],
  },
  {
    id: 'CO005', name: '传感器原理与应用', teacher: '郑芳', semester: '2026-2027-1', hours: 40, model: 'DeepSeek-V3', status: '进行中', studentCount: 72, classCount: 3,
    students: [
      { id: 'U2023002', name: '孙婷婷', gender: '女' },
      { id: 'U2025001', name: '吴倩', gender: '女' },
    ],
    enrollmentChanges: [],
  },
  {
    id: 'CO006', name: '软件工程导论', teacher: '王建国', semester: '2026-2027-1', hours: 48, model: 'DeepSeek-R1', status: '已归档', studentCount: 66, classCount: 3,
    students: [
      { id: 'U2023003', name: '周杰', gender: '男' },
      { id: 'U2025002', name: '郑凯', gender: '男' },
    ],
    enrollmentChanges: [],
  },
]

// ===================== 科研管理 =====================
export const seedProjects: ProjectItem[] = [
  {
    id: 'P2026001', name: '基于大模型的课堂教学质量智能评估', discipline: '教育大数据', leader: '张伟明',
    status: '进行中',
    members: [
      { name: '张伟明', id: 'T1001', role: '负责人' },
      { name: '李慧', id: 'T1002', role: '核心成员' },
      { name: '王芳', id: 'U2024001', role: '参与学生' },
      { name: '陈博士', id: 'E01', role: '外部协作' },
    ],
    outputs: [
      { id: 'O1', type: '前沿报告', title: 'LLM 教学质量评估方法前沿综述', status: '已入库', aiGenerated: true, generatedAt: '2026-07-18', refCount: 23 },
      { id: 'O2', type: '数据分析报告', title: '课堂互动数据多维度分析', status: '已入库', aiGenerated: true, generatedAt: '2026-07-25', refCount: 11 },
    ],
    milestones: [
      { name: '文献调研与需求梳理', progress: 100, dueDate: '2026-06-30' },
      { name: '评估指标体系构建', progress: 80, dueDate: '2026-08-15' },
      { name: '模型训练与验证', progress: 30, dueDate: '2026-10-31' },
    ],
    changes: [
      { time: '2026-07-02', content: '核心成员加入：李慧', operator: '张伟明' },
      { time: '2026-07-19', content: '研究方向微调：聚焦形成性评估', operator: '张伟明' },
    ],
    createdAt: '2026-05-20', updatedAt: '2026-08-06', stageProgress: 70,
  },
  {
    id: 'P2026002', name: '面向化学合成的 AI 辅助路径规划', discipline: '计算化学', leader: '周丽华',
    status: '待审核',
    members: [{ name: '周丽华', id: 'T1008', role: '负责人' }],
    outputs: [],
    milestones: [{ name: '立项书提交', progress: 100, dueDate: '2026-08-10' }],
    changes: [],
    createdAt: '2026-08-01', updatedAt: '2026-08-07', stageProgress: 20,
  },
  {
    id: 'P2026003', name: '情感计算在学生心理预警中的应用', discipline: '人工智能', leader: '王建国',
    status: '已结项',
    members: [
      { name: '王建国', id: 'T1003', role: '负责人' },
      { name: '刘洋', id: 'U2024004', role: '参与学生' },
    ],
    outputs: [
      { id: 'O3', type: '热点图谱', title: '情感计算研究方向热点图谱', status: '已入库', aiGenerated: true, generatedAt: '2026-06-12', refCount: 34 },
      { id: 'O4', type: '论文框架', title: '融合多模态的心理预警模型框架', status: '已入库', aiGenerated: true, generatedAt: '2026-06-20', refCount: 17 },
    ],
    milestones: [{ name: '全阶段', progress: 100, dueDate: '2026-06-30' }],
    changes: [],
    createdAt: '2026-03-01', updatedAt: '2026-07-01', stageProgress: 100,
  },
  {
    id: 'P2026004', name: '高校科研经费使用效率分析', discipline: '管理科学', leader: '吴勇',
    status: '草稿',
    members: [{ name: '吴勇', id: 'T1009', role: '负责人' }],
    outputs: [],
    milestones: [],
    changes: [],
    createdAt: '2026-08-05', updatedAt: '2026-08-05', stageProgress: 5,
  },
  {
    id: 'P2026005', name: '基于知识图谱的课程资源推荐', discipline: '教育技术', leader: '赵敏',
    status: '已驳回',
    rejectReason: '立项论证不足，请补充技术可行性与数据来源说明',
    members: [{ name: '赵敏', id: 'T1006', role: '负责人' }],
    outputs: [],
    milestones: [],
    changes: [],
    createdAt: '2026-07-10', updatedAt: '2026-07-22', stageProgress: 10,
  },
]

export const seedCompliance: ComplianceItem[] = [
  {
    id: 'CM1', projectName: '基于大模型的课堂教学质量智能评估', outputTitle: '课堂互动数据多维度分析',
    dimension: '数据合规', result: '疑似违规', severity: '高', status: '待处理',
    aiDetected: true, summary: '样本数据疑似包含未脱敏的学生姓名与学号',
    aiHints: ['检测到连续学号序列', '存在未掩码的个人信息字段'],
    issue: '科研数据未完成脱敏处理，报告中出现真实学生信息',
    detectedAt: '2026-08-06 10:20',
  },
  {
    id: 'CM2', projectName: '基于大模型的课堂教学质量智能评估', outputTitle: 'LLM 教学质量评估方法前沿综述',
    dimension: '引用真实性', result: '疑似违规', severity: '中', status: '待处理',
    aiDetected: true, summary: '第 5 节引用「Zhang et al., 2024」未在知识库中检索到对应文献',
    aiHints: ['引用条目在学术论文库中不存在'],
    issue: '文献引用真实性无法核验，疑似引用虚构来源',
    detectedAt: '2026-08-07 09:15',
  },
  {
    id: 'CM3', projectName: '情感计算在学生心理预警中的应用', outputTitle: '融合多模态的心理预警模型框架',
    dimension: 'AI 标识', result: '疑似违规', severity: '中', status: '已处置',
    aiDetected: true, summary: '产出由 AI 辅助生成但未标注 AI 生成标记',
    aiHints: ['文本相似度与生成模板高度一致'],
    issue: '未标注 AI 生成标记',
    detectedAt: '2026-06-22', handledAt: '2026-06-23', handler: '管理员', handleMethod: '修改',
  },
  {
    id: 'CM4', projectName: '面向化学合成的 AI 辅助路径规划', outputTitle: '立项书中实验数据来源说明',
    dimension: '伪造检测', result: '疑似违规', severity: '高', status: '待处理',
    aiDetected: true, summary: '反应收率数据与公共数据库记录存在明显偏差',
    aiHints: ['收率数值异常集中于 95%-98%'],
    issue: '实验数据来源无法核验，疑似数据伪造',
    detectedAt: '2026-08-08 08:40',
  },
  {
    id: 'CM5', projectName: '基于知识图谱的课程资源推荐', outputTitle: '课程资源推荐系统架构说明',
    dimension: '学术伦理', result: '合规', severity: '低', status: '已处置',
    aiDetected: false, summary: '内容未发现学术不端风险',
    aiHints: [],
    issue: '轻微格式问题：参考文献编号顺序不规范',
    detectedAt: '2026-07-20', handledAt: '2026-07-21', handler: '管理员', handleMethod: '通知整改',
  },
]

// ===================== AI 运维管控 =====================

export const seedSubjectRoutes: SubjectRoute[] = [
  { id: 'SR1', subject: '计算机科学与技术', primaryModel: '计算机代码垂类大模型', primaryVersion: 'v2.1', fallbackModel: '通用大模型', fallbackVersion: 'v3.0', currentModel: 'primary', triggerConfig: {
    toFallback: { timeoutMs: 10000, consecutiveFailures: 3, http5xx: true, authFailure: true, successRateThreshold: 90 },
    toPrimary: { timeoutMs: 30000, consecutiveFailures: 5, http5xx: false, authFailure: false, successRateThreshold: 95 },
  }, connectivity: '主可用', online: true },
]

export const seedSwitchHistories: SwitchHistory[] = [
  { id: 'SH1', time: '2026-08-09 09:45:00', subject: '计算机科学与技术', fromModel: '计算机代码垂类大模型 v2.1', toModel: '通用大模型 v3.0', type: '自动', reason: '连续 5 次 HTTP 500 错误，自动触发兜底切换', operator: '系统自动' },
  { id: 'SH2', time: '2026-08-08 14:30:00', subject: '计算机科学与技术', fromModel: '通用大模型 v3.0', toModel: '计算机代码垂类大模型 v2.1', type: '手动', reason: '垂类模型恢复，手动切回', operator: '管理员' },
  { id: 'SH3', time: '2026-08-06 20:00:00', subject: '计算机科学与技术', fromModel: '计算机代码垂类大模型 v2.1', toModel: '通用大模型 v3.0', type: '自动', reason: '成功率降至 78%，低于阈值 85%', operator: '系统自动' },
]

export const seedConnectedModels: ConnectedModel[] = [
  { id: 'CM1', subjectRouteId: 'SR1', modelType: 'primary', nickname: '计算机代码垂类', modelName: 'cs-code-vertical-v2.1', version: 'v2.1', releaseDate: '2026-08-01', notes: '主路由模型，用于代码生成与审阅', url: 'https://api.codetrack.ai/vertical/cs-code/v2.1', apiKey: 'sk-ct-****a1b2', enabled: true },
  // 课程垂类大模型
  { id: 'CM3', subjectRouteId: 'SR1', modelType: 'primary', nickname: 'Python程序设计', modelName: 'course-python-v2.3', version: 'v2.3', releaseDate: '2026-07-18', notes: 'Python语言课程专用垂类模型', url: 'https://api.codetrack.ai/course/python/v2.3', apiKey: 'sk-ct-****p3t4', enabled: true },
  { id: 'CM4', subjectRouteId: 'SR1', modelType: 'primary', nickname: 'Java面向对象编程', modelName: 'course-java-oop-v1.9', version: 'v1.9', releaseDate: '2026-06-25', notes: 'Java课程专用垂类模型', url: 'https://api.codetrack.ai/course/java/v1.9', apiKey: 'sk-ct-****j5v6', enabled: true },
  { id: 'CM5', subjectRouteId: 'SR1', modelType: 'primary', nickname: '人工智能导论', modelName: 'course-ai-intro-v3.1', version: 'v3.1', releaseDate: '2026-08-05', notes: 'AI入门课程专用垂类模型', url: 'https://api.codetrack.ai/course/ai-intro/v3.1', apiKey: 'sk-ct-****a7i8', enabled: true },
  { id: 'CM6', subjectRouteId: 'SR1', modelType: 'primary', nickname: '数据结构与算法', modelName: 'course-ds-algo-v2.0', version: 'v2.0', releaseDate: '2026-07-10', notes: '数据结构课程专用垂类模型', url: 'https://api.codetrack.ai/course/dsa/v2.0', apiKey: 'sk-ct-****d9s0', enabled: false },
  { id: 'CM2', subjectRouteId: 'SR1', modelType: 'fallback', nickname: '通用大模型', modelName: 'general-v3.0', version: 'v3.0', releaseDate: '2026-07-20', notes: '', url: 'https://api.codetrack.ai/general/v3.0', apiKey: 'sk-ct-****c3d4', enabled: false },
]

export const seedModelVersions: ModelVersion[] = [
  { id: 'MV1', connectedModelId: 'CM1', version: 'v2.1', releaseDate: '2026-08-01', changelog: '优化代码生成质量，修复长文本截断问题，新增多语言支持', isCurrent: true },
  { id: 'MV2', connectedModelId: 'CM1', version: 'v2.0', releaseDate: '2026-07-15', changelog: '升级底层推理引擎，引入上下文感知机制，提升复杂场景准确率 12%', isCurrent: false },
  { id: 'MV3', connectedModelId: 'CM1', version: 'v1.8', releaseDate: '2026-06-20', changelog: '修复内存泄漏，优化并发处理能力', isCurrent: false },
  { id: 'MV4', connectedModelId: 'CM1', version: 'v1.7', releaseDate: '2026-05-10', changelog: '初始生产版本', isCurrent: false },
]

export const seedSubjectAvailabilities: SubjectAvailability[] = [
  { id: 'SA1', subject: '计算机科学与技术', open: true, allowedScope: '全体学生', dailyCallLimit: 10000, dailyTokenLimit: 5000000, singleUserConcurrency: 5 },
]

export const seedAiCallLogs: AiCallLog[] = [
  { id: 'CL1', requestId: 'req-20260809-a001', time: '2026-08-09 10:23:15', user: '张伟明', subject: '计算机科学与技术', feature: '代码智能补全', planModel: '计算机代码垂类大模型', actualModel: '计算机代码垂类大模型', fallbackTriggered: false, fallbackLevel: 0, status: '成功', latency: '1.2s', tokenUsed: 2048 },
  { id: 'CL2', requestId: 'req-20260809-a002', time: '2026-08-09 10:22:48', user: '王芳', subject: '计算机科学与技术', feature: '算法题解', planModel: '计算机代码垂类大模型', actualModel: '通用大模型', fallbackTriggered: true, fallbackLevel: 1, status: '成功', latency: '3.1s', tokenUsed: 512 },
  { id: 'CL3', requestId: 'req-20260809-a003', time: '2026-08-09 10:21:33', user: '王建国', subject: '计算机科学与技术', feature: '代码调试', planModel: '计算机代码垂类大模型', actualModel: '计算机代码垂类大模型', fallbackTriggered: false, fallbackLevel: 0, status: '超时', latency: '12.4s', tokenUsed: 0, errorInfo: '请求超时 >10s' },
  { id: 'CL4', requestId: 'req-20260809-a004', time: '2026-08-09 10:20:12', user: '系统', subject: '计算机科学与技术', feature: '知识问答', planModel: '通用大模型', actualModel: '通用大模型', fallbackTriggered: false, fallbackLevel: 0, status: '成功', latency: '0.9s', tokenUsed: 4096 },
  { id: 'CL5', requestId: 'req-20260809-a005', time: '2026-08-09 10:18:55', user: '刘洋', subject: '计算机科学与技术', feature: '代码审查', planModel: '计算机代码垂类大模型', actualModel: '通用大模型', fallbackTriggered: true, fallbackLevel: 1, status: '失败', latency: '—', tokenUsed: 0, errorInfo: '500 Internal Server Error' },
  { id: 'CL6', requestId: 'req-20260809-a006', time: '2026-08-09 10:17:40', user: '李慧', subject: '计算机科学与技术', feature: '文档生成', planModel: '通用大模型', actualModel: '通用大模型', fallbackTriggered: false, fallbackLevel: 0, status: '限流', latency: '0.1s', tokenUsed: 0, errorInfo: 'QPS 超限' },
]

export const seedAiAlerts: AiAlert[] = [
  { id: 'AL1', time: '2026-08-10 10:21:35', subject: '计算机科学与技术', level: '警告', type: '兜底切换', summary: '垂类模型连续 5 次 500 错误，已自动切至通用大模型', detail: '计算机代码垂类大模型持续返回 HTTP 500，已触发自动熔断切换至通用大模型 v3.0。请排查垂类模型服务状态。', status: '待处理' },
  { id: 'AL2', time: '2026-08-10 09:45:00', subject: '计算机科学与技术', level: '严重', type: '服务失联', summary: '垂类模型服务失联，已自动切换', detail: '计算机代码垂类大模型主链路连续 5 次心跳检测失败，已触发自动熔断切换至通用大模型 v3.0。', status: '已认领', claimedBy: '张伟明', claimedAt: '2026-08-10 09:50:00' },
  { id: 'AL3', time: '2026-08-09 21:30:00', subject: '计算机科学与技术', level: '提示', type: '并发过载', summary: '瞬时并发接近上限', detail: '21:28-21:30 期间 计算机科学与技术并发量接近上限，建议关注是否需扩容或调整配额', status: '处理中', claimedBy: '管理员', claimedAt: '2026-08-09 21:35:00', handler: '管理员', handlingRecords: [
    { time: '2026-08-09 21:35:00', operator: '管理员', content: '已认领告警，开始排查并发来源' },
    { time: '2026-08-09 21:45:00', operator: '管理员', content: '确认瞬时峰值来自代码审查批量任务，已临时限流' },
  ]},
  { id: 'AL4', time: '2026-08-09 14:10:00', subject: '计算机科学与技术', level: '警告', type: '接口超时', summary: '垂类模型接口响应时间超过阈值', detail: '13:50-14:10 期间垂类模型接口多次超时超过 10s，触发告警。经排查为下游资源波动，已恢复。', status: '已解决', claimedBy: '李慧', claimedAt: '2026-08-09 14:15:00', handler: '李慧', handledBy: '管理员', handledAt: '2026-08-09 15:30:00', handlingRecords: [
    { time: '2026-08-09 14:15:00', operator: '李慧', content: '已认领，开始排查下游服务状态' },
    { time: '2026-08-09 14:30:00', operator: '李慧', content: '定位到下游 GPU 资源池波动，已联系基础设施团队' },
    { time: '2026-08-09 15:00:00', operator: '李慧', content: '下游资源已恢复，模型响应时间恢复正常' },
  ]},
  { id: 'AL5', time: '2026-08-08 11:00:00', subject: '计算机科学与技术', level: '提示', type: '其他异常', summary: 'API Key 调用频率接近限额', detail: '近1小时 API Key 使用量已达配额的 85%，建议关注是否需要提升配额', status: '已关闭', handledBy: '管理员', handledAt: '2026-08-08 12:00:00' },
]

export const seedAlertRules: AlertRule[] = [
  { id: 'AR1', metric: '延迟', threshold: 3000, statisticalWindow: '5分钟', alertLevel: '警告', enabled: true, subject: '计算机科学与技术', createdAt: '2026-08-01' },
  { id: 'AR2', metric: '成功率', threshold: 95, statisticalWindow: '1分钟', alertLevel: '严重', enabled: true, subject: '计算机科学与技术', createdAt: '2026-08-02' },
  { id: 'AR3', metric: '错误率', threshold: 5, statisticalWindow: '15分钟', alertLevel: '警告', enabled: false, subject: '计算机科学与技术', createdAt: '2026-08-03' },
  { id: 'AR4', metric: '调用量', threshold: 10000, statisticalWindow: '1小时', alertLevel: '提示', enabled: true, subject: '计算机科学与技术', createdAt: '2026-08-04' },
  { id: 'AR5', metric: '延迟', threshold: 5000, statisticalWindow: '1小时', alertLevel: '提示', enabled: true, subject: '计算机科学与技术', createdAt: '2026-08-05' },
]

export const seedAISafetyConfig: AISafetyConfig = {
  sensitiveWordsEnabled: true,
  ioSafetyCheckEnabled: true,
  personalInfoDesensitize: true,
  logRetentionDays: 180,
}

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
  { id: 'N1', title: '关于启用 2026-2027 学年第一学期的通知', content: '平台将于 9 月 1 日正式启用新学期的教学资源与课程配置，请各位老师及时更新课程资源。', audience: '全体师生', status: '已发布', pinned: true, readCount: 1240, totalCount: 2386, author: '超级管理员', createdAt: '2026-08-01 10:00', publishAt: '2026-08-01 10:00', expireAt: '2026-09-30' },
  { id: 'N2', title: '科研项目结项材料提交截止提醒', content: '本学期计划结项的科研项目，请于 8 月 31 日前提交结项材料。', audience: '科研团队', status: '已发布', pinned: false, readCount: 86, totalCount: 112, author: '超级管理员', createdAt: '2026-08-05 09:30', publishAt: '2026-08-05 09:30', expireAt: '2026-08-31' },
  { id: 'N3', title: '平台 AI 服务升级维护公告（草稿）', content: '平台将于本周六 22:00-24:00 进行垂类模型升级维护，期间 AI 辅助功能将切换至兜底模型。', audience: '全体师生', status: '草稿', pinned: false, readCount: 0, totalCount: 2386, author: '超级管理员', createdAt: '2026-08-07 16:20' },
  { id: 'N4', title: '上学期平台使用情况通报', content: '上学期平台整体运行平稳，资源访问量同比增长 32%，感谢全体师生的使用与反馈。', audience: '全体教师', status: '已撤回', pinned: false, readCount: 0, totalCount: 312, author: '超级管理员', createdAt: '2026-07-20 14:00', publishAt: '2026-07-20 14:00' },
  { id: 'N5', title: '关于规范 AI 生成内容标识的通知', content: '使用 AI 辅助生成的科研产出，必须在产出中明确标注 AI 生成标记。', audience: '全体师生', status: '已发布', pinned: true, readCount: 2310, totalCount: 2386, author: '超级管理员', createdAt: '2026-07-15 09:00', publishAt: '2026-07-15 09:00', expireAt: '2026-12-31' },
]

export const seedLogs: OperationLog[] = [
  { id: 'L1', operator: '超级管理员', actionType: '权限变更', resourceType: '教师账号', resourceId: 'T1001', desc: '调整张伟明的院系管理数据权限', before: '仅本人数据', after: '本学院全部数据', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-08 10:02:11', sensitive: true },
  { id: 'L2', operator: '超级管理员', actionType: '处置', resourceType: '合规审查', resourceId: 'CM3', desc: '处置 AI 标识缺失问题', before: '待处理', after: '已处置（修改）', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-07 15:30:42', sensitive: true },
  { id: 'L3', operator: '超级管理员', actionType: '审核', resourceType: '科研项目', resourceId: 'P2026002', desc: '审核通过科研项目立项申请', before: '待审核', after: '进行中', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-07 11:22:05', sensitive: false },
  { id: 'L4', operator: '超级管理员', actionType: '导出', resourceType: '操作日志', resourceId: '—', desc: '导出近 7 天操作日志', before: '—', after: '—', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-06 17:08:33', sensitive: true },
  { id: 'L5', operator: '超级管理员', actionType: '创建', resourceType: '公告', resourceId: 'N2', desc: '发布科研结项材料提交提醒公告', before: '草稿', after: '已发布', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-05 09:31:10', sensitive: false },
  { id: 'L6', operator: '超级管理员', actionType: '删除', resourceType: '资源', resourceId: 'R1004', desc: '删除闲置资源：量子力学-第一章讲义', before: '正常', after: '已删除', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-08-04 14:20:18', sensitive: true },
  { id: 'L7', operator: 'T1001', actionType: '登录', resourceType: '账号', resourceId: 'T1001', desc: '账号登录成功', before: '—', after: '—', ip: '10.20.3.22', ua: 'Chrome/126 Windows', time: '2026-08-08 09:41:02', sensitive: false },
  { id: 'L8', operator: '超级管理员', actionType: '编辑', resourceType: '基础参数', resourceId: 'upload', desc: '调整单文件上传上限', before: '200 MB', after: '500 MB', ip: '10.20.1.8', ua: 'Chrome/126 Windows', time: '2026-06-15 10:00:00', sensitive: true },
]

// 平台运营指标（按时间范围）—— 用函数生成避免数据过于静态
// 核心指标：用户总量 / AI 调用总量 / 科研项目数 / 科研辅助产出量
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
