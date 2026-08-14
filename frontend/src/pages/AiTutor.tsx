import { useEffect, useMemo, useState } from "react";
import { Alert, Drawer } from "antd";
import {
  ArrowRight,
  BookMarked,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  Lightbulb,
  MessageSquarePlus,
  PanelRightOpen,
  SendHorizontal,
  Sparkles,
  Target,
  UserRound
} from "lucide-react";
import { api, LearningContext, StudentProfile } from "../api";
import { knowledgeSources } from "../data/constants";

type ChatMessage = {
  id: string;
  role: "student" | "ai";
  title: string;
  body: string;
  meta?: string;
};

type HistoryItem = {
  id: string;
  title: string;
  summary: string;
  time: string;
  tags: string[];
  active?: boolean;
};

const historyItems: HistoryItem[] = [
  {
    id: "h1",
    title: "链表删除边界复盘",
    summary: "围绕头节点返回值、空链表和越界位置整理了复习路径。",
    time: "今天 20:42",
    tags: ["链表", "边界处理"],
    active: true
  },
  {
    id: "h2",
    title: "栈与队列适用场景",
    summary: "比较括号匹配、任务调度和层序遍历中的结构选择。",
    time: "昨天 18:15",
    tags: ["栈与队列"]
  },
  {
    id: "h3",
    title: "二叉树递归出口",
    summary: "把前序遍历中的空节点出口整理成知识卡片。",
    time: "07-22 21:06",
    tags: ["二叉树", "递归"]
  }
];

export default function AiTutor() {
  const [context, setContext] = useState<LearningContext | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setContext(null);
    setProfile(null);
    api.getLearningContext().then((data) => {
      if (!alive) return;
      setContext(data);
      const courseId = data.courses[0]?.course_id;
      if (courseId) {
        api.getStudentProfile(courseId).then((profileData) => alive && setProfile(profileData)).catch(() => {
          if (alive) setError("学习画像数据暂时不可用，AI 导师将等待画像后再展示个性化回答。");
        }).finally(() => {
          if (alive) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(() => {
      if (!alive) return;
      setError("AI 导师上下文加载失败，请稍后刷新。");
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const weakestPoint = useMemo(() => {
    return profile?.knowledge_states.find((item) => item.state === "WEAK") ?? profile?.knowledge_states[0];
  }, [profile]);

  const frequentError = profile?.frequent_errors[0];
  const recommendation = profile?.recommendations[0];
  const studentName = context?.student.name;
  const courseName = profile?.course.name ?? context?.courses[0]?.course_name;
  const activePoint = weakestPoint?.knowledge_point ?? "链表边界处理";
  const masteryScore = weakestPoint?.mastery_score ?? 62;
  const hintLevel = profile?.overview.hint_dependency_level ?? "中等";

  const messages: ChatMessage[] = profile ? [
    {
      id: "m1",
      role: "student",
      title: "学生提问",
      body: `为什么${activePoint}容易出错？请结合我最近的提交解释。`,
      meta: studentName ? `${studentName} · 当前课程上下文` : "当前课程上下文"
    },
    {
      id: "m2",
      role: "ai",
      title: "AI 导师",
      body: `${activePoint}是当前画像里需要重点复盘的内容。系统结合 ${courseName ?? "数据结构与程序设计基础"} 的任务进度、高频错因${frequentError ? `“${frequentError.label}”` : "和最近提交"}后，建议先定位最小失败场景，再补充对应边界用例。`,
      meta: "AI 生成内容 · 置信度 88% · 已结合画像"
    },
    {
      id: "m3",
      role: "ai",
      title: "下一步建议",
      body: "先按课程知识源复述规则，再写 2 组最小样例验证。如果这是考核任务，只请求一级或二级提示，不直接索要完整答案。",
      meta: "Citation Guard Agent 已检查"
    }
  ] : [];

  const quickPrompts = [
    "把这段诊断整理成复习笔记",
    "生成 5 道边界测试练习",
    "只给一级提示，不要直接给答案"
  ];

  return (
    <div className="ai-tutor-page">
      <header className="ai-tutor-topbar">
        <div className="ai-tutor-title">
          <span className="ai-tutor-mark" aria-hidden="true"><Bot size={22} /></span>
          <div>
            <span className="student-eyebrow">AI 助学 / 自主学习导师</span>
            <h1>围绕知识点持续追问、生成资料、沉淀学习证据</h1>
          </div>
        </div>
        <div className="ai-tutor-toolbar">
          <span className="ai-tutor-status"><CheckCircle2 size={15} /> 课程知识库已连接</span>
          <button className="ai-tutor-icon-button" type="button" onClick={() => setHistoryOpen(true)} aria-label="打开历史对话">
            <History size={19} />
            <span>历史对话</span>
          </button>
        </div>
      </header>

      {error ? <Alert type="warning" message={error} showIcon /> : null}

      <section className="ai-tutor-shell">
        <main className="ai-chat-workspace">
          <div className="ai-chat-context-strip" aria-label="当前 AI 回答上下文">
            <article>
              <span><BookMarked size={16} /></span>
              <div><small>当前课程</small><strong>{courseName ?? "加载中"}</strong></div>
            </article>
            <article>
              <span><Target size={16} /></span>
              <div><small>聚焦知识点</small><strong>{loading ? "读取画像中" : activePoint}</strong></div>
            </article>
            <article>
              <span><Lightbulb size={16} /></span>
              <div><small>提示依赖</small><strong>{hintLevel}</strong></div>
            </article>
          </div>

          <div className="ai-chat-thread">
            {loading ? (
              <div className="ai-chat-loading skeleton-block" />
            ) : messages.length > 0 ? (
              messages.map((message) => (
                <article className={`ai-message ${message.role}`} key={message.id}>
                  <div className="ai-message-avatar" aria-hidden="true">
                    {message.role === "student" ? <UserRound size={18} /> : <Sparkles size={18} />}
                  </div>
                  <div className="ai-message-card">
                    <header>
                      <strong>{message.title}</strong>
                      {message.meta ? <small>{message.meta}</small> : null}
                    </header>
                    <p>{message.body}</p>
                    {message.role === "ai" ? (
                      <div className="ai-message-actions">
                        <button type="button"><FileText size={15} />保存笔记</button>
                        <button type="button"><MessageSquarePlus size={15} />继续追问</button>
                        <button type="button"><PanelRightOpen size={15} />查看来源</button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="ai-tutor-empty">
                <Sparkles size={28} />
                <h2>画像数据加载后，这里会展示个性化 AI 导师回答</h2>
                <p>回答会显示引用来源、置信度、是否结合画像，以及可执行的下一步动作。</p>
              </div>
            )}
          </div>

          <footer className="ai-chat-composer">
            <div className="ai-quick-prompts">
              {quickPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => setDraft(prompt)} disabled={loading || !profile}>
                  {prompt}
                </button>
              ))}
            </div>
            <div className="ai-composer-box">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="继续追问，例如：帮我把这段诊断整理成复习笔记"
                disabled={loading || !profile}
                rows={2}
              />
              <button className="ai-send-button" type="button" disabled={loading || !profile || draft.trim().length === 0} aria-label="发送问题">
                <SendHorizontal size={18} />
              </button>
            </div>
          </footer>
        </main>

        <aside className="ai-context-panel" aria-label="学习上下文与引用来源">
          <section>
            <div className="ai-side-head">
              <h2>当前上下文</h2>
              <span>{masteryScore}%</span>
            </div>
            <dl className="ai-context-list">
              <div><dt>学生</dt><dd>{studentName ?? "加载中"}</dd></div>
              <div><dt>班级</dt><dd>{context?.student.class_name ?? "加载中"}</dd></div>
              <div><dt>画像</dt><dd>{loading ? "等待画像数据" : `${activePoint} · ${masteryScore}%`}</dd></div>
              <div><dt>风险</dt><dd>不能直接给完整答案</dd></div>
            </dl>
          </section>

          <section>
            <div className="ai-side-head">
              <h2>引用来源</h2>
              <span>2 条</span>
            </div>
            <div className="ai-source-list">
              {knowledgeSources.slice(0, 2).map((source) => (
                <article key={source.id}>
                  <strong>{source.title}</strong>
                  <p>{source.summary}</p>
                  <small>匹配度 {source.level === "HIGH" ? "高" : "中"}</small>
                </article>
              ))}
            </div>
          </section>

          <section>
            <div className="ai-side-head">
              <h2>可执行下一步</h2>
            </div>
            <div className="ai-next-list">
              <button type="button">整理成复习笔记 <ArrowRight size={15} /></button>
              <button type="button">生成知识卡片 <ArrowRight size={15} /></button>
              <button type="button">更新复习计划 <ArrowRight size={15} /></button>
            </div>
            {recommendation ? <p className="ai-recommendation">{recommendation.reason}</p> : null}
          </section>
        </aside>
      </section>

      <Drawer
        title="历史对话"
        placement="right"
        width={420}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        className="ai-history-drawer"
      >
        <div className="ai-history-toolbar">
          <button className="self-study-primary" type="button"><MessageSquarePlus size={15} />新建对话</button>
          <button type="button">仅看已保存</button>
        </div>
        <div className="ai-history-list">
          {historyItems.map((item) => (
            <button className={item.active ? "active" : ""} type="button" key={item.id}>
              <span><Clock3 size={14} />{item.time}</span>
              <strong>{item.title}</strong>
              <p>{item.summary}</p>
              <em>{item.tags.join(" / ")}</em>
            </button>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
