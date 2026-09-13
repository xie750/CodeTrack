import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Rnd, type DraggableData, type Position } from "react-rnd";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  History,
  Lightbulb,
  MessageSquarePlus,
  Minus,
  RefreshCw,
  Send,
  X
} from "lucide-react";
import { api, type StudentAiChatStreamEvent, type StudentAiModelOption } from "../api";
import {
  fallbackStudentAiModelOptions,
  readStudentAiModelKey,
  saveStudentAiModelKey
} from "../studentAiModels";
import { scopedStorageKey } from "../scopedStorage";
import AIContentDisclosure from "./AIContentDisclosure";

type CompanionMode = "floating" | "expanded" | "chat";
type MessageRole = "assistant" | "user";

type CompanionMessage = {
  id: string;
  role: MessageRole;
  content: string;
  time: string;
  loading?: boolean;
  error?: boolean;
  confidence?: number;
  citationsCount?: number;
  modelLabel?: string;
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

type CompanionPlacement = "top" | "right" | "bottom" | "left" | "sheet" | "free";
type PanelSide = Exclude<CompanionPlacement, "sheet" | "free">;

type CompanionFrame = Position & {
  width: number;
  height: number;
};

const COMPANION_FRAME_STORAGE_BASE_KEY = "codetrack.aiCompanion.launcherFrame.v3";
const CHAT_SIZE_STORAGE_BASE_KEY = "codetrack.aiCompanion.chatSize.v2";
const LAUNCHER_SIZE = { width: 88, height: 78 };
const DEFAULT_ENTRY_SIZE = { width: 408, height: 436 };
const MIN_ENTRY_SIZE = { width: 320, height: 380 };
const DEFAULT_CHAT_SIZE = { width: 492, height: 720 };
const MIN_CHAT_SIZE = { width: 420, height: 560 };
const VIEWPORT_MARGIN = 16;
const MOBILE_VIEWPORT_MARGIN = 12;
const PANEL_GAP = 14;
const TRANSITION_MS = 190;
const CLICK_DRAG_TOLERANCE = 6;

function companionFrameStorageKey() {
  return scopedStorageKey(COMPANION_FRAME_STORAGE_BASE_KEY);
}

function chatSizeStorageKey() {
  return scopedStorageKey(CHAT_SIZE_STORAGE_BASE_KEY);
}

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

function normalizePosition(position: Position, size: { width: number; height: number }, margin = VIEWPORT_MARGIN): Position {
  const viewport = viewportSize();
  return {
    x: clamp(position.x, margin, Math.max(margin, viewport.width - size.width - margin)),
    y: clamp(position.y, margin, Math.max(margin, viewport.height - size.height - margin))
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
  const margin = panelViewportMargin();
  const width = clamp(frame.width, LAUNCHER_SIZE.width, Math.max(LAUNCHER_SIZE.width, viewport.width - margin * 2));
  const height = clamp(frame.height, LAUNCHER_SIZE.height, Math.max(LAUNCHER_SIZE.height, viewport.height - margin * 2));
  return {
    ...normalizePosition({ x: frame.x, y: frame.y }, { width, height }, margin),
    width,
    height
  };
}

function normalizeLauncherFrame(frame: CompanionFrame): CompanionFrame {
  const position = normalizePosition({ x: frame.x, y: frame.y }, LAUNCHER_SIZE);
  return { ...position, ...LAUNCHER_SIZE };
}

function readInitialFrame() {
  const fallback = defaultFloatingFrame();
  const saved = readJson(companionFrameStorageKey(), fallback);
  return normalizeLauncherFrame({ ...fallback, x: saved.x, y: saved.y });
}

function panelViewportMargin() {
  const viewport = viewportSize();
  return viewport.width <= 640 ? MOBILE_VIEWPORT_MARGIN : VIEWPORT_MARGIN;
}

function normalizeEntrySize(size = DEFAULT_ENTRY_SIZE) {
  const viewport = viewportSize();
  const margin = panelViewportMargin();
  const minWidth = Math.min(MIN_ENTRY_SIZE.width, Math.max(LAUNCHER_SIZE.width, viewport.width - margin * 2));
  const minHeight = Math.min(MIN_ENTRY_SIZE.height, Math.max(320, viewport.height - margin * 2));
  return {
    width: clamp(size.width, minWidth, Math.max(minWidth, viewport.width - margin * 2)),
    height: clamp(size.height, minHeight, Math.max(minHeight, viewport.height - margin * 2))
  };
}

function readInitialChatSize() {
  const minSize = chatMinSize();
  const viewport = viewportSize();
  const fallback = {
    width: Math.min(DEFAULT_CHAT_SIZE.width, Math.max(minSize.width, viewport.width - 32)),
    height: Math.min(DEFAULT_CHAT_SIZE.height, Math.max(minSize.height, viewport.height - 96))
  };
  const saved = readJson(chatSizeStorageKey(), fallback);
  return normalizeChatSize(saved);
}

function chatMinSize() {
  const viewport = viewportSize();
  const margin = panelViewportMargin();
  return {
    width: Math.min(MIN_CHAT_SIZE.width, Math.max(LAUNCHER_SIZE.width, viewport.width - margin * 2)),
    height: Math.min(MIN_CHAT_SIZE.height, Math.max(360, viewport.height - margin * 2))
  };
}

function normalizeChatSize(size: { width: number; height: number }) {
  const minSize = chatMinSize();
  const viewport = viewportSize();
  const margin = panelViewportMargin();
  return {
    width: clamp(size.width, minSize.width, Math.max(minSize.width, viewport.width - margin * 2)),
    height: clamp(size.height, minSize.height, Math.max(minSize.height, viewport.height - margin * 2))
  };
}

function positionPanel(anchor: CompanionFrame, size: { width: number; height: number }): { frame: CompanionFrame; placement: CompanionPlacement } {
  const viewport = viewportSize();
  const margin = panelViewportMargin();
  const gap = PANEL_GAP;
  const panelSize = viewport.width <= 640 ? normalizeChatSize(size) : size;

  if (viewport.width <= 640) {
    const sheetHeight = clamp(panelSize.height, 320, Math.max(320, viewport.height - margin * 2));
    const sheetWidth = Math.max(0, viewport.width - margin * 2);
    return {
      frame: {
        x: margin,
        y: Math.max(margin, viewport.height - sheetHeight - margin),
        width: sheetWidth,
        height: sheetHeight
      },
      placement: "sheet"
    };
  }

  const anchorCenterX = anchor.x + anchor.width / 2;
  const anchorCenterY = anchor.y + anchor.height / 2;
  const available = {
    right: viewport.width - margin - (anchor.x + anchor.width + gap),
    left: anchor.x - margin - gap,
    bottom: viewport.height - margin - (anchor.y + anchor.height + gap),
    top: anchor.y - margin - gap
  };
  const horizontalOrder: PanelSide[] = anchorCenterX > viewport.width / 2 ? ["left", "right"] : ["right", "left"];
  const verticalOrder: PanelSide[] = anchorCenterY > viewport.height / 2 ? ["top", "bottom"] : ["bottom", "top"];
  const ordered = [...horizontalOrder, ...verticalOrder];
  const placement = ordered.find((side) => (
    side === "left" || side === "right" ? available[side] >= panelSize.width : available[side] >= panelSize.height
  )) ?? ordered.reduce((best, side) => {
    const bestSpace = available[best];
    const sideSpace = available[side];
    return sideSpace > bestSpace ? side : best;
  }, ordered[0]);

  const positionForPlacement: Record<PanelSide, Position> = {
    left: {
      x: anchor.x - panelSize.width - gap,
      y: anchorCenterY - panelSize.height / 2
    },
    right: {
      x: anchor.x + anchor.width + gap,
      y: anchorCenterY - panelSize.height / 2
    },
    top: {
      x: anchorCenterX - panelSize.width / 2,
      y: anchor.y - panelSize.height - gap
    },
    bottom: {
      x: anchorCenterX - panelSize.width / 2,
      y: anchor.y + anchor.height + gap
    }
  };
  const position = normalizePosition(positionForPlacement[placement], panelSize);
  return { frame: { ...position, ...panelSize }, placement };
}

function pageContextLabel(routeGroup: string) {
  const labels: Record<string, string> = {
    "/": "学习首页",
    "/tasks": "课程任务",
    "/workspace": "编码工作区",
    "/question-workspace": "题目工作区",
    "/self-study": "自主学习",
    "/project-practice": "项目实践",
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

function CompanionModelSelect({
  options,
  selectedKey,
  disabled,
  onChange
}: {
  options: StudentAiModelOption[];
  selectedKey: string;
  disabled?: boolean;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedModel = options.find((item) => item.key === selectedKey) ?? options[0];

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  return (
    <div className="ai-companion-model-select" onBlur={handleBlur}>
      <button
        type="button"
        className="ai-companion-model-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`当前模型：${selectedModel?.label ?? "通用模型"}`}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <Cpu size={14} strokeWidth={2.4} />
        <span>模型</span>
        <strong>{selectedModel?.label ?? "通用模型"}</strong>
        <ChevronDown size={14} strokeWidth={2.4} />
      </button>
      {open ? (
        <div className="ai-companion-model-menu" role="listbox" aria-label="选择 AI 模型">
          {options.map((option) => {
            const selected = option.key === selectedModel?.key;
            return (
              <button
                type="button"
                key={option.key}
                role="option"
                aria-selected={selected}
                disabled={!option.configured}
                title={option.configured ? option.description : `${option.label}尚未配置`}
                onClick={() => {
                  onChange(option.key);
                  setOpen(false);
                }}
              >
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.configured ? option.model_name || option.description : "暂未配置"}</small>
                </span>
                {selected ? <Check size={16} strokeWidth={2.6} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function AICompanion({ routePath, routeGroup }: AICompanionProps) {
  const [mode, setMode] = useState<CompanionMode>("floating");
  const [frame, setFrame] = useState<CompanionFrame>(readInitialFrame);
  const [panelPlacement, setPanelPlacement] = useState<CompanionPlacement>("left");
  const [chatSize, setChatSize] = useState(readInitialChatSize);
  const [transitioning, setTransitioning] = useState(false);
  const [input, setInput] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [messages, setMessages] = useState<CompanionMessage[]>(() => [initialMessage(routeGroup)]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [modelOptions, setModelOptions] = useState<StudentAiModelOption[]>(fallbackStudentAiModelOptions);
  const [selectedModelKey, setSelectedModelKey] = useState(readStudentAiModelKey);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const launcherFrameRef = useRef<CompanionFrame | null>(null);
  const draggedRef = useRef(false);
  const pointerStartRef = useRef<Position | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  const contextLabel = useMemo(() => pageContextLabel(routeGroup), [routeGroup]);
  const suggestions = suggestionSets[suggestionIndex % suggestionSets.length];
  const isFloating = mode === "floating";
  const isChat = mode === "chat";
  const minChatSize = chatMinSize();
  const selectedModel = modelOptions.find((item) => item.key === selectedModelKey) ?? modelOptions[0];

  useEffect(() => {
    function syncFrameToViewport() {
      setChatSize((currentSize) => {
        const nextSize = normalizeChatSize(currentSize);
        if (nextSize.width !== currentSize.width || nextSize.height !== currentSize.height) {
          saveJson(chatSizeStorageKey(), nextSize);
        }
        return nextSize;
      });
      setFrame((currentFrame) => {
        if (mode !== "floating") {
          const positionedPanel = positionPanel(
            launcherFrameRef.current ?? normalizeLauncherFrame(currentFrame),
            mode === "expanded" ? normalizeEntrySize() : normalizeChatSize(chatSize)
          );
          setPanelPlacement(positionedPanel.placement);
          return positionedPanel.frame;
        }
        const normalized = normalizeLauncherFrame(currentFrame);
        if (
          normalized.x !== currentFrame.x ||
          normalized.y !== currentFrame.y ||
          normalized.width !== currentFrame.width ||
          normalized.height !== currentFrame.height
        ) {
          if (mode === "floating") {
            launcherFrameRef.current = normalized;
            saveJson(companionFrameStorageKey(), normalized);
          }
        }
        return normalized;
      });
    }

    window.addEventListener("resize", syncFrameToViewport);
    return () => window.removeEventListener("resize", syncFrameToViewport);
  }, [chatSize, mode]);

  useEffect(() => {
    let alive = true;
    api.listStudentAiChatModels().then((data) => {
      if (!alive) return;
      const items = data.items.length ? data.items : fallbackStudentAiModelOptions;
      setModelOptions(items);
      setSelectedModelKey((current) => items.some((item) => item.key === current) ? current : items[0].key);
    }).catch(() => {
      if (alive) setModelOptions(fallbackStudentAiModelOptions);
    });
    return () => {
      alive = false;
    };
  }, []);

  function setCompanionFrame(nextFrame: CompanionFrame, shouldPersistLauncher = false) {
    const normalized = shouldPersistLauncher ? normalizeLauncherFrame(nextFrame) : normalizeFrame(nextFrame);
    setFrame(normalized);
    if (shouldPersistLauncher) {
      launcherFrameRef.current = normalized;
      saveJson(companionFrameStorageKey(), normalized);
    }
  }

  function startMorph(nextMode: CompanionMode, size: { width: number; height: number }) {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    const launcherFrame = mode === "floating"
      ? normalizeLauncherFrame(frame)
      : launcherFrameRef.current ?? normalizeLauncherFrame(frame);
    if (mode === "floating") {
      launcherFrameRef.current = launcherFrame;
      saveJson(companionFrameStorageKey(), launcherFrame);
    }
    const positionedPanel = nextMode === "floating"
      ? { frame: launcherFrame, placement: "free" as CompanionPlacement }
      : positionPanel(launcherFrame, size);
    setTransitioning(true);
    setMode(nextMode);
    setPanelPlacement(positionedPanel.placement);
    setCompanionFrame(positionedPanel.frame, nextMode === "floating");
    transitionTimerRef.current = window.setTimeout(() => {
      setTransitioning(false);
    }, TRANSITION_MS);
  }

  function openExpanded() {
    startMorph("expanded", normalizeEntrySize());
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

  function updateSelectedModel(key: string) {
    setSelectedModelKey(key);
    saveStudentAiModelKey(key);
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
        time: nowLabel(),
        confidence: event.data.confidence,
        citationsCount: event.data.citations?.length ?? 0,
        modelLabel: event.data.model_label || event.data.model_name
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
      {
        id: assistantMessageId,
        role: "assistant",
        content: "正在思考...",
        time: nowLabel(),
        loading: true,
        modelLabel: selectedModel?.label
      }
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
          modelKey: selectedModelKey,
          pageContext: {
            route_path: routePath,
            route_group: routeGroup,
            page_label: contextLabel,
            model_label: selectedModel?.label
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
    const nextFrame = { ...frame, x: data.x, y: data.y };
    if (isFloating) {
      setCompanionFrame(nextFrame, true);
      return;
    }
    setPanelPlacement("free");
    setCompanionFrame(nextFrame);
  }

  function handleResizeStop(elementRef: HTMLElement, position: Position) {
    const nextSize = normalizeChatSize({
      width: elementRef.offsetWidth,
      height: elementRef.offsetHeight
    });
    setChatSize(nextSize);
    saveJson(chatSizeStorageKey(), nextSize);
    setPanelPlacement("free");
    setCompanionFrame({ ...position, ...nextSize });
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
      data-placement={panelPlacement}
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
                    <CompanionModelSelect
                      options={modelOptions}
                      selectedKey={selectedModelKey}
                      disabled={sending}
                      onChange={updateSelectedModel}
                    />
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
                        {message.role === "assistant" ? (
                          <span className="ai-message-disclosure-row">
                            <AIContentDisclosure
                              compact
                              confidence={message.confidence}
                              modelLabel={message.modelLabel}
                              sourceLabel={message.citationsCount ? "课程知识库与页面上下文" : "页面上下文与对话输入"}
                              citationsCount={message.citationsCount}
                            />
                          </span>
                        ) : null}
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
                    <CompanionModelSelect
                      options={modelOptions}
                      selectedKey={selectedModelKey}
                      disabled={sending}
                      onChange={updateSelectedModel}
                    />
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
