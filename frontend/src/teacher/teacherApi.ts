import { request } from "../api";
import { authHeaders } from "../authSession";
import type {
  AiReviewActionPayload,
  AiReviewDetailData,
  AiReviewQueue,
  AiReviewQueueFilters,
  ChapterCreatePayload,
  ChapterUpdatePayload,
  ClassAlerts,
  ClassAnalytics,
  CourseClassFilters,
  CourseClassListData,
  CourseRosterData,
  CourseRosterFilters,
  CourseSyllabusData,
  DiagnosisClassOption,
  DiagnosisStudentOption,
  DiagnosisTaskOption,
  ImprovementStrategyData,
  ImprovementStrategyFilters,
  KnowledgePointCreatePayload,
  KnowledgePointUpdatePayload,
  KnowledgePointUsageDetail,
  MonitorBoardData,
  MonitorBoardFilters,
  ResourceCreatePayload,
  ResourceReferences,
  ResourceUpdatePayload,
  ResourceUploadPayload,
  StudentAnalytics,
  SyllabusChapter,
  SyllabusKnowledgePoint,
  SyllabusReorderPayload,
  TeacherCourse,
  TeacherDashboardData,
  TeacherDashboardFilters,
  TeacherDashboardOverview,
  TeacherResource,
  TeacherResourceDetail,
  TeacherResourceFilters,
  TeacherResourceListData,
  TeacherTeachingAssignment,
  TaskMonitorData,
  TeacherTaskCreatePayload,
  TeacherTaskCreateResult,
  TeacherTaskListData,
  TeacherTaskListFilters,
  TeacherTaskPublishPayload,
  TeacherTaskPublishResult,
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

/**
 * 教学首页聚合（§五）。一次拿全六张概览卡片、今日待办、最近任务和班级学情摘要。
 *
 * 刻意不在前端拼几个接口：`/monitor/board` 一次只看一个任务，而首页的平均完成率和
 * 逾期人数要横跨该班全部任务；分开打还会让教师切换班级时几张卡片落在不同班上。
 */
export const getTeacherDashboardOverview = (filters: TeacherDashboardFilters = {}) =>
  request<TeacherDashboardOverview>(
    withQuery("/api/v1/teacher/dashboard/overview", {
      teaching_assignment_id: filters.teachingAssignmentId,
      term: filters.term,
      course_id: filters.courseId,
      class_id: filters.classId,
    })
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

// ===== 任务中心（开发方案 §八 8.1 任务列表） =====

/**
 * 任务列表。只读：筛选、分页和统计都在后端算，`stats` 覆盖整个范围而不是当前页，
 * 所以切换状态标签时其它卡片的计数不会掉成 0。
 */
export const getTeacherTasks = (filters: TeacherTaskListFilters = {}) =>
  request<TeacherTaskListData>(
    withQuery("/api/v1/teacher/tasks", {
      course_id: filters.courseId,
      class_id: filters.classId,
      task_type: filters.taskType,
      content_status: filters.contentStatus,
      keyword: filters.keyword,
      page: filters.page ? String(filters.page) : undefined,
      page_size: filters.pageSize ? String(filters.pageSize) : undefined,
    })
  );

export const createTeacherTask = (payload: TeacherTaskCreatePayload) =>
  request<TeacherTaskCreateResult>("/api/v1/teacher/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const publishTeacherTask = (taskId: string, payload: TeacherTaskPublishPayload) =>
  request<TeacherTaskPublishResult>(`/api/v1/teacher/tasks/${encodeURIComponent(taskId)}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

// ===== 任务监控（开发方案 §九 9.1 提交进度看板） =====

/**
 * 提交进度看板。只读：概览卡片、筛选和分页都在后端算，`stats` 覆盖整个名册而不是当前页，
 * 所以点开「逾期」筛选后其它卡片的计数不会掉成 0。
 */
export const getMonitorBoard = (filters: MonitorBoardFilters = {}) =>
  request<MonitorBoardData>(withQuery("/api/v1/teacher/monitor/board", monitorQuery(filters)));

/**
 * 导出当前筛选结果。走与看板相同的取数路径，权限校验在后端（§15.1）。
 * 返回 Blob 而不是 JSON，所以不能用 request()。
 */
export async function exportMonitorBoard(filters: MonitorBoardFilters = {}) {
  const url = withQuery("/api/v1/teacher/monitor/board/export", monitorQuery(filters));
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error(`导出失败：${response.status}`);
  return response.blob();
}

// 分页参数只在看板用，导出要全量，所以分页字段留给调用方决定是否传
function monitorQuery(filters: MonitorBoardFilters): Record<string, string | undefined> {
  return {
    course_id: filters.courseId,
    class_id: filters.classId,
    task_id: filters.taskId,
    status: filters.status,
    // hint_level 为 0 是「未使用提示」这个有效筛选值，不能被 falsy 判断吞掉
    hint_level: filters.hintLevel === undefined ? undefined : String(filters.hintLevel),
    error_type: filters.errorType,
    keyword: filters.keyword,
    page: filters.page ? String(filters.page) : undefined,
    page_size: filters.pageSize ? String(filters.pageSize) : undefined,
  };
}

// ===== 资料中心（开发方案 §七） =====

/**
 * 资料列表（§7.2 A）。`stats` 和 `filters` 覆盖整个课程而不是当前页，
 * 所以切换状态标签时统计卡不会掉成 0、章节和知识点下拉也不会把自己筛没了。
 */
export const getTeacherResources = (filters: TeacherResourceFilters) =>
  request<TeacherResourceListData>(
    withQuery("/api/v1/teacher/resources", {
      course_id: filters.courseId,
      status: filters.status || undefined,
      chapter: filters.chapter,
      knowledge_point: filters.knowledgePoint,
      source_type: filters.sourceType,
      q: filters.keyword,
      page: filters.page ? String(filters.page) : undefined,
      page_size: filters.pageSize ? String(filters.pageSize) : undefined,
    })
  );

// 资料详情，附版本记录和可复制的目标课程（§7.2 B / C）
export const getTeacherResource = (resourceId: string) =>
  request<TeacherResourceDetail>(`/api/v1/teacher/resources/${encodeURIComponent(resourceId)}`);

// 新建文本资料（§7.2 A）
export const createTeacherResource = (payload: ResourceCreatePayload) =>
  request<TeacherResource>("/api/v1/teacher/resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

/**
 * 编辑资料（§7.2 B），也承担 §7.2 A 的停用与启用：传 `status` 即可。
 * 返回值带上更新后的版本记录，前端不用再拉一次详情。
 */
export const updateTeacherResource = (resourceId: string, payload: ResourceUpdatePayload) =>
  request<TeacherResourceDetail>(`/api/v1/teacher/resources/${encodeURIComponent(resourceId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

// 删除未被引用的资料。被历史诊断引用过的会返回 409 RESOURCE_IN_USE（§7.4）
export const deleteTeacherResource = (resourceId: string) =>
  request<{ resource_id: string; deleted: boolean }>(
    `/api/v1/teacher/resources/${encodeURIComponent(resourceId)}`,
    { method: "DELETE" }
  );

/**
 * 上传资料（§7.2 A）。第一版只落盘 + 记元数据，不做切片，
 * 所以上传件回来是 PARSE_PENDING 且不参与 AI 检索（§7.4）。
 *
 * 注意不要设 Content-Type：`request` 会把传入的 header 覆盖上去，
 * 手动写死 multipart/form-data 会丢掉 fetch 自动生成的 boundary。
 */
export const uploadTeacherResource = (file: File, payload: ResourceUploadPayload) => {
  const form = new FormData();
  form.append("file", file);
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    form.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
  });
  return request<TeacherResource>("/api/v1/teacher/resources/upload", {
    method: "POST",
    body: form,
  });
};

// 复制到其它课程（§7.2 C）。副本落成停用状态，由教师在新课程里确认后再启用
export const copyTeacherResource = (resourceId: string, targetCourseId: string) =>
  request<TeacherResource>(`/api/v1/teacher/resources/${encodeURIComponent(resourceId)}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_course_id: targetCourseId }),
  });

// 引用明细（§7.2 C「引用次数」下钻）。只读历史
export const getResourceReferences = (resourceId: string) =>
  request<ResourceReferences>(
    `/api/v1/teacher/resources/${encodeURIComponent(resourceId)}/references`
  );

// ===== 课程教学（开发方案 §六） =====

/**
 * 教学班卡片（§6.1）。一行 = 一个「行政班 × 课程」教学安排。
 *
 * 注意这里用 /course-classes 而不是 getTeacherCourses()：后者按课程聚合，
 * §6.1 要的是教学班，同一门课的两个班要分开显示。
 */
export const getCourseClasses = (filters: CourseClassFilters = {}) =>
  request<CourseClassListData>(
    withQuery("/api/v1/teacher/course-classes", {
      term: filters.term,
      keyword: filters.keyword,
    })
  );

/** 教学班学生名单（§6.1）。只读，风险等级与预警中心同源 */
export const getCourseRoster = (
  teachingAssignmentId: string,
  filters: CourseRosterFilters = {}
) =>
  request<CourseRosterData>(
    withQuery(
      `/api/v1/teacher/course-classes/${encodeURIComponent(teachingAssignmentId)}/students`,
      {
        keyword: filters.keyword,
        risk: filters.risk || undefined,
        page: filters.page ? String(filters.page) : undefined,
        page_size: filters.pageSize ? String(filters.pageSize) : undefined,
      }
    )
  );

/** 编辑课程教学说明（§6.1 唯一的写操作）。课程的建立和归档是管理员端职责 */
export const updateCourseDescription = (courseId: string, description: string) =>
  request<{ course_id: string; title: string; description: string; status: string }>(
    `/api/v1/teacher/courses/${encodeURIComponent(courseId)}/description`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    }
  );

/** 整棵章节—知识点树（§6.2）。一次取全量，章节树本来就要整棵展示 */
export const getCourseSyllabus = (courseId: string) =>
  request<CourseSyllabusData>(
    `/api/v1/teacher/courses/${encodeURIComponent(courseId)}/syllabus`
  );

export const createChapter = (courseId: string, payload: ChapterCreatePayload) =>
  request<SyllabusChapter>(`/api/v1/teacher/courses/${encodeURIComponent(courseId)}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const updateChapter = (chapterId: string, payload: ChapterUpdatePayload) =>
  request<SyllabusChapter>(`/api/v1/teacher/chapters/${encodeURIComponent(chapterId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

/** 删除章节。名下还有生效知识点会返回 409 CHAPTER_NOT_EMPTY（§6.2） */
export const deleteChapter = (chapterId: string) =>
  request<{ chapter_id: string; deleted: boolean }>(
    `/api/v1/teacher/chapters/${encodeURIComponent(chapterId)}`,
    { method: "DELETE" }
  );

export const createKnowledgePoint = (
  chapterId: string,
  payload: KnowledgePointCreatePayload
) =>
  request<SyllabusKnowledgePoint>(
    `/api/v1/teacher/chapters/${encodeURIComponent(chapterId)}/knowledge-points`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

/**
 * 编辑知识点（§6.2）。跨章节移动也走这里的 chapter_id。
 *
 * 被引用过的知识点改名会返回 409 KNOWLEDGE_POINT_IN_USE —— 软关联靠名字，
 * 改了名历史资料、题目和画像的引用会静默变成孤儿。
 */
export const updateKnowledgePoint = (
  knowledgePointId: string,
  payload: KnowledgePointUpdatePayload
) =>
  request<SyllabusKnowledgePoint>(
    `/api/v1/teacher/knowledge-points/${encodeURIComponent(knowledgePointId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

/** 删除知识点。被资料/题目/画像引用过会返回 409 KNOWLEDGE_POINT_IN_USE（§6.2） */
export const deleteKnowledgePoint = (knowledgePointId: string) =>
  request<{ knowledge_point_id: string; deleted: boolean }>(
    `/api/v1/teacher/knowledge-points/${encodeURIComponent(knowledgePointId)}`,
    { method: "DELETE" }
  );

/** 引用明细，删除确认框据此列出具体资料和任务（§6.2） */
export const getKnowledgePointUsage = (knowledgePointId: string) =>
  request<KnowledgePointUsageDetail>(
    `/api/v1/teacher/knowledge-points/${encodeURIComponent(knowledgePointId)}/usage`
  );

/**
 * 拖拽排序（§6.2）。整层一次性提交而不是逐个 PATCH：
 * 拖一次会改动多行顺序，分开发会出现中间态。返回刷新后的整棵树。
 */
export const reorderSyllabus = (courseId: string, payload: SyllabusReorderPayload) =>
  request<CourseSyllabusData>(
    `/api/v1/teacher/courses/${encodeURIComponent(courseId)}/syllabus/reorder`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
