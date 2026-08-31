import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Clock3,
  Code2,
  FileQuestion,
  FileText,
  GraduationCap,
  MapPin,
  Megaphone,
  Network,
  PencilLine,
  PlayCircle,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";
import { api, apiCache, LearningContext, StudentProfile, StudentTaskCard } from "../api";
import type { TaskOpenTarget } from "../App";
import StudentRouteBreadcrumb from "../components/StudentRouteBreadcrumb";
import { StudentInlineNotice, studentErrorDetail, studentErrorMessage } from "../components/StudentState";
import CourseTasks from "./CourseTasks";
import LearningProfile from "./LearningProfile";
import LearningLibrary from "./LearningLibrary";
import StudentKnowledgeMap from "./StudentKnowledgeMap";

type CourseHubProps = {
  onOpenWorkspace: (target?: TaskOpenTarget | string) => void;
};

const courseTabs = [
  { path: "", label: "课程工作台", icon: <BookOpen size={18} /> },
  { path: "tasks", label: "课程任务", icon: <ClipboardList size={18} /> },
  { path: "favorites", label: "收藏夹", icon: <BookMarked size={18} /> },
  { path: "profile", label: "学习画像", icon: <ChartNoAxesColumnIncreasing size={18} /> },
  { path: "knowledge-map", label: "知识图谱", icon: <Network size={18} /> }
];

function coursePath(courseId: string, path = "") {
  const base = `/courses/${encodeURIComponent(courseId)}`;
  return path ? `${base}/${path}` : base;
}

function progressOf(task: StudentTaskCard) {
  return Math.round((task.passed_count / Math.max(task.total_required_count, 1)) * 100);
}

function statusLabel(status: string) {
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

function taskTypeLabel(task: StudentTaskCard) {
  if (task.workspace_type === "QUESTION_SET" || task.task_type === "QUIZ" || task.task_type === "EXAM") return "测验";
  if (task.task_type === "RESOURCE") return "学习资源";
  return task.workspace_type === "PROGRAMMING" ? "作业" : "任务";
}

function taskIcon(task: StudentTaskCard) {
  if (task.workspace_type === "QUESTION_SET" || task.task_type === "QUIZ" || task.task_type === "EXAM") return <FileQuestion size={16} />;
  if (task.task_type === "RESOURCE") return <PlayCircle size={16} />;
  return task.workspace_type === "PROGRAMMING" ? <Code2 size={16} /> : <FileText size={16} />;
}

function taskTone(task: StudentTaskCard, index: number) {
  if (task.status === "COMPLETED") return "green";
  if (task.workspace_type === "QUESTION_SET" || task.task_type === "QUIZ" || task.task_type === "EXAM") return "orange";
  if (task.task_type === "RESOURCE") return "cyan";
  return index % 2 === 0 ? "blue" : "purple";
}

function deadlineLabel(value: string | null) {
  if (!value) return "暂无截止";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function CourseHub({ onOpenWorkspace }: CourseHubProps) {
  const { courseId } = useParams<{ courseId: string }>();
  if (!courseId) return <Navigate to="/courses" replace />;

  return (
    <CourseHubShell courseId={courseId}>
      <Routes>
        <Route index element={<CourseWorkbench courseId={courseId} onOpenWorkspace={onOpenWorkspace} />} />
        <Route path="tasks" element={<CourseTasks courseId={courseId} embedded onOpenWorkspace={onOpenWorkspace} />} />
        <Route path="favorites" element={<LearningLibrary initialCourseId={courseId} scope="course" />} />
        <Route path="profile" element={<LearningProfile initialCourseId={courseId} />} />
        <Route path="knowledge-map" element={<StudentKnowledgeMap scope="course" />} />
        <Route path="*" element={<Navigate to={coursePath(courseId)} replace />} />
      </Routes>
    </CourseHubShell>
  );
}

function CourseHubShell({ courseId, children }: { courseId: string; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [context, setContext] = useState<LearningContext | null>(apiCache.peekLearningContext());
  const course = context?.courses.find((item) => item.course_id === courseId);
  const basePath = coursePath(courseId);
  const relativePath = location.pathname === basePath ? "" : location.pathname.slice(`${basePath}/`.length);
  const activeTab = courseTabs.find((item) => item.path === relativePath) ?? courseTabs[0];

  useEffect(() => {
    let alive = true;
    api.getLearningContext().then((data) => {
      if (alive) setContext(data);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={`student-work-window${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="student-window-sidebar">
        <button className="student-window-back" type="button" onClick={() => navigate("/")} title="返回入口">
          <ArrowLeft size={17} />
          <span>返回入口</span>
        </button>
        <div className="student-window-title">
          <span className="teacher-soft-icon blue"><GraduationCap size={22} /></span>
          <div>
            <strong>{course?.course_name ?? "课程工作台"}</strong>
            <small>授课教师：{course?.teacher_name ?? "待同步"} · {context?.student.class_name ?? "我的班级"}</small>
          </div>
        </div>
        <nav className="student-window-nav" aria-label="课程内导航">
          {courseTabs.map((item) => (
            <NavLink key={item.label} to={coursePath(courseId, item.path)} end={item.path === ""} title={item.label}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          className="student-window-rail-toggle"
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          aria-label={sidebarCollapsed ? "展开课程导航" : "收起课程导航"}
          title={sidebarCollapsed ? "展开导航" : "收起导航"}
        >
          <span className="student-window-grip" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </aside>
      <main className="student-window-content">
        <StudentRouteBreadcrumb
          items={[
            { label: "学习入口", to: "/" },
            { label: "我的课程", to: "/" },
            { label: course?.course_name ?? "课程工作台", to: coursePath(courseId) },
            { label: activeTab.label }
          ]}
        />
        {children}
      </main>
    </div>
  );
}

function CourseWorkbench({ courseId, onOpenWorkspace }: { courseId: string; onOpenWorkspace: (target?: TaskOpenTarget | string) => void }) {
  const navigate = useNavigate();
  const cachedContext = apiCache.peekLearningContext();
  const cachedTasks = apiCache.peekStudentTasks(courseId);
  const cachedProfile = apiCache.peekStudentProfile(courseId);
  const [context, setContext] = useState<LearningContext | null>(cachedContext);
  const [tasks, setTasks] = useState<StudentTaskCard[]>(cachedTasks ?? []);
  const [profile, setProfile] = useState<StudentProfile | null>(cachedProfile);
  const [loading, setLoading] = useState(!cachedContext || !cachedTasks);
  const [message, setMessage] = useState<string | null>(null);
  const [messageDetail, setMessageDetail] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;

    async function loadCourse() {
      setLoading(!context || !tasks.length);
      setMessage(null);
      setMessageDetail(null);
      try {
        const data = await api.getLearningContext();
        const [taskData, profileData] = await Promise.all([
          api.listStudentTasks(courseId),
          api.getStudentProfile(courseId).catch(() => null)
        ]);
        if (!alive) return;
        setContext(data);
        setTasks(taskData);
        setProfile(profileData);
      } catch (err) {
        if (!alive) return;
        setMessage(studentErrorMessage(err, "课程工作台数据加载失败，请稍后刷新。"));
        setMessageDetail(studentErrorDetail(err));
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadCourse();
    return () => {
      alive = false;
    };
  }, [courseId, reloadKey]);

  const course = context?.courses.find((item) => item.course_id === courseId);
  const activeTask = tasks.find((task) => task.status !== "COMPLETED") ?? tasks[0];
  const completed = tasks.filter((task) => task.status === "COMPLETED").length;
  const inProgress = tasks.filter((task) => ["IN_PROGRESS", "SUBMITTED", "NEEDS_REVISION"].includes(task.status)).length;
  const pending = tasks.filter((task) => task.status !== "COMPLETED").length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const knowledgePoints = Array.from(new Set(tasks.flatMap((task) => task.knowledge_points)));
  const learnedPoints = profile?.knowledge_states.filter((item) => item.state === "MASTERED").length ?? completed;
  const assignmentCount = tasks.filter((task) => task.workspace_type === "PROGRAMMING" || task.task_type === "QUIZ" || task.task_type === "EXAM").length || tasks.length;
  const score = profile
    ? clampPercent((profile.overview.overall_progress + profile.overview.recent_task_completion + (100 - profile.overview.compile_error_rate) + (100 - profile.overview.logic_error_rate)) / 4)
    : clampPercent(progress || 82);
  const resourceProgress = profile ? profile.overview.overall_progress : clampPercent((learnedPoints / Math.max(knowledgePoints.length, 1)) * 100);
  const practiceScore = profile ? clampPercent(100 - profile.overview.logic_error_rate) : clampPercent(progress + 18);
  const activityScore = clampPercent((completed + inProgress) / Math.max(tasks.length, 1) * 100);
  const visibleTasks = tasks.slice(0, 5);

  const stats = [
    { label: "课程任务", value: loading ? "..." : String(tasks.length), sub: `待完成 ${pending} 项`, icon: <ClipboardList size={28} />, tone: "blue" },
    { label: "学习资源", value: String(Math.max(knowledgePoints.length, tasks.length * 2)), sub: `已学习 ${Math.max(learnedPoints, completed)} 个`, icon: <BookMarked size={28} />, tone: "green" },
    { label: "测验/作业", value: String(assignmentCount), sub: `待完成 ${pending} 项`, icon: <PencilLine size={28} />, tone: "purple" },
    { label: "课堂活动", value: String(Math.max(completed + inProgress, tasks.length)), sub: `参与 ${Math.max(completed, 0)} 次`, icon: <UsersRound size={28} />, tone: "orange" }
  ];

  const announcements = [
    { title: activeTask ? `${activeTask.title} 已发布` : "课程任务等待发布", date: activeTask?.published_at ? deadlineLabel(activeTask.published_at) : "今天" },
    { title: activeTask ? `${taskTypeLabel(activeTask)} 截止提醒` : "学习资料同步通知", date: activeTask?.deadline ? deadlineLabel(activeTask.deadline) : "本周" },
    { title: knowledgePoints[0] ? `${knowledgePoints[0]} 知识点已更新` : "课程知识点已更新", date: "最近" },
    { title: profile ? "学习画像已生成" : "完成任务后生成画像", date: "持续更新" }
  ];

  function openActiveTask() {
    if (!activeTask || loading) return;
    onOpenWorkspace({
      taskId: activeTask.task_id,
      assignmentId: activeTask.assignment_id,
      courseId: activeTask.course_id,
      workspaceType: activeTask.workspace_type,
      taskType: activeTask.task_type
    });
  }

  return (
    <div className="course-workbench-page course-dashboard-page">
      <header className="course-dashboard-hero">
        <div>
          <h1>课程工作台</h1>
          <p>查看本课程的学习概览与任务动态</p>
        </div>
        <button type="button" disabled={!activeTask || loading} onClick={openActiveTask}>
          进入当前任务
          <Code2 size={17} />
        </button>
      </header>

      {message ? (
        <StudentInlineNotice
          kind="degraded"
          title="课程工作台暂未完整同步"
          description={message}
          detail={messageDetail}
          actions={[{ label: "重试", variant: "primary", onClick: () => setReloadKey((value) => value + 1) }]}
        />
      ) : null}

      <section className="course-dashboard-stats">
        {stats.map((item) => (
          <article className={`course-dashboard-stat ${item.tone}`} key={item.label}>
            <span>{item.icon}</span>
            <div>
              <em>{item.label}</em>
              <strong>{item.value}<small>项</small></strong>
              <p>{item.sub}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="course-dashboard-grid">
        <article className="course-dashboard-card course-dashboard-tasks">
          <header>
            <h2>最近任务</h2>
            <button type="button" onClick={() => navigate(coursePath(courseId, "tasks"))}>查看全部 <ArrowRight size={14} /></button>
          </header>
          {loading ? <div className="skeleton-block course-task-skeleton" /> : visibleTasks.length ? (
            <div className="course-dashboard-task-list">
              {visibleTasks.map((task, index) => (
                <button className="course-dashboard-task-row" type="button" key={task.assignment_id} onClick={() => onOpenWorkspace({
                  taskId: task.task_id,
                  assignmentId: task.assignment_id,
                  courseId: task.course_id,
                  workspaceType: task.workspace_type,
                  taskType: task.task_type
                })}>
                  <span className={`course-task-icon ${taskTone(task, index)}`}>{taskIcon(task)}</span>
                  <span>
                    <strong>{task.title}</strong>
                    <small>{taskTypeLabel(task)} <i /> 截止时间：{deadlineLabel(task.deadline)}</small>
                  </span>
                  <em className={task.status === "COMPLETED" ? "done" : ""}>{statusLabel(task.status)}</em>
                </button>
              ))}
              <button className="course-dashboard-all" type="button" onClick={() => navigate(coursePath(courseId, "tasks"))}>
                查看全部任务
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="empty-panel">当前课程暂时没有下发任务。</div>
          )}
        </article>

        <div className="course-dashboard-side">
          <article className="course-dashboard-card course-dashboard-info">
            <h2>课程信息</h2>
            <dl>
              <div><dt><UserRound size={16} /> 授课教师</dt><dd>{course?.teacher_name ?? "待同步"}</dd></div>
              <div><dt><CalendarDays size={16} /> 学期</dt><dd>2024-2025 春季学期</dd></div>
              <div><dt><Clock3 size={16} /> 上课时间</dt><dd>周二 10:00 - 11:40</dd></div>
              <div><dt><MapPin size={16} /> 上课地点</dt><dd>教学楼 A305</dd></div>
            </dl>
            <span aria-hidden="true"><Code2 size={34} /></span>
          </article>

          <article className="course-dashboard-card course-dashboard-notices">
            <header>
              <h2>课程公告</h2>
            </header>
            <ul>
              {announcements.map((item) => (
                <li key={`${item.title}-${item.date}`}>
                  <Megaphone size={13} />
                  <span>{item.title}</span>
                  <time>{item.date}</time>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <article className="course-dashboard-card course-dashboard-data">
          <h2>学习数据概览</h2>
          <div className="course-dashboard-score" aria-label={`综合得分 ${score} 分`}>
            <span style={{ "--score": `${score}%` } as CSSProperties}>
              <strong>{score}</strong>
              <small>分</small>
            </span>
            <em>{score >= 80 ? "良好" : score >= 60 ? "稳定提升" : "需要跟进"}</em>
          </div>
          <div className="course-dashboard-bars">
            {[
              { label: "任务完成度", value: progress, tone: "blue" },
              { label: "资源学习进度", value: resourceProgress, tone: "green" },
              { label: "测验/作业平均分", value: practiceScore, tone: "purple" },
              { label: "课堂活动参与度", value: activityScore, tone: "orange" }
            ].map((item) => (
              <div className={`course-dashboard-bar ${item.tone}`} key={item.label}>
                <span>{item.label}</span>
                <i><b style={{ width: `${Math.max(6, item.value)}%` }} /></i>
                <strong>{item.value}%</strong>
              </div>
            ))}
            <button className="course-dashboard-all" type="button" onClick={() => navigate(coursePath(courseId, "profile"))}>查看学情分析 <ArrowRight size={14} /></button>
          </div>
        </article>

        <article className="course-dashboard-card course-dashboard-knowledge">
          <h2>知识图谱入口</h2>
          <div className="course-map-preview">
            {(knowledgePoints.length ? knowledgePoints.slice(0, 3) : ["链表", "栈与队列", "二叉树"]).map((point, index, items) => (
              <span key={point}>
                {index === 0 ? <BookOpen size={18} /> : index === 1 ? <Network size={18} /> : <ShieldCheck size={18} />}
                {point}
                {index < items.length - 1 ? <i /> : null}
              </span>
            ))}
          </div>
          <p className="student-panel-copy">课程知识点、任务证据和画像状态在这里汇总，后续可接入真实知识库检索。</p>
        </article>
      </section>
    </div>
  );
}
