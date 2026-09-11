import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  Circle,
  ClipboardList,
  Database,
  FileText,
  Link2,
  Loader2,
  MonitorPlay,
  PenLine,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  TrendingUp
} from "lucide-react";
import { api, apiCache, StudentDailyTask, StudentDailyTaskCenter, StudentProfile } from "../api";
import { StudentInlineNotice, studentErrorDetail, studentErrorMessage } from "../components/StudentState";
import selfStudyHeroArt from "../assets/self-study/self-study-ai-hero-wide.jpg";

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

function localTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function SelfStudy() {
  const navigate = useNavigate();
  const todayKey = localTodayKey();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [dailyTasks, setDailyTasks] = useState<StudentDailyTaskCenter | null>(() => apiCache.peekStudentDailyTasks(todayKey));
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileDetail, setProfileDetail] = useState<string | null>(null);
  const [dailyTaskError, setDailyTaskError] = useState<string | null>(null);
  const [dailyTaskBusyId, setDailyTaskBusyId] = useState<string | null>(null);
  const [dailyTaskCreating, setDailyTaskCreating] = useState(false);
  const [newDailyTaskTitle, setNewDailyTaskTitle] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setProfileMessage(null);
    setProfileDetail(null);
    setDailyTaskError(null);
    api.getLearningContext()
      .then((context) => {
        const courseId = context.courses[0]?.course_id;
        return Promise.all([
          api.getStudentProfile(courseId),
          api.listStudentDailyTasks(todayKey)
        ]);
      })
      .then(([profileData, dailyTaskData]) => {
        if (!alive) return;
        if (profileData) setProfile(profileData);
        setDailyTasks(dailyTaskData);
      })
      .catch((err) => {
        if (!alive) return;
        setProfile(null);
        setProfileMessage(studentErrorMessage(err, "学习画像暂未同步，当前使用默认自学建议。"));
        setProfileDetail(studentErrorDetail(err));
        setDailyTaskError(studentErrorMessage(err, "今日任务暂未同步。"));
      });
    return () => {
      alive = false;
    };
  }, [reloadKey, todayKey]);

  const weakPoint = profile?.knowledge_states.find((item) => item.state === "WEAK") ?? profile?.knowledge_states[0];
  const progress = clamp(profile?.overview.overall_progress ?? 0);
  const dailyTaskItems = dailyTasks?.items ?? [];
  const dailyCompleted = dailyTasks?.summary.completed ?? dailyTaskItems.filter((task) => task.completed).length;
  const dailyTotal = dailyTasks?.summary.total ?? dailyTaskItems.length;
  const adviceTopic = weakPoint?.knowledge_point ?? "自主学习起点";
  const adviceReason = useMemo(() => {
    if (weakPoint?.last_evidence) return weakPoint.last_evidence;
    return profile?.overview.recommendation ?? "当前账号还没有足够学习证据，建议先生成一份学习资料、创建自学图谱节点或完成一次科研实践记录。";
  }, [profile, weakPoint]);

  function updateDailyState(items: StudentDailyTask[], taskDate = todayKey) {
    const completed = items.filter((item) => item.completed).length;
    setDailyTasks({
      task_date: taskDate,
      summary: {
        total: items.length,
        completed,
        pending: items.length - completed
      },
      items
    });
  }

  async function addDailyTask() {
    const title = newDailyTaskTitle.trim();
    if (!title || dailyTaskCreating) return;
    setDailyTaskCreating(true);
    setDailyTaskError(null);
    try {
      const created = await api.createStudentDailyTask(title, todayKey);
      updateDailyState([...(dailyTasks?.items ?? []), created], created.task_date);
      setNewDailyTaskTitle("");
    } catch (err) {
      setDailyTaskError(studentErrorMessage(err, "今日任务新增失败，请稍后重试。"));
    } finally {
      setDailyTaskCreating(false);
    }
  }

  async function toggleDailyTask(task: StudentDailyTask) {
    if (dailyTaskBusyId) return;
    setDailyTaskBusyId(task.id);
    setDailyTaskError(null);
    try {
      const updated = await api.updateStudentDailyTask(task.id, { completed: !task.completed });
      updateDailyState((dailyTasks?.items ?? []).map((item) => (item.id === updated.id ? updated : item)), updated.task_date);
    } catch (err) {
      setDailyTaskError(studentErrorMessage(err, "今日任务状态更新失败，请稍后重试。"));
    } finally {
      setDailyTaskBusyId(null);
    }
  }

  async function deleteDailyTask(task: StudentDailyTask) {
    if (dailyTaskBusyId) return;
    setDailyTaskBusyId(task.id);
    setDailyTaskError(null);
    try {
      await api.deleteStudentDailyTask(task.id);
      updateDailyState((dailyTasks?.items ?? []).filter((item) => item.id !== task.id), dailyTasks?.task_date ?? todayKey);
    } catch (err) {
      setDailyTaskError(studentErrorMessage(err, "今日任务删除失败，请稍后重试。"));
    } finally {
      setDailyTaskBusyId(null);
    }
  }

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
              <button type="button" onClick={() => navigate("/self-study/classroom")}>
                <MonitorPlay size={17} />
                AI讲解课堂
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
            <span>{dailyTotal ? `${dailyCompleted}/${dailyTotal} 完成` : "未添加"}</span>
          </header>
          <div className="study-task-composer">
            <input
              value={newDailyTaskTitle}
              maxLength={160}
              onChange={(event) => setNewDailyTaskTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addDailyTask();
              }}
              placeholder="添加今天要完成的任务"
            />
            <button type="button" disabled={dailyTaskCreating || !newDailyTaskTitle.trim()} onClick={() => void addDailyTask()}>
              {dailyTaskCreating ? <Loader2 size={16} className="study-spin-icon" /> : <Plus size={16} />}
            </button>
          </div>
          {dailyTaskError ? <p className="study-task-error">{dailyTaskError}</p> : null}
          <div className="study-task-list personal">
            {dailyTaskItems.length ? dailyTaskItems.map((task) => (
              <article className={task.completed ? "done" : "pending"} key={task.id}>
                <button type="button" disabled={dailyTaskBusyId === task.id} onClick={() => void toggleDailyTask(task)} aria-label={task.completed ? "标记为未完成" : "标记为已完成"}>
                  {dailyTaskBusyId === task.id ? <Loader2 size={17} className="study-spin-icon" /> : task.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>
                <strong>{task.title}</strong>
                <em>{task.completed ? "已完成" : "待完成"}</em>
                <button type="button" disabled={dailyTaskBusyId === task.id} onClick={() => void deleteDailyTask(task)} aria-label={`删除 ${task.title}`} title="删除任务">
                  <Trash2 size={16} />
                </button>
              </article>
            )) : (
              <div className="study-task-empty">
                <ClipboardList size={26} />
                <strong>今天还没有自定义任务</strong>
                <p>在上方添加自己的学习安排。</p>
              </div>
            )}
          </div>
          <button className="study-task-more" type="button" onClick={() => navigate("/self-study/library")}>
            前往资源中心
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
