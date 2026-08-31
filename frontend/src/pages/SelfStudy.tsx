import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Link2,
  PenLine,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp
} from "lucide-react";
import { api, StudentProfile } from "../api";
import { StudentInlineNotice, studentErrorDetail, studentErrorMessage } from "../components/StudentState";
import selfStudyHeroArt from "../assets/self-study/self-study-ai-hero.jpg";

type TaskState = "done" | "active" | "pending";

const loopSteps = [
  {
    title: "学习画像 / AI诊断",
    desc: "评估掌握程度，定位薄弱知识点",
    icon: <Bot size={27} />,
    tone: "blue"
  },
  {
    title: "学习规划",
    desc: "生成个性化学习路径与计划",
    icon: <Target size={27} />,
    tone: "green"
  },
  {
    title: "资料检索",
    desc: "智能检索知识点与优质资料",
    icon: <Database size={27} />,
    tone: "sky"
  },
  {
    title: "练习与任务",
    desc: "生成练习，完成任务与巩固",
    icon: <PenLine size={27} />,
    tone: "orange"
  },
  {
    title: "反馈提升",
    desc: "AI 反馈学习效果，持续优化",
    icon: <TrendingUp size={27} />,
    tone: "purple"
  }
];

const tasks: Array<{ title: string; state: TaskState }> = [
  { title: "完成链表基础知识学习", state: "done" },
  { title: "完成 LeetCode 206 反转链表练习", state: "active" },
  { title: "整理本周学习笔记", state: "active" },
  { title: "学习图的基本概念", state: "pending" },
  { title: "完成每日学习反馈", state: "pending" }
];

const resourceCards = [
  {
    title: "B站课程：链表基础与专题练习",
    type: "B站",
    desc: "系统讲解链表基本概念与操作",
    icon: <FileText size={20} />,
    tone: "red"
  },
  {
    title: "LeetCode 练习：206. Reverse Linked List",
    type: "LeetCode",
    desc: "经典反转链表题，巩固指针操作",
    icon: <ClipboardList size={20} />,
    tone: "amber"
  },
  {
    title: "菜鸟教程 / 博客文章：链表操作总结",
    type: "博客",
    desc: "图文总结常见链表操作与注意事项",
    icon: <BookOpen size={20} />,
    tone: "green"
  }
];

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function taskStateLabel(state: TaskState) {
  if (state === "done") return "已完成";
  if (state === "active") return "进行中";
  return "待开始";
}

export default function SelfStudy() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileDetail, setProfileDetail] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setProfileMessage(null);
    setProfileDetail(null);
    api.getLearningContext()
      .then((context) => {
        const courseId = context.courses[0]?.course_id;
        return courseId ? api.getStudentProfile(courseId) : null;
      })
      .then((data) => {
        if (alive && data) setProfile(data);
      })
      .catch((err) => {
        if (!alive) return;
        setProfile(null);
        setProfileMessage(studentErrorMessage(err, "学习画像暂未同步，当前使用默认自学建议。"));
        setProfileDetail(studentErrorDetail(err));
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const weakPoint = profile?.knowledge_states.find((item) => item.state === "WEAK") ?? profile?.knowledge_states[0];
  const progress = clamp(profile?.overview.overall_progress ?? 68);
  const completedCount = tasks.filter((task) => task.state === "done").length;
  const activeCount = tasks.filter((task) => task.state !== "pending").length;
  const adviceTopic = weakPoint?.knowledge_point ?? "链表（数据结构）";
  const adviceReason = useMemo(() => {
    if (weakPoint?.last_evidence) return weakPoint.last_evidence;
    return "分析：节点链接与操作、上正逆单链表；插入和边界处理是你在本节操作中常见题型。";
  }, [weakPoint]);

  return (
    <div className="study-home-page">
      <section className="study-home-hero">
        <div className="study-home-hero-copy">
          <h1>让 AI 帮你规划、学习与提升</h1>
          <p>通过学习诊断、生成个性化方案、推荐优质资源、创建练习并提供反馈，形成高效学习闭环。</p>
          <div className="study-home-actions">
            <button className="study-home-primary" type="button" onClick={() => navigate("/self-study/ai")}>
              <Sparkles size={18} />
              开始 AI 诊断
            </button>
            <button className="study-home-secondary" type="button" onClick={() => navigate("/self-study/knowledge-base")}>
              <Database size={18} />
              进入知识库
            </button>
          </div>
        </div>
        <div className="study-ai-visual" aria-hidden="true">
          <img src={selfStudyHeroArt} alt="" draggable={false} />
        </div>
      </section>

      {profileMessage ? (
        <StudentInlineNotice
          kind="degraded"
          title="当前展示默认自学建议"
          description={profileMessage}
          detail={profileDetail}
          actions={[{ label: "重试同步", variant: "primary", onClick: () => setReloadKey((value) => value + 1) }]}
        />
      ) : null}

      <section className="study-home-grid">
        <main className="study-home-main">
          <section className="study-home-card study-loop-card">
            <header className="study-section-head">
              <h2>学习闭环：AI 助力你的每一步</h2>
            </header>
            <div className="study-loop-steps">
              {loopSteps.map((step, index) => (
                <article className={`study-loop-step ${step.tone}`} key={step.title}>
                  <div className="study-loop-icon">{step.icon}</div>
                  <strong>{index + 1}. {step.title}</strong>
                  <p>{step.desc}</p>
                  {index < loopSteps.length - 1 ? <ArrowRight className="study-loop-arrow" size={22} aria-hidden="true" /> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="study-home-card study-advice-card">
            <header className="study-advice-head">
              <div>
                <span><BarChart3 size={15} /> AI</span>
                <h2>每日学习建议</h2>
              </div>
              <p>基于学习画像、薄弱知识点与近期行为，每日自动推断推荐</p>
              <span className="study-advice-status" aria-label="每日建议自动更新">
                <RefreshCw size={15} />
                每日更新
              </span>
            </header>

            <article className="study-topic-banner">
              <span><Link2 size={34} /></span>
              <div>
                <small>今日推荐主题</small>
                <strong>{adviceTopic}</strong>
                <em>薄弱知识点</em>
                <p>{adviceReason}</p>
              </div>
            </article>

            <div className="study-resource-strip">
              <strong>推荐外部资源</strong>
              <div>
                {resourceCards.map((card) => (
                  <article className={`study-resource-card ${card.tone}`} key={card.title}>
                    <span>{card.icon}</span>
                    <div>
                      <b>{card.title}</b>
                      <small>{card.type}</small>
                      <p>{card.desc}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <footer className="study-advice-actions">
              <button className="study-home-primary" type="button" onClick={() => navigate("/self-study/library")}>
                <BookOpen size={17} />
                查看资源
              </button>
              <button type="button" onClick={() => navigate("/self-study/knowledge-map")}>
                <Target size={17} />
                生成练习
              </button>
              <button type="button" onClick={() => navigate("/self-study/ai")}>
                <Sparkles size={17} />
                生成讲解
              </button>
            </footer>
          </section>
        </main>

        <aside className="study-home-card study-task-card">
          <header className="study-task-head">
            <div>
              <CalendarCheck2 size={20} />
              <h2>今日任务</h2>
            </div>
            <span>{Math.max(activeCount, 4)}/{tasks.length} 完成</span>
          </header>
          <div className="study-task-list">
            {tasks.map((task) => (
              <article className={task.state} key={task.title}>
                <span>{task.state === "done" ? <CheckCircle2 size={18} /> : null}</span>
                <strong>{task.title}</strong>
                <em>{taskStateLabel(task.state)}</em>
              </article>
            ))}
          </div>
          <button className="study-task-more" type="button" onClick={() => navigate("/learning-home")}>
            查看全部任务
            <ArrowRight size={17} />
          </button>
        </aside>
      </section>

      <section className="study-streak-card">
        <span><Sparkles size={18} /></span>
        <div>
          <strong>连续学习 7 天</strong>
          <p>很棒哦，保持学习节奏！当前整体掌握度 {progress}%</p>
        </div>
      </section>
    </div>
  );
}
