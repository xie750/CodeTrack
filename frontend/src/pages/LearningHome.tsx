import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Check, ClipboardList, Code2, MessageSquareText, MonitorPlay, Send, ShieldCheck } from "lucide-react";
import { api, apiCache, LearningContext, StudentInterventionCenter, StudentInterventionItem, StudentProfile, StudentTaskCard } from "../api";
import type { TaskOpenTarget } from "../App";
import heroArt from "../assets/ui-home/hero-art.png";
import robotImg from "../assets/ui-home/robot-img.png";
import { StudentInlineNotice, StudentState, studentErrorDetail, studentErrorMessage } from "../components/StudentState";
import { resolveCourseIdeologyInsight } from "../courseIdeology";

type PageProps = {
  onNavigate: (page: string) => void;
  onOpenWorkspace: (target?: TaskOpenTarget | string) => void;
};

function deadlineLabel(value: string | null) {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function taskProgress(task: StudentTaskCard) {
  return Math.round((task.passed_count / Math.max(task.total_required_count, 1)) * 100);
}

export default function LearningHome({ onNavigate, onOpenWorkspace }: PageProps) {
  const cachedContext = apiCache.peekLearningContext();
  const cachedCourseId = cachedContext?.courses[0]?.course_id;
  const cachedTasks = apiCache.peekStudentTasks();
  const cachedProfile = cachedCourseId ? apiCache.peekStudentProfile(cachedCourseId) : null;
  const cachedInterventions = apiCache.peekStudentInterventions();
  const [context, setContext] = useState<LearningContext | null>(cachedContext);
  const [tasks, setTasks] = useState<StudentTaskCard[]>(cachedTasks ?? []);
  const [profile, setProfile] = useState<StudentProfile | null>(cachedProfile);
  const [interventions, setInterventions] = useState<StudentInterventionCenter | null>(cachedInterventions);
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "error">(cachedContext ? "ready" : "loading");
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [loadDetail, setLoadDetail] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadHomeData() {
      const hasVisibleData = Boolean(context || tasks.length || profile);
      if (!hasVisibleData) {
        setPageStatus("loading");
        setContext(null);
        setTasks([]);
        setProfile(null);
      }
      setLoadMessage(null);
      setLoadDetail(null);

      try {
        const data = await api.getLearningContext();
        if (!alive) return;
        setContext(data);

        const courseId = data.courses[0]?.course_id;
        const [taskResult, profileResult, interventionResult] = await Promise.allSettled([
          api.listStudentTasks(),
          courseId ? api.getStudentProfile(courseId) : Promise.resolve(null),
          api.getStudentInterventions()
        ]);
        if (!alive) return;

        setTasks(taskResult.status === "fulfilled" ? taskResult.value : []);
        setProfile(profileResult.status === "fulfilled" ? profileResult.value : null);
        setInterventions(interventionResult.status === "fulfilled" ? interventionResult.value : cachedInterventions);
        setLoadMessage(
          taskResult.status === "rejected" || profileResult.status === "rejected" || interventionResult.status === "rejected"
            ? "部分学习数据暂时没有读取成功，页面已按当前接口结果显示。"
            : null
        );
        setLoadDetail(
          taskResult.status === "rejected"
            ? studentErrorDetail(taskResult.reason)
            : profileResult.status === "rejected"
              ? studentErrorDetail(profileResult.reason)
              : interventionResult.status === "rejected"
                ? studentErrorDetail(interventionResult.reason)
              : null
        );
        setPageStatus("ready");
      } catch (err) {
        if (!alive) return;
        if (!hasVisibleData) {
          setContext(null);
          setTasks([]);
          setProfile(null);
        }
        setLoadMessage(studentErrorMessage(err, "学习首页数据加载失败，请稍后刷新。"));
        setLoadDetail(studentErrorDetail(err));
        setPageStatus(hasVisibleData ? "ready" : "error");
      }
    }

    loadHomeData();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const teacherFollowUps = useMemo(() => interventions?.items.slice(0, 3) ?? [], [interventions]);

  function openIntervention(item: StudentInterventionItem) {
    if (item.task_id && item.assignment_id) {
      onOpenWorkspace({
        taskId: item.task_id,
        assignmentId: item.assignment_id,
        courseId: item.course_id,
        workspaceType: "QUESTION_SET",
        taskType: "QUIZ"
      });
      return;
    }
    if (item.type === "discussion") {
      setReplyingId(item.id);
      setReplyText("");
      return;
    }
    onNavigate("/self-study/ai");
  }

  async function submitInterventionReply(item: StudentInterventionItem) {
    const text = replyText.trim();
    if (!text) return;
    setReplyLoading(true);
    try {
      await api.replyStudentIntervention(item.id, text);
      const next = await api.getStudentInterventions();
      setInterventions(next);
      setReplyingId(null);
      setReplyText("");
    } finally {
      setReplyLoading(false);
    }
  }

  const todayTasks = useMemo(() => {
    return tasks.slice(0, 3).map((task, index) => ({
      title: task.title,
      type: task.task_type === "CODING" ? "编程任务" : "课程任务",
      deadline: deadlineLabel(task.deadline),
      progress: taskProgress(task),
      color: index === 0 ? "blue" : index === 1 ? "green" : "purple",
      icon: task.task_type === "CODING" ? <Code2 size={22} /> : <ClipboardList size={22} />,
      taskId: task.task_id,
      assignmentId: task.assignment_id,
      courseId: task.course_id,
      workspaceType: task.workspace_type,
      taskType: task.task_type
    }));
  }, [tasks]);

  const recommendations = useMemo(() => {
    const items = profile?.recommendations ?? [];
    return items.slice(0, 3).map((item, index) => ({
      label: index === 0 ? "画像建议" : "知识点复习",
      title: item.title,
      desc: item.reason,
      action: item.suggested_action || "去完成",
      color: index === 0 ? "blue" : index === 1 ? "green" : "purple"
    }));
  }, [profile]);

  const reminders = useMemo(() => {
    return tasks.slice(0, 3).map((task, index) => ({
      icon: index === 0 ? <ClipboardList size={20} /> : index === 1 ? <CalendarClock size={20} /> : <MonitorPlay size={20} />,
      title: "班级任务 截止",
      desc: task.title,
      time: `截止时间：${deadlineLabel(task.deadline)}`,
      color: index === 0 ? "orange" : index === 1 ? "blue" : "purple"
    }));
  }, [tasks]);

  const primaryTask = tasks.find((task) => task.status !== "COMPLETED") ?? tasks[0];
  const courseName = context?.courses[0]?.course_name;
  const studentName = context?.student.name;
  const ideologyInsight = useMemo(() => resolveCourseIdeologyInsight({
    courseName,
    taskTitle: primaryTask?.title,
    knowledgePoints: [
      ...(profile?.knowledge_states ?? []).slice(0, 3).map((item) => item.knowledge_point),
      ...(primaryTask ? [primaryTask.title] : [])
    ]
  }), [courseName, primaryTask, profile]);
  const isLoading = pageStatus === "loading";

  return (
    <div className="home-dashboard">
      <section className="home-main">
        <section className="home-card home-hero">
          <div className="hero-copy">
            <h1>早上好，{studentName ?? "同学"}！</h1>
            <p>
              {isLoading
                ? "正在读取你的课程任务和学习画像..."
                  : context && courseName
                  ? `${context.student.class_name} · ${courseName} 的课程任务和学习画像已接入。`
                  : loadMessage ?? "暂时没有读取到学习首页数据。"}
            </p>
            <button
              className="primary-btn"
              type="button"
              disabled={isLoading}
              onClick={() => (primaryTask ? onOpenWorkspace({
                taskId: primaryTask.task_id,
                assignmentId: primaryTask.assignment_id,
                courseId: primaryTask.course_id,
                workspaceType: primaryTask.workspace_type,
                taskType: primaryTask.task_type
              }) : onNavigate("/courses"))}
            >
              {primaryTask ? "继续学习" : "查看我的课程"}
              <span>
                <ArrowRight size={17} />
              </span>
            </button>
          </div>
          <img className="hero-art" src={heroArt} alt="学生使用电脑学习" />
        </section>

        {pageStatus === "error" ? (
          <StudentState
            kind="unavailable"
            title="学习首页数据暂不可用"
            description="当前没有读到课程任务、学习画像或推荐数据。请先确认后端服务已经启动，或稍后刷新重试。"
            detail={loadDetail ?? loadMessage}
            actions={[{ label: "重新加载", variant: "primary", onClick: () => setReloadKey((value) => value + 1) }]}
          />
        ) : loadMessage ? (
          <StudentInlineNotice
            kind="degraded"
            title="部分学习数据暂未同步"
            description={loadMessage}
            detail={loadDetail}
            actions={[{ label: "重试", variant: "primary", onClick: () => setReloadKey((value) => value + 1) }]}
          />
        ) : null}

        <section className="home-card home-section tasks-section">
          <div className="home-card-header">
            <h2>今日任务</h2>
            <button className="text-link" type="button" onClick={() => onNavigate("/courses")}>
              查看全部
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="task-list">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => <div className="task-row skeleton-row" key={index} />)
            ) : todayTasks.length ? (
              todayTasks.map((task, index) => (
              <article className="task-row" key={task.title}>
                <div className={`task-icon ${task.color}`}>{task.icon}</div>
                <div className="task-info">
                  <div className="task-title-line">
                    <strong>{task.title}</strong>
                    <span className={`type-tag ${task.color}`}>{task.type}</span>
                  </div>
                  <span>
                    截止：<b className={index === 0 ? "danger" : ""}>{task.deadline}</b>
                  </span>
                </div>
                <div className="task-progress">
                  <span>进度&nbsp; {task.progress}%</span>
                  <div className="mini-progress">
                    <i className={task.color} style={{ width: `${task.progress}%` }} />
                  </div>
                </div>
                <button
                  className="outline-btn"
                  type="button"
                  onClick={() => onOpenWorkspace({
                    taskId: task.taskId,
                    assignmentId: task.assignmentId,
                    courseId: task.courseId,
                    workspaceType: task.workspaceType,
                    taskType: task.taskType
                  })}
                >
                  继续学习
                </button>
              </article>
              ))
            ) : (
              <div className="empty-panel">当前没有从接口读取到今日任务。切换到课程任务页后会按班级任务数据展示。</div>
            )}
          </div>
        </section>

        <section className="home-card home-section teacher-follow-section">
          <div className="home-card-header">
            <h2>教师跟进</h2>
            {interventions ? <span className="teacher-follow-count">{interventions.summary.unread} 项待响应</span> : null}
          </div>
          <div className="teacher-follow-list">
            {isLoading ? (
              Array.from({ length: 2 }).map((_, index) => <div className="teacher-follow-card skeleton-block" key={index} />)
            ) : teacherFollowUps.length ? (
              teacherFollowUps.map((item) => (
                <article className={`teacher-follow-card ${item.tone}`} key={item.id}>
                  <div className="teacher-follow-main">
                    <span className="teacher-follow-icon"><MessageSquareText size={18} /></span>
                    <div>
                      <div className="teacher-follow-title">
                        <strong>{item.title}</strong>
                        {item.knowledge_point ? <em>{item.knowledge_point}</em> : null}
                      </div>
                      <p>{item.content}</p>
                      <small>{item.course_name} · {item.teacher_name || "授课教师"} · {deadlineLabel(item.created_at)}</small>
                    </div>
                  </div>
                  {replyingId === item.id ? (
                    <div className="teacher-follow-reply">
                      <textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder="写下你的理解、疑问或完成计划"
                      />
                      <button type="button" disabled={replyLoading || !replyText.trim()} onClick={() => void submitInterventionReply(item)}>
                        <Send size={14} />
                        提交回应
                      </button>
                    </div>
                  ) : (
                    <button className="outline-btn" type="button" onClick={() => openIntervention(item)}>
                      {item.responded ? "已回应" : item.action_label}
                    </button>
                  )}
                </article>
              ))
            ) : (
              <div className="empty-panel wide">暂无教师跟进。老师从学情诊断发起干预后，会在这里形成提醒、反馈、讨论或专项练习。</div>
            )}
          </div>
        </section>

        <section className="home-card home-section">
          <div className="home-card-header">
            <h2>推荐学习</h2>
          </div>
          <div className="recommendations">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => <div className="recommendation skeleton-block" key={index} />)
            ) : recommendations.length ? (
              recommendations.map((item) => (
              <article className="recommendation" key={item.title}>
                <span className={`recommend-tag ${item.color}`}>{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
                <button className="outline-btn" type="button" onClick={() => (item.color === "blue" && primaryTask ? onOpenWorkspace({
                  taskId: primaryTask.task_id,
                  assignmentId: primaryTask.assignment_id,
                  courseId: primaryTask.course_id,
                  workspaceType: primaryTask.workspace_type,
                  taskType: primaryTask.task_type
                }) : onNavigate("/self-study"))}>
                  {item.action}
                </button>
              </article>
              ))
            ) : (
              <div className="empty-panel wide">暂无个性化推荐。完成任务或保存资料后，系统会基于画像生成下一步建议。</div>
            )}
          </div>
        </section>
      </section>

      <aside className="home-aside">
        <section className="home-card right-card today-goal">
          <div className="home-card-header">
            <h2>今日目标</h2>
          </div>
          {isLoading ? <div className="side-skeleton skeleton-block" /> : profile ? <>
          <div className="goal-ring">
            <div>
              <strong>{profile.overview.recent_task_completion}%</strong>
              <span>已完成</span>
            </div>
          </div>
          <div className="goal-list">
            <span className="done"><Check size={14} />完成 1 个课程任务</span>
            <span className="done"><Check size={14} />复盘 1 个薄弱点</span>
            <span><i />保存 1 份学习产物</span>
          </div>
          </> : <div className="empty-panel">暂无今日目标数据。</div>}
        </section>

        <section className="home-card right-card home-ideology-card">
          <div className="home-card-header">
            <h2>今日课程思政提示</h2>
            <span><ShieldCheck size={15} /> {ideologyInsight.dimension}</span>
          </div>
          <strong>{ideologyInsight.title}</strong>
          <p>{ideologyInsight.summary}</p>
          <em>{ideologyInsight.reflection}</em>
        </section>

        <section className="home-card right-card">
          <div className="home-card-header">
            <h2>近期提醒</h2>
          </div>
          <div className="reminder-list">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => <div className="reminder-item skeleton-row" key={index} />)
            ) : reminders.length ? (
              reminders.map((item) => (
              <article className="reminder-item" key={item.desc}>
                <div className={`reminder-icon ${item.color}`}>{item.icon}</div>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.desc}</span>
                  <em>{item.time}</em>
                </div>
              </article>
              ))
            ) : (
              <div className="empty-panel compact">暂无近期提醒。</div>
            )}
          </div>
        </section>

        <section className="home-card right-card ai-card">
          <h2>AI 助学</h2>
          <img src={robotImg} alt="AI 助学机器人" />
          <strong>AI 助教小码</strong>
          <p>有问题随时问我，为你提供学习建议。</p>
          <button className="primary-btn" type="button" onClick={() => onNavigate("/self-study/ai")}>去提问</button>
        </section>
      </aside>
    </div>
  );
}
