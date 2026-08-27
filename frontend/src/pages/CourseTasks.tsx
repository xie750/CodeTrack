import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Filter,
  Loader2,
  Search,
  Send,
  TimerReset,
  XCircle
} from "lucide-react";
import { api, apiCache, LearningContext, StudentTaskCard } from "../api";
import type { TaskOpenTarget } from "../App";
import { StudentInlineNotice, studentErrorDetail, studentErrorMessage } from "../components/StudentState";

type PageProps = {
  onOpenWorkspace: (target?: TaskOpenTarget | string) => void;
  courseId?: string;
  embedded?: boolean;
};

type TaskTab = "全部课程" | string;
type StatusFilter = "ALL" | "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "COMPLETED" | "NEEDS_REVISION" | "EXPIRED";
type TypeFilter = "ALL" | "ASSIGNMENT" | "QUIZ" | "EXAM" | "SURVEY";
type DeadlineFilter = "ALL" | "WEEK" | "SOON" | "OVERDUE";

type TaskViewItem = {
  task: StudentTaskCard;
  statusLabel: string;
  statusTone: string;
  typeLabel: string;
  dueLabel: string;
  dueTone: string;
  actionLabel: string;
  progress: number;
};

const statusFilters: Array<{ key: StatusFilter; label: string }> = [
  { key: "ALL", label: "全部状态" },
  { key: "NOT_STARTED", label: "未开始" },
  { key: "IN_PROGRESS", label: "进行中" },
  { key: "SUBMITTED", label: "已提交" },
  { key: "COMPLETED", label: "已批阅" },
  { key: "NEEDS_REVISION", label: "迟交" }
];

const typeFilters: Array<{ key: TypeFilter; label: string }> = [
  { key: "ALL", label: "全部类型" },
  { key: "ASSIGNMENT", label: "作业" },
  { key: "QUIZ", label: "测验" },
  { key: "EXAM", label: "考试" },
  { key: "SURVEY", label: "问卷调查" }
];

const deadlineFilters: Array<{ key: DeadlineFilter; label: string }> = [
  { key: "ALL", label: "全部截止日期" },
  { key: "WEEK", label: "本周" },
  { key: "SOON", label: "即将截止" },
  { key: "OVERDUE", label: "已过期" }
];

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
    NEEDS_REVISION: "迟交",
    COMPLETED: "已批阅",
    EXPIRED: "已过期"
  };
  return map[status] ?? status;
}

function statusTone(status: string) {
  if (status === "COMPLETED") return "green";
  if (status === "SUBMITTED") return "cyan";
  if (status === "IN_PROGRESS") return "orange";
  if (status === "NEEDS_REVISION" || status === "EXPIRED") return "red";
  return "blue";
}

function taskTypeText(task: StudentTaskCard) {
  if (task.task_type === "QUIZ") return "测验";
  if (task.task_type === "EXAM") return "考试";
  if (task.task_type === "SURVEY") return "问卷调查";
  if (task.task_type === "RESOURCE") return "学习资源";
  return task.workspace_type === "QUESTION_SET" ? "测验" : "作业";
}

function taskTypeKey(task: StudentTaskCard): TypeFilter {
  if (task.task_type === "QUIZ" || task.workspace_type === "QUESTION_SET") return "QUIZ";
  if (task.task_type === "EXAM") return "EXAM";
  if (task.task_type === "SURVEY") return "SURVEY";
  return "ASSIGNMENT";
}

function dueInfo(value: string | null) {
  if (!value) return { label: "未设置截止时间", tone: "muted" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: value, tone: "muted" };
  const diff = date.getTime() - Date.now();
  const absHours = Math.ceil(Math.abs(diff) / 36e5);
  if (diff < 0) {
    if (absHours < 24) return { label: `已截止 ${absHours} 小时`, tone: "red" };
    return { label: `已截止 ${Math.ceil(absHours / 24)} 天`, tone: "red" };
  }
  if (absHours < 24) return { label: `距截止还有 ${absHours} 小时`, tone: "orange" };
  return { label: `距截止还有 ${Math.ceil(absHours / 24)} 天`, tone: absHours <= 72 ? "orange" : "blue" };
}

function isThisWeek(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function isDueSoon(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const diff = date.getTime() - Date.now();
  return diff >= 0 && diff <= 72 * 36e5;
}

function isOverdue(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function progressOf(task: StudentTaskCard) {
  return Math.round((task.passed_count / Math.max(task.total_required_count, 1)) * 100);
}

export default function CourseTasks({ onOpenWorkspace, courseId, embedded = false }: PageProps) {
  const cachedContext = apiCache.peekLearningContext();
  const cachedTasks = apiCache.peekStudentTasks(courseId);
  const [context, setContext] = useState<LearningContext | null>(cachedContext);
  const [selectedTab, setSelectedTab] = useState<TaskTab>("全部课程");
  const [tasks, setTasks] = useState<StudentTaskCard[]>(cachedTasks ?? []);
  const [loadingContext, setLoadingContext] = useState(!cachedContext);
  const [loadingTasks, setLoadingTasks] = useState(!cachedTasks);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("ALL");
  const [openingAssignmentId, setOpeningAssignmentId] = useState<string | null>(null);
  const openTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    };
  }, []);

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
        if (courseId) {
          const selectedCourse = data.courses.find((course) => course.course_id === courseId);
          if (selectedCourse) setSelectedTab(selectedCourse.course_name);
        }
      })
      .catch((err) => {
        if (!alive) return;
        setError(studentErrorMessage(err, "班级课程数据加载失败，当前显示为空状态。"));
        setErrorDetail(studentErrorDetail(err));
      })
      .finally(() => {
        if (alive) setLoadingContext(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId, reloadKey]);

  useEffect(() => {
    if (!courseId || !context) return;
    const selectedCourse = context.courses.find((course) => course.course_id === courseId);
    if (selectedCourse && selectedTab !== selectedCourse.course_name) {
      setSelectedTab(selectedCourse.course_name);
    }
  }, [context, courseId, selectedTab]);

  useEffect(() => {
    let alive = true;
    const selectedCourseId = courseId ?? context?.courses.find((course) => course.course_name === selectedTab)?.course_id;
    const cachedTaskData = apiCache.peekStudentTasks(selectedCourseId);
    setLoadingTasks(!cachedTaskData);
    setError(null);
    setErrorDetail(null);
    setTasks(cachedTaskData ?? []);
    api
      .listStudentTasks(selectedCourseId)
      .then((data) => {
        if (alive) setTasks(data);
      })
      .catch((err) => {
        if (!alive) return;
        setTasks([]);
        setError(studentErrorMessage(err, "任务数据加载失败，请稍后刷新。"));
        setErrorDetail(studentErrorDetail(err));
      })
      .finally(() => {
        if (alive) setLoadingTasks(false);
      });
    return () => {
      alive = false;
    };
  }, [context, selectedTab, courseId, reloadKey]);

  const loading = loadingContext || loadingTasks;
  const courseTabs = useMemo(() => ["全部课程", ...(context?.courses.map((course) => course.course_name) ?? [])], [context]);
  const currentCourse = selectedTab === "全部课程" ? null : context?.courses.find((course) => course.course_name === selectedTab);
  const allCount = tasks.length;
  const inProgress = tasks.filter((task) => ["IN_PROGRESS"].includes(task.status)).length;
  const submitted = tasks.filter((task) => task.status === "SUBMITTED").length;
  const reviewed = tasks.filter((task) => task.status === "COMPLETED").length;
  const late = tasks.filter((task) => task.status === "NEEDS_REVISION" || task.status === "EXPIRED" || isOverdue(task.deadline)).length;

  const taskItems = useMemo<TaskViewItem[]>(
    () =>
      tasks.map((task) => {
        const due = dueInfo(task.deadline);
        return {
          task,
          statusLabel: statusText(task.status),
          statusTone: statusTone(task.status),
          typeLabel: taskTypeText(task),
          dueLabel: due.label,
          dueTone: due.tone,
          actionLabel: task.status === "COMPLETED" || task.status === "SUBMITTED" ? "查看详情" : "进入任务",
          progress: progressOf(task)
        };
      }),
    [tasks]
  );

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-CN");
    return taskItems.filter((item) => {
      const { task } = item;
      const matchesKeyword = !keyword || [
        task.title,
        task.course_name,
        task.teacher_name,
        item.statusLabel,
        item.typeLabel,
        ...task.knowledge_points
      ].some((value) => value.toLocaleLowerCase("zh-CN").includes(keyword));
      const matchesStatus = statusFilter === "ALL" || task.status === statusFilter;
      const matchesType = typeFilter === "ALL" || taskTypeKey(task) === typeFilter;
      const matchesDeadline =
        deadlineFilter === "ALL" ||
        (deadlineFilter === "WEEK" && isThisWeek(task.deadline)) ||
        (deadlineFilter === "SOON" && isDueSoon(task.deadline)) ||
        (deadlineFilter === "OVERDUE" && isOverdue(task.deadline));
      return matchesKeyword && matchesStatus && matchesType && matchesDeadline;
    });
  }, [deadlineFilter, query, statusFilter, taskItems, typeFilter]);

  const hasActiveFilters = Boolean(query.trim()) || statusFilter !== "ALL" || typeFilter !== "ALL" || deadlineFilter !== "ALL";

  function resetFilters() {
    setQuery("");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    setDeadlineFilter("ALL");
  }

  function openTask(task: StudentTaskCard) {
    if (openingAssignmentId) return;
    setOpeningAssignmentId(task.assignment_id);
    openTimer.current = window.setTimeout(() => {
      onOpenWorkspace({
        taskId: task.task_id,
        assignmentId: task.assignment_id,
        courseId: task.course_id,
        workspaceType: task.workspace_type,
        taskType: task.task_type
      });
    }, 260);
  }

  const stats = [
    { label: "全部任务", value: allCount, icon: <ClipboardList size={24} />, tone: "blue" },
    { label: "进行中", value: inProgress, icon: <CalendarDays size={24} />, tone: "orange" },
    { label: "已提交", value: submitted, icon: <Send size={24} />, tone: "green" },
    { label: "已批阅", value: reviewed, icon: <CheckCircle2 size={24} />, tone: "purple" },
    { label: "迟交", value: late, icon: <XCircle size={24} />, tone: "red" }
  ];

  return (
    <div className={`class-task-page course-task-workspace${embedded ? " embedded" : ""}`}>
      <section className="course-task-hero">
        <div>
          <h1>课程任务</h1>
          <p>查看本课程的全部任务与提交进度</p>
        </div>
        {!embedded ? (
          <div className="course-task-course-tabs" aria-label="课程切换">
            {courseTabs.map((tab) => (
              <button className={selectedTab === tab ? "active" : ""} type="button" key={tab} onClick={() => setSelectedTab(tab)}>
                {tab}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="course-task-filter-panel" aria-label="任务筛选">
        <div className="course-task-filter-row top">
          <label className="course-task-search">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务名称" />
          </label>
          <div className="course-task-chip-group" aria-label="任务类型">
            <span>任务类型：</span>
            {typeFilters.map((item) => (
              <button key={item.key} className={typeFilter === item.key ? "active" : ""} type="button" onClick={() => setTypeFilter(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="course-task-filter-row">
          <div className="course-task-chip-group" aria-label="任务状态">
            <span>任务状态：</span>
            {statusFilters.map((item) => (
              <button key={item.key} className={statusFilter === item.key ? "active" : ""} type="button" onClick={() => setStatusFilter(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
          <i aria-hidden="true" />
          <div className="course-task-chip-group" aria-label="截止日期">
            <span>截止日期：</span>
            {deadlineFilters.map((item) => (
              <button key={item.key} className={deadlineFilter === item.key ? "active" : ""} type="button" onClick={() => setDeadlineFilter(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="course-task-stat-strip" aria-label="任务统计">
        {stats.map((item) => (
          <article className={`course-task-stat ${item.tone}`} key={item.label}>
            <span>{item.icon}</span>
            <div>
              <em>{item.label}</em>
              <strong>{loading ? "..." : item.value}</strong>
            </div>
          </article>
        ))}
      </section>

      {error ? (
        <StudentInlineNotice
          kind="degraded"
          title="课程任务暂未完整同步"
          description={error}
          detail={errorDetail}
          actions={[{ label: "重试", variant: "primary", onClick: () => setReloadKey((value) => value + 1) }]}
        />
      ) : null}

      {loading ? (
        <CourseTaskLoading />
      ) : filteredItems.length === 0 ? (
        <CourseTaskEmpty hasFilters={hasActiveFilters} selectedTab={selectedTab} onReset={resetFilters} />
      ) : (
        <section className="course-task-table" aria-label="课程任务列表">
          <div className="course-task-table-head" aria-hidden="true">
            <span>任务名称</span>
            <span>类型</span>
            <span>任务状态</span>
            <span>截止日期</span>
            <span>操作</span>
          </div>
          <div className="course-task-table-body">
            {filteredItems.map((item) => (
              <TaskRow
                key={item.task.assignment_id}
                item={item}
                opening={openingAssignmentId === item.task.assignment_id}
                disabled={Boolean(openingAssignmentId)}
                onOpen={() => openTask(item.task)}
              />
            ))}
          </div>
        </section>
      )}

      {openingAssignmentId ? (
        <div className="course-task-entering" role="status" aria-live="polite">
          <Loader2 size={18} />
          正在进入任务工作区
        </div>
      ) : null}
    </div>
  );
}

function CourseTaskLoading() {
  return (
    <section className="course-task-table loading" aria-label="任务加载中">
      <div className="course-task-table-head">
        <span>任务名称</span>
        <span>类型</span>
        <span>任务状态</span>
        <span>截止日期</span>
        <span>操作</span>
      </div>
      <div className="course-task-table-body">
        {Array.from({ length: 8 }).map((_, index) => (
          <article className="course-task-row skeleton-block" key={index} />
        ))}
      </div>
    </section>
  );
}

function CourseTaskEmpty({ hasFilters, selectedTab, onReset }: { hasFilters: boolean; selectedTab: string; onReset: () => void }) {
  return (
    <section className="course-task-empty">
      <span aria-hidden="true">{hasFilters ? <Filter size={30} /> : <FileText size={30} />}</span>
      <h2>{hasFilters ? "没有匹配的任务" : `${selectedTab} 当前没有下发任务`}</h2>
      <p>{hasFilters ? "可以清空筛选条件后再查看全部任务。" : "教师发布任务后，这里会显示任务类型、状态、截止时间和进入入口。"}</p>
      {hasFilters ? <button type="button" onClick={onReset}>清空筛选</button> : null}
    </section>
  );
}

function TaskRow({ item, opening, disabled, onOpen }: { item: TaskViewItem; opening: boolean; disabled: boolean; onOpen: () => void }) {
  const { task } = item;
  return (
    <article className={`course-task-row ${opening ? "opening" : ""}`}>
      <span className="course-task-file-icon" aria-hidden="true"><FileText size={17} /></span>
      <div className="course-task-name">
        <strong>{task.title}</strong>
        <small>{task.knowledge_points.slice(0, 3).join(" / ") || task.course_name}</small>
      </div>
      <span className="course-task-type">{item.typeLabel}</span>
      <span className={`course-task-status ${item.statusTone}`}>{item.statusLabel}</span>
      <span className={`course-task-due ${item.dueTone}`}>
        <TimerReset size={15} />
        <span>{item.dueLabel}</span>
        <small>{formatDeadline(task.deadline)}</small>
      </span>
      <button type="button" disabled={disabled} onClick={onOpen}>
        {opening ? <Loader2 size={15} /> : null}
        {opening ? "进入中" : item.actionLabel}
        {!opening ? <ChevronRight size={15} /> : null}
      </button>
    </article>
  );
}
