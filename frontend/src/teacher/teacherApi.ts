import { request } from "../api";
import type {
  AiReviewActionPayload,
  AiReviewDetailData,
  AiReviewQueue,
  AiReviewQueueFilters,
  ClassAlerts,
  ClassAnalytics,
  DiagnosisClassOption,
  DiagnosisStudentOption,
  DiagnosisTaskOption,
  ImprovementStrategyData,
  ImprovementStrategyFilters,
  StudentAnalytics,
  TeacherCourse,
  TeacherDashboardData,
  TeacherTeachingAssignment,
  TaskMonitorData,
  TeacherTimeline,
} from "./teacherTypes";

/**
 * 教师端 API
 * 统一使用学生端 request 方法
 * Token: codetrack.accessToken
 */

// 获取教师教学安排列表（一个班级一门课一行）
export const getTeacherTeachingAssignments = () =>
  request<TeacherTeachingAssignment[]>("/api/v1/teacher/teaching-assignments");

// 获取教师课程列表（按课程聚合，course_id 唯一）
export const getTeacherCourses = () =>
  request<TeacherCourse[]>("/api/v1/teacher/courses");

// 获取课程详情
export const getTeacherCourse = (courseId: string) =>
  request<TeacherCourse>(`/api/v1/teacher/courses/${encodeURIComponent(courseId)}`);

// 获取课程学生提交列表
export const getCourseSubmissions = (courseId: string) =>
  request<any[]>("/api/v1/teacher/courses/" + encodeURIComponent(courseId) + "/submissions");

// 获取任务监控数据
export const getTaskMonitor = (taskId: string) =>
  request<TaskMonitorData>(`/api/v1/teacher/tasks/${encodeURIComponent(taskId)}/monitor`);

// 获取提交时间线
export const getSubmissionTimeline = (submissionId: string) =>
  request<TeacherTimeline>(`/api/v1/teacher/submissions/${encodeURIComponent(submissionId)}/timeline`);

// 获取提交版本列表
export const getSubmissionVersions = (submissionId: string) =>
  request<any[]>(`/api/v1/submissions/${encodeURIComponent(submissionId)}/versions`);

// 获取版本执行结果
export const getVersionResults = (versionId: string) =>
  request<any>(`/api/v1/submission-versions/${encodeURIComponent(versionId)}/results`);

// 获取版本诊断
export const getVersionDiagnosis = (versionId: string) =>
  request<any>(`/api/v1/submission-versions/${encodeURIComponent(versionId)}/diagnosis`);

// 教师首页聚合数据
export const getTeacherDashboard = (teachingAssignmentId?: string) =>
  request<TeacherDashboardData>(teachingAssignmentId
    ? `/api/v1/teacher/dashboard?teaching_assignment_id=${encodeURIComponent(teachingAssignmentId)}`
    : "/api/v1/teacher/dashboard"
  );

// ===== AI 审核（开发方案 §十一） =====

// 审核队列。筛选和分页都在后端做，stats 始终覆盖整个队列而不是当前页
export const getAiReviewQueue = (filters: AiReviewQueueFilters = {}) => {
  const query = new URLSearchParams();
  if (filters.reviewStatus) query.set("review_status", filters.reviewStatus);
  if (filters.confidenceMax !== undefined) query.set("confidence_max", String(filters.confidenceMax));
  if (filters.diagnosisType) query.set("diagnosis_type", filters.diagnosisType);
  if (filters.student) query.set("student", filters.student);
  if (filters.page) query.set("page", String(filters.page));
  if (filters.pageSize) query.set("page_size", String(filters.pageSize));
  const suffix = query.toString();
  return request<AiReviewQueue>(`/api/v1/teacher/ai-reviews${suffix ? `?${suffix}` : ""}`);
};

// 审核详情
export const getAiReviewDetail = (diagnosisId: string) =>
  request<AiReviewDetailData>(`/api/v1/teacher/ai-reviews/${encodeURIComponent(diagnosisId)}`);

// 审核动作。三个动作都返回更新后的完整详情，前端不用再拉一次
const postAiReviewAction = (
  diagnosisId: string,
  action: "accept" | "modify" | "reject",
  payload: AiReviewActionPayload
) =>
  request<AiReviewDetailData>(
    `/api/v1/teacher/ai-reviews/${encodeURIComponent(diagnosisId)}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

// 接受原始诊断，学生端显示「教师已确认」
export const acceptAiReview = (diagnosisId: string, payload: AiReviewActionPayload = {}) =>
  postAiReviewAction(diagnosisId, "accept", payload);

// 修改后接受，学生端显示「教师已修改」；revised_explanation 必填
export const modifyAiReview = (diagnosisId: string, payload: AiReviewActionPayload) =>
  postAiReviewAction(diagnosisId, "modify", payload);

// 驳回错误诊断，原始 AI 输出仍保留在库里
export const rejectAiReview = (diagnosisId: string, payload: AiReviewActionPayload = {}) =>
  postAiReviewAction(diagnosisId, "reject", payload);

// ===== 学情诊断（开发方案 §十） =====

function withQuery(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const suffix = query.toString();
  return `${path}${suffix ? `?${suffix}` : ""}`;
}

// 班级选项。课程选项复用已有的 getTeacherCourses，不另开接口
export const getDiagnosisClassOptions = (courseId: string) =>
  request<DiagnosisClassOption[]>(
    withQuery("/api/v1/teacher/diagnosis/options/classes", { course_id: courseId })
  );

// 学生选项。classId 不传则返回该课程下当前教师全部班级的学生
export const getDiagnosisStudentOptions = (courseId: string, classId?: string) =>
  request<DiagnosisStudentOption[]>(
    withQuery("/api/v1/teacher/diagnosis/options/students", {
      course_id: courseId,
      class_id: classId,
    })
  );

// 已发布任务选项
export const getDiagnosisTaskOptions = (courseId: string, classId?: string) =>
  request<DiagnosisTaskOption[]>(
    withQuery("/api/v1/teacher/diagnosis/options/tasks", {
      course_id: courseId,
      class_id: classId,
    })
  );

// 班级学情总览。taskId 只收窄成绩趋势，不影响名册口径
export const getClassAnalytics = (courseId: string, classId?: string, taskId?: string) =>
  request<ClassAnalytics>(
    withQuery("/api/v1/teacher/analytics/class", {
      course_id: courseId,
      class_id: classId,
      task_id: taskId,
    })
  );

// 个体诊断。画像六件套与学生端 /api/v1/student/profile 同源
export const getStudentAnalytics = (courseId: string, studentId: string, classId?: string) =>
  request<StudentAnalytics>(
    withQuery("/api/v1/teacher/analytics/student", {
      course_id: courseId,
      student_id: studentId,
      class_id: classId,
    })
  );

// 预警中心。规则实时计算，只读
export const getClassAlerts = (courseId: string, classId?: string) =>
  request<ClassAlerts>(
    withQuery("/api/v1/teacher/alerts", { course_id: courseId, class_id: classId })
  );

// 教学策略优化聚合（§十二 12.1）。只读；建议由后端规则从统计推导，不调大模型
export const getImprovementStrategy = (filters: ImprovementStrategyFilters) =>
  request<ImprovementStrategyData>(
    withQuery("/api/v1/teacher/improvement/strategy", {
      course_id: filters.courseId,
      class_id: filters.classId,
      compare_class_id: filters.compareClassId,
      // withQuery 会丢掉 falsy 值，window_days=0（全部）本来就是后端默认，正好不必传
      window_days: filters.windowDays ? String(filters.windowDays) : undefined,
    })
  );
