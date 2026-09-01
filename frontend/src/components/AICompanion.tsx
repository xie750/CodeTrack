import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Rnd, type DraggableData, type Position } from "react-rnd";
import {
  ChevronRight,
  History,
  Lightbulb,
  MessageSquarePlus,
  Minus,
  RefreshCw,
  Send,
  X
} from "lucide-react";
import { api, type StudentAiChatStreamEvent } from "../api";

type CompanionMode = "floating" | "expanded" | "chat";
type MessageRole = "assistant" | "user";

type CompanionMessage = {
  id: string;
  role: MessageRole;
  content: string;
  time: string;
  loading?: boolean;
  error?: boolean;
};

type AICompanionProps = {
  routePath: string;
  routeGroup: string;
};

type AICompanionOpenEventDetail = {
  mode?: CompanionMode;
  draft?: string;
  reset?: boolean;
};

type CompanionFrame = Position & {
  width: number;
  height: number;
};

const COMPANION_FRAME_STORAGE_KEY = "codetrack.aiCompanion.frame.v2";
const CHAT_SIZE_STORAGE_KEY = "codetrack.aiCompanion.chatSize.v2";
const LAUNCHER_SIZE = { width: 88, height: 78 };
const DEFAULT_CHAT_SIZE = { width: 492, height: 720 };
const MIN_CHAT_SIZE = { width: 420, height: 560 };
const TRANSITION_MS = 190;
const CLICK_DRAG_TOLERANCE = 6;

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

function normalizePosition(position: Position, size: { width: number; height: number }): Position {
  const viewport = viewportSize();
  return {
    x: clamp(position.x, 8, Math.max(8, viewport.width - size.width - 8)),
    y: clamp(position.y, 8, Math.max(8, viewport.height - size.height - 8))
  };
}

function defaultFloatingFrame(): CompanionFrame {
  const viewport = viewportSize();
  return {
    ...LAUNCHER_SIZE,
    x: Math.max(16, viewport.width - LAUNCHER_SIZE.width - 44),
    y: Math.max(16, viewport.height - LAUNCHER_SIZE.height - 34)
  };
}

function normalizeFrame(frame: CompanionFrame): CompanionFrame {
  const viewport = viewportSize();
  const width = clamp(frame.width, LAUNCHER_SIZE.width, Math.max(LAUNCHER_SIZE.width, viewport.width - 16));
  const height = clamp(frame.height, LAUNCHER_SIZE.height, Math.max(LAUNCHER_SIZE.height, viewport.height - 16));
  return {
    ...normalizePosition({ x: frame.x, y: frame.y }, { width, height }),
    width,
    height
  };
}

function frameFromCenter(frame: CompanionFrame, size: { width: number; height: number }): CompanionFrame {
  const center = {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2
  };
  const position = normalizePosition(
    {
      x: center.x - size.width / 2,
      y: center.y - size.height / 2
    },
    size
  );
  return { ...position, ...size };
}

function readInitialFrame() {
  return normalizeFrame(readJson(COMPANION_FRAME_STORAGE_KEY, defaultFloatingFrame()));
}

function readInitialChatSize() {
  const minSize = chatMinSize();
  const viewport = viewportSize();
  const fallback = {
    width: Math.min(DEFAULT_CHAT_SIZE.width, Math.max(minSize.width, viewport.width - 32)),
    height: Math.min(DEFAULT_CHAT_SIZE.height, Math.max(minSize.height, viewport.height - 96))
  };
  const saved = readJson(CHAT_SIZE_STORAGE_KEY, fallback);
  return normalizeChatSize(saved);
}

function chatMinSize() {
  const viewport = viewportSize();
  return {
    width: Math.min(MIN_CHAT_SIZE.width, Math.max(LAUNCHER_SIZE.width, viewport.width - 16)),
    height: Math.min(MIN_CHAT_SIZE.height, Math.max(360, viewport.height - 16))
  };
}

function normalizeChatSize(size: { width: number; height: number }) {
  const minSize = chatMinSize();
  const viewport = viewportSize();
  return {
    width: clamp(size.width, minSize.width, Math.max(minSize.width, viewport.width - 16)),
    height: clamp(size.height, minSize.height, Math.max(minSize.height, viewport.height - 16))
  };
}

function pageContextLabel(routeGroup: string) {
  const labels: Record<string, string> = {
    "/": "学习首页",
    "/tasks": "课程任务",
    "/workspace": "编码工作区",
    "/question-workspace": "题目工作区",
    "/self-study": "自主学习",
    "/ai-tutor": "AI 导师",
    "/library": "资源中心",
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
    content: `你好，我是 CodeTrack AI 助手。我会结合「${contextLabel}」、课程知识库和学习者画像，帮助你梳理知识点、制定学习计划和定位问题。`
  };
}

function readableAssistantError(event: { code?: string; message?: string; details?: Record<string, unknown> }) {
  const detail = event.details?.llm_error_detail;
  if (typeof detail === "string" && detail) {
    return `${event.message ?? "AI 助手暂时不可用。"}（${detail}）`;
  }
  return event.message || "AI 助手暂时不可用，请稍后重试。";
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
  const [frame, setFrame] = useState<CompanionFrame>(readInitialFrame);
  const [chatSize, setChatSize] = useState(readInitialChatSize);
  const [transitioning, setTransitioning] = useState(false);
  const [input, setInput] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [messages, setMessages] = useState<CompanionMessage[]>(() => [initialMessage(routeGroup)]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const draggedRef = useRef(false);
  const pointerStartRef = useRef<Position | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  const contextLabel = useMemo(() => pageContextLabel(routeGroup), [routeGroup]);
  const suggestions = suggestionSets[suggestionIndex % suggestionSets.length];
  const isFloating = mode === "floating";
  const isChat = mode === "chat";
  const minChatSize = chatMinSize();

  useEffect(() => {
    function syncFrameToViewport() {
      setChatSize((currentSize) => {
        const nextSize = normalizeChatSize(currentSize);
        if (nextSize.width !== currentSize.width || nextSize.height !== currentSize.height) {
          saveJson(CHAT_SIZE_STORAGE_KEY, nextSize);
        }
        return nextSize;
      });
      setFrame((currentFrame) => {
        const normalized = normalizeFrame(currentFrame);
        if (
          normalized.x !== currentFrame.x ||
          normalized.y !== currentFrame.y ||
          normalized.width !== currentFrame.width ||
          normalized.height !== currentFrame.height
        ) {
          saveJson(COMPANION_FRAME_STORAGE_KEY, normalized);
        }
        return normalized;
      });
    }

    window.addEventListener("resize", syncFrameToViewport);
    return () => window.removeEventListener("resize", syncFrameToViewport);
  }, []);

  function persistFrame(nextFrame: CompanionFrame) {
    const normalized = normalizeFrame(nextFrame);
    setFrame(normalized);
    saveJson(COMPANION_FRAME_STORAGE_KEY, normalized);
  }

  function startMorph(nextMode: CompanionMode, size: { width: number; height: number }) {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    setTransitioning(true);
    setMode(nextMode);
    persistFrame(frameFromCenter(frame, size));
    transitionTimerRef.current = window.setTimeout(() => {
      setTransitioning(false);
    }, TRANSITION_MS);
  }

  function openExpanded() {
    startMorph("expanded", normalizeChatSize(chatSize));
  }

  function openChat() {
    startMorph("chat", normalizeChatSize(chatSize));
    requestAnimationFrame(() => {
      messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  useEffect(() => {
    function handleCompanionOpen(event: Event) {
      const detail = (event as CustomEvent<AICompanionOpenEventDetail>).detail ?? {};
      if (detail.reset) {
        resetConversation();
      }
      if (typeof detail.draft === "string") {
        setInput(detail.draft);
      }
      if (detail.mode === "chat") {
        openChat();
        return;
      }
      openExpanded();
    }

    window.addEventListener("codetrack:ai-companion-open", handleCompanionOpen);
    return () => window.removeEventListener("codetrack:ai-companion-open", handleCompanionOpen);
  }, [chatSize, frame, routeGroup]);

  function minimize() {
    startMorph("floating", LAUNCHER_SIZE);
  }

  function closePanel() {
    startMorph("floating", LAUNCHER_SIZE);
  }

  function resetConversation() {
    setMessages([initialMessage(routeGroup)]);
    setSessionId(null);
    setSuggestionIndex(0);
    setInput("");
  }

  function updateMessage(messageId: string, update: Partial<CompanionMessage>) {
    setMessages((prev) => prev.map((message) => (
      message.id === messageId ? { ...message, ...update } : message
    )));
    requestAnimationFrame(() => {
      messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  function handleStreamEvent(event: StudentAiChatStreamEvent, assistantMessageId: string) {
    if (event.event === "session") {
      setSessionId(event.data.session.id);
      return;
    }
    if (event.event === "delta") {
      setMessages((prev) => prev.map((message) => (
        message.id === assistantMessageId
          ? { ...message, content: message.content === "正在思考..." ? event.data.content : message.content + event.data.content }
          : message
      )));
      requestAnimationFrame(() => {
        messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
      });
      return;
    }
    if (event.event === "final") {
      setSessionId(event.data.session?.id ?? null);
      updateMessage(assistantMessageId, {
        content: event.data.answer,
        loading: false,
        error: false,
        time: nowLabel()
      });
      return;
    }
    if (event.event === "error") {
      updateMessage(assistantMessageId, {
        content: readableAssistantError(event.data),
        loading: false,
        error: true,
        time: nowLabel()
      });
    }
  }

  async function submitMessage(messageText = input.trim()) {
    const value = messageText.trim();
    if (!value || sending) return;
    setInput("");
    if (!isChat) startMorph("chat", normalizeChatSize(chatSize));
    const userMessageId = `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const history = messages
      .filter((message) => message.id !== "assistant-initial" && !message.loading)
      .map((message) => ({
        role: message.role === "user" ? "student" as const : "assistant" as const,
        content: message.content
      }));
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user", content: value, time: nowLabel() },
      { id: assistantMessageId, role: "assistant", content: "正在思考...", time: nowLabel(), loading: true }
    ]);
    setSending(true);
    requestAnimationFrame(() => {
      messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
    });
    try {
      await api.streamStudentAiChat(
        {
          message: value,
          sessionId,
          pageContext: {
            route_path: routePath,
            route_group: routeGroup,
            page_label: contextLabel
          },
          history
        },
        (event) => handleStreamEvent(event, assistantMessageId)
      );
    } catch (error) {
      updateMessage(assistantMessageId, {
        content: error instanceof Error ? error.message : "AI 助手暂时不可用，请稍后重试。",
        loading: false,
        error: true,
        time: nowLabel()
      });
    } finally {
      setSending(false);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submitMessage();
  }

  function handleDragStop(data: DraggableData) {
    persistFrame({ ...frame, x: data.x, y: data.y });
  }

  function handleResizeStop(elementRef: HTMLElement, position: Position) {
    const nextSize = normalizeChatSize({
      width: elementRef.offsetWidth,
      height: elementRef.offsetHeight
    });
    setChatSize(nextSize);
    saveJson(CHAT_SIZE_STORAGE_KEY, nextSize);
    persistFrame({ ...position, ...nextSize });
  }

  function handleLauncherPointerDown(event: PointerEvent<HTMLButtonElement>) {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    draggedRef.current = false;
    event.currentTarget.blur();
  }

  function handleLauncherPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!pointerStartRef.current) return;
    const distance = Math.hypot(event.clientX - pointerStartRef.current.x, event.clientY - pointerStartRef.current.y);
    if (distance > CLICK_DRAG_TOLERANCE) draggedRef.current = true;
  }

  function handleLauncherClick(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.blur();
    if (draggedRef.current) {
      draggedRef.current = false;
      pointerStartRef.current = null;
      return;
    }
    pointerStartRef.current = null;
    openExpanded();
  }

  const companionNode = (
    <aside
      className={`ai-companion ai-companion-${mode}${transitioning ? " morphing" : ""}`}
      data-route={routePath}
      aria-label="CodeTrack AI 助手"
    >
      <Rnd
        bounds="parent"
        className="ai-companion-rnd"
        position={{ x: frame.x, y: frame.y }}
        size={{ width: frame.width, height: frame.height }}
        minWidth={isChat ? minChatSize.width : frame.width}
        minHeight={isChat ? minChatSize.height : frame.height}
        maxWidth="96vw"
        maxHeight="96vh"
        enableResizing={isChat}
        resizeHandleClasses={{ bottomRight: "ai-resize-handle-bottom-right" }}
        dragHandleClassName={isFloating ? "ai-floating-drag-handle" : "ai-panel-drag-handle"}
        cancel={isFloating ? "" : "button, textarea, input, .ai-message-list, .ai-suggestions, .ai-input-shell"}
        onDragStart={() => {
          draggedRef.current = false;
        }}
        onDrag={() => {
          draggedRef.current = true;
        }}
        onDragStop={(_, data: DraggableData) => handleDragStop(data)}
        onResizeStop={(_, __, elementRef, ___, position) => handleResizeStop(elementRef, position)}
      >
        {isFloating ? (
          <button
            className="ai-launcher ai-floating-drag-handle"
            type="button"
            aria-label="打开 CodeTrack AI 助手"
            onPointerDown={handleLauncherPointerDown}
            onPointerMove={handleLauncherPointerMove}
            onClick={handleLauncherClick}
          >
            <span className="ai-launcher-glow" aria-hidden="true" />
            <CompanionBot />
            <span className="ai-launcher-badge">1</span>
          </button>
        ) : (
          <section className={isChat ? "ai-chat-panel" : "ai-entry-panel"}>
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
                  <button type="button" aria-label="发送消息" onClick={() => submitMessage()} disabled={!input.trim() || sending}>
                    <Send size={19} strokeWidth={2.6} />
                  </button>
                </div>
              </>
            ) : (
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
                    <button type="button" aria-label="关闭 AI 助手" onClick={closePanel}>
                      <X size={18} strokeWidth={2.4} />
                    </button>
                  </div>
                </header>
                <div className="ai-entry-body">
                  <span className="ai-mini-avatar" aria-hidden="true">
                    <CompanionBot size="medium" />
                  </span>
                  <strong>CodeTrack AI 助手</strong>
                  <p>选择一个入口开始，结合课程知识库、学习者画像和历史会话进行交流。</p>
                  <div className="ai-entry-actions">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.blur();
                        resetConversation();
                        openChat();
                      }}
                    >
                      <span className="ai-entry-icon green" aria-hidden="true">
                        <MessageSquarePlus size={20} strokeWidth={2.4} />
                      </span>
                      <span>
                        <strong>新建会话</strong>
                        <small>从当前页面上下文开始提问</small>
                      </span>
                      <ChevronRight size={18} strokeWidth={2.3} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.currentTarget.blur();
                        openChat();
                      }}
                    >
                      <span className="ai-entry-icon blue" aria-hidden="true">
                        <History size={20} strokeWidth={2.4} />
                      </span>
                      <span>
                        <strong>历史会话</strong>
                        <small>继续查看当前 AI 对话记录</small>
                      </span>
                      <ChevronRight size={18} strokeWidth={2.3} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </Rnd>
    </aside>
  );

  return createPortal(companionNode, document.body);
}
