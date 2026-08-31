import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "antd";
import { useLocation } from "react-router-dom";
import {
  Bookmark,
  BookOpen,
  Check,
  FileQuestion,
  FileText,
  History,
  Link2,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Podcast,
  Presentation,
  Search,
  SendHorizontal,
  Trash2,
  Waypoints,
  X
} from "lucide-react";
import {
  ApiRequestError,
  api,
  type GeneratedResource,
  type GeneratedResourceType,
  type LearningContext,
  type StudentAiChatCitation,
  type StudentAiChatMessage,
  type StudentAiChatResponse,
  type StudentAiChatSession,
  type StudentProfile
} from "../api";
import robotImg from "../assets/ui-home/ai-tutor-bot.png";
import GeneratedResourcePreviewModal from "../components/GeneratedResourcePreviewModal";
import {
  StudentImageFallback,
  StudentInlineNotice,
  StudentState,
  studentErrorDetail,
  studentErrorMessage
} from "../components/StudentState";

type HistoryGroup = "今天" | "昨天" | "更早";

type AiChatTurn = {
  id: string;
  role: "student" | "assistant";
  content: string;
  time: string;
  loading?: boolean;
  error?: boolean;
  confidence?: number;
  citations?: StudentAiChatCitation[];
  suggestedActions?: string[];
  profileUsed?: boolean;
  sourceUsed?: boolean;
  safetyNote?: string;
  modelName?: string;
  resource?: GeneratedResource;
  resourceSaving?: boolean;
};

type AiTutorRouteState = {
  initialMessage?: string;
  focusKnowledgePoint?: string;
  fromCourseId?: string;
} | null;

const fallbackSuggestedActions = ["继续解释", "生成练习", "保存为笔记", "只给一级提示"];
const resourceOutputActions: Array<{ label: string; type: GeneratedResourceType; icon: JSX.Element }> = [
  { label: "PPT", type: "PPT", icon: <Presentation size={15} /> },
  { label: "思维导图", type: "MIND_MAP", icon: <Waypoints size={15} /> },
  { label: "文档", type: "DOCUMENT", icon: <FileText size={15} /> },
  { label: "练习题", type: "PRACTICE_SET", icon: <FileQuestion size={15} /> },
  { label: "播客", type: "PODCAST_SCRIPT", icon: <Podcast size={15} /> }
];
const resourceTypeLabels = Object.fromEntries(resourceOutputActions.map((item) => [item.type, item.label])) as Record<string, string>;
const openingPrompts = [
  "栈和队列的区别与场景",
  "链表反转的代码思路",
  "二叉树遍历方式对比",
  "动态规划的核心思想"
];
const previewLimit = 76;

function nowLabel() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function timeLabel(value?: string | null) {
  if (!value) return nowLabel();
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function groupByDay(value?: string | null): HistoryGroup {
  if (!value) return "更早";
  const date = new Date(value);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000);
  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "昨天";
  return "更早";
}

function splitAnswer(content: string) {
  return content
    .split(/\n{2,}|\n(?=\d+[.、])|(?=[-*]\s)/)
    .map((item) => item.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
}

function modelRequestErrorMessage(code?: string, message?: string, details?: Record<string, unknown>) {
  const detailText = typeof details?.llm_error_detail === "string" ? details.llm_error_detail : "";
  if (code === "AI_MODEL_NOT_CONFIGURED") {
    return "AI 模型配置还不完整。请检查后端 .env 中的 CODETRACK_MODEL_API_KEY、CODETRACK_MODEL_NAME，以及可选的 CODETRACK_MODEL_API_BASE_URL。";
  }
  if (code === "AI_MODEL_REQUEST_FAILED") {
    if (detailText.includes("Arrearage")) {
      return "AI 模型账号额度或计费状态异常，DashScope 返回 Arrearage。请检查阿里云百炼/模型服务是否欠费、额度耗尽或账号状态不可用。";
    }
    return message || "AI 模型请求失败，可能是密钥、模型名、接口地址、账号额度或网络连接异常。请检查后端日志后再试。";
  }
  return message || "AI 助学导师暂时不可用，请稍后再试。";
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    return modelRequestErrorMessage(error.code, error.message, error.details);
  }
  const message = error instanceof Error ? error.message : "AI 助学导师暂时不可用，请稍后再试。";
  if (message.includes("AI_MODEL_NOT_CONFIGURED")) {
    return modelRequestErrorMessage("AI_MODEL_NOT_CONFIGURED");
  }
  if (message.includes("AI_MODEL_REQUEST_FAILED")) {
    return modelRequestErrorMessage("AI_MODEL_REQUEST_FAILED");
  }
  return message;
}

function responseToTurn(id: string, result: StudentAiChatResponse): AiChatTurn {
  return {
    id,
    role: "assistant",
    content: result.answer,
    time: nowLabel(),
    confidence: result.confidence,
    citations: result.citations,
    suggestedActions: result.suggested_actions,
    profileUsed: result.profile_used,
    sourceUsed: result.source_used,
    safetyNote: result.safety_note,
    modelName: result.model_name
  };
}

function compactPreview(content: string) {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text) return "正在生成回答...";
  return text.length > previewLimit ? `${text.slice(0, previewLimit)}...` : text;
}

function scrollTurnIntoView(turnId: string) {
  const target = document.querySelector<HTMLElement>(`[data-ai-turn-id="${turnId}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function confidenceBadge(turn: AiChatTurn) {
  if (!turn.sourceUsed) return "通用回答";
  return `置信度 ${Math.round((turn.confidence ?? 0.7) * 100)}%`;
}

function compactCitationText(source: StudentAiChatCitation) {
  const rawText = (source.quote || source.summary || "").replace(/\s+/g, " ").trim();
  const briefText = rawText.length > 88 ? `${rawText.slice(0, 88)}...` : rawText;
  return briefText ? `${source.title}：${briefText}` : source.title;
}

function messageToTurn(message: StudentAiChatMessage): AiChatTurn {
  const metadata = message.metadata ?? {};
  return {
    id: message.id,
    role: message.role === "student" ? "student" : "assistant",
    content: message.content,
    time: timeLabel(message.created_at),
    error: message.status === "FAILED",
    confidence: typeof metadata.confidence === "number" ? metadata.confidence : undefined,
    citations: Array.isArray(metadata.citations) ? metadata.citations : [],
    suggestedActions: Array.isArray(metadata.suggested_actions) ? metadata.suggested_actions : undefined,
    profileUsed: typeof metadata.profile_used === "boolean" ? metadata.profile_used : undefined,
    sourceUsed: typeof metadata.source_used === "boolean" ? metadata.source_used : undefined,
    safetyNote: typeof metadata.safety_note === "string" ? metadata.safety_note : undefined,
    modelName: typeof metadata.model_name === "string" ? metadata.model_name : undefined,
    resource: metadata.resource
  };
}

function resourceToTurn(id: string, resource: GeneratedResource): AiChatTurn {
  const modelName = generatedResourceModelName(resource);
  const presentonError = resource.render_payload.metadata?.presenton_error;
  const pptMasterError = resource.render_payload.metadata?.ppt_master_error;
  const pptMasterOfficialConverterError = resource.render_payload.metadata?.ppt_master_official_converter_error;
  const rendererConfigError = resource.render_payload.metadata?.renderer_config_error;
  const modelContentFallbackError = resource.render_payload.metadata?.model_content_fallback_error;
  const previewError = resource.render_payload.metadata?.preview_error;
  const notes = [
    modelContentFallbackError
      ? `模型内容生成未成功，已使用规则模板兜底。原因：${modelContentFallbackError}`
      : null,
    presentonError
      ? `Presenton 暂未生成成功，已自动回退到本地 PPTX 渲染器。原因：${presentonError}`
      : pptMasterError
        ? `PPT Master 暂未生成成功，已自动回退到本地 PPTX 渲染器。原因：${pptMasterError}`
        : pptMasterOfficialConverterError
          ? `PPT Master 官方转换器暂不可用，桥接器已使用内置 PPTX 渲染完成。原因：${pptMasterOfficialConverterError}`
          : rendererConfigError
            ? `PPT 渲染器配置暂不可用，已自动回退到本地 PPTX 渲染器。原因：${rendererConfigError}`
            : null,
    previewError && !resource.preview_available
      ? `PPTX 文件可下载，但 PDF 预览暂不可用。原因：${previewError}`
      : null
  ].filter(Boolean);
  return {
    id,
    role: "assistant",
    content: `已生成资源：${resource.title}`,
    time: nowLabel(),
    confidence: resource.confidence,
    citations: resource.citations,
    suggestedActions: resource.resource_type === "PODCAST_SCRIPT"
      ? ["去资源中心播放", "生成配套练习"]
      : resource.resource_type === "PRACTICE_SET"
        ? ["去资源中心做题", "打开预览"]
        : ["加入资源中心", "打开预览"],
    profileUsed: true,
    sourceUsed: Boolean(resource.citations.length),
    safetyNote: notes.length
      ? notes.join(" ")
      : "AI 生成资源已基于课程资料进行引用校验，建议结合课堂讲义复核关键概念。",
    modelName,
    resource
  };
}

function generatedResourceModelName(resource: GeneratedResource) {
  const renderer = resource.render_payload.metadata?.renderer;
  const implementation = resource.render_payload.metadata?.ppt_master_implementation;
  if (renderer === "presenton") return "LangGraph + Presenton";
  if (renderer === "ppt_master" && implementation === "codetrack_ppt_master_bridge_fallback") return "LangGraph + PPT Master Bridge";
  if (renderer === "ppt_master") return "LangGraph + PPT Master";
  if (renderer === "local_pptx") return "LangGraph + python-pptx";
  if (resource.resource_type === "PPT") return "LangGraph + PPT renderer";
  const label = resource.resource_type_label ?? resourceTypeLabels[resource.resource_type] ?? resource.resource_type;
  return `LangGraph + ${label}渲染器`;
}

function resourceMetric(resource: GeneratedResource) {
  const label = resource.resource_type_label ?? resourceTypeLabels[resource.resource_type] ?? resource.resource_type;
  if (resource.resource_type === "PPT") return `${resource.slide_count || resource.item_count} 页演示文稿`;
  if (resource.resource_type === "DOCUMENT") return `${resource.item_count} 节文档`;
  if (resource.resource_type === "MIND_MAP") return `${resource.item_count} 个节点`;
  if (resource.resource_type === "PRACTICE_SET") return `${resource.item_count} 道练习`;
  if (resource.resource_type === "PODCAST_SCRIPT") return `${resource.item_count} 段播客`;
  if (resource.resource_type === "KNOWLEDGE_CARD") return `${resource.item_count} 张卡片`;
  return `${resource.item_count || 1} 个${label}`;
}

function resourcePreviewTitle(resource: GeneratedResource) {
  const payload = resource.render_payload;
  return (
    payload.presenton_slides?.[0]?.title ||
    payload.slides?.[0]?.title ||
    payload.sections?.[0]?.heading ||
    payload.nodes?.[0]?.label ||
    payload.questions?.[0]?.stem ||
    payload.cards?.[0]?.front ||
    payload.segments?.[0]?.label ||
    resource.title
  );
}

function resourcePreviewSubtitle(resource: GeneratedResource) {
  if (resource.render_payload.metadata?.renderer === "presenton") {
    const count = resource.render_payload.presenton_slides?.length || resource.item_count || resource.slide_count;
    return `Presenton · ${count} 页`;
  }
  return resource.resource_type_label ?? resourceTypeLabels[resource.resource_type] ?? resource.resource_type;
}

function AiRunSummary({
  turn,
  courseName,
  activePoint,
  frequentError
}: {
  turn: AiChatTurn;
  courseName: string;
  activePoint: string;
  frequentError: string;
}) {
  const citationCount = turn.citations?.length ?? 0;
  const actionCount = turn.suggestedActions?.length || fallbackSuggestedActions.length;
  const sourceState = turn.loading ? "running" : turn.sourceUsed ? "done" : "muted";
  const profileState = turn.loading ? "running" : turn.profileUsed ? "done" : "muted";

  return (
    <div className="ai-run-summary" aria-label="AI 回答处理过程">
      <article className={turn.loading ? "running" : turn.error ? "error" : "done"}>
        <span><Check size={15} /></span>
        <div>
          <strong>{turn.loading ? "正在组织回答" : turn.error ? "需要处理" : "回答已生成"}</strong>
          <small>{turn.loading ? "流式输出中" : turn.error ? "连接或配置异常" : `完成于 ${turn.time}`}</small>
        </div>
      </article>
      <article className={sourceState}>
        <span><BookOpen size={15} /></span>
        <div>
          <strong>{turn.loading ? "检索课程知识库" : citationCount ? `引用 ${citationCount} 个来源` : "未命中课程引用"}</strong>
          <small>{turn.loading ? courseName : citationCount ? courseName : "先用通用讲解兜底"}</small>
        </div>
      </article>
      <article className={profileState}>
        <span><FileText size={15} /></span>
        <div>
          <strong>{turn.loading ? "读取学习画像" : turn.profileUsed ? "已结合学习画像" : "画像未参与"}</strong>
          <small>{turn.loading || turn.profileUsed ? `${activePoint} / ${frequentError}` : "可继续补充学习记录"}</small>
        </div>
      </article>
      {!turn.loading && !turn.error ? (
        <article className="action">
          <span><PenLine size={15} /></span>
          <div>
            <strong>{actionCount} 个下一步动作</strong>
            <small>可追问、练习或保存资料</small>
          </div>
        </article>
      ) : null}
    </div>
  );
}

function AiThreadOutline({ turns }: { turns: AiChatTurn[] }) {
  if (!turns.length) return null;

  return (
    <aside className="ai-thread-outline" aria-label="对话时间轴">
      {turns.map((turn, index) => (
        <button
          type="button"
          className={`ai-thread-dot ${turn.role}${turn.loading ? " loading" : ""}${turn.error ? " error" : ""}`}
          key={turn.id}
          aria-label={`定位到第 ${index + 1} 条${turn.role === "student" ? "提问" : "回答"}`}
          onClick={() => scrollTurnIntoView(turn.id)}
        >
          <i aria-hidden="true" />
          <span className="ai-thread-preview" role="tooltip">
            <strong>{turn.role === "student" ? "你的提问" : turn.loading ? "AI 正在回答" : "AI 助学导师"}</strong>
            <small>{compactPreview(turn.content)}</small>
          </span>
        </button>
      ))}
    </aside>
  );
}

function GeneratedResourceCard({
  resource,
  saving,
  onPreview,
  onSave
}: {
  resource: GeneratedResource;
  saving?: boolean;
  onPreview: () => void;
  onSave: () => void;
}) {
  const metric = resourceMetric(resource);
  const presentonSlide = resource.render_payload.presenton_slides?.[0];
  const isDocument = resource.resource_type === "DOCUMENT";
  const documentHeadings = (resource.render_payload.sections ?? []).slice(0, 3).map((section) => section.heading);
  return (
    <div className="ai-resource-card-shell">
      <button type="button" className="ai-resource-card-main" onClick={onPreview}>
        <span className={`ai-resource-thumb-preview${presentonSlide ? " presenton" : ""}${isDocument ? " document" : ""}`}>
          <i />
          {isDocument ? (
            <span className="ai-resource-doc-thumb" aria-hidden="true">
              <b>{resource.title}</b>
              {documentHeadings.map((heading) => (
                <em key={heading}>{heading}</em>
              ))}
              <span />
              <span />
            </span>
          ) : (
            <>
              {presentonSlide?.image_url ? <img src={presentonSlide.image_url} alt="" /> : null}
              <strong>{resourcePreviewTitle(resource)}</strong>
              <small>{resourcePreviewSubtitle(resource)} · {resource.file_format}</small>
            </>
          )}
        </span>
        <span className="ai-resource-card-copy">
          <b>{resource.title}</b>
          <small>{resourcePreviewSubtitle(resource)} · {metric} · {Math.round(resource.confidence * 100)}% 置信度</small>
          <em>{presentonSlide?.summary || resource.summary}</em>
        </span>
      </button>
      <button
        type="button"
        className={`ai-resource-bookmark${resource.saved_to_resource_center ? " saved" : ""}`}
        aria-label={resource.saved_to_resource_center ? "已加入资源中心" : "加入资源中心"}
        title={resource.saved_to_resource_center ? "已加入资源中心" : "加入资源中心"}
        onClick={onSave}
        disabled={saving || resource.saved_to_resource_center}
      >
        <Bookmark size={19} fill={resource.saved_to_resource_center ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

export default function AiTutor() {
  const location = useLocation();
  const [context, setContext] = useState<LearningContext | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessions, setSessions] = useState<StudentAiChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<AiChatTurn[]>([]);
  const [activeResourceType, setActiveResourceType] = useState<GeneratedResourceType | null>(null);
  const [previewResource, setPreviewResource] = useState<GeneratedResource | null>(null);
  const hydratedRef = useRef(false);
  const routeDraftHydratedRef = useRef(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const weakestPoint = useMemo(() => {
    return profile?.knowledge_states.find((item) => item.state === "WEAK") ?? profile?.knowledge_states[0];
  }, [profile]);

  const activePoint = weakestPoint?.knowledge_point ?? "边界测试";
  const courseId = profile?.course.id ?? context?.courses[0]?.course_id;
  const courseName = profile?.course.name ?? context?.courses[0]?.course_name ?? "机器学习";
  const frequentError = profile?.frequent_errors[0]?.label ?? "只验证普通用例";
  const contextUnavailable = Boolean(error && !loadingContext && !context && !profile && !turns.length);

  const filteredSessions = useMemo(() => {
    const keyword = historyQuery.trim().toLowerCase();
    return sessions.filter((session) => (
      !keyword || session.title.toLowerCase().includes(keyword) || session.summary.toLowerCase().includes(keyword)
    ));
  }, [historyQuery, sessions]);

  useEffect(() => {
    let alive = true;
    setLoadingContext(true);
    setError(null);
    setErrorDetail(null);
    api.getLearningContext().then((data) => {
      if (!alive) return;
      setContext(data);
      const nextCourseId = data.courses[0]?.course_id;
      if (!nextCourseId) {
        setLoadingContext(false);
        return;
      }
      api.getStudentProfile(nextCourseId).then((profileData) => {
        if (alive) setProfile(profileData);
      }).catch((err) => {
        if (!alive) return;
        setError("学习画像暂时不可用，AI 助学导师会先使用课程知识库回答。");
        setErrorDetail(studentErrorDetail(err));
      }).finally(() => {
        if (alive) setLoadingContext(false);
      });
    }).catch((err) => {
      if (!alive) return;
      setError(studentErrorMessage(err, "AI 助学上下文加载失败，请稍后刷新。"));
      setErrorDetail(studentErrorDetail(err));
      setLoadingContext(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [turns]);

  useEffect(() => {
    if (routeDraftHydratedRef.current) return;
    const routeState = location.state as AiTutorRouteState;
    const initialMessage = routeState?.initialMessage?.trim();
    if (!initialMessage) return;
    routeDraftHydratedRef.current = true;
    setDraft(initialMessage);
  }, [location.state]);

  useEffect(() => {
    if (!courseId || hydratedRef.current) return;
    hydratedRef.current = true;
    refreshSessions(courseId).then((items) => {
      if (items[0]) {
        loadSession(items[0].id);
      }
    }).catch((err) => {
      setError("历史会话加载失败，当前可以先发起新的 AI 助学对话。");
      setErrorDetail(studentErrorDetail(err));
    });
  }, [courseId]);

  async function refreshSessions(targetCourseId = courseId) {
    const items = await api.listStudentAiChatSessions(targetCourseId);
    setSessions(items);
    return items;
  }

  async function loadSession(sessionId: string) {
    setLoadingSession(true);
    try {
      const detail = await api.getStudentAiChatSession(sessionId);
      setCurrentSessionId(detail.session.id);
      setTurns(detail.messages.length ? detail.messages.map(messageToTurn) : []);
      setHistoryOpen(false);
      await refreshSessions(detail.session.course_id ?? courseId);
    } catch (err) {
      setError(errorMessage(err));
      setErrorDetail(studentErrorDetail(err));
    } finally {
      setLoadingSession(false);
    }
  }

  async function startNewSession() {
    if (creatingSession) return;
    setCreatingSession(true);
    setError(null);
    setErrorDetail(null);
    setCurrentSessionId(null);
    setTurns([]);
    setDraft("");
    try {
      const session = await api.createStudentAiChatSession(courseId, "新的 AI 助学会话");
      setCurrentSessionId(session.id);
      setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
      setHistoryOpen(false);
    } catch (err) {
      setHistoryOpen(false);
      setError(errorMessage(err));
      setErrorDetail(studentErrorDetail(err));
    } finally {
      setCreatingSession(false);
    }
  }

  async function deleteSession(sessionId: string) {
    if (deletingSessionId) return;
    setDeletingSessionId(sessionId);
    try {
      await api.deleteStudentAiChatSession(sessionId);
      setSessions((current) => current.filter((item) => item.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setTurns([]);
      }
    } catch (err) {
      setError(errorMessage(err));
      setErrorDetail(studentErrorDetail(err));
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function sendMessage(messageOverride?: string) {
    if (activeResourceType) {
      await generateResource(activeResourceType, messageOverride);
      return;
    }
    const message = (messageOverride ?? draft).trim();
    if (!message || sending) return;
    const userTurn: AiChatTurn = {
      id: `student_${Date.now()}`,
      role: "student",
      content: message,
      time: nowLabel()
    };
    const pendingId = `assistant_${Date.now()}`;
    const pendingTurn: AiChatTurn = {
      id: pendingId,
      role: "assistant",
      content: "",
      time: nowLabel(),
      loading: true
    };
    const localHistory = turns
      .filter((turn) => !turn.loading && !turn.error)
      .slice(-6)
      .map((turn) => ({ role: turn.role, content: turn.content }));

    setDraft("");
    setSending(true);
    setError(null);
    setErrorDetail(null);
    setTurns((current) => [...current, userTurn, pendingTurn]);
    try {
      await api.streamStudentAiChat(
        {
          message,
          courseId,
          sessionId: currentSessionId,
          history: localHistory
        },
        (streamEvent) => {
          if (streamEvent.event === "session") {
            setCurrentSessionId(streamEvent.data.session.id);
            setSessions((current) => {
              const withoutCurrent = current.filter((item) => item.id !== streamEvent.data.session.id);
              return [streamEvent.data.session, ...withoutCurrent];
            });
          }
          if (streamEvent.event === "delta") {
            setTurns((current) => current.map((turn) => (
              turn.id === pendingId
                ? { ...turn, content: `${turn.content}${streamEvent.data.content}`, loading: true }
                : turn
            )));
          }
          if (streamEvent.event === "final") {
            setTurns((current) => current.map((turn) => (
              turn.id === pendingId ? responseToTurn(pendingId, streamEvent.data) : turn
            )));
            if (streamEvent.data.session) {
              setSessions((current) => {
                const withoutCurrent = current.filter((item) => item.id !== streamEvent.data.session?.id);
                return [streamEvent.data.session as StudentAiChatSession, ...withoutCurrent];
              });
            }
          }
          if (streamEvent.event === "error") {
            setTurns((current) => current.map((turn) => (
              turn.id === pendingId
                ? {
                    ...turn,
                    content: modelRequestErrorMessage(streamEvent.data.code, streamEvent.data.message, streamEvent.data.details),
                    loading: false,
                    error: true,
                    suggestedActions: ["检查配置", "稍后重试"]
                  }
                : turn
            )));
          }
        }
      );
      await refreshSessions();
    } catch (err) {
      setErrorDetail(studentErrorDetail(err));
      setTurns((current) => current.map((turn) => (
        turn.id === pendingId
          ? {
              id: pendingId,
              role: "assistant",
              content: errorMessage(err),
              time: nowLabel(),
              error: true,
              suggestedActions: ["检查配置", "稍后重试"]
            }
          : turn
      )));
    } finally {
      setSending(false);
    }
  }

  async function generateResource(resourceType: GeneratedResourceType, messageOverride?: string) {
    const message = (messageOverride ?? draft).trim();
    if (!message || sending) return;
    const label = resourceTypeLabels[resourceType] ?? "资源";
    const userTurn: AiChatTurn = {
      id: `student_${Date.now()}`,
      role: "student",
      content: message,
      time: nowLabel()
    };
    const pendingId = `assistant_${Date.now()}`;
    const pendingTurn: AiChatTurn = {
      id: pendingId,
      role: "assistant",
      content: `正在生成${label}资源...`,
      time: nowLabel(),
      loading: true
    };

    setDraft("");
    setSending(true);
    setError(null);
    setErrorDetail(null);
    setTurns((current) => [...current, userTurn, pendingTurn]);
    try {
      const result = await api.generateResource(resourceType, message, courseId, currentSessionId);
      setCurrentSessionId(result.session.id);
      setSessions((current) => {
        const withoutCurrent = current.filter((item) => item.id !== result.session.id);
        return [result.session, ...withoutCurrent];
      });
      setTurns((current) => current.map((turn) => (
        turn.id === pendingId ? resourceToTurn(pendingId, result.resource) : turn
      )));
      await refreshSessions(result.session.course_id ?? courseId);
    } catch (err) {
      setErrorDetail(studentErrorDetail(err));
      setTurns((current) => current.map((turn) => (
        turn.id === pendingId
          ? {
              id: pendingId,
              role: "assistant",
              content: errorMessage(err),
              time: nowLabel(),
              error: true,
              suggestedActions: ["检查配置", "稍后重试"]
            }
          : turn
      )));
    } finally {
      setSending(false);
      setActiveResourceType(null);
    }
  }

  async function saveResource(resource: GeneratedResource) {
    if (resource.saved_to_resource_center) return;
    setTurns((current) => current.map((turn) => (
      turn.resource?.id === resource.id ? { ...turn, resourceSaving: true } : turn
    )));
    try {
      const saved = await api.saveGeneratedResource(resource.id);
      setTurns((current) => current.map((turn) => (
        turn.resource?.id === resource.id ? { ...turn, resource: saved, resourceSaving: false } : turn
      )));
      if (previewResource?.id === resource.id) setPreviewResource(saved);
    } catch (err) {
      setError(errorMessage(err));
      setErrorDetail(studentErrorDetail(err));
      setTurns((current) => current.map((turn) => (
        turn.resource?.id === resource.id ? { ...turn, resourceSaving: false } : turn
      )));
    }
  }

  return (
    <div className={`ai-workspace-page${turns.length ? " ai-has-chat" : " ai-empty-chat"}`}>
      <header className="ai-workspace-header">
        <div className="ai-workspace-title">
          <StudentImageFallback src={robotImg} alt="AI 助学导师" decorative />
          <div>
            <span>AI 助学 / 自主学习导师</span>
            <h1>和 AI 助学导师持续追问、生成资料、沉淀学习证据</h1>
            <p>专注数据结构与程序设计 · 构建扎实的知识与能力</p>
          </div>
        </div>
        <button type="button" className="ai-history-entry" onClick={() => setHistoryOpen(true)}>
          <History size={17} />
          历史会话
        </button>
      </header>

      {error && !contextUnavailable ? (
        <StudentInlineNotice
          className="ai-workspace-alert"
          kind="degraded"
          title="部分 AI 上下文暂不可用"
          description={error}
          detail={errorDetail}
          actions={[{ label: "刷新重试", variant: "primary", onClick: () => window.location.reload() }]}
        />
      ) : null}

      <main className="ai-learning-workspace" aria-label="AI Learning Workspace">
        <AiThreadOutline turns={turns} />
        <div className="ai-thread" ref={threadRef}>
          {loadingSession ? <div className="ai-chat-loading">正在恢复历史会话...</div> : null}
          {!loadingSession && contextUnavailable ? (
            <StudentState
              kind="unavailable"
              title="AI 助学上下文暂不可用"
              description="当前没有读到课程、画像或历史会话数据。你可以刷新重试；如果正在本地开发，请先确认后端服务已经启动。"
              detail={errorDetail ?? error}
              actions={[{ label: "刷新重试", variant: "primary", onClick: () => window.location.reload() }]}
              className="ai-context-state"
            />
          ) : null}
          {!loadingSession && !contextUnavailable && !turns.length ? (
            <section className="ai-empty-state" aria-label="AI 助学初始页">
              <div className="ai-empty-visual">
                <span />
                <StudentImageFallback src={robotImg} alt="AI 助学导师" decorative />
              </div>
              <h2>你的 AI 学习伙伴，随时为你助力</h2>
              <p>提出问题，获取思路，生成资料，深入探索知识</p>
              <div className="ai-empty-prompts">
                {openingPrompts.map((prompt) => (
                  <button type="button" key={prompt} onClick={() => sendMessage(prompt)} disabled={sending || loadingContext}>
                    {prompt.includes("代码") ? <FileText size={17} /> : prompt.includes("总结") ? <PenLine size={17} /> : <Search size={17} />}
                    {prompt}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {turns.map((turn) => (
            turn.role === "student" ? (
              <article className="ai-turn ai-turn-user" key={turn.id} data-ai-turn-id={turn.id}>
                <div className="ai-user-bubble">
                  {turn.content}
                  <time>{turn.time}</time>
                </div>
              </article>
            ) : (
              <article className="ai-turn ai-turn-assistant" key={turn.id} data-ai-turn-id={turn.id}>
                <div className="ai-assistant-avatar" aria-hidden="true">
                  <StudentImageFallback src={robotImg} alt="AI 助学导师" decorative />
                </div>
                <div className={`ai-answer-flow${turn.error ? " ai-answer-flow-error" : ""}`}>
                  <header>
                    <strong>AI 助学导师</strong>
                    <span><Check size={14} /> {turn.loading ? (turn.content ? "回答中" : "思考中") : turn.error ? "需要处理" : "思考完成"}</span>
                  </header>
                  <AiRunSummary turn={turn} courseName={courseName} activePoint={activePoint} frequentError={frequentError} />

                  {turn.loading && !turn.content ? (
                    <div className="ai-answer-loading">
                      <i />
                      <i />
                      <i />
                    </div>
                  ) : (
                    <>
                      <section>
                        <h2>{turn.error ? "连接提示" : "回答"}</h2>
                        {splitAnswer(turn.content).map((paragraph, index) => (
                          <p key={`${turn.id}_p_${index}`}>{paragraph}</p>
                        ))}
                        {turn.loading ? <span className="ai-stream-caret" /> : null}
                      </section>

                      {turn.resource && !turn.loading ? (
                        <section>
                          <h2>生成资源</h2>
                          <GeneratedResourceCard
                            resource={turn.resource}
                            saving={turn.resourceSaving}
                            onPreview={() => setPreviewResource(turn.resource ?? null)}
                            onSave={() => saveResource(turn.resource as GeneratedResource)}
                          />
                        </section>
                      ) : null}

                      {!turn.error && !turn.loading ? (
                        <section>
                          <h2>回答依据</h2>
                          <div className="ai-answer-meta">
                            <span>{confidenceBadge(turn)}</span>
                            <span>{turn.profileUsed ? "已结合学习画像" : "未使用学习画像"}</span>
                            <span>{turn.sourceUsed ? "已引用资料" : "未引用资料"}</span>
                            {turn.modelName ? <span>模型 {turn.modelName}</span> : null}
                          </div>
                        </section>
                      ) : null}

                      {turn.safetyNote && !turn.loading ? (
                        <section>
                          <h2>使用提醒</h2>
                          <p>{turn.safetyNote}</p>
                        </section>
                      ) : null}

                      {turn.citations?.length && !turn.loading ? (
                        <section>
                          <h2>引用来源</h2>
                          {turn.citations.map((source) => (
                            <div className="ai-citation-line" key={source.source_id}>
                              <Link2 size={15} />
                              <span title={source.quote || source.summary || source.title}>{compactCitationText(source)}</span>
                            </div>
                          ))}
                        </section>
                      ) : null}

                      {!turn.loading ? (
                        <footer className="ai-answer-actions">
                          {(turn.suggestedActions?.length ? turn.suggestedActions : fallbackSuggestedActions).map((action) => (
                            <button type="button" key={action} onClick={() => setDraft(action)}>
                              {action.includes("保存") ? <PenLine size={15} /> : action.includes("练习") ? <FileText size={15} /> : <MessageSquarePlus size={15} />}
                              {action}
                            </button>
                          ))}
                        </footer>
                      ) : null}
                    </>
                  )}
                </div>
              </article>
            )
          ))}
        </div>

        <footer className="ai-sticky-composer" aria-label="AI 输入区">
          <div className="ai-prompt-row">
            {resourceOutputActions.map((action) => (
              <button
                type="button"
                className={`ai-resource-action${activeResourceType === action.type ? " active" : ""}`}
                key={action.label}
                disabled={sending}
                title={`生成${action.label}`}
                onClick={() => {
                  setActiveResourceType((current) => current === action.type ? null : action.type);
                }}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
          <div className="ai-composer-surface">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={activeResourceType ? `输入${resourceTypeLabels[activeResourceType] ?? "资源"}生成要求，例如：帮我生成关于队列的讲解${resourceTypeLabels[activeResourceType] ?? "资源"}` : `有问题，尽管问 AI 助学导师。当前课程：${courseName}；薄弱点：${activePoint}；常见错因：${frequentError}`}
              rows={2}
              disabled={sending || loadingSession}
            />
            <div className="ai-composer-actions">
              <button type="button" aria-label="添加附件" disabled={sending}><Paperclip size={18} /></button>
              <button type="button" aria-label="更多能力" disabled={sending}><MoreHorizontal size={18} /></button>
              <button type="button" className="ai-send" disabled={!draft.trim() || sending || loadingContext || loadingSession} aria-label="发送" onClick={() => sendMessage()}>
                <SendHorizontal size={19} />
              </button>
            </div>
          </div>
        </footer>
      </main>

      <Drawer
        title={null}
        placement="right"
        width={360}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        className="ai-session-drawer"
        closable={false}
        destroyOnClose={false}
      >
        <div className="ai-session-panel">
          <header>
            <h2>历史会话</h2>
            <button type="button" aria-label="关闭历史会话" onClick={() => setHistoryOpen(false)}>
              <X size={20} />
            </button>
          </header>
          <label className="ai-session-search">
            <Search size={16} />
            <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索历史会话" />
          </label>
          <button type="button" className="ai-new-session" onClick={startNewSession} disabled={creatingSession}>
            <MessageSquarePlus size={16} />
            新建会话
          </button>

          {(["今天", "昨天", "更早"] as const).map((group) => {
            const items = filteredSessions.filter((item) => groupByDay(item.last_message_at ?? item.updated_at) === group);
            if (!items.length) return null;
            return (
              <section className="ai-session-group" key={group}>
                <h3>{group}</h3>
                {items.map((item) => (
                  <div className={`ai-session-row${item.id === currentSessionId ? " active" : ""}`} key={item.id}>
                    <button
                      type="button"
                      className="ai-session-select"
                      onClick={() => loadSession(item.id)}
                    >
                      <span className="ai-session-top">
                        <i className="ai-session-item-icon" aria-hidden="true">
                          <History size={13} />
                        </i>
                        <strong>{item.title}</strong>
                        <time>{timeLabel(item.last_message_at ?? item.updated_at)}</time>
                      </span>
                      <small>{item.summary || "暂无摘要"}</small>
                    </button>
                    <button
                      type="button"
                      className="ai-session-delete"
                      aria-label="删除历史会话"
                      disabled={deletingSessionId === item.id}
                      onClick={() => deleteSession(item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </section>
            );
          })}
          {!filteredSessions.length ? <p className="ai-session-empty">还没有历史会话，发送第一条问题后会自动保存。</p> : null}
        </div>
      </Drawer>
      <GeneratedResourcePreviewModal resource={previewResource} onClose={() => setPreviewResource(null)} />
    </div>
  );
}
