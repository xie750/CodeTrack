import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter } from 'react-router-dom'

import ExactApp from './exact/ExactApp'
import { api, type ApiDiscussion, setCurrentUser, getCurrentUserId, getCurrentUserName } from './api'
import './exact/exact.css'

function StudentJoinEntry({ code }: { code: string }) {
  const [state, setState] = React.useState<'idle' | 'joining' | 'joined' | 'error'>('idle')
  const [message, setMessage] = React.useState('')
  const join = async () => {
    setState('joining')
    try {
      const result = await api.joinClass(code)
      setMessage(`已成功加入「${result.class_name}」`)
      setState('joined')
    } catch (reason: any) {
      setMessage(reason.message || '加入课程失败')
      setState('error')
    }
  }
  return <main className="student-join-entry"><section><div className="student-join-brand"><span>&lt;/&gt;</span><strong>CodeTrack</strong></div><small>班级邀请码</small><code>{code}</code><h1>{state === 'joined' ? '加入成功' : '加入课程'}</h1><p>{message || '确认后将以当前学生账号申请加入该教学班。'}</p>{state === 'joined' ? <button onClick={() => { window.location.href = '/' }}>返回首页</button> : <button disabled={state === 'joining'} onClick={join}>{state === 'joining' ? '正在加入...' : '确认加入课程'}</button>}</section></main>
}

function StudentDiscussionsEntry() {
  const [rows, setRows] = React.useState<ApiDiscussion[]>([])
  const [selectedId, setSelectedId] = React.useState('')
  const [reply, setReply] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.studentDiscussions()
      setRows(result)
      setSelectedId((current) => result.some((item) => item.id === current) ? current : result[0]?.id || '')
    } catch (reason: any) {
      setError(reason.message || '课堂讨论加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])
  const selected = rows.find((item) => item.id === selectedId) || rows[0]

  const submitReply = async () => {
    if (!selected || !reply.trim()) return
    setSending(true)
    setError('')
    try {
      const updated = await api.replyDiscussion(selected.id, reply.trim())
      setRows((current) => current.map((item) => item.id === updated.id ? updated : item))
      setReply('')
    } catch (reason: any) {
      setError(reason.message || '回复失败')
    } finally {
      setSending(false)
    }
  }

  return <main className="student-discussions-page">
    <header className="student-discussions-header">
      <div className="student-discussions-brand"><span>&lt;/&gt;</span><strong>CodeTrack</strong><em>学生端</em></div>
      <div><strong>王子轩</strong><small>2024121014</small></div>
    </header>
    <section className="student-discussions-shell">
      <div className="student-discussions-title"><div><small>课程互动</small><h1>课堂讨论</h1><p>查看教师发布的问题，分享你的思路并参与班级交流。</p></div><button onClick={() => void load()}>刷新讨论</button></div>
      {error && <div className="student-discussion-error">{error}</div>}
      <div className="student-discussions-layout">
        <aside>
          <div><strong>已发布讨论</strong><span>{rows.length}</span></div>
          {loading && <p className="student-discussion-placeholder">正在加载讨论...</p>}
          {!loading && !rows.length && <p className="student-discussion-placeholder">老师暂时还没有发布讨论</p>}
          {rows.map((item) => <button className={item.id === selected?.id ? 'active' : ''} key={item.id} onClick={() => setSelectedId(item.id)}>
            <span>{item.class_name}</span><strong>{item.title}</strong><p>{item.content}</p><small>{item.reply_count} 条回复 · {item.participant_count} 人参与</small>
          </button>)}
        </aside>
        <article className="student-discussion-detail">
          {!selected ? <div className="student-discussion-empty"><strong>选择一条课堂讨论</strong><p>教师发布后会实时出现在这里。</p></div> : <>
            <header><span>课堂讨论</span><time>{(selected.published_at || selected.created_at).slice(0,16).replace('T',' ')}</time></header>
            <h2>{selected.title}</h2>
            <p className="student-discussion-question">{selected.content}</p>
            <div className="student-discussion-meta"><span>{selected.class_name}</span><span>{selected.participant_count} 人参与</span><span>{selected.reply_count} 条回复</span></div>
            <section className="student-discussion-replies">
              <strong>同学观点</strong>
              {!selected.replies.length && <p className="student-discussion-placeholder">还没有回复，来分享第一个观点吧。</p>}
              {selected.replies.map((item) => <div key={item.id}><span>{item.student_name.slice(0,1)}</span><div><header><b>{item.student_name}</b><time>{item.created_at.slice(5,16).replace('T',' ')}</time></header><p>{item.content}</p></div></div>)}
            </section>
            <section className="student-discussion-reply-box">
              <label htmlFor="student-discussion-reply">发表你的观点</label>
              <textarea id="student-discussion-reply" maxLength={2000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="结合课程内容说明你的思考，也可以回应其他同学。" />
              <footer><small>{reply.length}/2000</small><button disabled={sending || !reply.trim()} onClick={submitReply}>{sending ? '正在提交...' : '参与讨论'}</button></footer>
            </section>
          </>}
        </article>
      </div>
    </section>
  </main>
}

const joinMatch = window.location.pathname.match(/^\/join\/([^/]+)$/)
const studentDiscussionMatch = window.location.pathname === '/student/discussions'
const teacherAccounts = new Map([
  ['teacher-01', '王老师'],
  ['teacher-02', '林老师'],
])

function AppRoot() {
  const [loggedIn, setLoggedIn] = React.useState(() => {
    const saved = localStorage.getItem('codetrack_user')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const teacherName = teacherAccounts.get(parsed.id)
        if (teacherName) {
          setCurrentUser(parsed.id, teacherName)
          return true
        }
      } catch { /* ignore corrupt data */ }
      localStorage.removeItem('codetrack_user')
    }
    // The teacher portal is an entry screen, not an authentication gate.
    // Keep the original demo teacher available when local state is missing.
    setCurrentUser('teacher-01', '王老师')
    return true
  })
  const [appKey, setAppKey] = React.useState(0)

  const handleLogin = (userId: string, name: string) => {
    setCurrentUser(userId, name)
    localStorage.setItem('codetrack_user', JSON.stringify({ id: userId, name }))
    setLoggedIn(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('codetrack_user')
    setCurrentUser('teacher-01', '王老师')
    setLoggedIn(true)
    setAppKey((n) => n + 1)
  }

  if (joinMatch) {
    return <StudentJoinEntry code={decodeURIComponent(joinMatch[1])} />
  }

  if (studentDiscussionMatch) {
    return <StudentDiscussionsEntry />
  }

  return <ExactApp key={appKey} loggedIn={loggedIn} onLogin={handleLogin} onLogout={handleLogout} />
}

const app = <AppRoot />

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#43b81a',
          colorInfo: '#43b81a',
          colorSuccess: '#379d1e',
          colorWarning: '#e0a12b',
          colorError: '#d45f55',
          colorText: '#19221b',
          colorTextSecondary: '#778279',
          colorBorder: '#dfe6dc',
          colorBgLayout: '#f7f9f6',
          borderRadius: 5,
          controlHeight: 34,
          fontSize: 12,
          fontFamily: "Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Button: { fontWeight: 550 },
          Table: { headerBg: '#f7f9f6', headerColor: '#657168', cellPaddingBlock: 10, cellPaddingInline: 11 },
          Tabs: { itemSelectedColor: '#3a9e20', inkBarColor: '#43b81a' },
          Form: { labelFontSize: 11, itemMarginBottom: 13 },
        },
      }}
    >
      <BrowserRouter>{app}</BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
)
