import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Rnd, type DraggableData, type Position } from "react-rnd";
import {
  BookMarked,
  ChevronRight,
  FileText,
  Lightbulb,
  MessageCircleQuestion,
  Minus,
  RefreshCw,
  Send,
  X
} from "lucide-react";

type CompanionMode = "floating" | "expanded" | "chat";
type MessageRole = "assistant" | "user";

type CompanionMessage = {
  id: string;
  role: MessageRole;
  content: string;
  time: string;
};

type QuickAction = {
  key: string;
  title: string;
  hint: string;
  icon: JSX.Element;
  accent: "green" | "purple" | "blue" | "orange";
};

type AICompanionProps = {
  routePath: string;
  routeGroup: string;
};

type CompanionFrame = Position & {
  width: number;
  height: number;
};

const LAUNCHER_STORAGE_KEY = "codetrack.aiCompanion.launcher.v1";
const PANEL_STORAGE_KEY = "codetrack.aiCompanion.panel.v1";
const LAUNCHER_SIZE = { width: 88, height: 78 };
const MINI_PANEL_SIZE = { width: 414, height: 442 };
const DEFAULT_CHAT_SIZE = { width: 492, height: 720 };

const quickActions: QuickAction[] = [
  {
    key: "recommend",
    title: "推荐知识点",
    hint: "基于当前页面给出复习方向",
    icon: <BookMarked size={18} strokeWidth={2.3} />,
    accent: "green"
  },
  {
    key: "summary",
    title: "总结页面",
    hint: "整理当前学习内容",
    icon: <FileText size={18} strokeWidth={2.3} />,
    accent: "purple"
  },
  {
    key: "advice",
    title: "学习建议",
    hint: "给出下一步动作",
    icon: <Lightbulb size={18} strokeWidth={2.3} />,
    accent: "blue"
  },
  {
    key: "question",
    title: "询问问题",
    hint: "进入对话窗口",
    icon: <MessageCircleQuestion size={18} strokeWidth={2.3} />,
    accent: "orange"
  }
];

const suggestionSets = [
  ["时间复杂度是什么？如何计算？", "递归和迭代的区别是什么？", "如何选择合适的排序算法？"],
  ["链表删除头节点为什么容易出错？", "栈和队列分别适合什么场景？", "怎么根据测试结果定位边界条件？"],
  ["帮我把当前诊断整理成复习笔记", "根据我的薄弱点推荐一个练习顺序", "我可以先请求哪一级提示？"]
];

function nowLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

function viewportSize() {
  if (typeof window === "undefined") return { width: 1440, height: 900 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function defaultLauncherPosition(): Position {
  const viewport = viewportSize();
  return {
    x: Math.max(16, viewport.width - LAUNCHER_SIZE.width - 44),
    y: Math.max(16, viewport.height - LAUNCHER_SIZE.height - 34)
  };
}

function defaultPanelFrame(): CompanionFrame {
  const viewport = viewportSize();
  const width = Math.min(DEFAULT_CHAT_SIZE.width, Math.max(360, viewport.width - 32));
  const height = Math.min(DEFAULT_CHAT_SIZE.height, Math.max(520, viewport.height - 118));
  return {
    width,
    height,
    x: Math.max(12, viewport.width - width - 108),
    y: Math.max(12, viewport.height - height - 112)
  };
}

function normalizePosition(position: Position, size: { width: number; height: number }): Position {
  const viewport = viewportSize();
  return {
    x: clamp(position.x, 8, Math.max(8, viewport.width - size.width - 8)),
    y: clamp(position.y, 8, Math.max(8, viewport.height - size.height - 8))
  };
}

function normalizeFrame(frame: CompanionFrame): CompanionFrame {
  const viewport = viewportSize();
  const width = clamp(frame.width, 360, Math.max(360, viewport.width - 24));
  const height = clamp(frame.height, 520, Math.max(520, viewport.height - 24));
  const position = normalizePosition({ x: frame.x, y: frame.y }, { width, height });
  return { ...position, width, height };
}

function pageContextLabel(routeGroup: string) {
  const labels: Record<string, string> = {
    "/": "学习首页",
    "/tasks": "课程任务",
    "/workspace": "编码工作区",
    "/question-workspace": "题目工作区",
    "/self-study": "自学",
    "/ai-tutor": "AI 导师",
    "/library": "我的资料库",
    "/profile": "学习者画像"
  };
  return labels[routeGroup] ?? "当前页面";
}

function initialMessage(routeGroup: string): CompanionMessage {
  const contextLabel = pageContextLabel(routeGroup);
  return {
    id: "assistant-initial",
    role: "assistant",
    time: nowLabel(),
    content: `你好，我是 CodeTrack AI 助手。我会根据「${contextLabel}」提供知识点梳理、学习建议和渐进式提示。正式 AI 回复接入后端后会显示引用来源和置信度。`
  };
}

function actionPrompt(action: QuickAction, routeGroup: string) {
  const contextLabel = pageContextLabel(routeGroup);
  const prompts: Record<string, string> = {
    recommend: `请根据「${contextLabel}」推荐我现在最该复习的知识点。`,
    summary: `帮我总结「${contextLabel}」里的关键学习内容。`,
    advice: `请结合「${contextLabel}」给我一个下一步学习建议。`,
    question: ""
  };
  return prompts[action.key] ?? "";
}

function localAssistantReply(userText: string, routeGroup: string) {
  const contextLabel = pageContextLabel(routeGroup);
  return `前端已收到你的问题：「${userText}」。正式回答需要接入后端 AI 助学接口；当前先保留对话、输入、推荐追问和页面上下文。接入后这里会基于「${contextLabel}」、课程知识库和学习者画像生成回答。`;
}

function CompanionBot({ size = "large" }: { size?: "large" | "medium" | "small" }) {
  return (
    <span className={`ai-bot ai-bot-${size}`} aria-hidden="true">
      <span className="ai-bot-sprout">
        <i />
        <i />
      </span>
      <span className="ai-bot-shell">
        <i className="ai-bot-ear left" />
        <i className="ai-bot-ear right" />
        <span className="ai-bot-face">
          <i />
          <i />
          <b />
        </span>
      </span>
    </span>
  );
}

export default function AICompanion({ routePath, routeGroup }: AICompanionProps) {
  const [mode, setMode] = useState<CompanionMode>("floating");
  const [input, setInput] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [messages, setMessages] = useState<CompanionMessage[]>(() => [initialMessage(routeGroup)]);
  const [launcherPosition, setLauncherPosition] = useState<Position>(() =>
    normalizePosition(readJson(LAUNCHER_STORAGE_KEY, defaultLauncherPosition()), LAUNCHER_SIZE)
  );
  const [panelFrame, setPanelFrame] = useState<CompanionFrame>(() =>
    normalizeFrame(readJson(PANEL_STORAGE_KEY, defaultPanelFrame()))
  );
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const launcherDraggedRef = useRef(false);

  const contextLabel = useMemo(() => pageContextLabel(routeGroup), [routeGroup]);
  const suggestions = suggestionSets[suggestionIndex % suggestionSets.length];
  const isChat = mode === "chat";
  const isExpanded = mode === "expanded";
  const activePanelSize = isChat ? panelFrame : MINI_PANEL_SIZE;
  const activePanelPosition = normalizePosition(panelFrame, activePanelSize);

  function openExpanded() {
    setMode("expanded");
  }

  function openChat() {
    setMode("chat");
    requestAnimationFrame(() => {
      messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  function minimize() {
    setMode("floating");
  }

  function closePanel() {
    setMode("floating");
  }

  function pushMessage(role: MessageRole, content: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        content,
        time: nowLabel()
      }
    ]);
    requestAnimationFrame(() => {
      messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  function submitMessage(messageText = input.trim()) {
    const value = messageText.trim();
    if (!value) return;
    setInput("");
    setMode("chat");
    pushMessage("user", value);
    window.setTimeout(() => {
      pushMessage("assistant", localAssistantReply(value, routeGroup));
    }, 360);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submitMessage();
  }

  function handleQuickAction(action: QuickAction) {
    if (action.key === "question") {
      openChat();
      return;
    }
    const prompt = actionPrompt(action, routeGroup);
    openChat();
    submitMessage(prompt);
  }

  function updateLauncherPosition(position: Position) {
    const next = normalizePosition(position, LAUNCHER_SIZE);
    setLauncherPosition(next);
    saveJson(LAUNCHER_STORAGE_KEY, next);
  }

  function updatePanelPosition(position: Position) {
    const next = normalizeFrame({ ...panelFrame, ...position });
    setPanelFrame(next);
    saveJson(PANEL_STORAGE_KEY, next);
  }

  function updatePanelFrame(frame: CompanionFrame) {
    const next = normalizeFrame(frame);
    setPanelFrame(next);
    saveJson(PANEL_STORAGE_KEY, next);
  }

  return (
    <aside
      className={`ai-companion ai-companion-${mode}`}
      data-route={routePath}
      aria-label="CodeTrack AI 助手"
    >
      {(isExpanded || isChat) && (
        <Rnd
          bounds="window"
          className="ai-companion-panel-rnd"
          position={activePanelPosition}
          size={activePanelSize}
          minWidth={360}
          minHeight={520}
          maxWidth="96vw"
          maxHeight="96vh"
          enableResizing={isChat}
          resizeHandleClasses={{ bottomRight: "ai-resize-handle-bottom-right" }}
          dragHandleClassName="ai-panel-drag-handle"
          cancel="button, textarea, input, .ai-message-list, .ai-suggestions, .ai-input-shell"
          onDragStop={(_, data: DraggableData) => updatePanelPosition({ x: data.x, y: data.y })}
          onResizeStop={(_, __, elementRef, ___, position) =>
            updatePanelFrame({
              x: position.x,
              y: position.y,
              width: elementRef.offsetWidth,
              height: elementRef.offsetHeight
            })
          }
        >
          <section className={isChat ? "ai-chat-panel" : "ai-mini-panel"}>
            {isChat ? (
              <>
                <header className="ai-chat-header ai-panel-drag-handle">
                  <div className="ai-panel-identity">
                    <span className="ai-panel-avatar" aria-hidden="true">
                      <CompanionBot size="small" />
                    </span>
                    <div>
                      <strong>CodeTrack AI 助手</strong>
                      <span><i aria-hidden="true" /> 在线 · {contextLabel}</span>
                    </div>
                  </div>
                  <div className="ai-panel-tools">
                    <button type="button" aria-label="最小化 AI 助手" onClick={minimize}>
                      <Minus size={17} strokeWidth={2.4} />
                    </button>
                    <button type="button" aria-label="关闭 AI 助手" onClick={closePanel}>
                      <X size={18} strokeWidth={2.4} />
                    </button>
                  </div>
                </header>

                <div className="ai-message-list" ref={messageListRef}>
                  {messages.map((message) => (
                    <article key={message.id} className={`ai-message-row ${message.role}`}>
                      {message.role === "assistant" && (
                        <span className="ai-message-avatar" aria-hidden="true">
                          <CompanionBot size="small" />
                        </span>
                      )}
                      <div className="ai-message-bubble">
                        <p>{message.content}</p>
                        <time>{message.time}</time>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="ai-suggestions">
                  <div className="ai-suggestions-head">
                    <strong>
                      <Lightbulb size={14} strokeWidth={2.5} />
                      你可能还想问
                    </strong>
                    <button type="button" onClick={() => setSuggestionIndex((value) => value + 1)}>
                      <RefreshCw size={14} strokeWidth={2.4} />
                      换一换
                    </button>
                  </div>
                  <div className="ai-suggestion-list">
                    {suggestions.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => submitMessage(suggestion)}>
                        <span>{suggestion}</span>
                        <ChevronRight size={16} strokeWidth={2.3} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ai-input-shell">
                  <textarea
                    value={input}
                    maxLength={1000}
                    rows={2}
                    placeholder="输入问题，随时快速交流"
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                  />
                  <span>{input.length}/1000</span>
                  <button type="button" aria-label="发送消息" onClick={() => submitMessage()} disabled={!input.trim()}>
                    <Send size={19} strokeWidth={2.6} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <button className="ai-panel-close" type="button" aria-label="关闭 AI 助手" onClick={closePanel}>
                  <X size={18} strokeWidth={2.4} />
                </button>
                <div className="ai-mini-hero ai-panel-drag-handle">
                  <span className="ai-mini-avatar" aria-hidden="true">
                    <CompanionBot size="medium" />
                  </span>
                  <strong>CodeTrack AI 助手</strong>
                  <p>可快速提问，解答知识点，整理思路</p>
                  <span className="ai-online"><i aria-hidden="true" /> 在线 · {contextLabel}</span>
                </div>
                <div className="ai-quick-grid">
                  {quickActions.map((action) => (
                    <button key={action.key} type="button" onClick={() => handleQuickAction(action)}>
                      <span className={`ai-quick-icon ${action.accent}`} aria-hidden="true">{action.icon}</span>
                      <span>
                        <strong>{action.title}</strong>
                        <small>{action.hint}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <button className="ai-history-link" type="button" onClick={openChat}>
                  查看历史对话
                  <ChevronRight size={16} strokeWidth={2.3} />
                </button>
              </>
            )}
          </section>
        </Rnd>
      )}

      <Rnd
        bounds="window"
        className="ai-launcher-rnd"
        position={launcherPosition}
        size={LAUNCHER_SIZE}
        enableResizing={false}
        onDragStart={() => {
          launcherDraggedRef.current = false;
        }}
        onDrag={() => {
          launcherDraggedRef.current = true;
        }}
        onDragStop={(_, data: DraggableData) => updateLauncherPosition({ x: data.x, y: data.y })}
      >
        <button
          className="ai-launcher"
          type="button"
          aria-label={mode === "floating" ? "打开 CodeTrack AI 助手" : "回到 CodeTrack AI 助手"}
          onClick={() => {
            if (launcherDraggedRef.current) {
              launcherDraggedRef.current = false;
              return;
            }
            if (mode === "floating") openExpanded();
            else openChat();
          }}
        >
          <span className="ai-launcher-glow" aria-hidden="true" />
          <CompanionBot />
          <span className="ai-launcher-badge">1</span>
        </button>
      </Rnd>
    </aside>
  );
}
