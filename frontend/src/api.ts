import { authHeaders, getAccessToken, type AuthUser } from "./authSession";

export type ApiMeta = { request_id: string; [key: string]: unknown };
export type ApiResponse<T> = { data: T; meta: ApiMeta };
export type ApiErrorBody = { error: { code: string; message: string; details: Record<string, unknown> }; meta: ApiMeta };
export type ApiErrorKind = "network" | "server" | "auth" | "forbidden" | "bad_response" | "request";

type ApiRequestErrorOptions = {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  requestId?: string;
  rawMessage?: string;
  recovery?: string;
  details?: Record<string, unknown>;
};

export class ApiRequestError extends Error {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  requestId?: string;
  rawMessage?: string;
  recovery?: string;
  details?: Record<string, unknown>;

  constructor(message: string, options: ApiRequestErrorOptions) {
    super(message);
    this.name = "ApiRequestError";
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.rawMessage = options.rawMessage;
    this.recovery = options.recovery;
    this.details = options.details;
  }
}

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
  workspace_type: string;
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
  behavior_events?: Array<{
    id: string;
    event_type: string;
    occurred_at: string | null;
    knowledge_points: string[];
    error_type: string | null;
    payload: Record<string, unknown>;
    activity_minutes: number;
    quality_score: number;
    summary: string;
    source: string;
  }>;
};

export type StudentKnowledgeGraphNode = {
  id: string;
  label: string;
  type: "知识点" | "概念" | "方法" | "公式" | "案例" | "能力" | string;
  description: string;
  difficulty: number;
  x: number;
  y: number;
  color: string;
  source: "ai" | "custom" | string;
};

export type StudentKnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "前驱" | "后继" | "相关" | string;
  label: string;
};

export type StudentKnowledgeGraph = {
  id: string;
  teaching_assignment_id: string;
  course_id: string;
  course_name: string;
  class_id: string;
  teacher_id: string;
  teacher_name: string;
  title: string;
  description: string;
  status: "published" | string;
  target_classes: string[];
  source_files: Array<{
    filename: string;
    mime_type: string;
    size_bytes: number;
  }>;
  source_summary: string;
  node_count: number;
  edge_count: number;
  nodes: StudentKnowledgeGraphNode[];
  edges: StudentKnowledgeGraphEdge[];
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
};

export type PracticeProjectSummary = {
  id: string;
  course_id: string;
  course_name: string;
  title: string;
  status: string;
  status_label: string;
  description: string;
  long_description: string;
  progress: number;
  accent: "blue" | "cyan" | "violet" | string;
  tags: string[];
  members: string[];
  period: string;
  stage: string;
  direction: string;
  capability_points: string[];
  last_activity_summary: string;
  weekly_hours: number;
};

export type PracticeProjectActivity = {
  id: string;
  project_id: string | null;
  type: string;
  text: string;
  time: string;
  created_at: string | null;
};

export type PracticeProjectPathStep = {
  title: string;
  description: string;
};

export type PracticeProjectProofItem = {
  title: string;
  description: string;
  icon: string;
};

export type PracticeProjectReadiness = {
  status: "ACTIVE" | "PREPARING" | string;
  title: string;
  description: string;
  primary_action_label: string;
  secondary_action_label: string;
};

export type PracticeResearchSignal = {
  label: string;
  value: string;
  note: string;
};

export type PracticeResearchRecommendation = {
  project_id: string;
  profile_fit: string;
  recommendation_reason: string;
  signals: PracticeResearchSignal[];
  confidence: number;
};

export type PracticeProjectHome = {
  projects: PracticeProjectSummary[];
  recommended_project_id: string | null;
  research_recommendation?: PracticeResearchRecommendation | null;
  stats: {
    project_count: number;
    in_progress_count: number;
    completed_count: number;
    weekly_hours: number;
    project_delta: number;
    completed_delta: number;
    weekly_hours_delta: number;
  };
  activities: PracticeProjectActivity[];
  path_steps: PracticeProjectPathStep[];
  readiness: PracticeProjectReadiness;
  proof_items: PracticeProjectProofItem[];
};

export type PracticeProjectTaskSection = {
  title: string;
  description: string;
  action?: string;
  icon?: string;
};

export type PracticeProjectResource = {
  title: string;
  meta: string;
};

export type PracticeResearchBrief = {
  profile_fit: string;
  recommendation_reason: string;
  research_stage: string;
  frontier_topics: Array<{ title: string; source: string; heat: number; summary: string }>;
  writing_blocks: Array<{ title: string; content: string; status: string }>;
  writing_checks: Array<{ label: string; result: string }>;
  data_metrics: Array<{ label: string; value: string; note: string }>;
  chart_series: Array<{ label: string; value: number }>;
  data_insights: string[];
  citations: PracticeProjectResource[];
  generated_at: string | null;
  confidence: number;
  next_actions: string[];
};

export type PracticeProjectSubmission = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  status_label: string;
  review_comment: string;
  content: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string | null;
};

export type PracticeProjectDetail = {
  project: PracticeProjectSummary;
  metrics: {
    completed_stage_count: number;
    total_stage_count: number;
    experiment_record_count: number;
    submission_count: number;
  };
  task_sections: PracticeProjectTaskSection[];
  submission_requirements: string[];
  acceptance_criteria: string[];
  mentor_tips: string[];
  resources: PracticeProjectResource[];
  research_brief?: PracticeResearchBrief;
  submissions: PracticeProjectSubmission[];
  activities: PracticeProjectActivity[];
};

export type RagKnowledgeBaseListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  embedding_model: string;
  document_count: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
};

export type RagFileProfile = {
  file_type: string;
  source_family: string;
  mime_type: string | null;
  extension: string;
  size_bytes: number;
  parser_hint: string;
};

export type RagContentProfile = {
  content_profile: string;
  cleaning_strategy: string;
  chunking_strategy: string;
  signals: Record<string, unknown>;
};

export type RagKnowledgeDocument = {
  id: string;
  name: string;
  title: string;
  filename: string;
  mime_type: string | null;
  extension: string | null;
  size_bytes: number;
  status: string;
  progress: number;
  stage: string;
  chunk_count: number;
  active_version_id: string | null;
  file_profile: RagFileProfile | Record<string, never>;
  content_profile: RagContentProfile | Record<string, never>;
  cleaning_strategy: string | null;
  chunking_strategy: string | null;
  error: null | { code: string; message: string; stage: string | null };
  created_at: string;
  updated_at: string;
};

export type RagKnowledgeChunk = {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  content_preview: string;
  content: string;
  heading_path: string[];
  page_start: number | null;
  page_end: number | null;
  slide_start: number | null;
  slide_end: number | null;
  char_count: number;
  token_count: number | null;
  metadata: Record<string, unknown>;
};

export type RagIngestionStep = {
  id: string;
  name: string;
  order: number;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
};

export type RagIngestionRun = {
  id: string;
  workflow_type: string;
  status: string;
  model_provider: string | null;
  model_name: string | null;
  prompt_version: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: null | { code: string; message: string | null };
  started_at: string;
  finished_at: string | null;
  steps: RagIngestionStep[];
};

export type RagKnowledgeGraphImportNode = {
  id: string;
  name: string;
  type: string;
  definition: string;
  aliases: string[];
  confidence: number;
  source_chunk_ids: string[];
  evidence: Array<{
    chunk_id: string;
    chunk_index: number;
    heading_path: string[];
    page_start: number | null;
    page_end: number | null;
    slide_start: number | null;
    slide_end: number | null;
    excerpt: string;
  }>;
  properties: Record<string, unknown>;
};

export type RagKnowledgeGraphImportEdge = {
  id: string;
  source: string;
  target: string;
  source_name: string;
  target_name: string;
  type: string;
  label: string;
  rationale: string;
  confidence: number;
  evidence_chunk_ids: string[];
};

export type RagKnowledgeGraphImportPlan = {
  document: {
    id: string;
    name: string;
    knowledge_base_id: string;
    active_version_id: string;
    status: string;
  };
  import_policy: {
    mode: string;
    requires_confirmation: boolean;
    auto_publish: boolean;
    boundary: string;
  };
  segmentation: {
    strategy: string;
    cleaning_strategy: string;
    content_profile: Record<string, unknown>;
    source_layers: Array<{ layer: string; count: number; role: string }>;
    chunk_groups: Array<{
      parent_chunk_id: string | null;
      parent_index: number;
      heading_path: string[];
      child_count: number;
      child_chunk_ids: string[];
      split_reason: string | null;
      page_start: number | null;
      page_end: number | null;
      slide_start: number | null;
      slide_end: number | null;
    }>;
  };
  nodes: RagKnowledgeGraphImportNode[];
  edges: RagKnowledgeGraphImportEdge[];
  quality: {
    status: string;
    risk_flags: string[];
    chunk_coverage: number;
    candidate_node_count: number;
    candidate_edge_count: number;
    suggestion: string;
  };
  market_reference_pattern: string[];
};

export type StudentAiChatCitation = {
  source_id: string;
  title: string;
  summary: string;
  source_type: string;
  version: string;
  authority_level: string;
  document_id?: string;
  chunk_id?: string;
  quote?: string;
};

export type StudentAiChatResponse = {
  answer: string;
  confidence: number;
  citations: StudentAiChatCitation[];
  suggested_actions: string[];
  profile_used: boolean;
  source_used: boolean;
  safety_note: string;
  model_provider: string;
  model_name: string;
  model_key?: string;
  model_label?: string;
  run_id: string;
  session?: StudentAiChatSession;
  user_message_id?: string;
  assistant_message_id?: string;
};

export type StudentAiModelOption = {
  key: "default" | "fine_tuned" | string;
  label: string;
  provider: string;
  model_name: string;
  configured: boolean;
  description: string;
};

export type GeneratedResourceCitation = StudentAiChatCitation;

export type GeneratedResourceSlide = {
  title: string;
  subtitle?: string;
  bullets: string[];
  speaker_notes?: string;
  citation_ids?: string[];
  layout?: string;
};

export type GeneratedResourceSection = {
  heading: string;
  paragraphs: string[];
  citation_ids?: string[];
};

export type GeneratedResourceNode = {
  id: string;
  node_id?: string;
  parent_id?: string | null;
  label: string;
  title?: string;
  level: number;
  depth?: number;
  summary?: string;
  node_type?: string;
  knowledge_points?: string[];
  citation_ids?: string[];
  citations?: string[];
  confidence?: number;
};

export type GeneratedResourceEdge = {
  source: string;
  target: string;
  source_node_id?: string;
  target_node_id?: string;
  relationship_type?: string;
  label?: string;
};

export type GeneratedResourceQuestion = {
  type: string;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  citation_ids?: string[];
};

export type GeneratedResourceCard = {
  front: string;
  back: string;
  tips?: string[];
  citation_ids?: string[];
};

export type GeneratedResourcePodcastSegment = {
  speaker: string;
  label: string;
  text: string;
  voice?: string;
  takeaway?: string;
  citation_ids?: string[];
};

export type GeneratedResourcePresentonSlide = {
  id?: string | null;
  index: number;
  layout?: string | null;
  layout_group?: string | null;
  title: string;
  summary: string;
  image_url?: string | null;
  speaker_note?: string | null;
  content?: Record<string, unknown>;
};

export type GeneratedResourceType =
  | "PPT"
  | "DOCUMENT"
  | "MIND_MAP"
  | "PRACTICE_SET"
  | "KNOWLEDGE_CARD"
  | "PODCAST_SCRIPT";

export type GeneratedResource = {
  id: string;
  resource_type: GeneratedResourceType | string;
  resource_type_label?: string;
  title: string;
  status: string;
  summary: string;
  knowledge_point: string;
  course_id: string;
  run_id?: string | null;
  confidence: number;
  citations: GeneratedResourceCitation[];
  render_payload: {
    slides?: GeneratedResourceSlide[];
    sections?: GeneratedResourceSection[];
    nodes?: GeneratedResourceNode[];
    edges?: GeneratedResourceEdge[];
    questions?: GeneratedResourceQuestion[];
    cards?: GeneratedResourceCard[];
    segments?: GeneratedResourcePodcastSegment[];
    presenton_slides?: GeneratedResourcePresentonSlide[];
    markdown?: string;
    metadata?: {
      renderer?: string;
      renderer_requested?: string;
      presenton_error?: string;
      presenton_presentation_id?: string | null;
      presenton_edit_path?: string | null;
      presenton_edit_url?: string | null;
      presenton_download_path?: string | null;
      presenton_download_url?: string | null;
      ppt_master_error?: string;
      ppt_master_request_path?: string | null;
      ppt_master_project_id?: string | null;
      ppt_master_export_path?: string | null;
      ppt_master_implementation?: string | null;
      ppt_master_official_converter_error?: string | null;
      model_content_fallback?: boolean;
      model_content_fallback_error?: string;
      preview_available?: boolean;
      preview_format?: string;
      preview_url?: string | null;
      preview_error?: string;
      renderer_config_error?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  file_format: string;
  slide_count: number;
  item_count: number;
  download_available?: boolean;
  preview_available?: boolean;
  preview_url?: string | null;
  saved_to_resource_center: boolean;
  created_at: string | null;
  updated_at: string | null;
  saved_at: string | null;
};

export type StudentResourceFolder = {
  id: string;
  student_id: string;
  name: string;
  sort_order: number;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

export type GenerateResourceResponse = {
  resource: GeneratedResource;
  session: StudentAiChatSession;
  user_message_id: string;
  assistant_message_id: string;
};

export type StudentAiChatSession = {
  id: string;
  student_id: string;
  course_id: string | null;
  title: string;
  summary: string;
  status: string;
  message_count: number;
  created_at: string | null;
  updated_at: string | null;
  last_message_at: string | null;
};

export type StudentAiChatMessage = {
  id: string;
  session_id: string;
  role: "student" | "assistant" | string;
  content: string;
  status: string;
  metadata: Partial<StudentAiChatResponse> & { resource?: GeneratedResource; error?: { code: string; message: string; details: Record<string, unknown> } };
  run_id: string | null;
  created_at: string | null;
};

export type StudentAiChatSessionDetail = {
  session: StudentAiChatSession;
  messages: StudentAiChatMessage[];
};

export type StudentAiChatStreamEvent =
  | { event: "session"; data: { session: StudentAiChatSession; user_message: StudentAiChatMessage } }
  | { event: "assistant_start"; data: { session_id: string } }
  | { event: "delta"; data: { content: string } }
  | { event: "final"; data: StudentAiChatResponse }
  | { event: "error"; data: { code: string; message: string; details: Record<string, unknown> } };

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
    runner_profile: string;
    supported_languages: string[];
    default_language: string;
    language_templates: Record<string, string>;
    language_labels: Record<string, string>;
    comparison: string;
  };
  learning_objectives: string[];
  test_cases: Array<{
    test_case_id: string;
    name: string;
    visibility: string;
    required: boolean;
    input_summary: Record<string, unknown> | null;
    input_visible: boolean;
    expected_output: unknown;
    expected_output_visible: boolean;
    expected_output_summary: string;
  }>;
  public_tests: Array<{
    test_case_id: string;
    name: string;
    visibility?: string;
    required?: boolean;
    input_summary: Record<string, unknown> | null;
    input_visible?: boolean;
    expected_output: unknown;
    expected_output_visible?: boolean;
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
  teacher_review?: {
    grade: null | {
      id: string;
      score: number;
      status: string;
      comment: string;
      dimensions?: Record<string, unknown>;
      published_at?: string | null;
    };
    feedback: Array<{
      id: string;
      content: string;
      status: string;
      student_visible: boolean;
      published_at?: string | null;
    }>;
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

export type AgentWorkflowStep = {
  step_id: string;
  step_name: string;
  step_order: number;
  status: string;
  input_summary: unknown;
  output_summary: unknown;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
};

export type AgentWorkflowRun = {
  run_id: string;
  workflow_type: string;
  status: string;
  model_provider: string | null;
  model_name: string | null;
  prompt_version: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  input_summary: unknown;
  output_summary: unknown;
  steps: AgentWorkflowStep[];
};

const GET_CACHE_TTL_MS = 2 * 60 * 1000;

type CachedGetEntry<T> = {
  data?: T;
  fetchedAt: number;
  promise?: Promise<T>;
};

export type QuestionWorkspace = {
  assignment: {
    assignment_id: string;
    assignment_mode: string;
    allow_hint_level_3: boolean;
    published_at: string | null;
    deadline: string | null;
  };
  task: {
    task_id: string;
    course_id: string;
    course_name: string;
    teacher_name: string;
    title: string;
    description: string;
    workspace_type: string;
    learning_objectives: string[];
  };
  progress: {
    status: string;
    score: number | null;
    passed_count: number;
    total_required_count: number;
  };
  attempt: {
    attempt_id: string | null;
    status: string;
    score: number | null;
    max_score: number;
    correct_count: number;
    total_count: number;
    submitted_at: string | null;
  };
  questions: QuestionItem[];
};

export type QuestionItem = {
  question_id: string;
  question_type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | string;
  stem: string;
  analysis: string;
  knowledge_points: string[];
  difficulty: string;
  score: number;
  selected_option_ids: string[];
  is_correct: boolean | null;
  earned_score: number | null;
  correct_option_ids?: string[];
  options: Array<{
    option_id: string;
    label: string;
    content: string;
    is_correct?: boolean;
  }>;
};

export type SubmitQuestionResult = {
  attempt_id: string;
  status: string;
  score: number;
  max_score: number;
  score_percent: number;
  correct_count: number;
  total_count: number;
  submitted_at: string | null;
  questions: QuestionItem[];
  profile_signal: {
    overall_progress: number;
    logic_error_rate: number;
    recent_task_completion: number;
    summary: string;
    recommendation: string;
  };
};

export type GeneratedPracticeWorkspace = {
  resource: GeneratedResource;
  course: {
    course_id: string;
    course_name: string;
  };
  attempt: {
    status: string;
    score: number | null;
    max_score: number;
    correct_count: number;
    total_count: number;
    submitted_at: string | null;
  };
  questions: QuestionItem[];
};

const getCache = new Map<string, CachedGetEntry<unknown>>();

function studentTasksUrl(courseId?: string) {
  return `/api/v1/student/tasks${courseId ? `?course_id=${encodeURIComponent(courseId)}` : ""}`;
}

function studentProfileUrl(courseId?: string) {
  return `/api/v1/student/profile${courseId ? `?course_id=${encodeURIComponent(courseId)}` : ""}`;
}

function studentKnowledgeGraphUrl(courseId: string) {
  return `/api/v1/student/courses/${encodeURIComponent(courseId)}/knowledge-graph`;
}

function studentPracticeProjectDetailUrl(projectId: string) {
  return `/api/v1/student/practice-projects/${encodeURIComponent(projectId)}`;
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

function compactTechnicalMessage(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
}

function classifyApiStatus(status: number, code?: string): ApiErrorKind {
  if (status === 401 || code?.startsWith("AUTH_")) return "auth";
  if (status === 403) return "forbidden";
  if (status >= 500) return "server";
  return "request";
}

function apiRecovery(kind: ApiErrorKind) {
  if (kind === "network" || kind === "server" || kind === "bad_response") {
    return "请确认后端服务已启动并且接口地址可访问，然后重试。";
  }
  if (kind === "auth") return "请重新确认账号、密码或登录状态。";
  if (kind === "forbidden") return "请切换到有权限的账号，或返回当前角色可访问的页面。";
  return "请检查当前输入后重试。";
}

function userFacingApiMessage(status: number, code?: string, message?: string) {
  if (code === "AUTH_LOGIN_REQUIRED" || code === "AUTH_LOGIN_FAILED") return message || "账号或密码不正确。";
  if (code === "AUTH_TOKEN_EXPIRED") return message || "登录状态已过期，请重新登录。";
  if (code?.startsWith("AUTH_") || status === 401) return message || "登录状态需要确认，请重新登录。";
  if (code?.endsWith("_NOT_INSTALLED")) return message || "运行依赖尚未安装，请检查后端环境。";
  if (status === 403) return message || "当前账号没有访问该资源的权限。";
  if (status >= 500) return "后端服务暂时不可用，请稍后重试。";
  return message || "请求没有完成，请稍后重试。";
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(authHeaders());
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    throw new ApiRequestError("暂时无法连接后端服务。", {
      kind: "network",
      rawMessage,
      recovery: apiRecovery("network")
    });
  }
  const text = await response.text();
  let body: ApiResponse<T> | ApiErrorBody | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as ApiResponse<T> | ApiErrorBody;
    } catch {
      body = null;
    }
  }
  if (!body) {
    if (!response.ok) {
      const kind = response.status >= 500 ? "server" : "bad_response";
      const technicalMessage = compactTechnicalMessage(`${response.status} ${response.statusText}: ${text || "响应不是 JSON"}`);
      throw new ApiRequestError(userFacingApiMessage(response.status), {
        kind,
        status: response.status,
        rawMessage: technicalMessage,
        recovery: apiRecovery(kind)
      });
    }
    throw new ApiRequestError("服务端返回格式异常，请稍后重试。", {
      kind: "bad_response",
      status: response.status,
      rawMessage: text ? compactTechnicalMessage(text) : "响应不是 JSON",
      recovery: apiRecovery("bad_response")
    });
  }
  if (!response.ok || "error" in body) {
    const code = "error" in body ? body.error.code : undefined;
    const errorMessage = "error" in body ? body.error.message : undefined;
    const kind = classifyApiStatus(response.status, code);
    const message = userFacingApiMessage(response.status, code, errorMessage);
    throw new ApiRequestError(message, {
      kind,
      status: response.status,
      code,
      requestId: body.meta?.request_id,
      rawMessage: "error" in body ? `${body.error.code}: ${body.error.message}` : response.statusText,
      recovery: apiRecovery(kind),
      details: "error" in body ? body.error.details : undefined
    });
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

function parseSseFrame(frame: string): StudentAiChatStreamEvent | null {
  const lines = frame.split(/\r?\n/);
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLines = lines.filter((line) => line.startsWith("data:"));
  const event = eventLine?.slice("event:".length).trim();
  const dataText = dataLines.map((line) => line.slice("data:".length).trimStart()).join("\n");
  if (!event || !dataText) return null;
  return { event, data: JSON.parse(dataText) } as StudentAiChatStreamEvent;
}

async function streamStudentAiChat(
  payload: {
    message: string;
    courseId?: string;
    sessionId?: string | null;
    modelKey?: string;
    pageContext?: Record<string, unknown>;
    history?: Array<{ role: "student" | "assistant"; content: string }>;
  },
  onEvent: (event: StudentAiChatStreamEvent) => void
) {
  const response = await fetch("/api/v1/student/ai-chat/stream", {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: payload.message,
      course_id: payload.courseId,
      session_id: payload.sessionId,
      model_key: payload.modelKey,
      page_context: payload.pageContext ?? {},
      history: payload.history ?? []
    })
  });

  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    const message = body && "error" in body ? `${body.error.code}: ${body.error.message}` : response.statusText;
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\n\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const parsed = parseSseFrame(frame.trim());
      if (parsed) onEvent(parsed);
    }
    if (done) break;
  }
  const tail = parseSseFrame(buffer.trim());
  if (tail) onEvent(tail);
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
  getTask: (taskId: string, assignmentId?: string) => request<TaskDetail>(`/api/v1/tasks/${taskId}${assignmentId ? `?assignment_id=${encodeURIComponent(assignmentId)}` : ''}`),
  getQuestionWorkspace: (assignmentId: string) =>
    request<QuestionWorkspace>(`/api/v1/student/assignments/${assignmentId}/workspace`),
  getLearningContext: () => cachedGet<LearningContext>("/api/v1/student/learning-context"),
  listStudentTasks: (courseId?: string) =>
    cachedGet<StudentTaskCard[]>(studentTasksUrl(courseId)),
  getStudentProfile: (courseId?: string) =>
    cachedGet<StudentProfile>(studentProfileUrl(courseId)),
  getStudentKnowledgeGraph: (courseId: string) =>
    cachedGet<StudentKnowledgeGraph>(studentKnowledgeGraphUrl(courseId)),
  getPracticeProjectHome: () =>
    cachedGet<PracticeProjectHome>("/api/v1/student/practice-projects"),
  getPracticeProjectDetail: (projectId: string) =>
    cachedGet<PracticeProjectDetail>(studentPracticeProjectDetailUrl(projectId)),
  startFirstPracticeProject: async () => {
    const result = await request<{ started: boolean; detail: PracticeProjectDetail }>(
      "/api/v1/student/practice-projects/start-first",
      { method: "POST" }
    );
    clearApiCache((url) => url.startsWith("/api/v1/student/practice-projects"));
    return result;
  },
  listRagKnowledgeBases: () =>
    request<{ items: RagKnowledgeBaseListItem[] }>("/api/v1/knowledge-bases"),
  createRagKnowledgeBase: (name: string, description = "") =>
    request<{ id: string; name: string; status: string }>("/api/v1/knowledge-bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description })
    }),
  listRagDocuments: (kbId: string) =>
    request<{ items: RagKnowledgeDocument[] }>(`/api/v1/knowledge-bases/${encodeURIComponent(kbId)}/documents`),
  uploadRagDocument: (kbId: string, file: File) => {
    const data = new FormData();
    data.append("file", file);
    return request<{ document_id: string; version_id: string; status: string; progress: number; file_profile: RagFileProfile | Record<string, never> }>(
      `/api/v1/knowledge-bases/${encodeURIComponent(kbId)}/documents?auto_process=false`,
      { method: "POST", body: data }
    );
  },
  createRagTextDocument: (kbId: string, title: string, content: string) =>
    request<{ document_id: string; version_id: string; status: string; progress: number; file_profile: RagFileProfile | Record<string, never> }>(
      `/api/v1/knowledge-bases/${encodeURIComponent(kbId)}/documents/from-text?auto_process=false`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content })
      }
    ),
  processRagDocument: (documentId: string) =>
    request<{
      document_id: string;
      version_id: string;
      status: string;
      progress: number;
      content_profile: RagContentProfile | Record<string, never>;
      cleaning_strategy: string | null;
      chunking_strategy: string | null;
    }>(
      `/api/v1/documents/${encodeURIComponent(documentId)}/process`,
      { method: "POST" }
    ),
  listRagChunks: (documentId: string) =>
    request<{ items: RagKnowledgeChunk[] }>(`/api/v1/documents/${encodeURIComponent(documentId)}/chunks`),
  getRagIngestionRun: (documentId: string) =>
    request<{ run: RagIngestionRun | null }>(`/api/v1/documents/${encodeURIComponent(documentId)}/ingestion-run`),
  getRagKnowledgeGraphImportPlan: (documentId: string) =>
    request<RagKnowledgeGraphImportPlan>(`/api/v1/documents/${encodeURIComponent(documentId)}/knowledge-graph/import-plan`),
  deleteRagDocument: (documentId: string) =>
    request<{ deleted: boolean }>(`/api/v1/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" }),
  sendStudentAiChat: (
    message: string,
    courseId?: string,
    history?: Array<{ role: "student" | "assistant"; content: string }>,
    pageContext?: Record<string, unknown>,
    modelKey?: string
  ) =>
    request<StudentAiChatResponse>("/api/v1/student/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, course_id: courseId, history: history ?? [], page_context: pageContext ?? {}, model_key: modelKey })
    }),
  streamStudentAiChat,
  listStudentAiChatModels: () =>
    request<{ items: StudentAiModelOption[] }>("/api/v1/student/ai-chat/models"),
  listStudentAiChatSessions: (courseId?: string, query?: string) => {
    const params = new URLSearchParams();
    if (courseId) params.set("course_id", courseId);
    if (query) params.set("q", query);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<StudentAiChatSession[]>(`/api/v1/student/ai-chat/sessions${suffix}`);
  },
  createStudentAiChatSession: (courseId?: string, firstMessage = "新的 AI 助学会话") =>
    request<StudentAiChatSession>("/api/v1/student/ai-chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: courseId, first_message: firstMessage })
    }),
  getStudentAiChatSession: (sessionId: string) =>
    request<StudentAiChatSessionDetail>(`/api/v1/student/ai-chat/sessions/${encodeURIComponent(sessionId)}`),
  deleteStudentAiChatSession: (sessionId: string) =>
    request<{ deleted: boolean; session_id: string }>(
      `/api/v1/student/ai-chat/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" }
    ),
  generateResource: (resourceType: GeneratedResourceType | string, message: string, courseId?: string, sessionId?: string | null) =>
    request<GenerateResourceResponse>("/api/v1/student/resources/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource_type: resourceType, message, course_id: courseId, session_id: sessionId })
    }),
  saveGeneratedResource: (resourceId: string) =>
    request<GeneratedResource>(`/api/v1/student/resources/${encodeURIComponent(resourceId)}/save`, {
      method: "POST"
    }),
  listGeneratedResources: (courseId?: string) => {
    const params = new URLSearchParams();
    if (courseId) params.set("course_id", courseId);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ items: GeneratedResource[] }>(`/api/v1/student/resources/generated${suffix}`);
  },
  listStudentResourceFolders: () =>
    request<{ items: StudentResourceFolder[] }>("/api/v1/student/resources/folders", { cache: "no-store" }),
  createStudentResourceFolder: (name: string) =>
    request<StudentResourceFolder>("/api/v1/student/resources/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }),
  getGeneratedPracticeWorkspace: (resourceId: string) =>
    request<GeneratedPracticeWorkspace>(`/api/v1/student/resources/${encodeURIComponent(resourceId)}/practice`),
  submitGeneratedPractice: async (resourceId: string, answers: Array<{ question_id: string; selected_option_ids: string[] }>) => {
    const result = await request<SubmitQuestionResult>(`/api/v1/student/resources/${encodeURIComponent(resourceId)}/practice/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers })
    });
    clearApiCache((url) => url.startsWith("/api/v1/student/"));
    return result;
  },
  submitPracticeProject: async (
    projectId: string,
    payload: { title?: string; description?: string; materials?: string[] }
  ) => {
    const result = await request<{ submission: PracticeProjectSubmission; detail: PracticeProjectDetail }>(
      `/api/v1/student/practice-projects/${encodeURIComponent(projectId)}/submissions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    clearApiCache((url) => url.startsWith("/api/v1/student/practice-projects"));
    return result;
  },
  markGeneratedPodcastListened: async (resourceId: string, completedSegmentCount?: number) => {
    const result = await request<{
      resource_id: string;
      event_type: string;
      completion_ratio: number;
      profile_signal: SubmitQuestionResult["profile_signal"];
    }>(`/api/v1/student/resources/${encodeURIComponent(resourceId)}/podcast/listened`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_segment_count: completedSegmentCount })
    });
    clearApiCache((url) => url.startsWith("/api/v1/student/"));
    return result;
  },
  generatedResourceDownloadUrl: (resourceId: string) =>
    `/api/v1/student/resources/${encodeURIComponent(resourceId)}/download`,
  generatedResourcePreviewUrl: (resourceId: string) =>
    `/api/v1/student/resources/${encodeURIComponent(resourceId)}/preview`,
  submitCode: async (taskId: string, language: string, sourceCode: string, assignmentId?: string) => {
    const result = await request<SubmitResponse>(`/api/v1/tasks/${taskId}/submissions${assignmentId ? `?assignment_id=${encodeURIComponent(assignmentId)}` : ''}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({ language, source_code: sourceCode })
    });
    clearApiCache((url) => url.startsWith("/api/v1/student/") || url === "/api/v1/tasks");
    return result;
  },
  saveQuestionAnswers: async (assignmentId: string, answers: Array<{ question_id: string; selected_option_ids: string[] }>) => {
    const result = await request<{ attempt_id: string; status: string; saved_at: string }>(
      `/api/v1/student/assignments/${assignmentId}/answers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
      }
    );
    clearApiCache((url) => url.startsWith("/api/v1/student/"));
    return result;
  },
  submitQuestionAnswers: async (assignmentId: string, answers: Array<{ question_id: string; selected_option_ids: string[] }>) => {
    const result = await request<SubmitQuestionResult>(`/api/v1/student/assignments/${assignmentId}/submit-answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers })
    });
    clearApiCache((url) => url.startsWith("/api/v1/student/"));
    return result;
  },
  getExecution: (executionId: string) =>
    request<ExecutionStatus>(`/api/v1/executions/${executionId}`),
  getResults: (versionId: string) =>
    request<VersionResult>(`/api/v1/submission-versions/${versionId}/results`),
  getDiagnosis: (versionId: string) =>
    request<Diagnosis>(`/api/v1/submission-versions/${versionId}/diagnosis`),
  getDiagnosisAgentRun: (diagnosisId: string) =>
    request<{ diagnosis_id: string; version_id: string; run: AgentWorkflowRun | null }>(
      `/api/v1/diagnoses/${encodeURIComponent(diagnosisId)}/agent-run`
    ),
  requestHint: (diagnosisId: string, requestedLevel: number) =>
    request<Hint>(`/api/v1/diagnoses/${diagnosisId}/hints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requested_level: requestedLevel })
    })
};

export const apiCache = {
  clear: clearApiCache,
  peekLearningContext: () => peekCachedGet<LearningContext>("/api/v1/student/learning-context"),
  peekStudentTasks: (courseId?: string) => peekCachedGet<StudentTaskCard[]>(studentTasksUrl(courseId)),
  peekStudentProfile: (courseId?: string) => peekCachedGet<StudentProfile>(studentProfileUrl(courseId)),
  peekStudentKnowledgeGraph: (courseId: string) => peekCachedGet<StudentKnowledgeGraph>(studentKnowledgeGraphUrl(courseId))
};
