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
import { api, apiCache, LearningContext, StudentTaskCard } from "../api";
import type { TaskOpenTarget } from "../App";

type PageProps = {
  onOpenWorkspace: (target?: TaskOpenTarget | string) => void;
};

type TaskTab = "全部课程" | string;

type TaskView = "card" | "list";

type TaskViewItem = {
  task: StudentTaskCard;
  progress: number;
  hot: boolean;
  status: string;
  badge: string;
  tags: string[];
  summary: string;
  actionLabel: string;
};

type TaskItemProps = {
  item: TaskViewItem;
  onOpen: () => void;
};

const TASK_VIEW_KEY = "codetrack.taskView";

function readTaskView(): TaskView {
  if (typeof window === "undefined") return "card";
  try {
    return window.localStorage.getItem(TASK_VIEW_KEY) === "list" ? "list" : "card";
  } catch {
    return "card";
  }
}

function writeTaskView(view: TaskView) {
  try {
    window.localStorage.setItem(TASK_VIEW_KEY, view);
  } catch {
    /* 隐私模式下写入会抛错，忽略即可，视图仍在本次会话内生效 */
  }
}

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
  const cachedContext = apiCache.peekLearningContext();
  const cachedTasks = apiCache.peekStudentTasks();
  const [context, setContext] = useState<LearningContext | null>(cachedContext);
  const [selectedTab, setSelectedTab] = useState<TaskTab>("全部课程");
  const [tasks, setTasks] = useState<StudentTaskCard[]>(cachedTasks ?? []);
  const [loadingContext, setLoadingContext] = useState(!cachedContext);
  const [loadingTasks, setLoadingTasks] = useState(!cachedTasks);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TaskView>(readTaskView);

  useEffect(() => {
    writeTaskView(view);
  }, [view]);

  useEffect(() => {
    let alive = true;
    if (!context) {
      setLoadingContext(true);
      setContext(null);
      setSelectedTab("全部课程");
    }
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
        if (alive) setLoadingContext(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const courseId = context?.courses.find((course) => course.course_name === selectedTab)?.course_id;
    const cachedTaskData = apiCache.peekStudentTasks(courseId);
    setLoadingTasks(!cachedTaskData);
    setError(null);
    setTasks(cachedTaskData ?? []);
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
        if (alive) setLoadingTasks(false);
      });
    return () => {
      alive = false;
    };
  }, [context, selectedTab]);

  const courseTabs = useMemo(() => ["全部课程", ...(context?.courses.map((course) => course.course_name) ?? [])], [context]);
  const loading = loadingContext || loadingTasks;
  const primaryTask = tasks.find((task) => task.status !== "COMPLETED") ?? tasks[0];
  const inProgress = tasks.filter((task) => ["IN_PROGRESS", "SUBMITTED", "NEEDS_REVISION"].includes(task.status)).length;
  const completed = tasks.filter((task) => task.status === "COMPLETED").length;
  const dueSoon = tasks.filter((task) => task.deadline).length;
  const goalRate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const currentCourse = selectedTab === "全部课程" ? null : context?.courses.find((course) => course.course_name === selectedTab);

  const taskItems = useMemo<TaskViewItem[]>(
    () =>
      tasks.map((task) => ({
        task,
        progress: Math.round((task.passed_count / Math.max(task.total_required_count, 1)) * 100),
        hot: task.status === "IN_PROGRESS" || task.status === "NEEDS_REVISION",
        status: statusText(task.status),
        badge: badgeColor(task.status),
        tags: [taskTypeText(task.task_type), ...task.knowledge_points].slice(0, 4),
        summary: task.latest_summary || `${task.course_name} 的教师下发任务。`,
        actionLabel: task.workspace_type === "QUESTION_SET" ? "开始做题" : "进入编程"
      })),
    [tasks]
  );

  function openTask(task: StudentTaskCard) {
    onOpenWorkspace({
      taskId: task.task_id,
      assignmentId: task.assignment_id,
      workspaceType: task.workspace_type,
      taskType: task.task_type
    });
  }

  const stats = [
    { title: "班级任务总数", value: String(tasks.length), sub: currentCourse?.course_name ?? "全部课程汇总", icon: <FileText size={28} />, color: "blue" },
    { title: "进行中任务", value: loading ? "..." : String(inProgress), sub: loading ? "正在读取当前课程" : "按课程实时更新", icon: <BellRing size={28} />, color: "orange" },
    { title: "已完成任务", value: String(completed), sub: "完成后同步画像", icon: <CheckCircle2 size={28} />, color: "green" },
    { title: "本周截止任务", value: String(dueSoon), sub: "来自教师下发", icon: <CalendarDays size={28} />, color: "indigo" }
  ];

  return (
    <div className="class-task-page">
      <header className="class-task-head">
        <div className="class-title-row">
          <h1>班级任务</h1>
          <button className="class-select" type="button">
            {loadingContext ? "正在加载班级" : context?.student.class_name ?? "暂无班级"} <ChevronDown size={16} />
          </button>
          <button className="class-ghost" type="button"><Plus size={17} /> 模拟登录已绑定</button>
        </div>
        <div className="class-title-row">
          <div className="view-switch" role="group" aria-label="任务视图切换">
            <button
              type="button"
              className={view === "list" ? "active" : ""}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={17} /> 列表视图
            </button>
            <button
              type="button"
              className={view === "card" ? "active" : ""}
              aria-pressed={view === "card"}
              onClick={() => setView("card")}
            >
              <Grid2X2 size={17} /> 卡片视图
            </button>
          </div>
          <button
            className="class-primary"
            type="button"
            disabled={!primaryTask || loading}
            onClick={() => primaryTask && onOpenWorkspace({
              taskId: primaryTask.task_id,
              assignmentId: primaryTask.assignment_id,
              workspaceType: primaryTask.workspace_type,
              taskType: primaryTask.task_type
            })}
          >
            <SquareCode size={17} /> 进入当前任务
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

          {!loading && taskItems.length === 0 ? (
            <div className="class-empty">
              <h2>{selectedTab} 当前没有下发任务</h2>
              <p>这个结果来自班级、课程、教师下发任务之间的数据关系。切换其他课程后，任务列表会跟着变化。</p>
            </div>
          ) : (
            <section className={view === "card" ? "class-task-grid" : "class-task-list"} aria-label="班级任务列表">
              {loading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <article
                      className={`class-card ${view === "card" ? "class-task-card" : "class-task-row"} skeleton-block`}
                      key={index}
                    />
                  ))
                : taskItems.map((item) =>
                    view === "card" ? (
                      <TaskCard key={item.task.assignment_id} item={item} onOpen={() => openTask(item.task)} />
                    ) : (
                      <TaskRow key={item.task.assignment_id} item={item} onOpen={() => openTask(item.task)} />
                    )
                  )}
            </section>
          )}
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
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => <p className="skeleton-row" key={index} />)
              ) : tasks.slice(0, 3).map((task, index) => (
                <p key={task.assignment_id}>
                  <span className={index === 0 ? "red" : index === 1 ? "orange" : "blue"} />
                  <strong>{task.title}</strong>
                  <em>{formatDeadline(task.deadline)} 截止</em>
                </p>
              ))}
              {!loading && tasks.length === 0 ? <p><span className="blue" /><strong>暂无提醒</strong><em>等待教师下发任务</em></p> : null}
            </div>
            <a href="#">查看全部提醒</a>
          </section>
        </aside>
      </div>
    </div>
  );
}

function TaskCard({ item, onOpen }: TaskItemProps) {
  const { task } = item;
  return (
    <article className={`class-card class-task-card ${item.hot ? "highlight" : ""}`}>
      {item.hot ? <Flame className="hot-icon" size={21} fill="currentColor" /> : null}
      <span className={`class-badge ${item.badge}`}>{item.status}</span>
      <h2>{task.title}</h2>
      <div className="class-tag-row">
        {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <p>{item.summary}</p>
      <div className="class-meta">
        <span><CalendarDays size={14} /> 截止时间：{formatDeadline(task.deadline)}</span>
        <span><UserRound size={14} /> 发布老师：{task.teacher_name}</span>
      </div>
      <div className="class-task-bottom">
        <div>
          <div className="class-progress-meta">
            <span>进度</span><b>{item.progress}% <small>({task.passed_count}/{task.total_required_count})</small></b>
          </div>
          <div className="class-progress"><i style={{ width: `${Math.max(6, item.progress)}%` }} /></div>
        </div>
        <button className={item.hot ? "primary" : ""} type="button" onClick={onOpen}>
          {item.actionLabel}
        </button>
      </div>
    </article>
  );
}

function TaskRow({ item, onOpen }: TaskItemProps) {
  const { task } = item;
  return (
    <article className={`class-card class-task-row ${item.hot ? "highlight" : ""}`}>
      <span className={`class-badge ${item.badge}`}>{item.status}</span>
      <div className="class-row-main">
        <h2>
          <span className="class-row-title">{task.title}</span>
          {item.hot ? <Flame className="class-row-flame" size={15} fill="currentColor" /> : null}
        </h2>
        <div className="class-tag-row">
          {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </div>
      <div className="class-meta class-row-meta">
        <span><CalendarDays size={13} /> {formatDeadline(task.deadline)}</span>
        <span><UserRound size={13} /> {task.teacher_name}</span>
      </div>
      <div className="class-row-progress">
        <div className="class-progress-meta">
          <span>进度</span><b>{item.progress}% <small>({task.passed_count}/{task.total_required_count})</small></b>
        </div>
        <div className="class-progress"><i style={{ width: `${Math.max(6, item.progress)}%` }} /></div>
      </div>
      <button className={item.hot ? "primary" : ""} type="button" onClick={onOpen}>
        {item.actionLabel}
      </button>
    </article>
  );
}
