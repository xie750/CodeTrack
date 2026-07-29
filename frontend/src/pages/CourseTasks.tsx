import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Filter,
  Flame,
  Grid2X2,
  List,
  Plus,
  SquareCode,
  UserRound
} from "lucide-react";
import { api, LearningContext, StudentTaskCard } from "../api";

type PageProps = {
  onOpenWorkspace: (taskId?: string) => void;
};

type TaskTab = "全部课程" | string;

function formatDeadline(value: string | null) {
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

function statusText(status: string) {
  const map: Record<string, string> = {
    NOT_STARTED: "未开始",
    IN_PROGRESS: "进行中",
    SUBMITTED: "已提交",
    NEEDS_REVISION: "待修正",
    COMPLETED: "已完成",
    EXPIRED: "已截止"
  };
  return map[status] ?? status;
}

function badgeColor(status: string) {
  if (status === "COMPLETED") return "green";
  if (status === "NEEDS_REVISION" || status === "EXPIRED") return "red";
  if (status === "IN_PROGRESS" || status === "SUBMITTED") return "purple";
  return "green";
}

function taskTypeText(type: string) {
  if (type === "CODING") return "编程任务";
  if (type === "QUIZ") return "练习任务";
  if (type === "EXAM") return "考核任务";
  return "课程任务";
}

export default function CourseTasks({ onOpenWorkspace }: PageProps) {
  const [context, setContext] = useState<LearningContext | null>(null);
  const [selectedTab, setSelectedTab] = useState<TaskTab>("全部课程");
  const [tasks, setTasks] = useState<StudentTaskCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .getLearningContext()
      .then((data) => {
        if (!alive) return;
        setContext(data);
      })
      .catch(() => {
        if (!alive) return;
        setError("班级课程数据加载失败，当前显示为空状态。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const courseId = context?.courses.find((course) => course.course_name === selectedTab)?.course_id;
    setLoading(true);
    setError(null);
    api
      .listStudentTasks(courseId)
      .then((data) => {
        if (alive) setTasks(data);
      })
      .catch(() => {
        if (!alive) return;
        setTasks([]);
        setError("任务数据加载失败，请稍后刷新。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [context, selectedTab]);

  const courseTabs = useMemo(() => ["全部课程", ...(context?.courses.map((course) => course.course_name) ?? [])], [context]);
  const primaryTaskId = tasks.find((task) => task.status !== "COMPLETED")?.task_id ?? tasks[0]?.task_id;
  const inProgress = tasks.filter((task) => ["IN_PROGRESS", "SUBMITTED", "NEEDS_REVISION"].includes(task.status)).length;
  const completed = tasks.filter((task) => task.status === "COMPLETED").length;
  const dueSoon = tasks.filter((task) => task.deadline).length;
  const goalRate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const currentCourse = selectedTab === "全部课程" ? null : context?.courses.find((course) => course.course_name === selectedTab);

  const stats = [
    { title: "班级任务总数", value: String(tasks.length), sub: currentCourse?.course_name ?? "全部课程汇总", icon: <FileText size={28} />, color: "blue" },
    { title: "进行中任务", value: String(inProgress), sub: loading ? "正在刷新" : "按课程实时更新", icon: <BellRing size={28} />, color: "orange" },
    { title: "已完成任务", value: String(completed), sub: "完成后同步画像", icon: <CheckCircle2 size={28} />, color: "green" },
    { title: "本周截止任务", value: String(dueSoon), sub: "来自教师下发", icon: <CalendarDays size={28} />, color: "indigo" }
  ];

  return (
    <div className="class-task-page">
      <header className="class-task-head">
        <div className="class-title-row">
          <h1>班级任务</h1>
          <button className="class-select" type="button">
            {context?.student.class_name ?? "软件工程 1 班"} <ChevronDown size={16} />
          </button>
          <button className="class-ghost" type="button"><Plus size={17} /> 模拟登录已绑定</button>
        </div>
        <div className="class-title-row">
          <div className="view-switch">
            <button type="button"><List size={17} /> 列表视图</button>
            <button className="active" type="button"><Grid2X2 size={17} /> 卡片视图</button>
          </div>
          <button className="class-primary" type="button" onClick={() => onOpenWorkspace(primaryTaskId)}>
            <SquareCode size={17} /> 进入编程模式
          </button>
        </div>
      </header>

      <div className="class-task-body">
        <section className="class-task-main">
          <section className="class-stats">
            {stats.map((stat) => (
              <article className="class-card class-stat" key={stat.title}>
                <span className={stat.color}>{stat.icon}</span>
                <p>{stat.title}</p>
                <strong>{stat.value}<small> 个</small></strong>
                <em>{stat.sub}</em>
              </article>
            ))}
          </section>

          {error ? <p className="class-data-message">{error}</p> : null}

          <div className="class-filters">
            <div className="class-tabs">
              {courseTabs.map((tab) => (
                <button className={selectedTab === tab ? "active" : ""} type="button" key={tab} onClick={() => setSelectedTab(tab)}>
                  {tab}
                </button>
              ))}
            </div>
            <div className="class-filter-actions">
              <button type="button">最新发布 <ChevronDown size={15} /></button>
              <button type="button">筛选 <Filter size={15} /></button>
            </div>
          </div>

          <section className="class-task-grid">
            {tasks.map((task) => {
              const progress = Math.round((task.passed_count / Math.max(task.total_required_count, 1)) * 100);
              const hot = task.status === "IN_PROGRESS" || task.status === "NEEDS_REVISION";
              return (
                <article className={`class-card class-task-card ${hot ? "highlight" : ""}`} key={task.assignment_id}>
                  {hot ? <Flame className="hot-icon" size={21} fill="currentColor" /> : null}
                  <span className={`class-badge ${badgeColor(task.status)}`}>{statusText(task.status)}</span>
                  <h2>{task.title}</h2>
                  <div className="class-tag-row">
                    {[taskTypeText(task.task_type), ...task.knowledge_points].slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <p>{task.latest_summary || `${task.course_name} 的教师下发任务。`}</p>
                  <div className="class-meta">
                    <span><CalendarDays size={14} /> 截止时间：{formatDeadline(task.deadline)}</span>
                    <span><UserRound size={14} /> 发布老师：{task.teacher_name}</span>
                  </div>
                  <div className="class-task-bottom">
                    <div>
                      <div className="class-progress-meta">
                        <span>进度</span><b>{progress}% <small>({task.passed_count}/{task.total_required_count})</small></b>
                      </div>
                      <div className="class-progress"><i style={{ width: `${Math.max(6, progress)}%` }} /></div>
                    </div>
                    <button className={hot ? "primary" : ""} type="button" onClick={() => onOpenWorkspace(task.task_id)}>进入任务</button>
                  </div>
                </article>
              );
            })}

            {!loading && tasks.length === 0 ? (
              <article className="class-card class-task-card">
                <span className="class-badge green">暂无任务</span>
                <h2>{selectedTab} 当前没有下发任务</h2>
                <p>这个结果来自班级、课程、教师下发任务之间的数据关系。切换其他课程后，任务列表会跟着变化。</p>
              </article>
            ) : null}
          </section>
        </section>

        <aside className="class-task-side">
          <section className="class-card sidecard">
            <h2>今日目标</h2>
            <div className="goal-top">
              <div><span>目标进度</span><strong>{completed}/{Math.max(tasks.length, 1)} <small>个任务</small></strong></div>
              <div className="class-ring"><b>{goalRate}%</b></div>
            </div>
            <div className="class-side-list">
              <p className={completed > 0 ? "done" : ""}><Check size={14} /> 完成课程任务 <span>{completed}/{tasks.length}</span></p>
              <p className={inProgress > 0 ? "done" : ""}><Check size={14} /> 跟进进行中任务 <span>{inProgress}</span></p>
              <p><i /> 复盘薄弱知识点 <span>{currentCourse?.unfinished_count ?? 0}</span></p>
            </div>
            <a href="#">查看全部目标</a>
          </section>

          <section className="class-card sidecard">
            <h2>任务提醒</h2>
            <div className="remind-list">
              {tasks.slice(0, 3).map((task, index) => (
                <p key={task.assignment_id}>
                  <span className={index === 0 ? "red" : index === 1 ? "orange" : "blue"} />
                  <strong>{task.title}</strong>
                  <em>{formatDeadline(task.deadline)} 截止</em>
                </p>
              ))}
              {tasks.length === 0 ? <p><span className="blue" /><strong>暂无提醒</strong><em>等待教师下发任务</em></p> : null}
            </div>
            <a href="#">查看全部提醒</a>
          </section>
        </aside>
      </div>
    </div>
  );
}
