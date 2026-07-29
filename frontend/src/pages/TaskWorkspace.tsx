import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
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
import { api, LearningContext, TaskDetail } from "../api";
import avatarImg from "../assets/ui-home/avatar.png";

type PageProps = {
  taskId: string;
  onBack: () => void;
};

type WorkspaceLayout = {
  problemWidth: number;
  editorHeight: number | null;
};

const WORKSPACE_LAYOUT_KEY = "codetrack.taskWorkspace.layout.v1";
const DEFAULT_PROBLEM_WIDTH = 316;
const PROBLEM_MIN_WIDTH = 240;
const CENTER_MIN_WIDTH = 520;
const EDITOR_MIN_HEIGHT = 300;
const RESULT_MIN_HEIGHT = 180;
const SPLITTER_SIZE = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function readWorkspaceLayout(): WorkspaceLayout {
  if (typeof window === "undefined") {
    return { problemWidth: DEFAULT_PROBLEM_WIDTH, editorHeight: null };
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_LAYOUT_KEY) ?? "{}") as Partial<WorkspaceLayout>;
    return {
      problemWidth: typeof parsed.problemWidth === "number" ? parsed.problemWidth : DEFAULT_PROBLEM_WIDTH,
      editorHeight: typeof parsed.editorHeight === "number" ? parsed.editorHeight : null
    };
  } catch {
    return { problemWidth: DEFAULT_PROBLEM_WIDTH, editorHeight: null };
  }
}

export default function TaskWorkspace({ taskId, onBack }: PageProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [context, setContext] = useState<LearningContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [layout, setLayout] = useState<WorkspaceLayout>(() => readWorkspaceLayout());
  const gridRef = useRef<HTMLElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setTask(null);

    Promise.allSettled([api.getTask(taskId), api.getLearningContext()])
      .then(([taskResult, contextResult]) => {
        if (!alive) return;
        if (taskResult.status === "fulfilled") {
          setTask(taskResult.value);
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

  const editorLines = useMemo(() => {
    const template = task?.interface_spec.student_template.trimEnd();
    return template ? template.split("\n") : ["// 正在等待任务模板"];
  }, [task]);

  const publicTestRows = useMemo(() => {
    return (task?.public_tests ?? []).map((test, index) => [
      test.name || `公开样例 ${index + 1}`,
      JSON.stringify(test.input_summary),
      test.expected_output_summary,
      "-",
      "待运行",
      "-"
    ]);
  }, [task]);

  const knowledgeTags = task?.learning_objectives.length ? task.learning_objectives : ["等待任务知识点"];
  const studentName = context?.student.name ?? "学生";
  const workspaceStyle = {
    "--program-problem-width": `${layout.problemWidth}px`,
    ...(layout.editorHeight ? { "--program-editor-height": `${layout.editorHeight}px` } : {})
  } as CSSProperties;

  function startProblemResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const grid = gridRef.current;
    if (!grid) return;

    const gridRect = grid.getBoundingClientRect();
    const aiWidth = grid.querySelector(".program-ai")?.getBoundingClientRect().width ?? 0;
    const maxProblemWidth = gridRect.width - aiWidth - CENTER_MIN_WIDTH - SPLITTER_SIZE - 32;

    document.documentElement.classList.add("workspace-resizing", "workspace-resizing-x");

    function handleMove(moveEvent: globalThis.PointerEvent) {
      const nextWidth = clamp(moveEvent.clientX - gridRect.left, PROBLEM_MIN_WIDTH, maxProblemWidth);
      setLayout((current) => ({ ...current, problemWidth: Math.round(nextWidth) }));
    }

    function stopResize() {
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
    const maxEditorHeight = centerRect.height - RESULT_MIN_HEIGHT - SPLITTER_SIZE;

    document.documentElement.classList.add("workspace-resizing", "workspace-resizing-y");

    function handleMove(moveEvent: globalThis.PointerEvent) {
      const nextHeight = clamp(moveEvent.clientY - centerRect.top, EDITOR_MIN_HEIGHT, maxEditorHeight);
      setLayout((current) => ({ ...current, editorHeight: Math.round(nextHeight) }));
    }

    function stopResize() {
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
    const delta = event.key === "ArrowLeft" ? -24 : 24;
    setLayout((current) => ({ ...current, problemWidth: Math.max(PROBLEM_MIN_WIDTH, current.problemWidth + delta) }));
  }

  function handleEditorSplitterKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? -24 : 24;
    setLayout((current) => ({ ...current, editorHeight: Math.max(EDITOR_MIN_HEIGHT, (current.editorHeight ?? 420) + delta) }));
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
              <span>状态：<b>{task.current_progress.status}</b></span>
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

            <h2>输入输出说明</h2>
            <ul>
              <li>函数签名：{task.interface_spec.function_signature}</li>
              <li>可编辑区域：{task.interface_spec.editable_region}</li>
            </ul>

            <h2>示例</h2>
            {task.public_tests.length ? task.public_tests.map((test) => (
              <div className="program-example" key={test.test_case_id}>
                <p><b>{test.name}：</b>{JSON.stringify(test.input_summary)}</p>
                <p><b>期望输出：</b>{test.expected_output_summary}</p>
              </div>
            )) : <p>暂无公开样例。</p>}

            <h2>约束条件</h2>
            <ul>
              {task.interface_spec.rules.map((rule) => <li key={rule}>{rule}</li>)}
            </ul>

            <h2>知识点</h2>
            <div className="program-tags">{knowledgeTags.map((tag) => <span key={tag}>{tag}</span>)}</div>

            <h2>老师备注</h2>
            <p>请先运行公开样例，再根据系统验证和 AI 诊断逐步修正。新提交不会继承旧诊断。</p>
          </article>

          <div
            className="program-splitter vertical"
            role="separator"
            aria-label="调整题目和代码区域宽度"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={startProblemResize}
            onKeyDown={handleProblemSplitterKey}
          >
            <span />
          </div>

          <div className="program-center" ref={centerRef}>
            <article className="program-card program-editor">
              <header>
                <h2>代码编辑器</h2>
                <div>
                  <button type="button">C++ <ChevronDown size={14} /></button>
                  <button type="button" aria-label="主题"><Lightbulb size={17} /></button>
                  <button type="button" aria-label="全屏"><Maximize2 size={17} /></button>
                  <button type="button" aria-label="更多"><MoreVertical size={17} /></button>
                </div>
              </header>
              <pre>{editorLines.map((line, index) => <span key={`${index}-${line}`}><em>{index + 1}</em><code>{line}</code></span>)}</pre>
              <footer>
                <button type="button"><Save size={16} /> 保存草稿</button>
                <button className="primary" type="button"><Play size={16} /> 运行代码</button>
                <button className="primary" type="button"><Upload size={16} /> 提交代码</button>
              </footer>
            </article>

            <div
              className="program-splitter horizontal"
              role="separator"
              aria-label="调整代码编辑器和测试结果高度"
              aria-orientation="horizontal"
              tabIndex={0}
              onPointerDown={startEditorResize}
              onKeyDown={handleEditorSplitterKey}
            >
              <span />
            </div>

            <article className="program-card program-result">
              <header>
                <nav><button className="active" type="button">测试结果</button><button type="button">运行输出</button></nav>
                <div>提交后显示执行用时、内存和诊断状态</div>
              </header>
              <table>
                <thead><tr><th>测试点</th><th>输入</th><th>期望输出</th><th>你的输出</th><th>结果</th><th>耗时</th></tr></thead>
                <tbody>
                  {publicTestRows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => (
                        <td className={index === 4 ? (cell === "通过" ? "pass" : cell === "失败" ? "fail" : "") : ""} key={`${row[0]}-${cell}-${index}`}>
                          {index === 4 ? <span>{cell === "通过" ? <Check size={13} /> : <Circle size={12} fill="currentColor" />} {cell}</span> : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="program-pass"><CheckCircle2 size={18} /> 当前任务已加载。提交代码后，这里会展示真实执行结果。</div>
            </article>
          </div>

          <aside className={`program-card program-ai${aiCollapsed ? " collapsed" : ""}`} aria-label="AI学习助手" aria-expanded={!aiCollapsed}>
            <header>
              <span><Bot size={22} /></span>
              <h2>AI学习助手</h2>
              <button
                className="program-ai-toggle"
                type="button"
                aria-label={aiCollapsed ? "展开AI学习助手" : "收起AI学习助手"}
                onClick={() => setAiCollapsed((value) => !value)}
              >
                {aiCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
                <span className="sr-only">{aiCollapsed ? "展开AI学习助手" : "收起AI学习助手"}</span>
              </button>
            </header>
            {!aiCollapsed && (
              <>
                <section>
                  <h3>AI诊断总结</h3>
                  <p>提交代码并完成系统验证后，AI 诊断会基于当前任务、执行结果、测试证据和课程知识源生成。</p>
                </section>
                <section>
                  <h3>问题分析</h3>
                  <ul>
                    <li><b>系统验证：</b>等待首次提交。</li>
                    <li><b>分析范围：</b>{task.title} 的公开样例、隐藏测试摘要、代码版本和学习画像。</li>
                  </ul>
                </section>
                <section className="program-hints">
                  <h3>分层提示</h3>
                  {knowledgeTags.slice(0, 3).map((tag, index) => (
                    <article key={tag}>
                      <button type="button"><Lightbulb size={15} /> 第{index + 1}层提示 · {tag}<ChevronDown size={15} /></button>
                      <p>提交后可按层级解锁。首层只给方向，后续层级会结合当前失败证据逐步展开。</p>
                    </article>
                  ))}
                </section>
                <div className="hint-usage">
                  <p><Eye size={14} /> 第一层提示 <span>待提交后解锁</span></p>
                  <p><Eye size={14} /> 第二层提示 <span>待诊断后解锁</span></p>
                  <p><Eye size={14} /> 第三层提示 <span>按任务规则控制</span></p>
                </div>
                <footer>
                  <button type="button"><GraduationCap size={16} /> 查看讲解</button>
                  <button className="primary" type="button"><Lightbulb size={16} /> 获取下一层提示</button>
                </footer>
              </>
            )}
          </aside>
        </section>

        <section className="program-bottom-grid">
          <article className="program-card program-history">
            <header><h2>提交记录</h2><a href="#">更多 <ChevronRight size={14} /></a></header>
            <table>
              <thead><tr><th>状态</th><th>提交时间</th><th>用时</th><th>内存</th></tr></thead>
              <tbody>
                <tr>
                  <td colSpan={4}>暂无提交记录。提交代码后会显示真实版本历史。</td>
                </tr>
              </tbody>
            </table>
            <a className="program-card-link" href="#">查看全部提交 <ChevronRight size={14} /></a>
          </article>

          <article className="program-card program-growth">
            <h2>能力成长 <span>i</span></h2>
            {knowledgeTags.slice(0, 3).map((item, index) => (
              <div className="growth-row" key={item}>
                <span className={index === 1 ? "orange" : index === 2 ? "blue" : ""}>{index === 0 ? <NotebookTabs size={17} /> : index === 1 ? <Zap size={17} /> : <Code2 size={17} />}</span>
                <div><strong>{item}</strong><p>等待提交和诊断证据更新画像</p><i><b style={{ width: "0%" }} /></i></div>
                <em>待更新</em>
              </div>
            ))}
            <a className="program-card-link" href="#">查看能力详情 <ChevronRight size={14} /></a>
          </article>

          <article className="program-card program-error">
            <header><h2>错因分析</h2><button type="button">本题表现 <ChevronDown size={14} /></button></header>
            <div className="error-layout">
              <div className="error-donut"><strong>0<span>次</span></strong></div>
              <div className="error-legend">
                <p><i className="blue" /> 逻辑错误 <b>待提交</b></p>
                <p><i className="red" /> 边界条件 <b>待提交</b></p>
                <p><i className="orange" /> 超时问题 <b>待提交</b></p>
                <p><i /> 其他问题 <b>0% (0次)</b></p>
              </div>
            </div>
            <a className="program-card-link" href="#">查看错题本 <ChevronRight size={14} /></a>
          </article>

          <article className="program-card program-advice">
            <h2>学习建议</h2>
            {knowledgeTags.slice(0, 3).map((item, index) => (
              <div className={index === 0 ? "done" : index === 1 ? "warn" : "todo"} key={item}>
                <span>{index === 0 ? <Check size={15} /> : <Circle size={15} />}</span>
                <div><strong>复习{item}</strong><p>提交前先对照任务说明和公开样例完成一次自检。</p></div>
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
