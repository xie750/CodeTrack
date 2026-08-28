import { useEffect, useMemo, useState } from 'react'
import { Drawer } from 'antd'
import {
  AlertTriangle, BarChart3, Bot, Check, CheckCircle2, FileSearch, History, Layers3,
  Link2, MessageSquarePlus, MoreHorizontal, Paperclip, Search, SendHorizontal, Trash2,
  ShieldCheck, Sparkles, ThumbsDown, ThumbsUp,
  TrendingUp,
} from 'lucide-react'

import { ApiError, api } from '../api'
import type {
  ApiClass,
  ApiCourse,
  ApiTeacherAiChatResponse,
  ApiTeacherAiCitation,
  ApiTeacherAiSession,
  ApiTeacherAiStoredMessage,
} from '../api'
import type { ExactView } from './components'
import robotImg from '../../assets/ui-home/ai-tutor-bot.png'

type TeacherAiMessage = {
  id: string
  role: 'assistant' | 'teacher'
  content: string
  time: string
  error?: boolean
  loading?: boolean
  confidence?: number
  citations?: ApiTeacherAiCitation[]
  actions?: string[]
  dataGaps?: string[]
  modelName?: string
}

const quickPrompts = [
  { label: '风险学生', icon: <AlertTriangle size={16} />, prompt: '请分析当前班级的风险学生，按风险原因、证据和建议干预动作列出。' },
  { label: '薄弱知识点', icon: <BarChart3 size={16} />, prompt: '请汇总当前班级最近任务中的薄弱知识点，并给出下一节课的讲解重点。' },
  { label: '提交异常', icon: <TrendingUp size={16} />, prompt: '请检查近期提交数据是否存在异常，例如集中失败、长时间未提交或提示依赖过高。' },
  { label: '分层辅导', icon: <Layers3 size={16} />, prompt: '请按高掌握、待巩固、需预警三类学生生成分层辅导建议。' },
  { label: '引用核查', icon: <ShieldCheck size={16} />, prompt: '请核查当前 AI 诊断是否有足够课程资料引用，标出需要教师复核的内容。' },
]

const readableScopes = ['课程基础信息', '当前班级学生画像', '任务提交记录', '课程知识图谱与资料', 'AI 诊断复核记录']

function nowTime() {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}

function splitAnswer(content: string) {
  return content
    .split(/\n{2,}|\n(?=\d+[.、])|(?=[-*]\s)/)
    .map((item) => item.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean)
}

function toAssistantMessage(reply: ApiTeacherAiChatResponse): TeacherAiMessage {
  return {
    id: reply.id,
    role: 'assistant',
    content: reply.content,
    time: nowTime(),
    confidence: reply.confidence,
    citations: reply.citations,
    actions: reply.suggested_actions,
    dataGaps: reply.data_gaps,
    modelName: reply.model.name,
  }
}

function formatMessageTime(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return nowTime()
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function formatSessionDate(value: string | null | undefined) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '刚刚'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function storedMessageToTurn(message: ApiTeacherAiStoredMessage): TeacherAiMessage | null {
  if (message.role !== 'teacher' && message.role !== 'assistant') return null
  const metadata = message.metadata || {}
  const isAssistant = message.role === 'assistant'
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    time: formatMessageTime(message.created_at),
    error: isAssistant && message.status === 'FAILED',
    confidence: isAssistant ? metadata.confidence : undefined,
    citations: isAssistant ? metadata.citations : undefined,
    actions: isAssistant ? metadata.suggested_actions : undefined,
    dataGaps: isAssistant ? metadata.data_gaps : undefined,
    modelName: isAssistant ? (metadata.model?.name || metadata.model_name) : undefined,
  }
}

function scrollTurnIntoView(turnId: string) {
  document.querySelector<HTMLElement>(`[data-teacher-ai-turn-id="${turnId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function errorMessage(error: unknown): TeacherAiMessage {
  const content = error instanceof ApiError
    ? error.message
    : '真实模型请求失败，请检查后端服务和模型配置后重试。'
  return {
    id: `assistant-error-${Date.now()}`,
    role: 'assistant',
    content,
    time: nowTime(),
    error: true,
    dataGaps: ['真实模型接口未返回可用结果'],
    actions: ['重新发送刚才的问题', '查看学情分析'],
  }
}

function compactPreview(content: string) {
  const text = content.replace(/\s+/g, ' ').trim()
  return text.length > 72 ? `${text.slice(0, 72)}...` : text || '正在生成回答...'
}

function TeacherAiThreadOutline({ messages, loading }: { messages: TeacherAiMessage[]; loading: boolean }) {
  if (!messages.length && !loading) return null
  const items = loading
    ? [...messages, { id: 'teacher-ai-loading', role: 'assistant', content: '正在读取教师端真实数据并调用模型分析...', time: nowTime() } as TeacherAiMessage]
    : messages
  return <aside className="teacher-ai-thread-outline" aria-label="对话时间轴">
    {items.map((message) => (
      <button
        type="button"
        key={message.id}
        className={'teacher-ai-thread-dot ' + (message.role === 'teacher' ? 'teacher' : 'assistant') + (message.loading ? ' loading' : '') + (message.error ? ' error' : '')}
        aria-label={message.role === 'teacher' ? '教师提问' : 'AI 助教回答'}
        onClick={() => scrollTurnIntoView(message.id)}
      >
        <i />
        <span className="teacher-ai-thread-preview">
          <strong>{message.role === 'teacher' ? '教师提问' : 'AI 助教'}</strong>
          <small>{compactPreview(message.content)}</small>
        </span>
      </button>
    ))}
  </aside>
}

export function ExactTeacherAiAssistant({
  courseId,
  classId,
  courses,
  classes,
  onNavigate,
}: {
  courseId: string
  classId: string
  courses: ApiCourse[]
  classes: ApiClass[]
  onNavigate: (view: ExactView) => void
}) {
  const course = useMemo(() => courses.find((item) => item.id === courseId), [courseId, courses])
  const classItem = useMemo(() => classes.find((item) => item.id === classId), [classId, classes])
  const courseName = course?.name || '当前课程'
  const className = classItem?.name || '当前班级'
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<TeacherAiMessage[]>([])
  const [latestContext, setLatestContext] = useState<ApiTeacherAiChatResponse['context'] | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sessions, setSessions] = useState<ApiTeacherAiSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(false)

  async function reloadSessions(query = historyQuery) {
    setHistoryLoading(true)
    try {
      const data = await api.listTeacherAiSessions(courseId, classId, query)
      setSessions(data)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    let alive = true
    setHistoryLoading(true)
    api.listTeacherAiSessions(courseId, classId, historyQuery)
      .then((data) => {
        if (alive) setSessions(data)
      })
      .catch(() => {
        if (alive) setSessions([])
      })
      .finally(() => {
        if (alive) setHistoryLoading(false)
      })
    return () => {
      alive = false
    }
  }, [courseId, classId, historyQuery])

  function upsertSession(session?: ApiTeacherAiSession) {
    if (!session) return
    setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)])
  }

  async function send(text = draft) {
    const value = text.trim()
    if (!value || isSending) return
    const stamp = Date.now()
    const teacherMessage: TeacherAiMessage = { id: `teacher-${stamp}`, role: 'teacher', content: value, time: nowTime() }
    const pendingId = `assistant-stream-${stamp}`
    const pendingMessage: TeacherAiMessage = {
      id: pendingId,
      role: 'assistant',
      content: '',
      time: nowTime(),
      loading: true,
    }
    const history = messages
      .slice(-8)
      .filter((message) => !message.loading && !message.error)
      .map((message) => ({ role: message.role, content: message.content }))
    setDraft('')
    setMessages((current) => [...current, teacherMessage, pendingMessage])
    setIsSending(true)
    try {
      await api.streamTeacherAiChat({
        course_id: courseId,
        class_id: classId,
        session_id: currentSessionId,
        message: value,
        history,
      }, (event) => {
        if (event.event === 'session') {
          setCurrentSessionId(event.data.session.id)
          upsertSession(event.data.session)
        }
        if (event.event === 'delta') {
          setMessages((current) => current.map((message) => (
            message.id === pendingId
              ? { ...message, content: message.content + event.data.content }
              : message
          )))
        }
        if (event.event === 'final') {
          setLatestContext(event.data.context)
          upsertSession(event.data.session)
          setMessages((current) => current.map((message) => (
            message.id === pendingId
              ? { ...toAssistantMessage(event.data), loading: false }
              : message
          )))
        }
        if (event.event === 'error') {
          setMessages((current) => current.map((message) => (
            message.id === pendingId
              ? {
                ...message,
                content: event.data.message,
                loading: false,
                error: true,
                dataGaps: ['真实模型接口未返回可用结果'],
                actions: ['重新发送刚才的问题', '查看学情分析'],
              }
              : message
          )))
        }
      })
      await reloadSessions()
    } catch (error) {
      setMessages((current) => current.map((message) => (
        message.id === pendingId ? { ...errorMessage(error), id: pendingId } : message
      )))
    } finally {
      setIsSending(false)
    }
  }

  async function startNewSession() {
    if (isSending) return
    setDraft('')
    setMessages([])
    setLatestContext(null)
    setSessionLoading(true)
    try {
      const session = await api.createTeacherAiSession({
        course_id: courseId,
        class_id: classId,
        first_message: '新的教师 AI 助教会话',
        title: '新的教师 AI 助教会话',
      })
      setCurrentSessionId(session.id)
      upsertSession(session)
      setHistoryOpen(false)
    } catch (error) {
      setCurrentSessionId(null)
    } finally {
      setSessionLoading(false)
    }
  }

  async function openSession(sessionId: string) {
    if (isSending) return
    setSessionLoading(true)
    try {
      const detail = await api.getTeacherAiSession(sessionId)
      setCurrentSessionId(detail.session.id)
      upsertSession(detail.session)
      setMessages(detail.messages.map(storedMessageToTurn).filter(Boolean) as TeacherAiMessage[])
      setLatestContext(null)
      setHistoryOpen(false)
    } finally {
      setSessionLoading(false)
    }
  }

  async function deleteSession(sessionId: string) {
    if (isSending) return
    await api.deleteTeacherAiSession(sessionId)
    setSessions((current) => current.filter((item) => item.id !== sessionId))
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null)
      setMessages([])
      setLatestContext(null)
    }
  }

  function handleAction(action: string) {
    if (/审核|复核/.test(action)) {
      onNavigate('reviews')
      return
    }
    if (/学情|风险|画像/.test(action)) {
      onNavigate('analytics')
      return
    }
    if (/知识图谱|资料|引用/.test(action)) {
      onNavigate('graph')
      return
    }
    setDraft(`请继续分析：${action}`)
  }

  const hasChat = messages.length > 0

  return <div className={'teacher-ai-workspace-page ' + (hasChat ? 'teacher-ai-has-chat' : 'teacher-ai-empty-chat')}>
    <header className="teacher-ai-workspace-header">
      <div className="teacher-ai-workspace-title">
        <img src={robotImg} alt="" aria-hidden="true" />
        <div>
          <span>教师端 AI 助教</span>
          <h1>围绕学情、提交和诊断复核持续追问</h1>
          <p>{courseName} · {className}</p>
        </div>
      </div>
      <div className="teacher-ai-toolbar">
        <button type="button" className="teacher-ai-history-entry" onClick={() => setHistoryOpen(true)}>
          <History size={17} />
          历史会话
        </button>
        <button type="button" className="teacher-ai-history-entry" onClick={startNewSession} disabled={isSending || sessionLoading}>
          <MessageSquarePlus size={17} />
          新建会话
        </button>
      </div>
    </header>

    <main className="teacher-ai-learning-workspace" aria-label="教师 AI 助教工作区">
      <TeacherAiThreadOutline messages={messages} loading={isSending} />
      <div className="teacher-ai-thread">
        {!hasChat ? <section className="teacher-ai-empty-state" aria-label="教师 AI 助教初始页">
          <div className="teacher-ai-empty-visual">
            <span />
            <img src={robotImg} alt="" aria-hidden="true" />
          </div>
          <h2>教师端 AI 助教，随时分析真实学情</h2>
          <p>快捷选择一个分析方向，模型会读取当前课程、班级、提交、知识图谱和 AI 复核记录。</p>
          <div className="teacher-ai-empty-prompts">
            {quickPrompts.map((item) => (
              <button type="button" key={item.label} onClick={() => send(item.prompt)} disabled={isSending}>
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </section> : null}
          {messages.map((message) => (
            <article className={'teacher-ai-turn teacher-ai-turn-' + message.role} key={message.id} data-teacher-ai-turn-id={message.id}>
              {message.role === 'teacher' ? <div className="teacher-ai-user-bubble">
                {message.content}
                <time>{message.time}</time>
              </div> : <>
                <div className="teacher-ai-assistant-avatar" aria-hidden="true">
                  <img src={robotImg} alt="" />
                </div>
                <div className="teacher-ai-answer-flow">
                  <header>
                    <strong>AI 助教</strong>
                    <span>{message.loading ? <Bot size={14} /> : <Check size={14} />} {message.loading ? '正在生成' : message.error ? '调用提示' : '思考完成'}</span>
                  </header>
                  {message.confidence !== undefined ? <div className="teacher-ai-run-summary">
                    <article className="done">
                      <span><CheckCircle2 size={16} /></span>
                      <div><strong>真实模型分析</strong><small>{message.modelName ? `模型 ${message.modelName}` : '已调用后端模型'}</small></div>
                    </article>
                    <article className="action">
                      <span><FileSearch size={16} /></span>
                      <div><strong>教师端数据</strong><small>{message.citations?.length ? `已引用 ${message.citations.length} 类来源` : '按当前上下文分析'}</small></div>
                    </article>
                  </div> : null}
                  <section>
                    <h2>{message.error ? '连接提示' : '回答'}</h2>
                    {message.content
                      ? splitAnswer(message.content).map((paragraph, index) => (
                        <p key={`${message.id}-p-${index}`}>{paragraph}{message.loading && index === splitAnswer(message.content).length - 1 ? <i className="teacher-ai-stream-caret" /> : null}</p>
                      ))
                      : <p>正在读取教师端真实数据并调用模型分析...{message.loading ? <i className="teacher-ai-stream-caret" /> : null}</p>}
                  </section>
                  {message.confidence !== undefined ? <section>
                    <h2>回答依据</h2>
                    <div className="teacher-ai-answer-meta">
                      <span>置信度 {message.confidence}%</span>
                      <span>已结合教师端真实数据</span>
                      {message.modelName ? <span>模型 {message.modelName}</span> : null}
                    </div>
                  </section> : null}
                  {message.citations?.length ? <section>
                    <h2>引用来源</h2>
                    {message.citations.map((source) => (
                      <div className="teacher-ai-citation-line" key={source.id}>
                        <Link2 size={15} />
                        <span>{source.label} · {source.record_count} 条记录</span>
                      </div>
                    ))}
                  </section> : null}
                  {message.dataGaps?.length ? <section>
                    <h2>数据缺口</h2>
                    <div className="teacher-ai-answer-meta">
                      {message.dataGaps.map((gap) => <span key={gap}>{gap}</span>)}
                    </div>
                  </section> : null}
                  {message.actions?.length ? <footer className="teacher-ai-answer-actions">
                    {message.actions.map((action) => (
                      <button type="button" key={action} onClick={() => handleAction(action)}>
                        {action.includes('审核') || action.includes('复核') ? <FileSearch size={15} /> : action.includes('学情') ? <BarChart3 size={15} /> : <MessageSquarePlus size={15} />}
                        {action}
                      </button>
                    ))}
                    <button type="button" aria-label="回答有帮助"><ThumbsUp size={16} /></button>
                    <button type="button" aria-label="回答需要改进"><ThumbsDown size={16} /></button>
                  </footer> : null}
                </div>
              </>}
            </article>
          ))}
        </div>

        <footer className="teacher-ai-composer" aria-label="AI 助教输入区">
          <div className="teacher-ai-prompt-row">
            {quickPrompts.map((item) => (
              <button type="button" key={item.label} disabled={isSending} onClick={() => send(item.prompt)}>
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
          <div className="teacher-ai-composer-surface">
            <textarea
              value={draft}
              rows={2}
              placeholder="问 AI 助教，例如：帮我分析本班最近一次任务的错因分布"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
            />
            <div>
              <button type="button" aria-label="添加附件"><Paperclip size={17} /></button>
              <button type="button" aria-label="更多能力"><MoreHorizontal size={17} /></button>
              <button type="button" className="teacher-ai-send" disabled={!draft.trim() || isSending} aria-label="发送" onClick={() => send()}>
                <SendHorizontal size={18} />
              </button>
            </div>
          </div>
          <div className="teacher-ai-readable-strip" aria-label="当前可读取范围">
            <Sparkles size={15} />
            <span>{latestContext ? `${latestContext.analytics_summary.students} 名学生 · ${latestContext.analytics_summary.assigned_tasks} 个任务 · ${latestContext.analytics_summary.pending_ai_reviews} 条待复核` : readableScopes.join(' / ')}</span>
          </div>
        </footer>
    </main>
    <Drawer
      rootClassName="teacher-ai-history-drawer"
      title="历史会话"
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      width={420}
    >
      <div className="teacher-ai-history-panel">
        <div className="teacher-ai-history-search">
          <Search size={16} />
          <input
            value={historyQuery}
            placeholder="搜索会话标题或最近问题"
            onChange={(event) => setHistoryQuery(event.target.value)}
          />
        </div>
        <button type="button" className="teacher-ai-history-new" onClick={startNewSession} disabled={isSending || sessionLoading}>
          <MessageSquarePlus size={16} />
          新建会话
        </button>
        <div className="teacher-ai-history-list" aria-busy={historyLoading || sessionLoading}>
          {historyLoading ? <p className="teacher-ai-history-state">正在读取历史会话...</p> : null}
          {!historyLoading && sessions.length === 0 ? <p className="teacher-ai-history-state">暂无历史会话，发送一次提问后会自动保存。</p> : null}
          {sessions.map((session) => (
            <button
              type="button"
              key={session.id}
              className={session.id === currentSessionId ? 'active' : ''}
              onClick={() => openSession(session.id)}
              disabled={isSending || sessionLoading}
            >
              <span><History size={14} /> {formatSessionDate(session.last_message_at || session.updated_at || session.created_at)}</span>
              <strong>{session.title}</strong>
              <p>{session.summary || '新的教师 AI 助教会话'}</p>
              <em>{session.message_count} 条消息</em>
              <i
                role="button"
                tabIndex={0}
                aria-label="删除会话"
                onClick={(event) => {
                  event.stopPropagation()
                  deleteSession(session.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    deleteSession(session.id)
                  }
                }}
              >
                <Trash2 size={15} />
              </i>
            </button>
          ))}
        </div>
      </div>
    </Drawer>
  </div>
}
