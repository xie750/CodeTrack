import { authHeaders, getAccessToken, type AuthUser } from "./authSession";

export type ApiMeta = { request_id: string; [key: string]: unknown };
export type ApiResponse<T> = { data: T; meta: ApiMeta };
export type ApiErrorBody = { error: { code: string; message: string; details: Record<string, unknown> }; meta: ApiMeta };

export type TaskListItem = {
  task_id: string;
  course_id: string;
  course_name: string;
  title: string;
  language: string;
  status: string;
  progress_status: string;
  latest_submission_id: string | null;
  latest_version_id: string | null;
  last_submitted_at: string | null;
  passed_at: string | null;
};

export type LearningContext = {
  student: {
    id: string;
    name: string;
    class_id: string;
    class_name: string;
  };
  courses: Array<{
    course_id: string;
    course_name: string;
    teacher_id: string;
    teacher_name: string;
    teaching_assignment_id: string;
    task_count: number;
    unfinished_count: number;
  }>;
};

export type StudentTaskCard = {
  assignment_id: string;
  task_id: string;
  course_id: string;
  course_name: string;
  class_id: string;
  class_name: string;
  teacher_id: string;
  teacher_name: string;
  title: string;
  task_type: string;
  assignment_mode: string;
  description: string;
  published_at: string | null;
  deadline: string | null;
  difficulty: string;
  knowledge_points: string[];
  status: string;
  passed_count: number;
  total_required_count: number;
  highest_hint_level: number;
  latest_summary: string;
};

export type StudentProfile = {
  student: {
    id: string;
    name: string;
    class_id: string;
    class_name: string;
  };
  course: {
    id: string;
    name: string;
    teacher_name: string;
  };
  overview: {
    overall_progress: number;
    hint_dependency_level: string;
    compile_error_rate: number;
    logic_error_rate: number;
    recent_task_completion: number;
    summary: string;
    recommendation: string;
    updated_at: string;
  };
  knowledge_states: Array<{
    knowledge_point: string;
    mastery_score: number;
    state: string;
    evidence_count: number;
    last_evidence: string;
  }>;
  frequent_errors: Array<{
    error_type: string;
    label: string;
    count: number;
    severity: string;
    related_knowledge_points: string[];
  }>;
  recommendations: Array<{
    id: string;
    title: string;
    reason: string;
    priority: number;
    related_task_id: string | null;
    related_knowledge_points: string[];
    suggested_action: string;
  }>;
};

export type TaskDetail = {
  task_id: string;
  course_id: string;
  title: string;
  language: string;
  status: string;
  description: string;
  interface_spec: {
    function_signature: string;
    editable_region: string;
    student_template: string;
    rules: string[];
  };
  learning_objectives: string[];
  public_tests: Array<{
    test_case_id: string;
    name: string;
    input_summary: { values: number[]; position: number };
    expected_output_summary: string;
  }>;
  current_progress: {
    submission_id: string | null;
    latest_version_id: string | null;
    status: string;
    version_no: number | null;
    passed_count: number;
    total_required_count: number;
    highest_hint_level: number;
  };
};

export type SubmitResponse = {
  submission_id: string;
  version_id: string;
  version_no: number;
  execution_id: string;
  status: string;
  status_url: string;
};

export type ExecutionStatus = {
  execution_id: string;
  version_id: string;
  status: string;
  compile_status: string;
  test_progress: { completed: number; total: number };
  passed_count: number | null;
  failed_count: number | null;
  started_at: string | null;
  finished_at: string | null;
  result_url: string | null;
};

export type VersionResult = {
  submission_id: string;
  version_id: string;
  version_no: number;
  submission_status: string;
  execution: {
    execution_id: string;
    status: string;
    compile_exit_code: number | null;
    compiler_stdout: string;
    compiler_stderr: string;
    started_at: string | null;
    finished_at: string | null;
  };
  tests: Array<{
    test_case_id: string;
    name: string;
    visibility: string;
    status: string;
    expected_output_summary: string;
    actual_output: string;
    duration_ms: number;
    error_tag: string;
  }>;
  diagnosis: { status: string; diagnosis_id: string | null; needs_teacher_review: boolean };
  hint_access: { highest_viewed_level: number; available_levels: number[]; reference_answer_viewed: boolean };
};

export type Diagnosis = {
  diagnosis_id: string;
  version_id: string;
  status: string;
  diagnosis_type: string;
  confidence: number;
  explanation: string;
  verified_evidence_ids: string[];
  knowledge_source_ids: string[];
  knowledge_sources: Array<{
    source_id: string;
    title: string;
    summary: string;
    source_type: string;
    version: string;
    authority_level: string;
  }>;
  needs_teacher_review: boolean;
  hint_level: number | null;
  hint: string | null;
  model_provider: string;
  model_name: string;
};

export type Hint = {
  hint_id: string;
  diagnosis_id: string;
  level: number;
  content: string;
  unlocked: boolean;
  unlock_reason: string;
  generated_at: string;
  viewed_at: string;
};

export type VersionHistoryItem = {
  version_id: string;
  version_no: number;
  language: string;
  source_code: string;
  code_hash: string;
  created_at: string;
  submission_status: string;
  execution_status: string;
  passed_count: number;
  total_required_count: number;
  highest_hint_level: number;
  is_latest: boolean;
  is_final: boolean;
};

export type Summary = {
  submission_id: string;
  task_id: string;
  final_status: string;
  version_count: number;
  highest_hint_level: number;
  started_at: string;
  passed_at: string | null;
  total_duration_ms: number | null;
  next_step_suggestion: string;
  test_comparison: Array<{ test_case_id: string; name: string; first_status: string; final_status: string }>;
  capability_evidence: null | {
    evidence_id: string;
    capability_code: string;
    strength: string;
    evidence_type: string;
    explanation: string;
  };
};

export type TeacherSubmission = {
  submission_id: string;
  task_id: string;
  task_title: string;
  student_id: string;
  student_name: string;
  status: string;
  version_count: number;
  latest_version_id: string | null;
  highest_hint_level: number;
  latest_diagnosis_type: string | null;
  passed_at: string | null;
};

export type TeacherTimeline = {
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
};

const GET_CACHE_TTL_MS = 2 * 60 * 1000;

type CachedGetEntry<T> = {
  data?: T;
  fetchedAt: number;
  promise?: Promise<T>;
};

const getCache = new Map<string, CachedGetEntry<unknown>>();

function studentTasksUrl(courseId?: string) {
  return `/api/v1/student/tasks${courseId ? `?course_id=${encodeURIComponent(courseId)}` : ""}`;
}

function studentProfileUrl(courseId?: string) {
  return `/api/v1/student/profile${courseId ? `?course_id=${encodeURIComponent(courseId)}` : ""}`;
}

function getCacheKey(url: string) {
  return `${getAccessToken() ?? "anonymous"}:${url}`;
}

function isFresh(entry: CachedGetEntry<unknown> | undefined, maxAgeMs = GET_CACHE_TTL_MS) {
  return Boolean(entry?.data) && Date.now() - (entry?.fetchedAt ?? 0) < maxAgeMs;
}

function peekCachedGet<T>(url: string, maxAgeMs = GET_CACHE_TTL_MS): T | null {
  const entry = getCache.get(getCacheKey(url));
  return isFresh(entry, maxAgeMs) ? (entry?.data as T) : null;
}

function clearApiCache(predicate?: (url: string) => boolean) {
  if (!predicate) {
    getCache.clear();
    return;
  }
  for (const key of getCache.keys()) {
    const url = key.slice(key.indexOf(":") + 1);
    if (predicate(url)) {
      getCache.delete(key);
    }
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(authHeaders());
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(url, {
    ...options,
    headers
  });
  const body = (await response.json()) as ApiResponse<T> | ApiErrorBody;
  if (!response.ok || "error" in body) {
    const message = "error" in body ? `${body.error.code}: ${body.error.message}` : response.statusText;
    throw new Error(message);
  }
  return body.data;
}

async function cachedGet<T>(url: string, maxAgeMs = GET_CACHE_TTL_MS): Promise<T> {
  const key = getCacheKey(url);
  const existing = getCache.get(key) as CachedGetEntry<T> | undefined;
  if (isFresh(existing, maxAgeMs)) {
    return existing?.data as T;
  }
  if (existing?.promise) {
    return existing.promise;
  }

  const promise = request<T>(url)
    .then((data) => {
      getCache.set(key, { data, fetchedAt: Date.now() });
      return data;
    })
    .catch((error) => {
      const current = getCache.get(key);
      if (current && "promise" in current) {
        getCache.delete(key);
      }
      throw error;
    });

  getCache.set(key, { data: existing?.data, fetchedAt: existing?.fetchedAt ?? 0, promise });
  return promise;
}

export const api = {
  login: (username: string, password: string) =>
    request<{
      access_token: string;
      token_type: string;
      expires_in: number;
      user: AuthUser;
    }>("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    }),
  me: () => request<AuthUser>("/api/v1/auth/me"),
  logout: () => request<{ logged_out: boolean }>("/api/v1/auth/logout", { method: "POST" }),
  listTasks: () => request<TaskListItem[]>("/api/v1/tasks"),
  getTask: (taskId: string) => request<TaskDetail>(`/api/v1/tasks/${taskId}`),
  getLearningContext: () => cachedGet<LearningContext>("/api/v1/student/learning-context"),
  listStudentTasks: (courseId?: string) =>
    cachedGet<StudentTaskCard[]>(studentTasksUrl(courseId)),
  getStudentProfile: (courseId?: string) =>
    cachedGet<StudentProfile>(studentProfileUrl(courseId)),
  submitCode: async (taskId: string, sourceCode: string) => {
    const result = await request<SubmitResponse>(`/api/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({ language: "CPP", source_code: sourceCode })
    });
    clearApiCache((url) => url.startsWith("/api/v1/student/") || url === "/api/v1/tasks");
    return result;
  },
  getExecution: (executionId: string) =>
    request<ExecutionStatus>(`/api/v1/executions/${executionId}`),
  getResults: (versionId: string) =>
    request<VersionResult>(`/api/v1/submission-versions/${versionId}/results`),
  getDiagnosis: (versionId: string) =>
    request<Diagnosis>(`/api/v1/submission-versions/${versionId}/diagnosis`),
  requestHint: (diagnosisId: string, requestedLevel: number) =>
    request<Hint>(`/api/v1/diagnoses/${diagnosisId}/hints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requested_level: requestedLevel })
    }),
  getVersions: (submissionId: string) =>
    request<VersionHistoryItem[]>(`/api/v1/submissions/${submissionId}/versions`),
  getSummary: (submissionId: string) =>
    request<Summary>(`/api/v1/submissions/${submissionId}/summary`),
  listTeacherSubmissions: () =>
    request<TeacherSubmission[]>("/api/v1/teacher/courses/course_ds_001/submissions"),
  getTeacherTimeline: (submissionId: string) =>
    request<TeacherTimeline>(`/api/v1/teacher/submissions/${submissionId}/timeline`)
};

export const apiCache = {
  clear: clearApiCache,
  peekLearningContext: () => peekCachedGet<LearningContext>("/api/v1/student/learning-context"),
  peekStudentTasks: (courseId?: string) => peekCachedGet<StudentTaskCard[]>(studentTasksUrl(courseId)),
  peekStudentProfile: (courseId?: string) => peekCachedGet<StudentProfile>(studentProfileUrl(courseId))
};
