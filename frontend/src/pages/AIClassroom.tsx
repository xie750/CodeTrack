import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  AudioLines,
  BookOpenCheck,
  CheckCircle2,
  FileText,
  Highlighter,
  Loader2,
  MessageSquarePlus,
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
import {
  actionLabel,
  actionNarration,
  actionWhiteboardNote,
  focusTargetForAction,
  generateClassroomFromFile,
  type OpenMaicAction,
  type OpenMaicClassroom
} from "../features/ai-classroom/openmaicCompat";

type AIClassroomRouteState = {
  classroom?: OpenMaicClassroom;
} | null;

const pipeline = [
  { label: "资料解析", desc: "PDF / PPT / 文本 / 代码结果" },
  { label: "课堂生成", desc: "Stage + Scene + Action" },
  { label: "实时播放", desc: "TTS + 高亮 + 白板 + 互动" }
];

const actionWeights: Record<OpenMaicAction["type"], number> = {
  speech: 3400,
  spotlight: 1800,
  laser: 1600,
  play_video: 3200,
  wb_open: 900,
  wb_close: 900,
  wb_clear: 800,
  wb_draw_text: 2600,
  widget_highlight: 2600,
  widget_annotation: 2400,
  widget_reveal: 2200,
  widget_setState: 2200,
  discussion: 4200
};

function targetLabel(target: ReturnType<typeof focusTargetForAction>) {
  const labels = {
    source: "资料片段",
    concept: "核心概念",
    curve: "互动图示",
    formula: "公式/规则",
    code: "代码落点",
    summary: "课堂追问"
  };
  return labels[target];
}

export default function AIClassroom() {
  const location = useLocation();
  const routeState = location.state as AIClassroomRouteState;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [classroom, setClassroom] = useState<OpenMaicClassroom | null>(null);
  const [activeActionIndex, setActiveActionIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (routeState?.classroom) {
      setClassroom(routeState.classroom);
      setActiveActionIndex(0);
      setPlaying(true);
      return;
    }
    generateClassroomFromFile().then(setClassroom);
  }, [routeState?.classroom]);

  const scene = classroom?.scenes[0];
  const actions = scene?.actions ?? [];
  const activeAction = actions[activeActionIndex] ?? actions[0];
  const activeTarget = activeAction ? focusTargetForAction(activeAction) : "source";
  const activeNarration = activeAction ? actionNarration(activeAction) : "正在准备课堂。";
  const activeWhiteboard = activeAction ? actionWhiteboardNote(activeAction) : undefined;
  const progress = actions.length ? ((activeActionIndex + 1) / actions.length) * 100 : 0;
  const sourceGroups = useMemo(() => classroom?.citations ?? [], [classroom]);

  useEffect(() => {
    if (!playing || !activeAction || !actions.length) return undefined;
    const timer = window.setTimeout(() => {
      setActiveActionIndex((current) => {
        if (current >= actions.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, actionWeights[activeAction.type] ?? 2600);
    return () => window.clearTimeout(timer);
  }, [activeAction, actions.length, playing]);

  async function generateFromSelectedFile(file?: File) {
    setGenerating(true);
    setPlaying(false);
    try {
      const nextClassroom = await generateClassroomFromFile(file);
      setClassroom(nextClassroom);
      setActiveActionIndex(0);
      setPlaying(true);
    } finally {
      setGenerating(false);
    }
  }

  function resetLecture() {
    setActiveActionIndex(0);
    setPlaying(true);
  }

  function nextStep() {
    setActiveActionIndex((current) => Math.min(actions.length - 1, current + 1));
    setPlaying(false);
  }

  function jumpToSource(source: string) {
    const index = actions.findIndex((action) => actionNarration(action).includes(source) || action.title?.includes(source));
    setActiveActionIndex(index >= 0 ? index : 0);
    setPlaying(false);
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
    <div className="ai-classroom-page">
      <header className="ai-classroom-hero">
        <div>
          <span className="ai-classroom-eyebrow">
            <MonitorPlay size={16} />
            AI讲解课堂
          </span>
          <h1>{classroom.stage.name}</h1>
          <p>复用 OpenMAIC 的核心业务形态：上传资料后生成 Stage / Scene / Action，前端播放器按动作实时执行讲解、高亮、白板和课堂追问。</p>
        </div>
        <div className="ai-classroom-hero-actions">
          <input
            ref={inputRef}
            hidden
            type="file"
            accept=".pdf,.ppt,.pptx,.md,.markdown,.txt,.py,.ts,.tsx,.js,.cpp,.java"
            onChange={(event) => void generateFromSelectedFile(event.target.files?.[0])}
          />
          <button type="button" className="ai-classroom-generate secondary" onClick={() => inputRef.current?.click()}>
            <UploadCloud size={17} />
            上传资料生成课堂
          </button>
          <button type="button" className="ai-classroom-generate" onClick={resetLecture}>
            <Sparkles size={17} />
            重播课堂
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
                ? "已读取文本内容并生成课堂对象"
                : classroom.material.parsedBy === "file_metadata_fallback"
                  ? "已接入上传流程，当前用文件元数据兜底生成"
                  : "当前展示内置示例课堂"}
            </small>
          </div>
        </div>
        <div className="ai-classroom-pipeline">
          {pipeline.map((item, index) => (
            <article className={index <= Math.min(activeActionIndex, 2) ? "done" : ""} key={item.label}>
              <span>{index + 1}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.desc}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <main className="ai-classroom-grid">
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

          <div className="ai-classroom-stage" data-target={activeTarget}>
            <div className="ai-classroom-teacher">
              <span><AudioLines size={18} /></span>
              <div>
                <strong>AI 概念导师</strong>
                <small>{playing ? "正在讲解" : "已暂停"}</small>
              </div>
            </div>

            <article className="ai-classroom-source ai-classroom-hotspot" data-id="source">
              <FileText size={18} />
              <div>
                <strong>资料片段</strong>
                <p>{classroom.material.textPreview}</p>
              </div>
            </article>

            <article className="ai-classroom-concept ai-classroom-hotspot" data-id="concept">
              <span>核心概念</span>
              <strong>{scene.content.elements.find((item) => item.id === "concept")?.text}</strong>
              <p>{scene.content.summary}</p>
            </article>

            <div className="ai-classroom-chart ai-classroom-hotspot" data-id="curve" aria-label="训练误差与验证误差趋势图">
              <span className="train-line" />
              <span className="valid-line" />
              <b>现象</b>
              <em>学习过程</em>
              <i className="chart-marker" />
            </div>

            <article className="ai-classroom-formula ai-classroom-hotspot" data-id="formula">
              <strong>{scene.content.elements.find((item) => item.id === "formula")?.text}</strong>
              <small>白板同步标注</small>
            </article>

            <pre className="ai-classroom-code ai-classroom-hotspot" data-id="code">
              <code>{scene.content.elements.find((item) => item.id === "code")?.text}</code>
            </pre>

            <article className="ai-classroom-summary ai-classroom-hotspot" data-id="summary">
              <MessageSquarePlus size={18} />
              <strong>课堂追问</strong>
              <p>{scene.content.elements.find((item) => item.id === "summary")?.text}</p>
            </article>

            {activeWhiteboard ? (
              <div className="ai-classroom-whiteboard">
                <Highlighter size={17} />
                <span>{activeWhiteboard}</span>
              </div>
            ) : null}

            <MousePointer2 className="ai-classroom-pointer" size={28} />

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
              <strong>OpenMAIC Action 脚本</strong>
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
              modelLabel="OpenMAIC-compatible DSL"
              sourceLabel="课程知识库、上传资料与学习画像"
              citationsCount={sourceGroups.length}
            />
          </section>

          <section className="ai-classroom-panel ai-classroom-contract">
            <header>
              <Highlighter size={17} />
              <strong>复用边界</strong>
            </header>
            <p>这里先复用 OpenMAIC 的课堂协议和播放链路形态，不整仓接入 Next.js 应用。后续后端只要返回同样的 Stage / Scene / Action JSON，当前播放器可以直接消费。</p>
            <code>material -&gt; Stage -&gt; Scene[] -&gt; Action[] -&gt; player</code>
          </section>
        </aside>
      </main>
    </div>
  );
}
