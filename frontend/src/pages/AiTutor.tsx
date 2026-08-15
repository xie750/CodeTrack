import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Drawer } from "antd";
import {
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
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Waypoints,
  X
} from "lucide-react";
import {
  api,
  LearningContext,
  StudentAiChatCitation,
  StudentAiChatMessage,
  StudentAiChatResponse,
  StudentAiChatSession,
  StudentProfile
} from "../api";
import robotImg from "../assets/ui-home/ai-tutor-bot.png";

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
};

const fallbackSuggestedActions = ["继续解释", "生成练习", "保存为笔记", "只给一级提示"];
const resourceOutputActions = [
  { label: "PPT", icon: <Presentation size={15} /> },
  { label: "思维导图", icon: <Waypoints size={15} /> },
  { label: "文档", icon: <FileText size={15} /> },
  { label: "练习题", icon: <FileQuestion size={15} /> },
  { label: "播客", icon: <Podcast size={15} /> }
];
const openingPrompts = [
  "栈和队列的区别与场景",
  "链表反转的代码思路",
  "二叉树遍历方式对比",
  "动态规划的核心思想"
];

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

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "AI 助学导师暂时不可用，请稍后再试。";
  if (message.includes("AI_MODEL_NOT_CONFIGURED")) {
    return "AI 模型配置还不完整。请检查后端 .env 中的 CODETRACK_MODEL_API_KEY、CODETRACK_MODEL_NAME，以及可选的 CODETRACK_MODEL_API_BASE_URL。";
  }
  if (message.includes("AI_MODEL_REQUEST_FAILED")) {
    return "AI 模型请求失败，可能是密钥、模型名、接口地址或网络连接异常。请检查后端日志后再试。";
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
    modelName: typeof metadata.model_name === "string" ? metadata.model_name : undefined
  };
}

export default function AiTutor() {
  const [context, setContext] = useState<LearningContext | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessions, setSessions] = useState<StudentAiChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<AiChatTurn[]>([]);
  const hydratedRef = useRef(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const weakestPoint = useMemo(() => {
    return profile?.knowledge_states.find((item) => item.state === "WEAK") ?? profile?.knowledge_states[0];
  }, [profile]);

  const activePoint = weakestPoint?.knowledge_point ?? "边界测试";
  const courseId = profile?.course.id ?? context?.courses[0]?.course_id;
  const courseName = profile?.course.name ?? context?.courses[0]?.course_name ?? "机器学习";
  const frequentError = profile?.frequent_errors[0]?.label ?? "只验证普通用例";

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
      }).catch(() => {
        if (alive) setError("学习画像暂时不可用，AI 助学导师会先使用课程知识库回答。");
      }).finally(() => {
        if (alive) setLoadingContext(false);
      });
    }).catch(() => {
      if (!alive) return;
      setError("AI 助学上下文加载失败，请稍后刷新。");
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
    if (!courseId || hydratedRef.current) return;
    hydratedRef.current = true;
    refreshSessions(courseId).then((items) => {
      if (items[0]) {
        loadSession(items[0].id);
      }
    }).catch(() => {
      setError("历史会话加载失败，当前可以先发起新的 AI 助学对话。");
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
    } finally {
      setLoadingSession(false);
    }
  }

  async function startNewSession() {
    if (creatingSession) return;
    setCreatingSession(true);
    setError(null);
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
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function sendMessage(messageOverride?: string) {
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
                    content: errorMessage(new Error(`${streamEvent.data.code}: ${streamEvent.data.message}`)),
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

  return (
    <div className={`ai-workspace-page${turns.length ? " ai-has-chat" : " ai-empty-chat"}`}>
      <header className="ai-workspace-header">
        <div className="ai-workspace-title">
          <img src={robotImg} alt="" />
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

      {error ? <Alert className="ai-workspace-alert" type="warning" message={error} showIcon /> : null}

      <main className="ai-learning-workspace" aria-label="AI Learning Workspace">
        <div className="ai-thread" ref={threadRef}>
          {loadingSession ? <div className="ai-chat-loading">正在恢复历史会话...</div> : null}
          {!loadingSession && !turns.length ? (
            <section className="ai-empty-state" aria-label="AI 助学初始页">
              <div className="ai-empty-visual">
                <span />
                <img src={robotImg} alt="" />
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
              <article className="ai-turn ai-turn-user" key={turn.id}>
                <div className="ai-user-bubble">
                  {turn.content}
                  <time>{turn.time}</time>
                </div>
              </article>
            ) : (
              <article className="ai-turn ai-turn-assistant" key={turn.id}>
                <div className="ai-assistant-avatar" aria-hidden="true">
                  <img src={robotImg} alt="" />
                </div>
                <div className={`ai-answer-flow${turn.error ? " ai-answer-flow-error" : ""}`}>
                  <header>
                    <strong>AI 助学导师</strong>
                    <span><Check size={14} /> {turn.loading ? (turn.content ? "回答中" : "思考中") : turn.error ? "需要处理" : "思考完成"}</span>
                  </header>

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

                      {!turn.error && !turn.loading ? (
                        <section>
                          <h2>回答依据</h2>
                          <div className="ai-answer-meta">
                            <span>置信度 {Math.round((turn.confidence ?? 0.7) * 100)}%</span>
                            <span>{turn.profileUsed ? "已结合学习画像" : "未使用学习画像"}</span>
                            <span>{turn.sourceUsed ? "已引用课程资料" : "未引用课程资料"}</span>
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
                              <span>{source.title}：{source.summary}</span>
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
                          <button type="button" aria-label="回答有帮助"><ThumbsUp size={16} /></button>
                          <button type="button" aria-label="回答需要改进"><ThumbsDown size={16} /></button>
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
              <button type="button" className="ai-resource-action" key={action.label} aria-disabled="true" title="资源生成入口待接入">
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
              placeholder={`有问题，尽管问 AI 助学导师。当前课程：${courseName}；薄弱点：${activePoint}；常见错因：${frequentError}`}
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
    </div>
  );
}
