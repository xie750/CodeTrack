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

const studentHeaders = { "X-Demo-User-Id": "user_student_001" };
const teacherHeaders = { "X-Demo-User-Id": "user_teacher_001" };

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const body = (await response.json()) as ApiResponse<T> | ApiErrorBody;
  if (!response.ok || "error" in body) {
    const message = "error" in body ? `${body.error.code}: ${body.error.message}` : response.statusText;
    throw new Error(message);
  }
  return body.data;
}

export const api = {
  listTasks: () => request<TaskListItem[]>("/api/v1/tasks", { headers: studentHeaders }),
  getTask: (taskId: string) => request<TaskDetail>(`/api/v1/tasks/${taskId}`, { headers: studentHeaders }),
  submitCode: (taskId: string, sourceCode: string) =>
    request<SubmitResponse>(`/api/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      headers: {
        ...studentHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({ language: "CPP", source_code: sourceCode })
    }),
  getExecution: (executionId: string) =>
    request<ExecutionStatus>(`/api/v1/executions/${executionId}`, { headers: studentHeaders }),
  getResults: (versionId: string) =>
    request<VersionResult>(`/api/v1/submission-versions/${versionId}/results`, { headers: studentHeaders }),
  getDiagnosis: (versionId: string) =>
    request<Diagnosis>(`/api/v1/submission-versions/${versionId}/diagnosis`, { headers: studentHeaders }),
  requestHint: (diagnosisId: string, requestedLevel: number) =>
    request<Hint>(`/api/v1/diagnoses/${diagnosisId}/hints`, {
      method: "POST",
      headers: {
        ...studentHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requested_level: requestedLevel })
    }),
  getVersions: (submissionId: string) =>
    request<VersionHistoryItem[]>(`/api/v1/submissions/${submissionId}/versions`, { headers: studentHeaders }),
  getSummary: (submissionId: string) =>
    request<Summary>(`/api/v1/submissions/${submissionId}/summary`, { headers: studentHeaders }),
  listTeacherSubmissions: () =>
    request<TeacherSubmission[]>("/api/v1/teacher/courses/course_ds_001/submissions", { headers: teacherHeaders }),
  getTeacherTimeline: (submissionId: string) =>
    request<TeacherTimeline>(`/api/v1/teacher/submissions/${submissionId}/timeline`, { headers: teacherHeaders })
};
