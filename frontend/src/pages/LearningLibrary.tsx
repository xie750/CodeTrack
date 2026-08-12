import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  FileText,
  Filter,
  Heart,
  Pencil,
  PlusCircle,
  Search,
  Target
} from "lucide-react";
import { api, LearningContext, StudentProfile, StudentTaskCard } from "../api";

type FavoriteType = "编程题" | "练习题" | "考核题";

type FavoriteItem = {
  id: string;
  taskId: string;
  assignmentId: string;
  workspaceType: string;
  taskType: string;
  title: string;
  type: FavoriteType;
  badgeClass: "green" | "purple" | "orange";
  tags: string[];
  description: string;
  courseId: string;
  course: string;
  className: string;
  teacherName: string;
  publishedAt: string;
  difficulty: string;
  progress: number;
  count: string;
};

const tabs = ["全部收藏", "编程题", "练习题", "考核题", "最近收藏"];

function formatDateTime(value: string | null) {
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

function difficultyText(value: string) {
  if (value === "MEDIUM") return "中等";
  if (value === "HARD") return "较难";
  return "基础";
}

function favoriteType(taskType: string): Pick<FavoriteItem, "type" | "badgeClass"> {
  if (taskType === "QUIZ") return { type: "练习题", badgeClass: "purple" };
  if (taskType === "EXAM") return { type: "考核题", badgeClass: "orange" };
  return { type: "编程题", badgeClass: "green" };
}

function taskToFavorite(task: StudentTaskCard): FavoriteItem {
  const typeInfo = favoriteType(task.task_type);
  const total = Math.max(task.total_required_count, 1);
  const progress = Math.round((task.passed_count / total) * 100);
  return {
    id: task.assignment_id,
    taskId: task.task_id,
    assignmentId: task.assignment_id,
    workspaceType: task.workspace_type,
    taskType: task.task_type,
    title: task.title,
    ...typeInfo,
    tags: ["教师下发", ...task.knowledge_points].slice(0, 4),
    description: task.description || task.latest_summary,
    courseId: task.course_id,
    course: task.course_name,
    className: task.class_name,
    teacherName: task.teacher_name,
    publishedAt: formatDateTime(task.published_at),
    difficulty: difficultyText(task.difficulty),
    progress,
    count: `${task.passed_count}/${task.total_required_count}`
  };
}

function initialFavoriteIds(tasks: StudentTaskCard[]) {
  const coding = tasks.find((task) => task.task_type === "CODING")?.assignment_id;
  const quiz = tasks.find((task) => task.task_type === "QUIZ")?.assignment_id;
  const fallback = tasks.slice(0, 2).map((task) => task.assignment_id);
  return new Set([coding, quiz, ...fallback].filter(Boolean).slice(0, 2) as string[]);
}

type LearningLibraryProps = {
  initialCourseId?: string;
  scope?: "global" | "course";
};

export default function LearningLibrary({ initialCourseId = "", scope = "global" }: LearningLibraryProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("全部收藏");
  const [query, setQuery] = useState("");
  const [context, setContext] = useState<LearningContext | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [tasks, setTasks] = useState<StudentTaskCard[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [recentlyChangedIds, setRecentlyChangedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCourseId(initialCourseId);
  }, [initialCourseId]);

  useEffect(() => {
    let alive = true;

    async function loadLibraryData() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getLearningContext();
        if (!alive) return;
        setContext(data);

        const courseId = initialCourseId || data.courses[0]?.course_id;
        const [taskResult, profileResult] = await Promise.allSettled([
          api.listStudentTasks(initialCourseId || undefined),
          courseId ? api.getStudentProfile(courseId) : Promise.resolve(null)
        ]);
        if (!alive) return;

        const loadedTasks = taskResult.status === "fulfilled" ? taskResult.value : [];
        setTasks(loadedTasks);
        setFavoriteIds(initialFavoriteIds(loadedTasks));
        setRecentlyChangedIds(new Set());
        setProfile(profileResult.status === "fulfilled" ? profileResult.value : null);
        if (taskResult.status === "rejected") {
          setError("收藏页暂时没有读到教师下发任务，当前显示为空状态。");
        }
      } catch {
        if (!alive) return;
        setContext(null);
        setTasks([]);
        setFavoriteIds(new Set());
        setProfile(null);
        setError("收藏页数据加载失败，请稍后刷新。");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadLibraryData();
    return () => {
      alive = false;
    };
  }, [initialCourseId]);

  useEffect(() => {
    if (!selectedCourseId) return;
    let alive = true;
    api
      .getStudentProfile(selectedCourseId)
      .then((data) => {
        if (alive) setProfile(data);
      })
      .catch(() => {
        if (alive) setProfile(null);
      });
    return () => {
      alive = false;
    };
  }, [selectedCourseId]);

  const allItems = useMemo(() => tasks.map(taskToFavorite), [tasks]);
  const courseItems = useMemo(
    () => (selectedCourseId ? allItems.filter((item) => item.courseId === selectedCourseId) : allItems),
    [allItems, selectedCourseId]
  );
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return courseItems.filter((item) => {
      const isFavorite = favoriteIds.has(item.id);
      const wasRecentlyChanged = recentlyChangedIds.has(item.id);
      if (!isFavorite && !wasRecentlyChanged) return false;

      const typeMatch = activeTab === "全部收藏" || activeTab === "最近收藏" || item.type === activeTab;
      const queryMatch =
        !normalizedQuery ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.course.toLowerCase().includes(normalizedQuery) ||
        item.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
      return typeMatch && queryMatch;
    });
  }, [activeTab, courseItems, favoriteIds, query, recentlyChangedIds]);

  const favoriteItems = useMemo(() => courseItems.filter((item) => favoriteIds.has(item.id)), [courseItems, favoriteIds]);
  const typeCounts = useMemo(() => {
    return favoriteItems.reduce(
      (counts, item) => {
        counts[item.type] += 1;
        return counts;
      },
      { 编程题: 0, 练习题: 0, 考核题: 0 } as Record<FavoriteType, number>
    );
  }, [favoriteItems]);

  const weakPoint = profile?.knowledge_states.find((item) => item.state === "WEAK")?.knowledge_point ?? "链表边界处理";

  function toggleFavorite(item: FavoriteItem) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
    setRecentlyChangedIds((current) => new Set(current).add(item.id));
  }

  function openTask(item: FavoriteItem) {
    const state = scope === "course" && selectedCourseId
      ? { fromCourseId: selectedCourseId, fromPath: `/courses/${selectedCourseId}/favorites` }
      : undefined;
    if (item.workspaceType === "QUESTION_SET" || item.taskType === "QUIZ" || item.taskType === "EXAM") {
      navigate(`/question-workspace/${item.assignmentId}`, state ? { state } : undefined);
      return;
    }
    navigate(`/workspace/${item.taskId}`, state ? { state } : undefined);
  }

  return (
    <div className="library-page">
      <section className="library-main">
        <header className="library-head">
          <div className="library-head-left">
            <h1>收藏夹</h1>
            {scope === "course" ? (
              <span className="library-course-pill">
                {context?.courses.find((course) => course.course_id === selectedCourseId)?.course_name ?? "当前课程"}
              </span>
            ) : (
              <div className="library-select library-course-select">
                <select
                  value={selectedCourseId}
                  onChange={(event) => setSelectedCourseId(event.target.value)}
                  aria-label="按课程筛选收藏"
                >
                  <option value="">全部课程</option>
                  {(context?.courses ?? []).map((course) => (
                    <option key={course.course_id} value={course.course_id}>
                      {course.course_name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={17} />
              </div>
            )}
          </div>
          <label className="library-search">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索已收藏任务" />
            <Search size={18} />
          </label>
        </header>

        <section className="library-stats" aria-label="收藏统计">
          <StatCard title="收藏题目总数" value={String(favoriteItems.length)} unit="道" detail="来自教师下发任务" tone="blue" icon={<Bookmark size={24} fill="currentColor" />} />
          <StatCard title="本次可演示" value={String(recentlyChangedIds.size)} unit="次" detail="收藏状态响应" tone="orange" icon={<PlusCircle size={25} fill="currentColor" />} />
          <StatCard title="编程题" value={String(typeCounts.编程题)} unit="道" detail="关联沙箱任务" tone="green" icon={<Code2 size={25} />} />
          <StatCard title="练习题" value={String(typeCounts.练习题)} unit="道" detail="关联阶段练习" tone="purple" icon={<Pencil size={25} fill="currentColor" />} />
        </section>

        <section className="library-filterbar">
          <div className="library-tabs" role="tablist" aria-label="收藏类型">
            {tabs.map((tab) => (
              <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>
          <div className="library-tools">
            <button type="button" className="library-select library-sort">
              最近下发
              <ChevronDown size={17} />
            </button>
            <button type="button" className="library-filter">
              <Filter size={17} />
              筛选
              <ChevronDown size={15} />
            </button>
          </div>
        </section>

        {error ? <p className="library-data-message">{error}</p> : null}

        <section id="favorite-list" className="favorite-grid" aria-label="收藏题目列表">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <article className="favorite-card skeleton-block" key={index} />)
          ) : visibleItems.length ? (
            visibleItems.map((item) => {
              const isFavorite = favoriteIds.has(item.id);
              return (
                <article key={item.id} className={isFavorite ? "favorite-card" : "favorite-card faded"}>
                  <button type="button" className="favorite-heart" aria-label={`${isFavorite ? "取消收藏" : "重新收藏"} ${item.title}`} onClick={() => toggleFavorite(item)}>
                    <Heart size={23} fill={isFavorite ? "currentColor" : "none"} />
                  </button>
                  <span className={`favorite-badge ${item.badgeClass}`}>{isFavorite ? item.type : "已取消"}</span>
                  <h2>{item.title}</h2>
                  <div className="favorite-tags">
                    {item.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <p>{item.description}</p>
                  <div className="favorite-meta">
                    {item.course} · {item.className}
                    <br />
                    发布老师：{item.teacherName} · 下发时间：{item.publishedAt}
                  </div>
                  <div className="favorite-progress-row">
                    <span>
                      难度：<b className={item.difficulty === "中等" ? "warn" : ""}>{item.difficulty}</b>
                    </span>
                    <div>
                      <div className="favorite-progress-label">
                        <span>进度：</span>
                        <b>
                          {item.progress}% ({item.count})
                        </b>
                      </div>
                      <i className="favorite-track">
                        <b style={{ width: `${Math.max(6, item.progress)}%` }} />
                      </i>
                    </div>
                  </div>
                  <div className="favorite-actions">
                    <button type="button" className="solid" onClick={() => openTask(item)}>查看题目</button>
                    <button type="button" onClick={() => openTask(item)}>继续练习</button>
                    <button type="button" className="ghost" onClick={() => toggleFavorite(item)}>
                      {isFavorite ? "取消收藏" : "重新收藏"}
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <article className="favorite-empty">
              <Bookmark size={28} />
              <h2>当前没有收藏题目</h2>
              <p>收藏页只展示已经存在于教师下发任务里的题目。你可以在演示中点击“重新收藏”恢复刚取消的题目，或回到班级任务查看全部下发内容。</p>
              <button type="button" onClick={() => navigate(scope === "course" && selectedCourseId ? `/courses/${selectedCourseId}/tasks` : "/tasks")}>查看班级任务</button>
            </article>
          )}
        </section>
      </section>

      <aside className="library-aside" aria-label="收藏侧栏">
        <section className="library-side-card overview">
          <header>
            <h2>收藏概览</h2>
            <a href="#favorite-list">
              查看详情 <ChevronRight size={14} />
            </a>
          </header>
          <div className="library-overview-body">
            <div className="library-donut">
              <div>
                <strong>{favoriteItems.length}</strong>
                <span>总收藏</span>
              </div>
            </div>
            <div className="library-legend">
              <span>
                <i className="green" /> 编程题&nbsp;&nbsp;{typeCounts.编程题} 道
              </span>
              <span>
                <i className="purple" /> 练习题&nbsp;&nbsp;{typeCounts.练习题} 道
              </span>
              <span>
                <i className="orange" /> 考核题&nbsp;&nbsp;{typeCounts.考核题} 道
              </span>
            </div>
          </div>
          <div className="library-side-summary">
            <span>来源：教师下发</span>
            <span>
              已取消：<b>{allItems.filter((item) => recentlyChangedIds.has(item.id) && !favoriteIds.has(item.id)).length} 道</b>
            </span>
          </div>
        </section>

        <section className="library-side-card recent">
          <header>
            <h2>最近收藏</h2>
            <a href="#favorite-list">
              查看全部 <ChevronRight size={14} />
            </a>
          </header>
          {favoriteItems.slice(0, 3).map((item) => (
            <RecentItem
              key={item.id}
              tone={item.badgeClass}
              icon={item.type === "编程题" ? <Code2 size={17} /> : <FileText size={16} />}
              title={item.title}
              meta={`${item.type} · ${item.course}`}
              time={item.publishedAt}
            />
          ))}
          {!favoriteItems.length ? <p className="library-data-message">暂无收藏记录。</p> : null}
        </section>

        <section className="library-side-card advice">
          <header>
            <h2>学习建议</h2>
          </header>
          <AdviceItem tone="blue" icon={<BarChart3 size={22} />} title="先复盘收藏任务" text="收藏夹里的题目都来自当前班级任务，可以直接回到任务工作区继续练习。" />
          <AdviceItem tone="green" icon={<Target size={22} />} title="强化薄弱知识点" text={`${weakPoint} 需要结合任务诊断和收藏题目复盘。`} />
          <AdviceItem tone="orange" icon={<Clock3 size={22} />} title="定期清理收藏" text="取消收藏会即时更新统计，便于演示收藏状态联动。" />
          <button type="button" className="plan-button">
            生成个性化学习计划
          </button>
        </section>
      </aside>
    </div>
  );
}

function StatCard({
  title,
  value,
  unit,
  detail,
  growth,
  tone,
  icon
}: {
  title: string;
  value: string;
  unit: string;
  detail: string;
  growth?: string;
  tone: "blue" | "orange" | "green" | "purple";
  icon: ReactNode;
}) {
  return (
    <article className="library-stat">
      <span className={`library-stat-icon ${tone}`}>{icon}</span>
      <h2>{title}</h2>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <p>
        {detail} {growth && <b>{growth}</b>}
      </p>
    </article>
  );
}

function RecentItem({ tone, icon, title, meta, time }: { tone: string; icon: ReactNode; title: string; meta: string; time: string }) {
  return (
    <div className="recent-favorite">
      <span className={`recent-icon ${tone}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <em>{time}</em>
    </div>
  );
}

function AdviceItem({ tone, icon, title, text }: { tone: string; icon: ReactNode; title: string; text: string }) {
  return (
    <div className="library-advice-item">
      <span className={`advice-icon ${tone}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
