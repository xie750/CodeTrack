import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Check, ClipboardList, Code2, MonitorPlay } from "lucide-react";
import { api, apiCache, LearningContext, StudentProfile, StudentTaskCard } from "../api";
import type { TaskOpenTarget } from "../App";
import heroArt from "../assets/ui-home/hero-art.png";
import robotImg from "../assets/ui-home/robot-img.png";

type PageProps = {
  onNavigate: (page: string) => void;
  onOpenWorkspace: (target?: TaskOpenTarget | string) => void;
};

const resources = [
  { title: "Python 数据结构速查手册", meta: "PDF · 1.2MB", color: "red", label: "pdf" },
  { title: "常见算法图解（含代码）", meta: "PDF · 3.5MB", color: "blue", label: "pdf" },
  { title: "LeetCode 热题精选 100 题", meta: "PDF · 2.8MB", color: "black", label: "C" }
];

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
  const [context, setContext] = useState<LearningContext | null>(cachedContext);
  const [tasks, setTasks] = useState<StudentTaskCard[]>(cachedTasks ?? []);
  const [profile, setProfile] = useState<StudentProfile | null>(cachedProfile);
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "error">(cachedContext ? "ready" : "loading");
  const [loadMessage, setLoadMessage] = useState<string | null>(null);

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

      try {
        const data = await api.getLearningContext();
        if (!alive) return;
        setContext(data);

        const courseId = data.courses[0]?.course_id;
        const [taskResult, profileResult] = await Promise.allSettled([
          api.listStudentTasks(),
          courseId ? api.getStudentProfile(courseId) : Promise.resolve(null)
        ]);
        if (!alive) return;

        setTasks(taskResult.status === "fulfilled" ? taskResult.value : []);
        setProfile(profileResult.status === "fulfilled" ? profileResult.value : null);
        setLoadMessage(
          taskResult.status === "rejected" || profileResult.status === "rejected"
            ? "部分学习数据暂时没有读取成功，页面已按当前接口结果显示。"
            : null
        );
        setPageStatus("ready");
      } catch {
        if (!alive) return;
        if (!hasVisibleData) {
          setContext(null);
          setTasks([]);
          setProfile(null);
        }
        setLoadMessage("学习首页数据加载失败，请稍后刷新。");
        setPageStatus(hasVisibleData ? "ready" : "error");
      }
    }

    loadHomeData();
    return () => {
      alive = false;
    };
  }, []);

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

  const skills = profile
    ? [
        { name: "总体进度", value: profile.overview.overall_progress },
        { name: "任务完成", value: profile.overview.recent_task_completion },
        { name: "调试能力", value: 100 - profile.overview.compile_error_rate },
        { name: "逻辑稳定", value: 100 - profile.overview.logic_error_rate },
        { name: "知识掌握", value: profile.knowledge_states[0]?.mastery_score ?? 0 }
      ]
    : [];
  const primaryTask = tasks.find((task) => task.status !== "COMPLETED") ?? tasks[0];
  const courseName = context?.courses[0]?.course_name;
  const studentName = context?.student.name;
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
                  ? `${context.student.class_name} · ${courseName} 的任务和画像数据已接入。`
                  : loadMessage ?? "暂时没有读取到学习首页数据。"}
            </p>
            <button
              className="primary-btn"
              type="button"
              disabled={isLoading}
              onClick={() => (primaryTask ? onOpenWorkspace({
                taskId: primaryTask.task_id,
                assignmentId: primaryTask.assignment_id,
                workspaceType: primaryTask.workspace_type,
                taskType: primaryTask.task_type
              }) : onNavigate("/tasks"))}
            >
              {primaryTask ? "继续学习" : "查看任务"}
              <span>
                <ArrowRight size={17} />
              </span>
            </button>
          </div>
          <img className="hero-art" src={heroArt} alt="学生使用电脑学习" />
        </section>

        <section className="home-card home-section tasks-section">
          <div className="home-card-header">
            <h2>今日任务</h2>
            <button className="text-link" type="button" onClick={() => onNavigate("/tasks")}>
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

        <div className="analytics-grid">
          <section className="home-card analytics-card">
            <h2>学习进度</h2>
            {isLoading ? <div className="progress-layout skeleton-block" /> : profile ? <div className="progress-layout">
              <div className="donut">
                <div className="donut-center">
                  <strong>{profile.overview.overall_progress}%</strong>
                  <span>总体进度</span>
                </div>
              </div>
              <div className="legend-list">
                <span><i className="dot blue" />已完成&nbsp; {profile.overview.recent_task_completion}%</span>
                <span><i className="dot green" />进行中&nbsp; {tasks.filter((task) => task.status !== "COMPLETED").length} 个</span>
                <span><i className="dot gray" />薄弱点&nbsp; {profile.knowledge_states.filter((item) => item.state === "WEAK").length} 个</span>
              </div>
            </div> : <div className="empty-panel">暂无学习画像数据。</div>}
          </section>

          <section className="home-card analytics-card radar-card">
            <h2>能力雷达</h2>
            {isLoading ? <div className="radar-layout skeleton-block" /> : profile ? <div className="radar-layout">
              <svg viewBox="0 0 180 170" aria-label="能力雷达图">
                <polygon points="90,14 158,58 132,138 48,138 22,58" fill="#eef4ff" stroke="#cddcff" />
                <polygon points="90,42 130,68 116,120 62,120 48,68" fill="#d7e5ff" stroke="#adc6ff" />
                <polygon points="90,70 104,80 100,102 80,102 76,80" fill="#f8fbff" stroke="#d9e5ff" />
                <polygon points="90,27 135,63 118,124 62,124 43,65" fill="rgba(32, 111, 246, .2)" stroke="#176cf5" strokeWidth="3" />
                <circle cx="90" cy="27" r="4" fill="#176cf5" />
                <circle cx="135" cy="63" r="4" fill="#176cf5" />
                <circle cx="118" cy="124" r="4" fill="#176cf5" />
                <circle cx="62" cy="124" r="4" fill="#176cf5" />
                <circle cx="43" cy="65" r="4" fill="#176cf5" />
                <text x="90" y="11" textAnchor="middle">总体进度</text>
                <text x="164" y="63">任务完成</text>
                <text x="123" y="151">调试能力</text>
                <text x="18" y="151">逻辑稳定</text>
                <text x="0" y="66">知识掌握</text>
              </svg>
              <div className="skill-list">
                {skills.map((skill) => (
                  <div className="skill-row" key={skill.name}>
                    <span>{skill.name}</span>
                    <div className="skill-bar"><i style={{ width: `${skill.value}%` }} /></div>
                    <b>{skill.value}</b>
                  </div>
                ))}
                <p className="growth">画像来自 <b>{courseName}</b></p>
              </div>
            </div> : <div className="empty-panel">暂无能力维度数据。</div>}
          </section>
        </div>

        <section className="home-bottom-panels">
          <article className="home-card home-panel today-goal">
            <div className="home-card-header">
              <h2>今日目标</h2>
              <button className="text-link" type="button">编辑</button>
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
          </article>

          <article className="home-card home-panel">
            <div className="home-card-header">
              <h2>近期提醒</h2>
              <button className="text-link" type="button">查看全部</button>
            </div>
            <div className="reminder-list">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, index) => <div className="reminder-item skeleton-row" key={index} />)
              ) : reminders.length ? (
                reminders.map((item) => (
                <div className="reminder-item" key={item.desc}>
                  <div className={`reminder-icon ${item.color}`}>{item.icon}</div>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.desc}</span>
                    <em>{item.time}</em>
                  </div>
                </div>
              ))): (
                <div className="empty-panel compact">暂无近期提醒。</div>
              )}
            </div>
          </article>

          <article className="home-card home-panel ai-panel">
            <h2>AI 助学</h2>
            <img src={robotImg} alt="AI 助学机器人" />
            <strong>AI 助教小码</strong>
            <p>有问题随时问我，为你提供学习建议。</p>
            <button className="primary-btn" type="button" onClick={() => onNavigate("/ai-tutor")}>去提问</button>
          </article>

          <article className="home-card home-panel resource-panel">
            <div className="home-card-header">
              <h2>推荐资料</h2>
              <button className="text-link" type="button" onClick={() => onNavigate("/library")}>查看全部</button>
            </div>
            {resources.map((item) => (
              <div className="resource-item" key={item.title}>
                <div className={`file-icon ${item.color}`}>{item.label}</div>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.meta}</span>
                </div>
              </div>
            ))}
          </article>
        </section>

        <footer className="home-footer">© 2024 CodeTrack · 时代码点亮未来 <span>帮助中心</span><span>隐私政策</span><span>用户协议</span></footer>
      </section>
    </div>
  );
}
