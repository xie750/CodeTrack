// 教师端类型定义
// 基于学生端现有类型扩展

export type TeacherRole = "TEACHER" | "ADMIN";

// 教师课程简略信息
export interface TeacherCourse {
  course_id: string;
  title: string;
  description?: string;
  teacher_id: string;
  semester?: string;
  status?: string;
  student_count: number;
  task_count: number;
  created_at: string;
}

// 教学任务
export interface TeachingAssignment {
  teaching_assignment_id: string;
  teacher_id: string;
  course_id: string;
  class_id?: string;
  class_name?: string;
  semester: string;
  student_count: number;
  task_count: number;
}

// 教学安排行，是 TeacherCourse 的超集：课程字段 + 班级维度
export interface TeacherTeachingAssignment extends TeacherCourse {
  teaching_assignment_id: string;
  class_id: string;
  class_name: string;
}

// 学生任务进度状态（后端为大写枚举）
export type TeacherProgressStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "NEEDS_REVISION"
  | "COMPLETED";

// 任务监控中的单个学生行
export interface TaskMonitorRow {
  submission_id: string | null;
  student_id: string;
  student_name: string;
  status: TeacherProgressStatus;
  submission_status: string | null;
  version_count: number;
  highest_hint_level: number;
  latest_diagnosis_type: string | null;
  passed_at: string | null;
  last_submitted_at: string | null;
}

// 任务监控数据
export interface TaskMonitorData {
  task_id: string;
  task_title: string;
  course_id: string;
  course_name: string;
  total_students: number;
  submitted_count: number;
  in_progress_count: number;
  not_started_count: number;
  passed_count: number;
  submissions: TaskMonitorRow[];
}

// 教学首页聚合数据
export interface TeacherDashboardData {
  teacher: { id: string; name: string };
  stats: {
    course_count: number;
    student_count: number;
    task_count: number;
    pending_review_count: number;
    graded_count: number;
  };
  courses: TeacherCourse[];
  recent_submissions: Array<{
    submission_id: string;
    task_id: string;
    task_title: string;
    course_id: string;
    course_name: string;
    student_id: string;
    student_name: string;
    status: string;
    version_count: number;
    highest_hint_level: number;
    latest_diagnosis_type: string | null;
    passed_at: string | null;
    last_submitted_at: string | null;
  }>;
}

// ===== 教学首页（开发方案 §五 页面模块一） =====

/**
 * §5.2 B 数据概览卡片。每张卡都带下钻路由，`value` 为 null 表示「没有这个指标」
 * 而不是 0（例如一个班还没发过任务时的平均完成率）。
 */
export interface TeacherDashboardStatCard {
  value: number | null;
  target_route: string | null;
}

/** §5.2 C 待办标签的四类 */
export type TeacherTodoType = "TASK" | "STUDENT" | "AI_REVIEW" | "FEEDBACK";

export type TeacherTodoLevel = "HIGH" | "WATCH" | "NOTICE";

export interface TeacherDashboardTodo {
  todo_id: string;
  type: TeacherTodoType;
  level: TeacherTodoLevel;
  title: string;
  detail: string;
  due_at: string | null;
  target_route: string;
}

/** §5.2 D 最近任务。分母是整个在册名册，不是"有提交记录的人" */
export interface TeacherDashboardTask {
  task_id: string;
  task_title: string;
  task_type: string;
  publish_statuses: string[];
  published_at: string | null;
  deadline: string | null;
  total: number;
  completed: number;
  submitted: number;
  in_progress: number;
  not_started: number;
  overdue_count: number;
  needs_review_count: number;
  completion_rate: number;
  submit_rate: number;
  is_active: boolean;
}

/** §5.2 A 教学上下文的三级选择器 */
export interface TeacherDashboardContext {
  terms: Array<{ term: string; is_current: boolean }>;
  courses: Array<{ course_id: string; name: string; is_current: boolean }>;
  classes: Array<{
    class_id: string;
    name: string;
    teaching_assignment_id: string;
    student_count: number;
    is_current: boolean;
  }>;
  current: {
    teaching_assignment_id: string;
    term: string;
    course_id: string;
    course_name: string;
    class_id: string;
    class_name: string;
  } | null;
  generated_at: string | null;
}

/** §5.2 E 班级学情摘要。与 §十 诊断页同源，首页只取前几名 */
export interface TeacherDashboardSummary {
  completion_trend: Array<{
    task_id: string;
    task_title: string;
    published_at: string | null;
    completion_rate: number;
    submit_rate: number;
  }>;
  top_errors: Array<{
    error_type: string;
    label: string;
    student_count: number;
    total_count: number;
    severity: string;
    related_knowledge_points: string[];
  }>;
  weak_knowledge_points: Array<{
    knowledge_point: string;
    avg_mastery: number;
    covered_students: number;
    weak_student_count: number;
  }>;
  roster_with_profile: number;
  analysis_route: string;
}

/** 库里还没有落点的写操作，原因由后端下发，页面不自己编文案 */
export interface TeacherUnavailableAction {
  action: string;
  reason: string;
  target_route: string | null;
}

export interface TeacherDashboardOverview {
  context: TeacherDashboardContext;
  stats: {
    student_count: TeacherDashboardStatCard;
    active_task_count: TeacherDashboardStatCard;
    avg_completion_rate: TeacherDashboardStatCard;
    overdue_student_count: TeacherDashboardStatCard;
    pending_ai_review_count: TeacherDashboardStatCard;
    risk_student_count: TeacherDashboardStatCard;
  };
  todos: TeacherDashboardTodo[];
  todo_type_labels: Record<TeacherTodoType, string>;
  recent_tasks: TeacherDashboardTask[];
  class_summary: TeacherDashboardSummary;
  unavailable_actions: TeacherUnavailableAction[];
  /** 教师还没有生效教学安排时才有 */
  empty_reason?: string;
}

/** 首页选择器筛选参数。teachingAssignmentId 优先于其余三个（§15.1） */
export interface TeacherDashboardFilters {
  teachingAssignmentId?: string;
  term?: string;
  courseId?: string;
  classId?: string;
}

// 提交时间线
export interface TeacherTimeline {
  submission_id: string;
  student_id: string;
  student_name: string;
  task_id: string;
  task_title: string;
  events: Array<{
    event_id: string;
    type: string;
    version_id: string;
    execution_id?: string;
    occurred_at: string | null;
    summary: string;
  }>;
}

// ─────────────────────────────────────────────────────────────
// 学情诊断（开发方案 §十）
// 后端聚合接口在 backend/app/api/teacher_analytics.py
// ─────────────────────────────────────────────────────────────

// 下拉选项：班级
export interface DiagnosisClassOption {
  class_id: string;
  class_name: string;
  teaching_assignment_id: string;
  term: string;
  student_count: number;
}

// 下拉选项：学生。has_profile 用于提前标出没有画像的学生
export interface DiagnosisStudentOption {
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  has_profile: boolean;
}

// 下拉选项：任务
export interface DiagnosisTaskOption {
  task_id: string;
  task_title: string;
  workspace_type: string;
  assignment_mode: string;
  published_at: string | null;
  deadline: string | null;
}

// 名册与画像覆盖，用于「数据充分性提示」
export interface DiagnosisRoster {
  total: number;
  with_profile: number;
  without_profile: number;
}

export type HintDependencyLevel = "LOW" | "MEDIUM" | "HIGH";

// 班级综合能力。所有比率后端已换算成百分数
export interface ClassAbility {
  overall_progress: number;
  task_completion: number;
  compile_error_rate: number;
  logic_error_rate: number;
  hint_dependency: Record<HintDependencyLevel, number>;
}

// 成绩趋势的单个任务点。avg_score 为 null 表示该任务还没有任何评分
export interface ClassScorePoint {
  task_id: string;
  task_title: string;
  published_at: string | null;
  deadline: string | null;
  avg_score: number | null;
  scored_count: number;
  submit_rate: number;
  pass_rate: number;
}

// 热力图单元格。mastery_score 为 null 表示该学生这个知识点还没有证据
export interface KnowledgeCell {
  knowledge_point: string;
  mastery_score: number | null;
  state: string | null;
  evidence_count: number;
}

export interface KnowledgeMatrix {
  points: string[];
  rows: Array<{
    student_id: string;
    student_name: string;
    cells: KnowledgeCell[];
  }>;
  point_averages: Array<{
    knowledge_point: string;
    avg_mastery: number | null;
    covered_students: number;
  }>;
}

export interface ClassErrorItem {
  error_type: string;
  label: string;
  student_count: number;
  total_count: number;
  severity: string;
  related_knowledge_points: string[];
}

export interface HintLevelCounts {
  none: number;
  level_1: number;
  level_2: number;
  level_3: number;
}

// GET /api/v1/teacher/analytics/class
export interface ClassAnalytics {
  course_id: string;
  classes: Array<{ class_id: string; class_name: string }>;
  roster: DiagnosisRoster;
  ability: ClassAbility;
  score_trend: ClassScorePoint[];
  knowledge: KnowledgeMatrix;
  errors: ClassErrorItem[];
  hint_levels: HintLevelCounts;
}

// 画像六件套，与学生端 StudentProfile 同源同口径
export interface LearnerKnowledgeStateItem {
  knowledge_point: string;
  mastery_score: number;
  state: string;
  evidence_count: number;
  last_evidence: string;
}

export interface LearnerErrorItem {
  error_type: string;
  label: string;
  count: number;
  severity: string;
  related_knowledge_points: string[];
}

export interface LearnerRecommendationItem {
  id: string;
  title: string;
  reason: string;
  priority: number;
  related_task_id: string | null;
  related_knowledge_points: string[];
  suggested_action: string;
}

export interface LearnerOverview {
  overall_progress: number;
  hint_dependency_level: string;
  compile_error_rate: number;
  logic_error_rate: number;
  recent_task_completion: number;
  summary: string;
  recommendation: string;
  updated_at: string | null;
}

// 教师专属：能力证据
export interface CapabilityEvidenceItem {
  evidence_id: string;
  capability_id: string;
  capability_name: string;
  task_id: string;
  task_title: string;
  evidence_type: string;
  strength: string;
  explanation: string;
  teacher_confirmed: boolean;
  created_at: string | null;
}

// 教师专属：提示使用明细
export interface HintUsageItem {
  hint_id: string;
  level: number;
  status: string;
  student_requested: boolean;
  request_reason: string;
  task_id: string | null;
  task_title: string;
  version_no: number | null;
  viewed_at: string | null;
}

export interface BehaviorEventItem {
  event_id: string;
  event_type: string;
  task_id: string | null;
  error_type: string | null;
  knowledge_points: string[];
  created_at: string | null;
}

export interface StudentTaskHistoryItem {
  task_id: string;
  task_title: string;
  status: TeacherProgressStatus | "OVERDUE";
  score: number | null;
  highest_hint_level: number;
  version_count: number;
  passed_at: string | null;
  last_submitted_at: string | null;
  published_at: string | null;
  deadline: string | null;
}

/**
 * GET /api/v1/teacher/analytics/student
 *
 * has_profile 为 false 时只有 student / course_id 和后四块，画像六件套缺席 ——
 * 这是「学生在名册里但还没有足够画像数据」的真实状态，不是请求失败。
 */
export interface StudentAnalytics {
  has_profile: boolean;
  student: { id: string; name: string; class_id?: string; class_name?: string };
  course?: { id: string; name: string; teacher_name: string };
  course_id?: string;
  overview?: LearnerOverview;
  knowledge_states?: LearnerKnowledgeStateItem[];
  frequent_errors?: LearnerErrorItem[];
  recommendations?: LearnerRecommendationItem[];
  capability_evidence: CapabilityEvidenceItem[];
  hint_usage: HintUsageItem[];
  behavior_timeline: BehaviorEventItem[];
  task_history: StudentTaskHistoryItem[];
}

// 预警等级：提醒 / 关注 / 高风险
export type AlertLevel = "NOTICE" | "WATCH" | "HIGH";

export interface AlertRuleHit {
  code: string;
  label: string;
  evidence: string;
}

export interface StudentAlert {
  student_id: string;
  student_name: string;
  level: AlertLevel;
  rule_codes: string[];
  rules: AlertRuleHit[];
  last_activity_at: string | null;
}

/**
 * GET /api/v1/teacher/alerts
 *
 * actions_available 恒为 false：预警状态表还没建，处置动作不可用。
 * 前端据 actions_disabled_reason 说明原因，不要自己写死文案，也不要假装能处理。
 */
export interface ClassAlerts {
  roster_total: number;
  alert_count: number;
  level_counts: Record<AlertLevel, number>;
  rules: Array<{ code: string; label: string }>;
  alerts: StudentAlert[];
  actions_available: boolean;
  actions_disabled_reason: string;
}

// ===== AI 审核（开发方案 §十一） =====

/** §14.4 审核状态。PENDING 表示还没有任何教师审核记录 */
export type AiReviewStatus = "PENDING" | "ACCEPTED" | "MODIFIED" | "REJECTED";

/** 审核列表一行，不含代码和测试明细 */
export interface AiReviewRow {
  diagnosis_id: string;
  review_status: AiReviewStatus;
  reviewed_at: string | null;
  submission_id: string;
  version_id: string;
  version_no: number;
  student_id: string;
  student_name: string;
  task_id: string;
  task_title: string;
  course_id: string;
  course_name: string;
  diagnosis_type: string;
  diagnosis_status: string;
  confidence: number;
  explanation: string;
  /** 入队原因，例如 LOW_CONFIDENCE / RULE_FALLBACK / NO_KNOWLEDGE_CITATION */
  queue_reasons: string[];
  citation_count: number;
  failed_test_count: number;
  highest_hint_level: number;
  model_provider: string;
  model_name: string;
  created_at: string | null;
}

export interface AiReviewQueueStats {
  total: number;
  pending: number;
  accepted: number;
  modified: number;
  rejected: number;
  low_confidence: number;
}

export interface AiReviewQueue {
  stats: AiReviewQueueStats;
  diagnosis_types: string[];
  items: AiReviewRow[];
}

export interface AiReviewRecord {
  review_id: string;
  action: Exclude<AiReviewStatus, "PENDING">;
  revised_explanation: string;
  note: string;
  reviewer_id: string;
  reviewer_name: string;
  created_at: string | null;
}

/** 审核详情，教师侧可见隐藏用例完整输出和模型元数据 */
export interface AiReviewDetailData extends AiReviewRow {
  language: string;
  source_code: string;
  submitted_at: string | null;
  submission_status: string;
  execution: {
    execution_id: string;
    status: string;
    compile_exit_code: number | null;
    compiler_stdout: string;
    compiler_stderr: string;
    finished_at: string | null;
  } | null;
  tests: Array<{
    test_case_id: string;
    name: string;
    visibility: string;
    status: string;
    expected_output_summary: string;
    actual_output: string;
    duration_ms: number;
    error_message: string;
    error_tag: string;
  }>;
  passed_test_count: number;
  prompt_version: string;
  verified_evidence_ids: string[];
  knowledge_sources: Array<{
    source_id: string;
    title: string;
    summary: string;
    source_type: string;
    version: string;
    authority_level: string;
  }>;
  hints: Array<{ level: number; content: string; viewed_at: string | null }>;
  /** 倒序：第一条是当前生效的审核结论，其余是历史 */
  reviews: AiReviewRecord[];
}

export interface AiReviewQueueFilters {
  reviewStatus?: AiReviewStatus;
  confidenceMax?: number;
  diagnosisType?: string;
  student?: string;
  page?: number;
  pageSize?: number;
}

export interface AiReviewActionPayload {
  revised_explanation?: string;
  note?: string;
}

// ===== 教学改进（开发方案 §十二 12.1 教学策略优化） =====

/**
 * 注意所有比率字段都是 `number | null`：null 表示「无数据」，0 表示「实测为零」。
 * 这两者是相反的事实，类型上留住 null 就是为了逼调用方经过 formatRate() 处理，
 * 不要图省事改成 number。
 */
export interface ImprovementSummary {
  published_task_count: number;
  active_student_count: number;
  with_profile: number;
  without_profile: number;
  completion_rate: number | null;
  avg_score: number | null;
  scored_count: number;
  avg_mastery: number | null;
  knowledge_point_count: number;
  weak_knowledge_point_count: number;
  error_total_count: number;
  error_type_count: number;
  hint_level_2_plus_count: number;
  hint_ratio: number | null;
  avg_overall_progress: number | null;
  avg_compile_error_rate: number | null;
  avg_logic_error_rate: number | null;
  hint_dependency: Record<string, number>;
}

export interface ImprovementWeakPoint {
  knowledge_point: string;
  avg_mastery: number | null;
  state: string | null;
  covered_students: number;
  weak_student_count: number;
  weak_ratio: number | null;
}

export interface ImprovementError {
  error_type: string;
  label: string;
  student_count: number;
  total_count: number;
  severity: string;
  related_knowledge_points: string[];
}

export type ImprovementSeverity = "HIGH" | "MEDIUM" | "INFO";

export interface ImprovementSuggestion {
  id: string;
  rule_id: string;
  /** 恒为 "RULE"：建议由后端规则推导，不调大模型。界面必须照实标注 */
  generator: string;
  generator_version: string;
  severity: ImprovementSeverity;
  title: string;
  detail: string;
  evidence: Array<{ metric: string; subject: string; value: number; source_table: string }>;
  suggested_action: string;
}

export interface ImprovementTrendSegment {
  label: string;
  task_count: number;
  avg_score: number | null;
  scored_count: number;
  pass_rate: number | null;
}

export interface ImprovementStrategyData {
  scope: {
    course_id: string;
    course_name: string;
    class_ids: string[];
    class_names: string[];
    active_student_count: number;
    with_profile: number;
    without_profile: number;
    small_sample: boolean;
  };
  class_options: Array<{
    class_id: string;
    class_name: string;
    is_current: boolean;
    is_compare: boolean;
  }>;
  window: { days: number; label: string; from: string | null; to: string };
  window_options: Array<{ days: number; label: string }>;
  window_scope_note: string;
  summary: ImprovementSummary;
  weak_knowledge_points: ImprovementWeakPoint[];
  frequent_errors: ImprovementError[];
  hint_levels: Record<string, number>;
  trend: {
    early: ImprovementTrendSegment | null;
    late: ImprovementTrendSegment | null;
    note: string;
  };
  suggestions: ImprovementSuggestion[];
  suggestion_meta: {
    generator: string;
    generator_version: string;
    llm_used: boolean;
    rule_count: number;
    note: string;
  };
  compare: {
    class_ids: string[];
    summary: ImprovementSummary;
    weak_knowledge_points: ImprovementWeakPoint[];
    frequent_errors: ImprovementError[];
    deltas: Record<string, number | null>;
  } | null;
  data_gaps: Array<{ code: string; message: string }>;
  /** 采纳 / 忽略 / 生成资料等暂不可用动作的理由，文案由后端给，前端不自己编 */
  unavailable_actions: Array<{
    action: string;
    reason: string;
    target_route: string | null;
  }>;
}

export interface ImprovementStrategyFilters {
  courseId: string;
  classId?: string;
  compareClassId?: string;
  windowDays?: number;
}

// ===== 任务中心（开发方案 §八 8.1 任务列表） =====

/** §14.1 任务内容状态。当前由后端从现有数据推导，不是存储字段，见 status_derivation */
export type TaskContentStatus = "DRAFT" | "READY" | "PUBLISHED" | "CLOSED" | "ARCHIVED";

/** 任务类型只能从 workspace_type 推导。测验和补救是发布模式，不是内容类型 */
export type TeacherTaskType = "PROGRAMMING" | "QUESTION";

/** §14.2 班级任务发布状态 */
export type TaskPublishStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "PAUSED" | "CLOSED";

export interface TeacherTaskPublication {
  assignment_id: string;
  class_id: string;
  class_name: string;
  term: string;
  publish_status: TaskPublishStatus;
  /** PRACTICE / QUIZ / EXAM / REMEDIAL */
  assignment_mode: string;
  allow_hint_level_3: boolean;
  published_at: string | null;
  deadline: string | null;
}

/**
 * 注意 completion_rate 是 `number | null`：null 表示这个任务还没有名册可算
 * （未发布），0 表示发布了但没人完成。两者不能都渲染成 0%。
 */
export interface TeacherTaskRow {
  task_id: string;
  title: string;
  description: string;
  course_id: string;
  course_name: string;
  task_type: TeacherTaskType | string;
  workspace_type: string;
  content_status: TaskContentStatus;
  raw_status: string;
  language: string;
  interface_spec: string;
  learning_objectives: string[];
  capability_ids: string[];
  publications: TeacherTaskPublication[];
  test_case_count: number;
  public_test_case_count: number;
  required_test_case_count: number;
  question_count: number;
  question_total_score: number | null;
  roster_total: number;
  submitted_count: number;
  completed_count: number;
  not_started_count: number;
  completion_rate: number | null;
  published_class_names: string[];
}

export interface TeacherTaskStats {
  total: number;
  draft: number;
  ready: number;
  published: number;
  closed: number;
  archived: number;
  programming: number;
  question: number;
}

export interface TeacherTaskListData {
  scope: {
    course_id: string | null;
    class_id: string | null;
    course_ids: string[];
    class_ids: string[];
  };
  course_options: Array<{ course_id: string; name: string; term: string; is_current: boolean }>;
  class_options: Array<{ class_id: string; name: string; is_current: boolean }>;
  task_type_options: Array<{ value: string; label: string }>;
  content_status_order: TaskContentStatus[];
  /** 内容状态推导口径说明，必须显示给教师，避免把「可发布」当成手工标注的状态 */
  status_derivation: string;
  stats: TeacherTaskStats;
  items: TeacherTaskRow[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  /** 新建、编辑、复制、归档、发布、学生预览六个动作的不可用原因，由后端给文案 */
  unavailable_actions: Array<{
    action: string;
    reason: string;
    target_route: string | null;
  }>;
}

export interface TeacherTaskListFilters {
  courseId?: string;
  classId?: string;
  taskType?: string;
  contentStatus?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

// ===== 任务监控（开发方案 §九 9.1 提交进度看板） =====

/** §14.3 学生任务状态。OVERDUE 只作为筛选值出现，不是行上的 status 取值 */
export type MonitorProgressStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "NEEDS_REVISION"
  | "COMPLETED";

export type MonitorStatusFilter = MonitorProgressStatus | "OVERDUE";

export interface MonitorOption {
  value: string;
  label: string;
}

export interface MonitorTaskOption {
  task_id: string;
  title: string;
  task_type: string;
  class_names: string[];
  published_at: string | null;
  deadline: string | null;
  publish_statuses: string[];
  is_current: boolean;
}

export interface MonitorTask {
  task_id: string;
  title: string;
  task_type: string;
  workspace_type: string;
  course_id: string;
  language: string;
  class_names: string[];
  published_at: string | null;
  deadline: string | null;
  publish_statuses: string[];
  /**
   * 编程任务当前没有分数字段，只有通过/未通过。false 时平均成绩必须显示「不适用」，
   * 不能渲染成 0 —— 否则教师会把「没有这个指标」读成「全班 0 分」。
   */
  score_supported: boolean;
  required_test_case_count: number | null;
  /** 成绩口径说明，文案由后端给，前端不自己编 */
  score_note: string;
}

/**
 * 概览卡片。始终覆盖整个名册，不随下方筛选变化 —— 卡片本身就是筛选入口。
 * 名册为空时 submit_rate / completion_rate 是 null 而不是 0。
 */
export interface MonitorStats {
  total: number;
  completed: number;
  in_progress: number;
  not_started: number;
  needs_revision: number;
  submitted: number;
  overdue: number;
  hint_level_3: number;
  pending_review: number;
  submit_rate: number | null;
  completion_rate: number | null;
  score_supported: boolean;
  scored_count: number;
  avg_score: number | null;
}

export interface MonitorRow {
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  status: MonitorProgressStatus | string;
  /** 逾期与状态正交：交晚了会同时是「已提交」和「逾期」 */
  overdue: boolean;
  submission_id: string | null;
  submission_status: string | null;
  version_count: number;
  highest_hint_level: number;
  /** 编程任务恒为 null，前端不要补 0 */
  score: number | null;
  passed_count: number | null;
  total_required_count: number | null;
  error_tags: string[];
  latest_diagnosis_type: string | null;
  needs_teacher_review: boolean;
  started_at: string | null;
  last_submitted_at: string | null;
  passed_at: string | null;
  deadline: string | null;
}

export interface MonitorBoardData {
  scope: {
    course_id: string | null;
    class_id: string | null;
    task_id: string | null;
  };
  course_options: Array<{ course_id: string; name: string; term: string; is_current: boolean }>;
  class_options: Array<{ class_id: string; name: string; is_current: boolean }>;
  task_options: MonitorTaskOption[];
  status_options: MonitorOption[];
  hint_level_options: MonitorOption[];
  /** 只列名册里真实出现过的错误标签，避免给出选了必然为空的筛选项 */
  error_type_options: MonitorOption[];
  task: MonitorTask | null;
  stats: MonitorStats;
  items: MonitorRow[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  /** task 为 null 时说明为什么没有数据，区分「没有教学安排」和「还没发布任务」 */
  empty_reason: string | null;
  unavailable_actions: Array<{ action: string; reason: string; target_route: string | null }>;
}

export interface MonitorBoardFilters {
  courseId?: string;
  classId?: string;
  taskId?: string;
  status?: string;
  hintLevel?: number;
  errorType?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

// ===== 资料中心（开发方案 §七） =====

/** §7.2 A 状态筛选器的四态。上传件在解析完成前是 PARSE_PENDING */
export type ResourceStatus = "ACTIVE" | "DISABLED" | "PARSE_PENDING" | "PARSE_FAILED";

/** §7.2 B 资料类型：课件、代码、数据集、技术文档，外加种子数据用的教师笔记 */
export type ResourceSourceType = "COURSEWARE" | "CODE" | "DATASET" | "TECH_DOC" | "TEACHER_NOTE";

export type ResourceAuthorityLevel = "HIGH" | "MEDIUM" | "LOW";

/** §7.2 C 共享范围：仅当前班级 / 当前课程 / 教师复用 */
export type ResourceShareScope = "CLASS" | "COURSE" | "TEACHER";

export interface TeacherResource {
  resource_id: string;
  course_id: string;
  title: string;
  summary: string;
  content: string;
  source_type: ResourceSourceType;
  chapter: string;
  knowledge_points: string[];
  version: string;
  authority_level: ResourceAuthorityLevel;
  status: ResourceStatus;
  /** 学生能否直接查看 —— 与 ai_retrievable 互相独立 */
  student_visible: boolean;
  /** 是否参与 AI 检索 —— 停用或正文为空时后端会强制置为 false */
  ai_retrievable: boolean;
  share_scope: ResourceShareScope;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  has_file: boolean;
  /** 被多少条历史 AI 诊断引用过。>0 时不允许删除，只能停用（§7.4） */
  reference_count: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** 资料历史版本，只追加（§7.2 C / §15.2） */
export interface ResourceRevision {
  revision_id: string;
  version: string;
  title: string;
  summary: string;
  content: string;
  editor_id: string | null;
  change_note: string;
  created_at: string | null;
}

export interface TeacherResourceDetail extends TeacherResource {
  revisions: ResourceRevision[];
  /** 可复制到的其它课程，只含当前教师有生效教学安排的课程 */
  copy_targets: string[];
}

export interface TeacherResourceListData {
  course_id: string;
  /** 统计覆盖整个课程，不随筛选变化，所以切状态标签时计数不会掉成 0 */
  stats: {
    total: number;
    active: number;
    disabled: number;
    ai_retrievable: number;
    student_visible: number;
    parse_pending: number;
    parse_failed: number;
  };
  items: TeacherResource[];
  /** 下拉选项由后端从真实数据聚合，前端不写死（§15.2） */
  filters: {
    chapters: string[];
    knowledge_points: string[];
    source_types: string[];
  };
}

export interface TeacherResourceFilters {
  courseId: string;
  status?: ResourceStatus | "";
  chapter?: string;
  knowledgePoint?: string;
  sourceType?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 新建文本资料的请求体（§7.2 A） */
export interface ResourceCreatePayload {
  course_id: string;
  title: string;
  summary?: string;
  content?: string;
  source_type?: ResourceSourceType;
  chapter?: string;
  knowledge_points?: string[];
  authority_level?: ResourceAuthorityLevel;
  version?: string;
  student_visible?: boolean;
  ai_retrievable?: boolean;
  share_scope?: ResourceShareScope;
}

/** 编辑资料的请求体（§7.2 B）。只传要改的字段；status 兼作停用/启用 */
export interface ResourceUpdatePayload {
  title?: string;
  summary?: string;
  content?: string;
  source_type?: ResourceSourceType;
  chapter?: string;
  knowledge_points?: string[];
  authority_level?: ResourceAuthorityLevel;
  version?: string;
  student_visible?: boolean;
  ai_retrievable?: boolean;
  share_scope?: ResourceShareScope;
  status?: ResourceStatus;
  change_note?: string;
}

/** 上传资料的表单字段（§7.2 A）。文件本身单独传 */
export interface ResourceUploadPayload {
  course_id: string;
  title: string;
  summary?: string;
  source_type?: ResourceSourceType;
  chapter?: string;
  knowledge_points?: string[];
  authority_level?: ResourceAuthorityLevel;
  version?: string;
  student_visible?: boolean;
  share_scope?: ResourceShareScope;
}

/** 引用明细（§7.2 C「引用次数」下钻） */
export interface ResourceReferences {
  resource_id: string;
  title: string;
  reference_count: number;
  items: Array<{
    diagnosis_id: string;
    diagnosis_type: string;
    confidence: number;
    task_id: string | null;
    task_title: string;
    student_id: string | null;
    student_name: string;
    created_at: string | null;
  }>;
}
