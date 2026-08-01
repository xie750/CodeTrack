import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  ClipboardList,
  Code2,
  Gauge,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  Users,
} from "lucide-react";
import { getTeacherDashboardOverview } from "../teacherApi";
import type {
  TeacherDashboardOverview,
  TeacherDashboardTask,
  TeacherDashboardTodo,
  TeacherTodoType,
} from "../teacherTypes";

/**
 * 教学首页（开发方案 §五 页面模块一）。
 *
 * 控件样式全部沿用学生端的设计系统（home-card / task-row / mini-progress /
 * outline-btn / empty-panel / skeleton），不引入 AntD 的 Card 与 Statistic ——
 * 教师端和学生端是同一个产品的两个角色端，视觉语言必须是一套。
 *
 * 本页只读（§5.3）。所有指标由后端聚合，前端不做二次计算，避免和学情诊断页出现
 * 两套口径；「标记已处理」这类还没有落点的写操作按后端 `unavailable_actions`
 * 下发的原因禁用，不放能点但存不了的按钮。
 */

/** 待办四类的配色，取学生端 type-tag 的三色 + 危险色 */
const TODO_TONE: Record<TeacherTodoType, string> = {
  TASK: "blue",
  STUDENT: "orange",
  AI_REVIEW: "purple",
  FEEDBACK: "green",
};

const LEVEL_TEXT: Record<TeacherDashboardTodo["level"], string> = {
  HIGH: "需尽快处理",
  WATCH: "本周关注",
  NOTICE: "提醒",
};

function formatDateTime(value: string | null) {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** 剩余时间文案。已过截止交给调用方按逾期处理，这里只描述还剩多久 */
function remainingLabel(value: string | null) {
  if (!value) return "";
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return "";
  const hours = (target - Date.now()) / 3600000;
  if (hours < 0) return "已过截止";
  if (hours < 1) return "不足 1 小时";
  if (hours < 24) return `还剩 ${Math.floor(hours)} 小时`;
  return `还剩 ${Math.floor(hours / 24)} 天`;
}

/** 指标值渲染。null 是「没有这个指标」，不能显示成 0（§11.7） */
function statValue(value: number | null, suffix = "") {
  if (value === null || value === undefined) return "—";
  return `${value}${suffix}`;
}

function taskTypeLabel(task: TeacherDashboardTask) {
  if (task.task_type === "PROGRAMMING") return "编程任务";
  if (task.task_type === "QUESTION") return "客观题";
  return task.task_type;
}

/** 发布状态里只要还有 PUBLISHED 就按进行中显示，其余取第一个 */
function publishLabel(task: TeacherDashboardTask) {
  if (task.is_active) return { text: "进行中", tone: "blue" };
  if (task.publish_statuses.includes("PAUSED")) return { text: "已暂停", tone: "orange" };
  if (task.publish_statuses.includes("CLOSED")) return { text: "已结束", tone: "purple" };
  return { text: "已截止", tone: "orange" };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<TeacherDashboardOverview | null>(null);
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  // 切换学期或课程时清掉下级选择，让后端按新范围给默认班级
  const [selection, setSelection] = useState<{ term?: string; courseId?: string; classId?: string }>({});

  const loadOverview = useCallback(
    async (next: { term?: string; courseId?: string; classId?: string }, silent: boolean) => {
      if (!silent) setPageStatus("loading");
      setLoadMessage(null);
      try {
        const data = await getTeacherDashboardOverview({
          term: next.term,
          courseId: next.courseId,
          classId: next.classId,
        });
        setOverview(data);
        setPageStatus("ready");
      } catch {
        setLoadMessage("教学首页数据加载失败，请确认教师身份和后端服务后重试。");
        setPageStatus((prev) => (prev === "ready" ? "ready" : "error"));
      }
    },
    []
  );

  useEffect(() => {
    loadOverview(selection, Boolean(overview));
    // overview 只用于判断是否静默刷新，不参与依赖，否则每次成功都会再拉一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, loadOverview]);

  const context = overview?.context;
  const current = context?.current ?? null;
  const isLoading = pageStatus === "loading";

  const markTodoReason = useMemo(
    () =>
      overview?.unavailable_actions.find((item) => item.action === "MARK_TODO_DONE")?.reason ?? "",
    [overview]
  );

  const stats = useMemo(() => {
    const source = overview?.stats;
    return [
      {
        key: "student_count",
        label: "班级人数",
        value: statValue(source?.student_count.value ?? null, " 人"),
        hint: current ? current.class_name : "当前教学班",
        icon: <Users size={20} />,
        tone: "blue",
        route: source?.student_count.target_route,
      },
      {
        key: "active_task_count",
        label: "进行中任务",
        value: statValue(source?.active_task_count.value ?? null, " 个"),
        hint: "已发布且未过截止",
        icon: <ClipboardList size={20} />,
        tone: "blue",
        route: source?.active_task_count.target_route,
      },
      {
        key: "avg_completion_rate",
        label: "平均完成率",
        value: statValue(source?.avg_completion_rate.value ?? null, "%"),
        hint: "按全班在册人数计算",
        icon: <Gauge size={20} />,
        tone: "green",
        route: source?.avg_completion_rate.target_route,
      },
      {
        key: "overdue_student_count",
        label: "逾期人数",
        value: statValue(source?.overdue_student_count.value ?? null, " 人"),
        hint: "存在逾期任务的学生",
        icon: <CalendarClock size={20} />,
        tone: "orange",
        route: source?.overdue_student_count.target_route,
      },
      {
        key: "pending_ai_review_count",
        label: "待审核 AI",
        value: statValue(source?.pending_ai_review_count.value ?? null, " 条"),
        hint: "教师确认后学生才看到结论",
        icon: <ShieldCheck size={20} />,
        tone: "purple",
        route: source?.pending_ai_review_count.target_route,
      },
      {
        key: "risk_student_count",
        label: "风险学生",
        value: statValue(source?.risk_student_count.value ?? null, " 人"),
        hint: "命中预警规则",
        icon: <AlertTriangle size={20} />,
        tone: "orange",
        route: source?.risk_student_count.target_route,
      },
    ];
  }, [overview, current]);

  const trend = overview?.class_summary.completion_trend ?? [];

  if (pageStatus === "error" && !overview) {
    return (
      <div className="home-dashboard teacher-home single">
        <section className="home-main">
          <section className="home-card home-section">
            <div className="home-card-header">
              <h2>教学首页</h2>
              <button className="outline-btn" type="button" onClick={() => loadOverview(selection, false)}>
                <RefreshCw size={15} />
                重新加载
              </button>
            </div>
            <div className="empty-panel">{loadMessage ?? "暂时没有读取到教学首页数据。"}</div>
          </section>
        </section>
      </div>
    );
  }

  return (
    <div className="home-dashboard teacher-home">
      <section className="home-main">
        {/* §5.2 A 教学上下文。切换后当前页数据必须同步刷新（§四） */}
        <section className="home-card home-hero teacher-hero">
          <div className="hero-copy">
            <h1>教学首页</h1>
            <p>
              {isLoading
                ? "正在读取当前教学班的任务进度与学情..."
                : overview?.empty_reason
                  ? overview.empty_reason
                  : current
                    ? `${current.term} · ${current.course_name} · ${current.class_name}`
                    : loadMessage ?? "暂时没有读取到教学上下文。"}
            </p>
            {loadMessage && overview && <p className="teacher-hero-warn">{loadMessage}</p>}
          </div>

          <div className="teacher-context" aria-label="教学上下文">
            <label>
              <span>学期</span>
              <select
                value={current?.term ?? ""}
                disabled={isLoading || !context?.terms.length}
                onChange={(event) => setSelection({ term: event.target.value })}
              >
                {context?.terms.map((item) => (
                  <option key={item.term} value={item.term}>
                    {item.term}
                  </option>
                ))}
                {!context?.terms.length && <option value="">暂无学期</option>}
              </select>
            </label>
            <label>
              <span>课程</span>
              <select
                value={current?.course_id ?? ""}
                disabled={isLoading || !context?.courses.length}
                onChange={(event) =>
                  setSelection({ term: current?.term, courseId: event.target.value })
                }
              >
                {context?.courses.map((item) => (
                  <option key={item.course_id} value={item.course_id}>
                    {item.name}
                  </option>
                ))}
                {!context?.courses.length && <option value="">暂无课程</option>}
              </select>
            </label>
            <label>
              <span>班级</span>
              <select
                value={current?.class_id ?? ""}
                disabled={isLoading || !context?.classes.length}
                onChange={(event) =>
                  setSelection({
                    term: current?.term,
                    courseId: current?.course_id,
                    classId: event.target.value,
                  })
                }
              >
                {context?.classes.map((item) => (
                  <option key={item.class_id} value={item.class_id}>
                    {item.name}（{item.student_count} 人）
                  </option>
                ))}
                {!context?.classes.length && <option value="">暂无班级</option>}
              </select>
            </label>
            <button
              className="outline-btn"
              type="button"
              disabled={isLoading}
              onClick={() => loadOverview(selection, true)}
            >
              <RefreshCw size={15} />
              刷新
            </button>
          </div>
        </section>

        {/* §5.2 B 数据概览卡片。每张卡片点击进入对应明细页 */}
        <section className="home-card home-section">
          <div className="home-card-header">
            <h2>数据概览</h2>
            <span className="teacher-meta">
              {context?.generated_at ? `统计时间 ${formatDateTime(context.generated_at)}` : ""}
            </span>
          </div>
          <div className="teacher-stat-grid">
            {isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <div className="teacher-stat skeleton-block" key={index} />
                ))
              : stats.map((item) => (
                  <button
                    className={`teacher-stat ${item.tone}`}
                    type="button"
                    key={item.key}
                    disabled={!item.route}
                    onClick={() => item.route && navigate(item.route)}
                  >
                    <span className={`teacher-stat-icon ${item.tone}`}>{item.icon}</span>
                    <span className="teacher-stat-body">
                      <em>{item.label}</em>
                      <strong>{item.value}</strong>
                      <small>{item.hint}</small>
                    </span>
                  </button>
                ))}
          </div>
        </section>

        {/* §5.2 D 最近任务 */}
        <section className="home-card home-section">
          <div className="home-card-header">
            <h2>最近任务</h2>
            <button className="text-link" type="button" onClick={() => navigate("/teacher/tasks")}>
              查看全部
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="task-list">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div className="task-row teacher-task-row skeleton-row" key={index} />
              ))
            ) : overview?.recent_tasks.length ? (
              overview.recent_tasks.map((task) => {
                const publish = publishLabel(task);
                const overdue = task.overdue_count > 0;
                return (
                  <article className="task-row teacher-task-row" key={task.task_id}>
                    <div className={`task-icon ${task.task_type === "PROGRAMMING" ? "blue" : "purple"}`}>
                      {task.task_type === "PROGRAMMING" ? <Code2 size={22} /> : <ClipboardList size={22} />}
                    </div>
                    <div className="task-info">
                      <div className="task-title-line">
                        <strong>{task.task_title}</strong>
                        <span className={`type-tag ${task.task_type === "PROGRAMMING" ? "blue" : "purple"}`}>
                          {taskTypeLabel(task)}
                        </span>
                        <span className={`type-tag ${publish.tone}`}>{publish.text}</span>
                      </div>
                      <span>
                        截止：<b className={overdue ? "danger" : ""}>{formatDateTime(task.deadline)}</b>
                        {task.deadline && <em className="teacher-remaining">{remainingLabel(task.deadline)}</em>}
                      </span>
                    </div>
                    <div className="task-progress">
                      <span>
                        完成 {task.completed}/{task.total}（{task.completion_rate}%）
                      </span>
                      <div className="mini-progress">
                        <i
                          className={task.completion_rate >= 60 ? "green" : ""}
                          style={{ width: `${Math.min(task.completion_rate, 100)}%` }}
                        />
                      </div>
                      {overdue && <em className="teacher-danger-note">{task.overdue_count} 人逾期</em>}
                    </div>
                    <div className="teacher-row-actions">
                      <button
                        className="outline-btn"
                        type="button"
                        onClick={() => navigate(`/teacher/monitor/tasks/${task.task_id}`)}
                      >
                        查看监控
                      </button>
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => navigate(`/teacher/tasks/${task.task_id}/publish`)}
                      >
                        查看任务
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-panel">
                当前教学班还没有已发布的任务。到任务中心创建并发布任务后，这里会显示完成进度。
              </div>
            )}
          </div>
        </section>

        {/* §5.2 E 班级学情摘要。数字与学情诊断页同源，只展示摘要 */}
        <section className="home-card home-section">
          <div className="home-card-header">
            <h2>班级学情摘要</h2>
            <button
              className="text-link"
              type="button"
              onClick={() => navigate(overview?.class_summary.analysis_route ?? "/teacher/diagnosis")}
            >
              查看完整分析
              <ArrowRight size={14} />
            </button>
          </div>

          {isLoading ? (
            <div className="teacher-summary-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="teacher-summary-card skeleton-block" key={index} />
              ))}
            </div>
          ) : (
            <div className="teacher-summary-grid">
              <article className="teacher-summary-card">
                <h3>完成率趋势</h3>
                {trend.length ? (
                  <div className="teacher-trend" role="img" aria-label="按任务发布顺序的班级完成率">
                    {trend.map((item) => (
                      <div className="teacher-trend-col" key={item.task_id} title={`${item.task_title}：完成率 ${item.completion_rate}%，提交率 ${item.submit_rate}%`}>
                        <span className="teacher-trend-value">{item.completion_rate}%</span>
                        {/* 百分比固定按 100% 刻度，不按本组最大值缩放，否则任务间高度不可比 */}
                        <i style={{ height: `${Math.max(item.completion_rate, 3)}%` }} />
                        <span className="teacher-trend-label">{item.task_title}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-panel compact">暂无已发布任务，无法形成趋势。</div>
                )}
              </article>

              <article className="teacher-summary-card">
                <h3>高频错误排行</h3>
                {overview?.class_summary.top_errors.length ? (
                  <ul className="teacher-rank">
                    {overview.class_summary.top_errors.map((item) => (
                      <li key={item.error_type}>
                        <span className="teacher-rank-name">{item.label || item.error_type}</span>
                        <span className={`type-tag ${item.severity === "HIGH" ? "orange" : "blue"}`}>
                          {item.student_count} 人 / {item.total_count} 次
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-panel compact">还没有错误统计数据。</div>
                )}
              </article>

              <article className="teacher-summary-card">
                <h3>薄弱知识点</h3>
                {overview?.class_summary.weak_knowledge_points.length ? (
                  <ul className="teacher-rank">
                    {overview.class_summary.weak_knowledge_points.map((item) => (
                      <li key={item.knowledge_point}>
                        <span className="teacher-rank-name">
                          <TrendingDown size={14} />
                          {item.knowledge_point}
                        </span>
                        <span className="teacher-rank-metric">
                          <b>{item.avg_mastery}</b>
                          <small>{item.weak_student_count} 人未达标</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-panel compact">
                    该班还没有知识点掌握证据。学生完成任务后会自动生成。
                  </div>
                )}
              </article>
            </div>
          )}
        </section>
      </section>

      <aside className="home-aside teacher-aside">
        {/* §5.2 C 今日待办 */}
        <section className="home-card right-card">
          <div className="home-card-header">
            <h2>今日待办</h2>
            <span className="teacher-meta">{overview?.todos.length ?? 0} 项</span>
          </div>
          <div className="reminder-list">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div className="reminder-item skeleton-row" key={index} />
              ))
            ) : overview?.todos.length ? (
              overview.todos.map((todo) => (
                <article className="reminder-item teacher-todo" key={todo.todo_id}>
                  <div className={`reminder-icon ${TODO_TONE[todo.type]}`}>
                    {todo.type === "TASK" ? (
                      <ClipboardList size={20} />
                    ) : todo.type === "STUDENT" ? (
                      <Users size={20} />
                    ) : todo.type === "AI_REVIEW" ? (
                      <ShieldCheck size={20} />
                    ) : (
                      <BadgeCheck size={20} />
                    )}
                  </div>
                  <div>
                    <strong>
                      {todo.title}
                      <span className={`type-tag ${TODO_TONE[todo.type]}`}>
                        {overview.todo_type_labels[todo.type]}
                      </span>
                    </strong>
                    <span>{todo.detail}</span>
                    <em>
                      {LEVEL_TEXT[todo.level]}
                      {todo.due_at ? ` · ${formatDateTime(todo.due_at)}` : ""}
                    </em>
                    <div className="teacher-todo-actions">
                      <button
                        className="outline-btn"
                        type="button"
                        onClick={() => navigate(todo.target_route)}
                      >
                        立即处理
                      </button>
                      {/* 待办状态表未建，按后端下发的原因禁用，不做假成功 */}
                      <button className="text-link" type="button" disabled title={markTodoReason}>
                        标记已处理
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-panel compact">
                当前没有需要立即处理的事项。任务临近截止、学生逾期或 AI 待审核时会出现在这里。
              </div>
            )}
          </div>
          {markTodoReason && !isLoading && overview?.todos.length ? (
            <p className="teacher-note">{markTodoReason}</p>
          ) : null}
        </section>

        <section className="home-card right-card">
          <div className="home-card-header">
            <h2>快速进入</h2>
          </div>
          <div className="teacher-quick-links">
            <button className="outline-btn" type="button" onClick={() => navigate("/teacher/tasks")}>
              <ClipboardList size={16} />
              任务中心
            </button>
            <button className="outline-btn" type="button" onClick={() => navigate("/teacher/monitor")}>
              <Activity size={16} />
              任务监控
            </button>
            <button className="outline-btn" type="button" onClick={() => navigate("/teacher/diagnosis")}>
              <BookOpen size={16} />
              学情诊断
            </button>
            <button className="outline-btn" type="button" onClick={() => navigate("/teacher/ai-review")}>
              <ShieldCheck size={16} />
              AI 审核
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
