import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  AudioLines,
  BookOpenCheck,
  CheckCircle2,
  FileQuestion,
  FileText,
  Gamepad2,
  Highlighter,
  Loader2,
  MonitorPlay,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  UploadCloud
} from "lucide-react";
import AIContentDisclosure from "../components/AIContentDisclosure";
import { findAIClassroomResource } from "../features/ai-classroom/classroomResourceStore";
import {
  actionLabel,
  actionNarration,
  actionWhiteboardNote,
  focusTargetForAction,
  generateClassroomFromFile,
  type OpenMaicAction,
  type OpenMaicClassroom,
  type OpenMaicInteractiveContent,
  type OpenMaicScene,
  type OpenMaicSlideElement
} from "../features/ai-classroom/openmaicCompat";

type AIClassroomRouteState = {
  classroom?: OpenMaicClassroom;
} | null;

const pipeline = [
  { label: "资料解析", desc: "材料切片 / 引用整理" },
  { label: "课程规划", desc: "Slide / Interactive / Quiz" },
  { label: "动作编排", desc: "Speech / Whiteboard / Widget" },
  { label: "课堂播放", desc: "播放器 + iframe 互动" }
];

const actionWeights: Record<OpenMaicAction["type"], number> = {
  speech: 3300,
  spotlight: 1700,
  laser: 1400,
  play_video: 3200,
  wb_open: 900,
  wb_close: 900,
  wb_clear: 800,
  wb_draw_text: 2400,
  widget_highlight: 2300,
  widget_annotation: 2300,
  widget_reveal: 2100,
  widget_setState: 2600,
  discussion: 4200
};

function targetLabel(target: ReturnType<typeof focusTargetForAction>) {
  const labels = {
    source: "资料片段",
    concept: "核心概念",
    curve: "趋势图示",
    formula: "公式/规则",
    code: "代码落点",
    summary: "课堂追问",
    interactive: "互动组件"
  };
  return labels[target];
}

function sceneTypeLabel(scene: OpenMaicScene) {
  if (scene.type === "interactive") return scene.content.type === "interactive" ? `${scene.content.widgetType} 互动` : "互动页";
  if (scene.type === "quiz") return "课堂自测";
  return "讲解页";
}

export default function AIClassroom() {
  const location = useLocation();
  const navigate = useNavigate();
  const { resourceId } = useParams();
  const routeState = location.state as AIClassroomRouteState;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [classroom, setClassroom] = useState<OpenMaicClassroom | null>(null);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [activeActionIndex, setActiveActionIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [resourceMissing, setResourceMissing] = useState(false);
  const [quizChoice, setQuizChoice] = useState<string | null>(null);

  useEffect(() => {
    setResourceMissing(false);
    if (resourceId) {
      const resource = findAIClassroomResource(resourceId);
      if (resource) {
        setClassroom(resource.classroom);
        setActiveSceneIndex(0);
        setActiveActionIndex(0);
        setPlaying(true);
      } else {
        setClassroom(null);
        setPlaying(false);
        setResourceMissing(true);
      }
      return;
    }
    if (routeState?.classroom) {
      setClassroom(routeState.classroom);
      setActiveSceneIndex(0);
      setActiveActionIndex(0);
      setPlaying(true);
      return;
    }
    generateClassroomFromFile().then(setClassroom);
  }, [resourceId, routeState?.classroom]);

  const scenes = classroom?.scenes ?? [];
  const scene = scenes[activeSceneIndex] ?? scenes[0];
  const actions = scene?.actions ?? [];
  const activeAction = actions[activeActionIndex] ?? actions[0];
  const activeTarget = activeAction ? focusTargetForAction(activeAction) : "source";
  const activeNarration = activeAction ? actionNarration(activeAction) : "正在准备课堂。";
  const activeWhiteboard = activeAction ? actionWhiteboardNote(activeAction) : undefined;
  const actionCount = scenes.reduce((total, item) => total + item.actions.length, 0);
  const completedActions = scenes.slice(0, activeSceneIndex).reduce((total, item) => total + item.actions.length, 0) + activeActionIndex + 1;
  const progress = actionCount ? (completedActions / actionCount) * 100 : 0;
  const sourceGroups = useMemo(() => classroom?.citations ?? [], [classroom]);

  useEffect(() => {
    if (!playing || !activeAction || !actions.length) return undefined;
    const timer = window.setTimeout(() => {
      setActiveActionIndex((current) => {
        if (current < actions.length - 1) return current + 1;
        setActiveSceneIndex((sceneIndex) => {
          if (sceneIndex >= scenes.length - 1) {
            setPlaying(false);
            return sceneIndex;
          }
          return sceneIndex + 1;
        });
        return 0;
      });
    }, actionWeights[activeAction.type] ?? 2400);
    return () => window.clearTimeout(timer);
  }, [activeAction, actions.length, playing, scenes.length]);

  useEffect(() => {
    if (!activeAction || scene?.content.type !== "interactive") return;
    if (!activeAction.type.startsWith("widget_")) return;
    const payload = {
      type: activeAction.type === "widget_setState" ? "widget:setState" : activeAction.type === "widget_annotation" ? "widget:annotation" : "widget:highlight",
      ...("state" in activeAction ? activeAction.state : {}),
      ...("target" in activeAction ? { target: activeAction.target.replace(/^[.#]/, "") } : {})
    };
    iframeRef.current?.contentWindow?.postMessage(payload, "*");
  }, [activeAction, scene?.content.type]);

  async function generateFromSelectedFile(file?: File) {
    setGenerating(true);
    setPlaying(false);
    try {
      const nextClassroom = await generateClassroomFromFile(file);
      setClassroom(nextClassroom);
      setActiveSceneIndex(0);
      setActiveActionIndex(0);
      setQuizChoice(null);
      setPlaying(true);
    } finally {
      setGenerating(false);
    }
  }

  function resetLecture() {
    setActiveSceneIndex(0);
    setActiveActionIndex(0);
    setQuizChoice(null);
    setPlaying(true);
  }

  function nextStep() {
    setPlaying(false);
    if (activeActionIndex < actions.length - 1) {
      setActiveActionIndex((current) => current + 1);
      return;
    }
    setActiveSceneIndex((current) => Math.min(scenes.length - 1, current + 1));
    setActiveActionIndex(0);
  }

  function jumpToScene(index: number) {
    setActiveSceneIndex(index);
    setActiveActionIndex(0);
    setQuizChoice(null);
    setPlaying(false);
  }

  function jumpToSource(source: string) {
    const index = scenes.findIndex((item) => item.actions.some((action) => actionNarration(action).includes(source) || action.title?.includes(source)));
    if (index >= 0) jumpToScene(index);
  }

  if (resourceMissing) {
    return (
      <div className="ai-classroom-page">
        <section className="ai-classroom-loading">
          <strong>没有找到这个 AI讲解课堂资源</strong>
          <span>请回到资源中心，从已保存的课堂资源重新进入。</span>
          <button type="button" className="ai-classroom-generate" onClick={() => navigate("/self-study/library")}>
            <ArrowLeft size={17} />
            返回资源中心
          </button>
        </section>
      </div>
    );
  }

  if (!classroom || !scene || !activeAction) {
    return (
      <div className="ai-classroom-page">
        <section className="ai-classroom-loading">
          <Loader2 size={22} className="study-spin-icon" />
          <strong>正在准备 AI讲解课堂...</strong>
        </section>
      </div>
    );
  }

  return (
    <div className="ai-classroom-page openmaic-like">
      <header className="ai-classroom-hero compact">
        <div>
          <span className="ai-classroom-eyebrow">
            <MonitorPlay size={16} />
            AI讲解课堂
          </span>
          <h1>{classroom.stage.name}</h1>
          <p>按 OpenMAIC 的课堂运行时思路组织：多个 scene 串联，讲解页、游戏页、方程验证页和自测页由同一套 Action 脚本驱动。</p>
        </div>
        <div className="ai-classroom-hero-actions">
          <button type="button" className="ai-classroom-generate secondary" onClick={() => navigate("/self-study/library")}>
            <ArrowLeft size={17} />
            返回资源中心
          </button>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept=".pdf,.ppt,.pptx,.md,.markdown,.txt,.py,.ts,.tsx,.js,.cpp,.java"
            onChange={(event) => void generateFromSelectedFile(event.target.files?.[0])}
          />
          <button type="button" className="ai-classroom-generate secondary" onClick={() => inputRef.current?.click()}>
            <UploadCloud size={17} />
            重新上传资料
          </button>
          <button type="button" className="ai-classroom-generate" onClick={resetLecture}>
            <Sparkles size={17} />
            从头播放
          </button>
        </div>
      </header>

      <section className="ai-classroom-intake" aria-label="课堂生成流程">
        <div className="ai-classroom-upload">
          <span>{generating ? <Loader2 size={22} className="study-spin-icon" /> : <UploadCloud size={22} />}</span>
          <div>
            <strong>{classroom.material.fileName}</strong>
            <small>
              {classroom.material.parsedBy === "browser_text"
                ? "已读取文本内容，并规划为互动课堂"
                : classroom.material.parsedBy === "file_metadata_fallback"
                  ? "已接入上传流程，当前用文件元数据生成课堂"
                  : "当前展示内置示例课堂"}
            </small>
          </div>
        </div>
        <div className="ai-classroom-pipeline openmaic">
          {pipeline.map((item, index) => (
            <article className={index <= Math.min(activeSceneIndex, 3) ? "done" : ""} key={item.label}>
              <span>{index + 1}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.desc}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <main className="ai-classroom-shell">
        <aside className="ai-classroom-scenes" aria-label="课堂页面">
          <header>
            <strong>课堂页面</strong>
            <span>{scenes.length} scenes</span>
          </header>
          {scenes.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={index === activeSceneIndex ? "active" : index < activeSceneIndex ? "done" : ""}
              onClick={() => jumpToScene(index)}
            >
              <span>{index < activeSceneIndex ? <CheckCircle2 size={14} /> : index + 1}</span>
              <div>
                <strong>{item.title}</strong>
                <small>{sceneTypeLabel(item)}</small>
              </div>
            </button>
          ))}
        </aside>

        <section className="ai-classroom-player" aria-label="AI讲解课堂播放器">
          <div className="ai-classroom-toolbar">
            <div>
              <strong>{scene.title}</strong>
              <span>{actionLabel(activeAction)} · {targetLabel(activeTarget)} · {activeAction.type}</span>
            </div>
            <div className="ai-classroom-controls">
              <button type="button" onClick={() => setPlaying((current) => !current)} title={playing ? "暂停讲解" : "继续讲解"} aria-label={playing ? "暂停讲解" : "继续讲解"}>
                {playing ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <button type="button" onClick={nextStep} title="下一步" aria-label="下一步">
                <SkipForward size={17} />
              </button>
              <button type="button" onClick={resetLecture} title="重播" aria-label="重播">
                <RotateCcw size={17} />
              </button>
            </div>
          </div>

          <div className="ai-classroom-progress" aria-label="讲解进度">
            <i style={{ width: `${progress}%` }} />
          </div>

          <div className={`ai-classroom-stage scene-${scene.type}`} data-target={activeTarget}>
            <div className="ai-classroom-teacher">
              <span><AudioLines size={18} /></span>
              <div>
                <strong>AI 概念导师</strong>
                <small>{playing ? "正在讲解" : "已暂停"}</small>
              </div>
            </div>

            {scene.content.type === "slide" ? <SlideScene content={scene.content.elements} summary={scene.content.summary} /> : null}
            {scene.content.type === "interactive" ? (
              <InteractiveScene iframeRef={iframeRef} content={scene.content} />
            ) : null}
            {scene.content.type === "quiz" ? (
              <QuizScene scene={scene} quizChoice={quizChoice} onChoose={setQuizChoice} />
            ) : null}

            {activeWhiteboard ? (
              <div className="ai-classroom-whiteboard">
                <Highlighter size={17} />
                <span>{activeWhiteboard}</span>
              </div>
            ) : null}

            {scene.content.type !== "interactive" ? <MousePointer2 className="ai-classroom-pointer" size={28} /> : null}

            <div className="ai-classroom-caption">
              <strong>{activeAction.title || actionLabel(activeAction)}</strong>
              <p>{activeNarration}</p>
            </div>
          </div>
        </section>

        <aside className="ai-classroom-side">
          <section className="ai-classroom-panel">
            <header>
              <BookOpenCheck size={17} />
              <strong>当前 Action 脚本</strong>
            </header>
            <div className="ai-classroom-actions">
              {actions.map((action, index) => (
                <button
                  type="button"
                  className={index === activeActionIndex ? "active" : index < activeActionIndex ? "done" : ""}
                  key={action.id}
                  onClick={() => {
                    setActiveActionIndex(index);
                    setPlaying(false);
                  }}
                >
                  <span>{index < activeActionIndex ? <CheckCircle2 size={14} /> : index + 1}</span>
                  <div>
                    <strong>{action.title || action.type}</strong>
                    <small>{actionLabel(action)} / {targetLabel(focusTargetForAction(action))}</small>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="ai-classroom-panel">
            <header>
              <FileText size={17} />
              <strong>引用来源</strong>
            </header>
            <div className="ai-classroom-sources">
              {sourceGroups.map((source) => (
                <button type="button" key={source} onClick={() => jumpToSource(source)}>
                  {source}
                </button>
              ))}
            </div>
            <AIContentDisclosure
              confidence={0.86}
              modelLabel="OpenMAIC-compatible runtime"
              sourceLabel="课程知识库、上传资料与学习画像"
              citationsCount={sourceGroups.length}
            />
          </section>
        </aside>
      </main>
    </div>
  );
}

function SlideScene({ content, summary }: { content: OpenMaicSlideElement[]; summary: string }) {
  const element = (id: OpenMaicSlideElement["id"]) => content.find((item) => item.id === id);
  return (
    <>
      {element("source") ? (
        <article className="ai-classroom-source ai-classroom-hotspot" data-id="source">
          <FileText size={18} />
          <div>
            <strong>{element("source")?.label}</strong>
            <p>{element("source")?.text}</p>
          </div>
        </article>
      ) : null}

      <article className="ai-classroom-concept ai-classroom-hotspot" data-id="concept">
        <span>{element("concept")?.label ?? "核心概念"}</span>
        <strong>{element("concept")?.text}</strong>
        <p>{summary}</p>
      </article>

      {element("curve") ? (
        <div className="ai-classroom-chart ai-classroom-hotspot" data-id="curve" aria-label={element("curve")?.label}>
          <span className="train-line" />
          <span className="valid-line" />
          <b>{element("curve")?.text}</b>
          <em>学习过程</em>
          <i className="chart-marker" />
        </div>
      ) : null}

      {element("formula") ? (
        <article className="ai-classroom-formula ai-classroom-hotspot" data-id="formula">
          <strong>{element("formula")?.text}</strong>
          <small>白板同步标注</small>
        </article>
      ) : null}

      {element("code") ? (
        <pre className="ai-classroom-code ai-classroom-hotspot" data-id="code">
          <code>{element("code")?.text}</code>
        </pre>
      ) : null}

      {element("summary") ? (
        <article className="ai-classroom-summary ai-classroom-hotspot" data-id="summary">
          <FileQuestion size={18} />
          <strong>{element("summary")?.label}</strong>
          <p>{element("summary")?.text}</p>
        </article>
      ) : null}
    </>
  );
}

function InteractiveScene({
  iframeRef,
  content
}: {
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  content: OpenMaicInteractiveContent;
}) {
  return (
    <div className="ai-classroom-interactive-wrap ai-classroom-hotspot" data-id="interactive">
      <div className="ai-classroom-interactive-head">
        <span><Gamepad2 size={16} /> {content.widgetType}</span>
        <strong>{content.title}</strong>
        <small>{content.summary}</small>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={patchInteractiveHtml(content.html)}
        title={content.title}
        sandbox="allow-scripts allow-forms allow-popups"
      />
    </div>
  );
}

function QuizScene({
  scene,
  quizChoice,
  onChoose
}: {
  scene: OpenMaicScene;
  quizChoice: string | null;
  onChoose: (value: string) => void;
}) {
  if (scene.content.type !== "quiz") return null;
  const selected = scene.content.options.find((item) => item.id === quizChoice);
  return (
    <section className="ai-classroom-quiz ai-classroom-hotspot" data-id="summary">
      <span>课堂自测</span>
      <h2>{scene.content.question}</h2>
      <div>
        {scene.content.options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={quizChoice === option.id ? option.correct ? "correct" : "wrong" : ""}
            onClick={() => onChoose(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {selected ? (
        <p>{selected.correct ? "判断正确。" : "还差一点。"}{scene.content.explanation}</p>
      ) : (
        <p>{scene.content.summary}</p>
      )}
    </section>
  );
}

function patchInteractiveHtml(html: string) {
  const storageShim = `<script>
(function () {
  function makeStore() {
    var data = Object.create(null);
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, String(k)) ? data[String(k)] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); },
      removeItem: function (k) { delete data[String(k)]; },
      clear: function () { data = Object.create(null); }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try { window[name].getItem('__probe__'); } catch (e) {
      try { Object.defineProperty(window, name, { value: makeStore(), configurable: true }); } catch (_) {}
    }
  });
})();
</script>`;
  const errorShim = `<script>
(function () {
  function emit(kind, message) {
    try { window.parent.postMessage({ __codetrackInteractive: true, kind: kind, message: String(message).slice(0, 800) }, '*'); } catch (e) {}
  }
  window.addEventListener('error', function (e) { emit('runtime-error', e && e.message ? e.message : 'resource failed'); }, true);
  window.addEventListener('unhandledrejection', function (e) { emit('unhandledrejection', e && e.reason ? (e.reason.message || e.reason) : 'promise rejected'); });
})();
</script>`;
  return html.replace(/<head>/i, `<head>${errorShim}${storageShim}`);
}
