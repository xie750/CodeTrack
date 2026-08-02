import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import Editor from "@monaco-editor/react";
import {
  ArrowLeft,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Code2,
  Eye,
  GraduationCap,
  Lightbulb,
  Maximize2,
  MoreVertical,
  NotebookTabs,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Save,
  Search,
  Upload,
  Zap
} from "lucide-react";
import { api, LearningContext, TaskDetail, VersionResult, Diagnosis, Hint } from "../api";
import avatarImg from "../assets/ui-home/avatar.png";

type PageProps = {
  taskId: string;
  onBack: () => void;
};

type WorkspaceLayout = {
  problemRatio: number;
  editorRatio: number;
};

type WorkspaceMetrics = {
  gridWidth: number;
  centerHeight: number;
  aiWidth: number;
};

type RunState = "IDLE" | "QUEUED" | "RUNNING" | "DONE" | "ERROR";
type ResultPanelTab = "cases" | "results";

type TeacherTestCase = TaskDetail["test_cases"][number];

const WORKSPACE_LAYOUT_KEY = "codetrack.taskWorkspace.layout.v1";
const DEFAULT_PROBLEM_WIDTH = 316;
const DEFAULT_EDITOR_HEIGHT = 407;
const DEFAULT_PROBLEM_RATIO = 0.31;
const DEFAULT_EDITOR_RATIO = 0.59;
const PROBLEM_MIN_WIDTH = 260;
const CENTER_MIN_WIDTH = 560;
const EDITOR_MIN_HEIGHT = 320;
const RESULT_MIN_HEIGHT = 220;
const SPLITTER_SIZE = 12;
const GRID_COLUMN_GAPS = 24;

const MONACO_LANGUAGE: Record<string, string> = {
  CPP: "cpp",
  PYTHON: "python",
  JAVA: "java",
  JAVASCRIPT: "javascript"
};

const TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "COMPILE_ERROR",
  "RUNTIME_ERROR",
  "TIMEOUT",
  "RESOURCE_LIMIT",
  "SECURITY_REJECTED",
  "INFRASTRUCTURE_ERROR"
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function readWorkspaceLayout(): WorkspaceLayout {
  if (typeof window === "undefined") {
    return { problemRatio: DEFAULT_PROBLEM_RATIO, editorRatio: DEFAULT_EDITOR_RATIO };
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_LAYOUT_KEY) ?? "{}") as Partial<WorkspaceLayout>;
    return {
      problemRatio: typeof parsed.problemRatio === "number" ? clamp(parsed.problemRatio, 0.18, 0.58) : DEFAULT_PROBLEM_RATIO,
      editorRatio: typeof parsed.editorRatio === "number" ? clamp(parsed.editorRatio, 0.34, 0.76) : DEFAULT_EDITOR_RATIO
    };
  } catch {
    return { problemRatio: DEFAULT_PROBLEM_RATIO, editorRatio: DEFAULT_EDITOR_RATIO };
  }
}

function resolveProblemWidth(metrics: WorkspaceMetrics | null, problemRatio: number) {
  if (!metrics) return DEFAULT_PROBLEM_WIDTH;
  const availableWidth = metrics.gridWidth - metrics.aiWidth - SPLITTER_SIZE - GRID_COLUMN_GAPS;
  const maxProblemWidth = Math.max(PROBLEM_MIN_WIDTH, availableWidth - CENTER_MIN_WIDTH);
  return Math.round(clamp(availableWidth * problemRatio, PROBLEM_MIN_WIDTH, maxProblemWidth));
}

function resolveEditorHeight(metrics: WorkspaceMetrics | null, editorRatio: number) {
  if (!metrics) return DEFAULT_EDITOR_HEIGHT;
  const availableHeight = metrics.centerHeight - SPLITTER_SIZE;
  const maxEditorHeight = Math.max(EDITOR_MIN_HEIGHT, availableHeight - RESULT_MIN_HEIGHT);
  return Math.round(clamp(availableHeight * editorRatio, EDITOR_MIN_HEIGHT, maxEditorHeight));
}

function compactJson(value: unknown) {
  return JSON.stringify(value);
}

function formatCaseValue(value: unknown) {
  if (value === null || value === undefined) return "教师保留";
  if (typeof value === "string") return value.trimEnd();
  return compactJson(value);
}

function visibilityLabel(visibility: string | undefined) {
  return visibility === "HIDDEN" ? "隐藏" : "公开";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PASSED: "通过",
    FAILED: "未通过",
    PENDING: "待运行"
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (status === "PASSED") return "pass";
  if (status === "FAILED") return "fail";
  return "";
}

function caseFields(testCase: TeacherTestCase | null) {
  if (!testCase) return [];
  if (!testCase.input_visible || testCase.input_summary === null) {
    return [{ name: "input", value: "教师保留，提交后仅显示判题状态" }];
  }
  const input = testCase.input_summary;
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return Object.entries(input).map(([name, value]) => ({ name, value: formatCaseValue(value) }));
  }
  return [{ name: "input", value: formatCaseValue(input) }];
}

function isPassed(result: VersionResult | null) {
  return Boolean(result?.tests.length) && result?.tests.every((test) => test.status === "PASSED");
}

function normalizeTaskDetail(rawTask: TaskDetail): TaskDetail {
  const rawSpec = rawTask.interface_spec as Partial<TaskDetail["interface_spec"]>;
  const publicTests = rawTask.public_tests ?? [];
  const testCases = rawTask.test_cases?.length
    ? rawTask.test_cases
    : publicTests.map((test) => ({
      test_case_id: test.test_case_id,
      name: test.name,
      visibility: test.visibility ?? "PUBLIC",
      required: test.required ?? true,
      input_summary: test.input_summary,
      input_visible: test.input_visible ?? true,
      expected_output: test.expected_output,
      expected_output_visible: test.expected_output_visible ?? true,
      expected_output_summary: test.expected_output_summary
    }));
  const defaultLanguage = rawSpec.default_language || rawTask.language || "CPP";
  const languageTemplates =
    rawSpec.language_templates && Object.keys(rawSpec.language_templates).length
      ? rawSpec.language_templates
      : { [defaultLanguage]: rawSpec.student_template ?? "" };
  const supportedLanguages =
    rawSpec.supported_languages?.length
      ? rawSpec.supported_languages
      : Object.keys(languageTemplates).length
        ? Object.keys(languageTemplates)
        : [defaultLanguage];
  const languageLabels =
    rawSpec.language_labels && Object.keys(rawSpec.language_labels).length
      ? rawSpec.language_labels
      : Object.fromEntries(supportedLanguages.map((language) => [language, language === "CPP" ? "C++17" : language]));

  return {
    ...rawTask,
    public_tests: publicTests,
    test_cases: testCases,
    interface_spec: {
      function_signature: rawSpec.function_signature ?? "",
      editable_region: rawSpec.editable_region ?? "FUNCTION_ONLY",
      student_template: rawSpec.student_template ?? languageTemplates[defaultLanguage] ?? "",
      rules: rawSpec.rules ?? [],
      runner_profile: rawSpec.runner_profile ?? "linked_list_delete_transform_v1",
      supported_languages: supportedLanguages,
      default_language: defaultLanguage,
      language_templates: languageTemplates,
      language_labels: languageLabels,
      comparison: rawSpec.comparison ?? "exact_json"
    }
  };
}

export default function TaskWorkspace({ taskId, onBack }: PageProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [context, setContext] = useState<LearningContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [layout, setLayout] = useState<WorkspaceLayout>(() => readWorkspaceLayout());
  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("CPP");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sourceCode, setSourceCode] = useState("");
  const [runState, setRunState] = useState<RunState>("IDLE");
  const [runMessage, setRunMessage] = useState("等待提交");
  const [activeResultTab, setActiveResultTab] = useState<ResultPanelTab>("cases");
  const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
  const [latestResult, setLatestResult] = useState<VersionResult | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [hints, setHints] = useState<Hint[]>([]);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const gridRef = useRef<HTMLElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setTask(null);
    setLatestResult(null);
    setDiagnosis(null);
    setHints([]);
    setActiveResultTab("cases");
    setSelectedCaseIndex(0);

    Promise.allSettled([api.getTask(taskId), api.getLearningContext()])
      .then(([taskResult, contextResult]) => {
        if (!alive) return;
        if (taskResult.status === "fulfilled") {
          const nextTask = normalizeTaskDetail(taskResult.value);
          const defaultLanguage = nextTask.interface_spec.default_language || nextTask.language || "CPP";
          setTask(nextTask);
          setSelectedLanguage(defaultLanguage);
          setDrafts(nextTask.interface_spec.language_templates);
          setSourceCode(nextTask.interface_spec.language_templates[defaultLanguage] ?? nextTask.interface_spec.student_template);
          setRunState("IDLE");
          setRunMessage("等待提交");
        } else {
          setError("任务详情加载失败，请返回任务列表后重试。");
        }
        if (contextResult.status === "fulfilled") {
          setContext(contextResult.value);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [taskId]);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    if (!activeExecutionId) return undefined;
    const executionId = activeExecutionId;
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const status = await api.getExecution(executionId);
        if (cancelled) return;
        setRunMessage(status.status);
        setRunState(TERMINAL_STATUSES.has(status.status) ? "DONE" : "RUNNING");
        if (status.result_url && status.version_id) {
          const result = await api.getResults(status.version_id);
          if (cancelled) return;
          setLatestResult(result);
          setActiveResultTab("results");
          if (result.diagnosis.status === "READY") {
            try {
              const nextDiagnosis = await api.getDiagnosis(result.version_id);
              if (!cancelled) {
                setDiagnosis(nextDiagnosis);
                setHints(nextDiagnosis.hint ? [{
                  hint_id: `${nextDiagnosis.diagnosis_id}-level-${nextDiagnosis.hint_level ?? 1}`,
                  diagnosis_id: nextDiagnosis.diagnosis_id,
                  level: nextDiagnosis.hint_level ?? 1,
                  content: nextDiagnosis.hint,
                  unlocked: true,
                  unlock_reason: "AUTO_LEVEL_1",
                  generated_at: "",
                  viewed_at: ""
                }] : []);
              }
            } catch {
              if (!cancelled) setDiagnosis(null);
            }
          }
          setActiveExecutionId(null);
          return;
        }
        timer = window.setTimeout(poll, 1200);
      } catch (caught) {
        if (!cancelled) {
          setRunState("ERROR");
          setRunMessage(caught instanceof Error ? caught.message : "执行状态读取失败");
          setActiveExecutionId(null);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeExecutionId]);

  useEffect(() => {
    const grid = gridRef.current;
    const center = centerRef.current;
    if (!grid || !center) return undefined;
    const activeGrid = grid;
    const activeCenter = center;

    let frame = 0;
    function measure() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const gridRect = activeGrid.getBoundingClientRect();
        const centerRect = activeCenter.getBoundingClientRect();
        const aiWidth = activeGrid.querySelector(".program-ai")?.getBoundingClientRect().width ?? 0;
        setMetrics((current) => {
          const next = {
            gridWidth: Math.round(gridRect.width),
            centerHeight: Math.round(centerRect.height),
            aiWidth: Math.round(aiWidth)
          };
          return current &&
            current.gridWidth === next.gridWidth &&
            current.centerHeight === next.centerHeight &&
            current.aiWidth === next.aiWidth
            ? current
            : next;
        });
      });
    }

    const observer = new ResizeObserver(measure);
    observer.observe(activeGrid);
    observer.observe(activeCenter);
    const aiPanel = activeGrid.querySelector(".program-ai");
    if (aiPanel) observer.observe(aiPanel);
    window.addEventListener("resize", measure);
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [aiCollapsed, loading, task, error]);

  const teacherCases = useMemo(() => task?.test_cases ?? [], [task]);
  const selectedCase = teacherCases[selectedCaseIndex] ?? teacherCases[0] ?? null;
  const selectedCaseFields = useMemo(() => caseFields(selectedCase), [selectedCase]);
  const resultRows = useMemo(() => {
    const resultByCase = new Map((latestResult?.tests ?? []).map((test) => [test.test_case_id, test]));
    const baseCases = teacherCases.length
      ? teacherCases
      : (latestResult?.tests ?? []).map((test) => ({
        test_case_id: test.test_case_id,
        name: test.name,
        visibility: test.visibility,
        required: true,
        input_summary: null,
        input_visible: false,
        expected_output: null,
        expected_output_visible: false,
        expected_output_summary: test.expected_output_summary
      }));
    return baseCases.map((testCase, index) => {
      const result = resultByCase.get(testCase.test_case_id);
      return {
        key: testCase.test_case_id,
        name: testCase.name || `Case ${index + 1}`,
        visibility: testCase.visibility,
        input: testCase.input_visible ? formatCaseValue(testCase.input_summary) : "教师保留",
        expected: testCase.expected_output_summary,
        actual: result?.actual_output ?? "-",
        status: result?.status ?? "PENDING",
        duration: result ? `${result.duration_ms} ms` : "-"
      };
    });
  }, [latestResult, teacherCases]);

  useEffect(() => {
    if (selectedCaseIndex >= teacherCases.length && teacherCases.length > 0) {
      setSelectedCaseIndex(0);
    }
  }, [selectedCaseIndex, teacherCases.length]);

  const knowledgeTags = task?.learning_objectives.length ? task.learning_objectives : ["等待任务知识点"];
  const studentName = context?.student.name ?? "学生";
  const problemWidth = resolveProblemWidth(metrics, layout.problemRatio);
  const editorHeight = resolveEditorHeight(metrics, layout.editorRatio);
  const workspaceStyle = {
    "--program-problem-width": `${problemWidth}px`,
    "--program-editor-height": `${editorHeight}px`
  } as CSSProperties;

  function updateCurrentDraft(value: string) {
    setSourceCode(value);
    setDrafts((current) => ({ ...current, [selectedLanguage]: value }));
  }

  function switchLanguage(language: string) {
    setDrafts((current) => ({ ...current, [selectedLanguage]: sourceCode }));
    setSelectedLanguage(language);
    setSourceCode(drafts[language] ?? task?.interface_spec.language_templates[language] ?? "");
    setLatestResult(null);
    setDiagnosis(null);
    setHints([]);
    setRunState("IDLE");
    setRunMessage("等待提交");
  }

  async function submitCode() {
    if (!task || runState === "QUEUED" || runState === "RUNNING") return;
    setRunState("QUEUED");
    setRunMessage("已提交，等待执行");
    setLatestResult(null);
    setDiagnosis(null);
    setHints([]);
    try {
      const response = await api.submitCode(task.task_id, selectedLanguage, sourceCode);
      setActiveExecutionId(response.execution_id);
      setRunMessage(response.status);
    } catch (caught) {
      setRunState("ERROR");
      setRunMessage(caught instanceof Error ? caught.message : "提交失败");
    }
  }

  async function requestNextHint() {
    const diagnosisId = diagnosis?.diagnosis_id ?? latestResult?.diagnosis.diagnosis_id;
    if (!diagnosisId) return;
    const highestLevel = hints.length ? Math.max(...hints.map((hint) => hint.level)) : 0;
    const nextLevel = Math.min(3, highestLevel + 1);
    try {
      const hint = await api.requestHint(diagnosisId, nextLevel);
      setHints((current) => current.some((item) => item.level === hint.level) ? current : [...current, hint]);
    } catch (caught) {
      setRunMessage(caught instanceof Error ? caught.message : "提示暂不可用");
    }
  }

  function startProblemResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const grid = gridRef.current;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const aiWidth = grid.querySelector(".program-ai")?.getBoundingClientRect().width ?? 0;
    const availableWidth = gridRect.width - aiWidth - SPLITTER_SIZE - GRID_COLUMN_GAPS;
    const maxProblemWidth = Math.max(PROBLEM_MIN_WIDTH, availableWidth - CENTER_MIN_WIDTH);
    let frame = 0;
    document.documentElement.classList.add("workspace-resizing", "workspace-resizing-x");
    function handleMove(moveEvent: globalThis.PointerEvent) {
      const nextWidth = clamp(moveEvent.clientX - gridRect.left, PROBLEM_MIN_WIDTH, maxProblemWidth);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setLayout((current) => ({ ...current, problemRatio: clamp(nextWidth / availableWidth, 0.18, 0.58) }));
      });
    }
    function stopResize() {
      window.cancelAnimationFrame(frame);
      document.documentElement.classList.remove("workspace-resizing", "workspace-resizing-x");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  function startEditorResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const center = centerRef.current;
    if (!center) return;
    const centerRect = center.getBoundingClientRect();
    const availableHeight = centerRect.height - SPLITTER_SIZE;
    const maxEditorHeight = Math.max(EDITOR_MIN_HEIGHT, availableHeight - RESULT_MIN_HEIGHT);
    let frame = 0;
    document.documentElement.classList.add("workspace-resizing", "workspace-resizing-y");
    function handleMove(moveEvent: globalThis.PointerEvent) {
      const nextHeight = clamp(moveEvent.clientY - centerRect.top, EDITOR_MIN_HEIGHT, maxEditorHeight);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setLayout((current) => ({ ...current, editorRatio: clamp(nextHeight / availableHeight, 0.34, 0.76) }));
      });
    }
    function stopResize() {
      window.cancelAnimationFrame(frame);
      document.documentElement.classList.remove("workspace-resizing", "workspace-resizing-y");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  function handleProblemSplitterKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setLayout((current) => ({ ...current, problemRatio: clamp(current.problemRatio + (event.key === "ArrowLeft" ? -0.02 : 0.02), 0.18, 0.58) }));
  }

  function handleEditorSplitterKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    setLayout((current) => ({ ...current, editorRatio: clamp(current.editorRatio + (event.key === "ArrowUp" ? -0.03 : 0.03), 0.34, 0.76) }));
  }

  return (
    <div className="program-shell" data-task-id={taskId} style={workspaceStyle}>
      <header className="program-topbar">
        <div className="program-brand">
          <span className="program-brand-mark ct-brand-mark" aria-hidden="true" />
          <strong>Code<span>Track</span></strong>
        </div>
        <div className="program-top-actions">
          <button type="button" aria-label="搜索"><Search size={22} /></button>
          <button className="program-bell" type="button" aria-label="通知"><Bell size={21} /><span>3</span></button>
          <img src={avatarImg} alt={`${studentName}头像`} />
          <strong>{studentName}</strong>
          <ChevronDown size={16} />
        </div>
      </header>

      <main className="program-page">
        {loading ? (
          <>
            <section className="program-head skeleton-block" />
            <section className="program-grid">
              <article className="program-card program-problem skeleton-block" />
              <div className="program-splitter vertical skeleton-block" />
              <div className="program-center">
                <article className="program-card program-editor skeleton-block" />
                <div className="program-splitter horizontal skeleton-block" />
                <article className="program-card program-result skeleton-block" />
              </div>
              <aside className="program-card program-ai skeleton-block" />
            </section>
          </>
        ) : error || !task ? (
          <section className="program-card program-problem">
            <h2>任务暂不可用</h2>
            <p>{error ?? "没有读取到当前任务详情。"}</p>
            <button className="program-back" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回班级任务</button>
          </section>
        ) : (
          <>
            <section className="program-head">
              <div>
                <button className="program-back" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回班级任务</button>
                <div className="program-title-line">
                  <h1>编程任务：{task.title}</h1>
                  <span>状态：<b>{latestResult?.submission_status ?? task.current_progress.status}</b></span>
                </div>
              </div>
              <div className="program-head-actions">
                <button type="button"><Eye size={17} /> 收藏</button>
                <button type="button"><NotebookTabs size={17} /> 笔记</button>
                <button className="outline" type="button"><ChevronLeft size={17} /> 上一题</button>
                <button className="primary" type="button">下一题 <ChevronRight size={17} /></button>
              </div>
            </section>

            <section className="program-grid" data-ai-collapsed={aiCollapsed ? "true" : "false"} ref={gridRef}>
              <article className="program-card program-problem">
                <h2>题目描述</h2>
                <p>{task.description}</p>

                <h2>函数说明</h2>
                <ul>
                  <li>签名：{task.interface_spec.function_signature}</li>
                  <li>编辑区域：{task.interface_spec.editable_region}</li>
                  <li>判题模式：{task.interface_spec.runner_profile}</li>
                </ul>

                <h2>公开样例</h2>
                {task.public_tests.length ? task.public_tests.map((test) => (
                  <div className="program-example" key={test.test_case_id}>
                    <p><b>{test.name}：</b>{compactJson(test.input_summary)}</p>
                    <p><b>期望输出：</b>{test.expected_output_summary}</p>
                  </div>
                )) : <p>暂无公开样例。</p>}

                <h2>规则</h2>
                <ul>
                  {task.interface_spec.rules.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>

                <h2>知识点</h2>
                <div className="program-tags">{knowledgeTags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              </article>

              <div className="program-splitter vertical" role="separator" aria-label="调整题目和代码区域宽度" aria-orientation="vertical" tabIndex={0} onPointerDown={startProblemResize} onKeyDown={handleProblemSplitterKey} onDoubleClick={() => setLayout((current) => ({ ...current, problemRatio: DEFAULT_PROBLEM_RATIO }))}>
                <span />
              </div>

              <div className="program-center" ref={centerRef}>
                <article className="program-card program-editor">
                  <header>
                    <h2>代码编辑器</h2>
                    <div>
                      <select value={selectedLanguage} onChange={(event) => switchLanguage(event.target.value)} aria-label="选择语言">
                        {task.interface_spec.supported_languages.map((language) => (
                          <option value={language} key={language}>{task.interface_spec.language_labels[language] ?? language}</option>
                        ))}
                      </select>
                      <button type="button" aria-label="提示"><Lightbulb size={17} /></button>
                      <button type="button" aria-label="全屏"><Maximize2 size={17} /></button>
                      <button type="button" aria-label="更多"><MoreVertical size={17} /></button>
                    </div>
                  </header>
                  <div className="program-monaco">
                    <Editor
                      height="100%"
                      language={MONACO_LANGUAGE[selectedLanguage] ?? "plaintext"}
                      value={sourceCode}
                      theme="vs"
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineHeight: 21,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2
                      }}
                      onChange={(value) => updateCurrentDraft(value ?? "")}
                    />
                  </div>
                  <footer>
                    <button type="button" onClick={() => updateCurrentDraft(sourceCode)}><Save size={16} /> 保存草稿</button>
                    <button className="primary" type="button" disabled={runState === "QUEUED" || runState === "RUNNING"} onClick={submitCode}><Play size={16} /> 运行代码</button>
                    <button className="primary" type="button" disabled={runState === "QUEUED" || runState === "RUNNING"} onClick={submitCode}><Upload size={16} /> 提交判题</button>
                  </footer>
                </article>

                <div className="program-splitter horizontal" role="separator" aria-label="调整代码编辑器和测试结果高度" aria-orientation="horizontal" tabIndex={0} onPointerDown={startEditorResize} onKeyDown={handleEditorSplitterKey} onDoubleClick={() => setLayout((current) => ({ ...current, editorRatio: DEFAULT_EDITOR_RATIO }))}>
                  <span />
                </div>

                <article className="program-card program-result">
                  <header>
                    <nav>
                      <button className={activeResultTab === "cases" ? "active" : ""} type="button" onClick={() => setActiveResultTab("cases")}>测试用例</button>
                      <button className={activeResultTab === "results" ? "active" : ""} type="button" onClick={() => setActiveResultTab("results")}>测试结果</button>
                    </nav>
                    <div>执行状态：<b>{runMessage}</b></div>
                  </header>
                  {activeResultTab === "cases" ? (
                    <div className="program-case-panel">
                      {teacherCases.length ? (
                        <>
                          <div className="program-case-tabs" role="tablist" aria-label="教师测试用例">
                            {teacherCases.map((testCase, index) => (
                              <button
                                className={index === selectedCaseIndex ? "active" : ""}
                                type="button"
                                role="tab"
                                aria-selected={index === selectedCaseIndex}
                                key={testCase.test_case_id}
                                onClick={() => setSelectedCaseIndex(index)}
                              >
                                Case {index + 1}
                              </button>
                            ))}
                          </div>
                          <section className="program-case-detail">
                            <div className="program-case-title">
                              <strong>{selectedCase?.name ?? "测试用例"}</strong>
                              <span>{visibilityLabel(selectedCase?.visibility)}</span>
                            </div>
                            <div className="program-case-fields">
                              {selectedCaseFields.map((field) => (
                                <label key={field.name}>
                                  <span>{field.name} =</span>
                                  <code>{field.value}</code>
                                </label>
                              ))}
                            </div>
                            <label className="program-case-expected">
                              <span>expected =</span>
                              <code>{selectedCase?.expected_output_summary ?? "-"}</code>
                            </label>
                          </section>
                        </>
                      ) : (
                        <div className="program-result-empty">当前编程题还没有配置教师测试用例。</div>
                      )}
                    </div>
                  ) : (
                    <>
                      <table>
                        <thead><tr><th>测试点</th><th>输入</th><th>期望输出</th><th>你的输出</th><th>结果</th><th>耗时</th></tr></thead>
                        <tbody>
                          {resultRows.map((row) => (
                            <tr key={row.key}>
                              <td>{row.name}<small>{visibilityLabel(row.visibility)}</small></td>
                              <td>{row.input}</td>
                              <td>{row.expected}</td>
                              <td>{row.actual}</td>
                              <td className={statusClass(row.status)}>
                                <span>{row.status === "PASSED" ? <Check size={13} /> : <Circle size={12} fill="currentColor" />} {statusLabel(row.status)}</span>
                              </td>
                              <td>{row.duration}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(latestResult?.execution.compiler_stderr || latestResult?.execution.compiler_stdout) && (
                        <div className="program-compiler-output">
                          <strong>编译输出</strong>
                          <pre>{latestResult.execution.compiler_stderr || latestResult.execution.compiler_stdout}</pre>
                        </div>
                      )}
                      <div className="program-pass">
                        <CheckCircle2 size={18} />
                        {isPassed(latestResult) ? "已通过全部测试，可以生成总结并更新学习画像。" : "提交后会按教师测试用例显示运行结果和 AI 诊断。"}
                      </div>
                    </>
                  )}
                </article>
              </div>

              <aside className={`program-card program-ai${aiCollapsed ? " collapsed" : ""}`} aria-label="AI学习助手" aria-expanded={!aiCollapsed}>
                <header>
                  <span><Bot size={22} /></span>
                  <h2>AI学习助手</h2>
                  <button className="program-ai-toggle" type="button" aria-label={aiCollapsed ? "展开AI学习助手" : "收起AI学习助手"} onClick={() => setAiCollapsed((value) => !value)}>
                    {aiCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
                    <span className="sr-only">{aiCollapsed ? "展开AI学习助手" : "收起AI学习助手"}</span>
                  </button>
                </header>
                {!aiCollapsed && (
                  <>
                    <section>
                      <h3>AI诊断总结</h3>
                      <p>{diagnosis?.explanation ?? (latestResult ? "当前版本暂无可用 AI 诊断，请先查看系统测试证据。" : "提交代码后，AI 会基于编译输出、失败用例和课程知识源给出诊断。")}</p>
                    </section>
                    <section>
                      <h3>系统证据</h3>
                      <ul>
                        <li><b>通过情况：</b>{latestResult ? `${latestResult.tests.filter((test) => test.status === "PASSED").length}/${latestResult.tests.length}` : "等待提交"}</li>
                        <li><b>编译状态：</b>{latestResult?.execution.compile_exit_code === 0 ? "通过" : latestResult ? "未通过" : "等待提交"}</li>
                        <li><b>语言：</b>{task.interface_spec.language_labels[selectedLanguage] ?? selectedLanguage}</li>
                      </ul>
                    </section>
                    <section className="program-hints">
                      <h3>分层提示</h3>
                      {hints.length ? [...hints].sort((a, b) => a.level - b.level).map((hint) => (
                        <article className="open" key={`${hint.diagnosis_id}-${hint.level}`}>
                          <button type="button"><Lightbulb size={15} /> 第{hint.level}层提示 <ChevronDown size={15} /></button>
                          <p>{hint.content}</p>
                        </article>
                      )) : (
                        <article>
                          <button type="button"><Lightbulb size={15} /> 第1层提示 <ChevronDown size={15} /></button>
                          <p>诊断生成后会先解锁方向性提示，不直接给完整答案。</p>
                        </article>
                      )}
                    </section>
                    <div className="hint-usage">
                      <p><Eye size={14} /> 第一层提示 <span>{hints.some((hint) => hint.level === 1) ? "已解锁" : "待诊断"}</span></p>
                      <p><Eye size={14} /> 第二层提示 <span>{hints.some((hint) => hint.level === 2) ? "已解锁" : "按需解锁"}</span></p>
                      <p><Eye size={14} /> 第三层提示 <span>{hints.some((hint) => hint.level === 3) ? "已解锁" : "按任务规则控制"}</span></p>
                    </div>
                    <footer>
                      <button type="button"><GraduationCap size={16} /> 查看讲解</button>
                      <button className="primary" type="button" disabled={!diagnosis?.diagnosis_id} onClick={requestNextHint}><Lightbulb size={16} /> 获取下一层提示</button>
                    </footer>
                  </>
                )}
              </aside>
            </section>

            <section className="program-bottom-grid">
              <article className="program-card program-history">
                <header><h2>提交记录</h2><a href="#">更多 <ChevronRight size={14} /></a></header>
                <table>
                  <thead><tr><th>状态</th><th>版本</th><th>执行</th><th>语言</th></tr></thead>
                  <tbody>
                    {latestResult ? (
                      <tr>
                        <td className={isPassed(latestResult) ? "pass" : "fail"}>{latestResult.submission_status}</td>
                        <td>v{latestResult.version_no}</td>
                        <td>{latestResult.execution.status}</td>
                        <td>{selectedLanguage}</td>
                      </tr>
                    ) : (
                      <tr><td colSpan={4}>暂无提交记录。提交代码后会显示真实版本历史。</td></tr>
                    )}
                  </tbody>
                </table>
                <a className="program-card-link" href="#">查看全部提交 <ChevronRight size={14} /></a>
              </article>

              <article className="program-card program-growth">
                <h2>能力成长 <span>i</span></h2>
                {knowledgeTags.slice(0, 3).map((item, index) => (
                  <div className="growth-row" key={item}>
                    <span className={index === 1 ? "orange" : index === 2 ? "blue" : ""}>{index === 0 ? <NotebookTabs size={17} /> : index === 1 ? <Zap size={17} /> : <Code2 size={17} />}</span>
                    <div><strong>{item}</strong><p>等待提交和诊断证据更新画像。</p><i><b style={{ width: isPassed(latestResult) ? "72%" : "0%" }} /></i></div>
                    <em>{isPassed(latestResult) ? "已更新" : "待更新"}</em>
                  </div>
                ))}
                <a className="program-card-link" href="#">查看能力详情 <ChevronRight size={14} /></a>
              </article>

              <article className="program-card program-error">
                <header><h2>错因分析</h2><button type="button">本题表现 <ChevronDown size={14} /></button></header>
                <div className="error-layout">
                  <div className="error-donut"><strong>{latestResult?.tests.filter((test) => test.status === "FAILED").length ?? 0}<span>次</span></strong></div>
                  <div className="error-legend">
                    <p><i className="blue" /> 逻辑错误 <b>{latestResult ? "按失败用例归因" : "待提交"}</b></p>
                    <p><i className="red" /> 编译错误 <b>{latestResult?.execution.compile_exit_code === 0 ? "0次" : latestResult ? "1次" : "待提交"}</b></p>
                    <p><i className="orange" /> 超时问题 <b>{latestResult?.execution.status === "TIMEOUT" ? "1次" : "0次"}</b></p>
                    <p><i /> 其他问题 <b>{runState === "ERROR" ? "需要检查" : "0次"}</b></p>
                  </div>
                </div>
                <a className="program-card-link" href="#">查看错题本 <ChevronRight size={14} /></a>
              </article>

              <article className="program-card program-advice">
                <h2>学习建议</h2>
                {knowledgeTags.slice(0, 3).map((item, index) => (
                  <div className={index === 0 ? "done" : index === 1 ? "warn" : "todo"} key={item}>
                    <span>{index === 0 ? <Check size={15} /> : <Circle size={15} />}</span>
                    <div><strong>复习{item}</strong><p>先对照公开样例自测，再根据系统证据逐步修正。</p></div>
                  </div>
                ))}
                <a className="program-card-link" href="#">查看推荐题目 <ChevronRight size={14} /></a>
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
