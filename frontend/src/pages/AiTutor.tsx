import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Drawer } from "antd";
import {
  Bot,
  Check,
  FileText,
  History,
  Link2,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  PenLine,
  Search,
  SendHorizontal,
  ThumbsDown,
  ThumbsUp,
  X
} from "lucide-react";
import { api, LearningContext, StudentAiChatCitation, StudentProfile } from "../api";

type HistoryItem = {
  id: string;
  title: string;
  summary: string;
  time: string;
  group: "今天" | "昨天" | "更早";
  active?: boolean;
};

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

const historyItems: HistoryItem[] = [
  {
    id: "h1",
    title: "边界测试在黑盒测试中的应用",
    summary: "为什么边界测试容易漏掉，需结合等价类一起分析。",
    time: "10:32",
    group: "今天",
    active: true
  },
  {
    id: "h2",
    title: "引用来源的查找方法",
    summary: "如何在课程资料中查到对应的引用来源。",
    time: "09:48",
    group: "今天"
  },
  {
    id: "h3",
    title: "如何设计边界测试用例",
    summary: "给我一个函数的边界测试用例设计思路。",
    time: "09:15",
    group: "今天"
  },
  {
    id: "h4",
    title: "等价类划分示例",
    summary: "给我几个等价类划分的例子。",
    time: "21:04",
    group: "昨天"
  },
  {
    id: "h5",
    title: "条件覆盖与判定覆盖的区别",
    summary: "条件覆盖和判定覆盖有什么区别？",
    time: "18:37",
    group: "昨天"
  }
];

const suggestedPrompts = ["继续解释", "生成练习", "保存为笔记", "只给一级提示"];

function nowLabel() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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

export default function AiTutor() {
  const [context, setContext] = useState<LearningContext | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const weakestPoint = useMemo(() => {
    return profile?.knowledge_states.find((item) => item.state === "WEAK") ?? profile?.knowledge_states[0];
  }, [profile]);

  const activePoint = weakestPoint?.knowledge_point ?? "边界测试";
  const courseId = profile?.course.id ?? context?.courses[0]?.course_id;
  const courseName = profile?.course.name ?? context?.courses[0]?.course_name ?? "数据结构与程序设计基础";
  const frequentError = profile?.frequent_errors[0]?.label ?? "只验证普通用例";

  const [turns, setTurns] = useState<AiChatTurn[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      content: "你好，我是 AI 助学导师。你可以直接问知识点、错题原因、练习生成或学习计划，我会尽量结合你的课程资料和学习画像回答。",
      time: nowLabel(),
      confidence: 0.86,
      citations: [],
      suggestedActions: suggestedPrompts,
      profileUsed: false,
      sourceUsed: false,
      modelName: "ready"
    }
  ]);

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

  const filteredHistory = historyItems.filter((item) => {
    const keyword = historyQuery.trim().toLowerCase();
    return !keyword || item.title.toLowerCase().includes(keyword) || item.summary.toLowerCase().includes(keyword);
  });

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
      content: "AI 助学导师正在结合课程资料和学习画像思考...",
      time: nowLabel(),
      loading: true
    };
    const history = turns
      .filter((turn) => !turn.loading && !turn.error)
      .slice(-6)
      .map((turn) => ({ role: turn.role, content: turn.content }));

    setDraft("");
    setSending(true);
    setTurns((current) => [...current, userTurn, pendingTurn]);
    try {
      const result = await api.sendStudentAiChat(message, courseId, history);
      setTurns((current) => current.map((turn) => (
        turn.id === pendingId
          ? {
              id: pendingId,
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
            }
          : turn
      )));
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
    <div className="ai-workspace-page">
      <header className="ai-workspace-header">
        <div>
          <span>AI 助学 / 自主学习导师</span>
          <h1>和 AI 助学导师持续追问、生成资料、沉淀学习证据</h1>
        </div>
        <button type="button" className="ai-history-entry" onClick={() => setHistoryOpen(true)}>
          <History size={17} />
          历史会话
        </button>
      </header>

      {error ? <Alert className="ai-workspace-alert" type="warning" message={error} showIcon /> : null}

      <main className="ai-learning-workspace" aria-label="AI Learning Workspace">
        <div className="ai-thread" ref={threadRef}>
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
                  <Bot size={20} />
                </div>
                <div className={`ai-answer-flow${turn.error ? " ai-answer-flow-error" : ""}`}>
                  <header>
                    <strong>AI 助学导师</strong>
                    <span><Check size={14} /> {turn.loading ? "思考中" : turn.error ? "需要处理" : "思考完成"}</span>
                  </header>

                  {turn.loading ? (
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
                      </section>

                      {!turn.error ? (
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

                      {turn.safetyNote ? (
                        <section>
                          <h2>使用提醒</h2>
                          <p>{turn.safetyNote}</p>
                        </section>
                      ) : null}

                      {turn.citations?.length ? (
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

                      <footer className="ai-answer-actions">
                        {(turn.suggestedActions?.length ? turn.suggestedActions : suggestedPrompts).map((action) => (
                          <button type="button" key={action} onClick={() => setDraft(action)}>
                            {action.includes("保存") ? <PenLine size={15} /> : action.includes("练习") ? <FileText size={15} /> : <MessageSquarePlus size={15} />}
                            {action}
                          </button>
                        ))}
                        <button type="button" aria-label="回答有帮助"><ThumbsUp size={16} /></button>
                        <button type="button" aria-label="回答需要改进"><ThumbsDown size={16} /></button>
                      </footer>
                    </>
                  )}
                </div>
              </article>
            )
          ))}
        </div>

        <footer className="ai-sticky-composer" aria-label="AI 输入区">
          <div className="ai-prompt-row">
            {suggestedPrompts.map((prompt) => (
              <button type="button" key={prompt} onClick={() => sendMessage(prompt)} disabled={sending || loadingContext}>
                {prompt}
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
              disabled={sending}
            />
            <div className="ai-composer-actions">
              <button type="button" aria-label="添加附件" disabled={sending}><Paperclip size={18} /></button>
              <button type="button" aria-label="更多能力" disabled={sending}><MoreHorizontal size={18} /></button>
              <button type="button" className="ai-send" disabled={!draft.trim() || sending || loadingContext} aria-label="发送" onClick={() => sendMessage()}>
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
          <button type="button" className="ai-new-session">
            <MessageSquarePlus size={16} />
            新建会话
          </button>

          {(["今天", "昨天", "更早"] as const).map((group) => {
            const items = filteredHistory.filter((item) => item.group === group);
            if (!items.length) return null;
            return (
              <section className="ai-session-group" key={group}>
                <h3>{group}</h3>
                {items.map((item) => (
                  <button type="button" className={item.active ? "active" : ""} key={item.id}>
                    <span>
                      <strong>{item.title}</strong>
                      <time>{item.time}</time>
                    </span>
                    <small>{item.summary}</small>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </Drawer>
    </div>
  );
}
