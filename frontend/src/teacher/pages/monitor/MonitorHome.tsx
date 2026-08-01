import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Gauge,
  Lightbulb,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import TeacherSubNav from "../../components/TeacherSubNav";
import { exportMonitorBoard, getMonitorBoard } from "../../teacherApi";
import type { MonitorBoardData, MonitorRow } from "../../teacherTypes";
import { monitorNav } from "./monitorNav";
import {
  avgScoreText,
  formatDate,
  formatDateTime,
  hintLevelText,
  metricText,
  progressStatusText,
  publishStatusText,
  remainingText,
  rowScoreText,
  statusTone,
  taskTypeText,
} from "./monitorLabels";

/**
 * 提交进度看板（开发方案 §九 9.1）
 *
 * 本页**只读**学生端产生的数据，不直接修改学生数据。评分与反馈属于 §9.3 / §十三，后端
 * 还没有 Grade 和 TeacherFeedback 表，所以这里不放任何"能点但存不了"的按钮 —— 缺失原因
 * 由后端 `unavailable_actions` 下发，前端只负责渲染。
 *
 * 概览卡片同时是筛选入口：点"逾期"就把下面的列表筛到逾期学生。卡片自身的计数**不**跟着
 * 筛选走（后端 `stats` 覆盖整个名册），否则点完一张卡其余全变 0，就没法互相对照了。
 *
 * 控件样式沿用学生端那套 token，与 AI 审核 / 学情诊断一致：.review-page / .review-head /
 * .class-card / .class-stat / .review-select / .review-search / .review-list /
 * .review-pagination / .class-empty，不使用 antd 默认外观。
 */

const PAGE_SIZE = 20;

export default function MonitorHome() {
  const navigate = useNavigate();
  // 支持 /teacher/monitor/tasks/:taskId 深链直接落到某个任务
  const { taskId: routeTaskId } = useParams<{ taskId: string }>();

  const [courseId, setCourseId] = useState("");
  const [classId, setClassId] = useState("");
  const [taskId, setTaskId] = useState(routeTaskId ?? "");
  const [status, setStatus] = useState("");
  const [hintLevel, setHintLevel] = useState<number | undefined>(undefined);
  const [errorType, setErrorType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<MonitorBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const filters = useMemo(
    () => ({
      courseId: courseId || undefined,
      classId: classId || undefined,
      taskId: taskId || undefined,
      status: status || undefined,
      hintLevel,
      errorType: errorType || undefined,
      keyword: keyword.trim() || undefined,
    }),
    [courseId, classId, taskId, status, hintLevel, errorType, keyword]
  );

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError("");
    getMonitorBoard({ ...filters, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!alive) return;
        setData(result);
        // 课程和任务可以由后端兜底选中，回填后续请求才会带上同一个范围
        setCourseId((current) => current || result.scope.course_id || "");
        setTaskId((current) => current || result.scope.task_id || "");
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setError(
          "监控数据加载失败。请确认已用教师账号登录，并且所选班级与任务属于当前教师的教学安排。"
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filters, page]);

  useEffect(load, [load]);

  function resetFilters() {
    setStatus("");
    setHintLevel(undefined);
    setErrorType("");
    setKeyword("");
    setPage(1);
  }

  const handleCourseChange = (value: string) => {
    setCourseId(value);
    // 换课程后班级和任务都不再有效，清空让后端重新兜底
    setClassId("");
    setTaskId("");
    resetFilters();
  };

  const handleClassChange = (value: string) => {
    setClassId(value);
    setTaskId("");
    resetFilters();
  };

  const handleTaskChange = (value: string) => {
    setTaskId(value);
    resetFilters();
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError("");
    try {
      const blob = await exportMonitorBoard(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `任务监控-${data?.task?.title ?? "导出"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("导出失败，请稍后重试。");
    } finally {
      setExporting(false);
    }
  };

  const task = data?.task ?? null;
  const stats = data?.stats;
  const scoreSupported = Boolean(task?.score_supported);

  /*
   * 错误标签的中文名只在 error_type_options 里给一次（那份词表由后端合并三套错误来源
   * 得出）。行上只带原始 tag，所以这里建一张查表，免得表格里显示 LINKED_LIST_HEAD_UPDATE_ERROR
   * 这种给机器看的字符串。
   */
  const errorLabels = useMemo(() => {
    const map = new Map<string, string>();
    data?.error_type_options.forEach((option) => map.set(option.value, option.label));
    return map;
  }, [data]);

  // 卡片点击切换状态筛选：再点一次同一张卡取消筛选，避免"点进去出不来"
  const toggleStatus = (value: string) => {
    setStatus((current) => (current === value ? "" : value));
    setPage(1);
  };

  return (
    <div className="review-page monitor-page">
      <header className="review-head">
        <div className="review-head-copy">
          <h1>提交进度看板</h1>
          <p>
            按任务查看班级提交进度、完成情况和逾期学生。本页只读取学生端产生的数据，不修改
            学生成绩或进度；概览卡片始终覆盖整个班级名册，不随下方筛选变化。
          </p>
        </div>
        <div className="review-head-actions">
          <button className="review-back" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> 刷新
          </button>
        </div>
      </header>

      <TeacherSubNav items={monitorNav} ariaLabel="任务监控二级导航" />

      {error ? <p className="review-message error">{error}</p> : null}

      <div className="diagnosis-context" aria-label="教学上下文">
        <label className="diagnosis-field">
          <span>课程</span>
          <select
            className="review-select"
            value={courseId}
            disabled={loading || !data || data.course_options.length === 0}
            onChange={(event) => handleCourseChange(event.target.value)}
          >
            {!data || data.course_options.length === 0 ? <option value="">暂无课程</option> : null}
            {data?.course_options.map((option) => (
              <option value={option.course_id} key={option.course_id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="diagnosis-field">
          <span>教学班</span>
          <select
            className="review-select"
            value={classId}
            disabled={loading || !data}
            onChange={(event) => handleClassChange(event.target.value)}
          >
            <option value="">全部班级</option>
            {data?.class_options.map((option) => (
              <option value={option.class_id} key={option.class_id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="diagnosis-field monitor-task-field">
          <span>任务</span>
          <select
            className="review-select"
            value={taskId}
            disabled={loading || !data || data.task_options.length === 0}
            onChange={(event) => handleTaskChange(event.target.value)}
          >
            {!data || data.task_options.length === 0 ? (
              <option value="">暂无已发布任务</option>
            ) : null}
            {data?.task_options.map((option) => (
              <option value={option.task_id} key={option.task_id}>
                {option.title}（{taskTypeText(option.task_type)}）
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && !data ? <BoardSkeleton /> : null}

      {!loading && data && !task ? (
        <div className="class-empty">
          <h2>暂时没有可监控的任务</h2>
          <p>{data.empty_reason ?? "该范围内还没有发布过任务。"}</p>
        </div>
      ) : null}

      {data && task && stats ? (
        <>
          <TaskSummary task={task} stats={stats} />

          <section className="review-stats monitor-stats" aria-label="提交进度概览">
            <StatCard
              icon={<Users size={26} />}
              tone=""
              label="总人数"
              value={`${stats.total}`}
              unit="人"
              note="覆盖该任务已发布班级的在册名单"
            />
            <StatCard
              icon={<CheckCircle2 size={26} />}
              tone="green"
              label="已完成"
              value={`${stats.completed}`}
              unit="人"
              note={`完成率 ${metricText(stats.completion_rate, "%")}`}
              active={status === "COMPLETED"}
              onClick={() => toggleStatus("COMPLETED")}
            />
            <StatCard
              icon={<PlayCircle size={26} />}
              tone="blue"
              label="进行中"
              value={`${stats.in_progress}`}
              unit="人"
              note="已打开任务但还没提交"
              active={status === "IN_PROGRESS"}
              onClick={() => toggleStatus("IN_PROGRESS")}
            />
            <StatCard
              icon={<Clock size={26} />}
              tone="indigo"
              label="未开始"
              value={`${stats.not_started}`}
              unit="人"
              note={`已提交 ${stats.submitted} 人`}
              active={status === "NOT_STARTED"}
              onClick={() => toggleStatus("NOT_STARTED")}
            />
            <StatCard
              icon={<AlertTriangle size={26} />}
              tone="orange"
              label="逾期"
              value={`${stats.overdue}`}
              unit="人"
              note={task.deadline ? `截止 ${formatDate(task.deadline)}` : "该任务没有设置截止时间"}
              active={status === "OVERDUE"}
              onClick={() => toggleStatus("OVERDUE")}
            />
            <StatCard
              icon={<Gauge size={26} />}
              tone="indigo"
              label="平均成绩"
              value={avgScoreText(stats)}
              unit={scoreSupported && stats.avg_score !== null ? "分" : ""}
              note={
                scoreSupported
                  ? `已评定 ${stats.scored_count} / ${stats.total} 人`
                  : "编程任务只有通过 / 未通过"
              }
            />
          </section>

          <div className="review-filters monitor-filters">
            <div className="review-filter-group">
              <select
                className="review-select"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">状态：全部</option>
                {data.status_options.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                className="review-select"
                value={hintLevel === undefined ? "" : String(hintLevel)}
                onChange={(event) => {
                  setHintLevel(event.target.value === "" ? undefined : Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value="">提示等级：不限</option>
                {data.hint_level_options.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                className="review-select"
                value={errorType}
                disabled={data.error_type_options.length === 0}
                onChange={(event) => {
                  setErrorType(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">
                  {data.error_type_options.length === 0 ? "错误类型：暂无记录" : "错误类型：全部"}
                </option>
                {data.error_type_options.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="review-search">
                <Search size={15} />
                <input
                  type="search"
                  value={keyword}
                  placeholder="搜索姓名或学号"
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <button
                className="review-back"
                type="button"
                onClick={handleExport}
                disabled={exporting || stats.total === 0}
                title="导出当前筛选结果，权限校验在后端执行"
              >
                <Download size={15} /> {exporting ? "导出中…" : "导出"}
              </button>
            </div>
          </div>

          {exportError ? <p className="review-message error">{exportError}</p> : null}

          {loading ? (
            <section className="review-list monitor-list" aria-busy="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <article className="class-card monitor-row skeleton-block" key={index} />
              ))}
            </section>
          ) : data.items.length === 0 ? (
            <div className="class-empty">
              <h2>没有符合条件的学生</h2>
              <p>
                {stats.total === 0
                  ? "该任务发布的班级还没有在册学生，请确认班级名单已导入。"
                  : `当前筛选条件下没有学生。清空筛选即可看到全部 ${stats.total} 人。`}
              </p>
            </div>
          ) : (
            <section className="review-list monitor-list" aria-label="学生任务明细">
              {data.items.map((row) => (
                <StudentRow
                  key={row.student_id}
                  row={row}
                  scoreSupported={scoreSupported}
                  errorLabels={errorLabels}
                  onOpenSubmission={() =>
                    navigate(`/teacher/submissions/${row.submission_id}/grade`)
                  }
                  onOpenReview={() => navigate("/teacher/ai-review")}
                />
              ))}
            </section>
          )}

          {data.total_pages > 1 ? (
            <div className="review-pagination">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </button>
              <span>
                第 {data.page} / {data.total_pages} 页 · 共 {data.total} 人
              </span>
              <button
                type="button"
                disabled={page >= data.total_pages || loading}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </button>
            </div>
          ) : null}

          <UnavailableActions actions={data.unavailable_actions} />
        </>
      ) : null}
    </div>
  );
}

/** 任务信息条。发布状态、截止时间和成绩口径都在这里说清楚 */
function TaskSummary({
  task,
  stats,
}: {
  task: NonNullable<MonitorBoardData["task"]>;
  stats: MonitorBoardData["stats"];
}) {
  const remaining = remainingText(task.deadline);
  const ringPercent = stats.completion_rate ?? 0;
  return (
    <article className="class-card monitor-task-card">
      <div className="monitor-task-main">
        <div className="monitor-task-title">
          <h2>{task.title}</h2>
          <em className="review-tag">{taskTypeText(task.task_type)}</em>
          {task.publish_statuses.map((item) => (
            <em className={`monitor-publish-badge ${item.toLowerCase()}`} key={item}>
              {publishStatusText(item)}
            </em>
          ))}
        </div>
        <div className="monitor-task-meta">
          <span>发布班级：{task.class_names.join("、") || "未记录"}</span>
          <span>发布时间：{formatDate(task.published_at)}</span>
          <span>
            截止时间：{formatDate(task.deadline)}
            {remaining ? `（${remaining}）` : task.deadline ? "（已截止）" : ""}
          </span>
          {task.required_test_case_count !== null ? (
            <span>必过用例：{task.required_test_case_count} 个</span>
          ) : null}
        </div>
        <p className="monitor-task-note">{task.score_note}</p>
      </div>
      <div className="monitor-task-side">
        <div
          className="class-ring"
          /*
           * 学生端 .class-ring 的 conic-gradient 是写死 60% 的装饰值。这里必须按真实
           * 完成率覆盖，否则环形永远显示 60% 而中间的数字写着 0%，两个数字互相打脸。
           */
          style={{
            background: `conic-gradient(#176cf5 0 ${ringPercent}%, #e7edf6 ${ringPercent}% 100%)`,
          }}
        >
          <b>{stats.completion_rate === null ? "—" : `${Math.round(stats.completion_rate)}%`}</b>
        </div>
        <em>完成率</em>
      </div>
    </article>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  unit,
  note,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  unit?: string;
  note: string;
  active?: boolean;
  onClick?: () => void;
}) {
  // 选中态由 .review-stats button.class-stat[aria-pressed="true"] 负责，不另加类名
  const className = `class-card class-stat${onClick ? " monitor-stat-button" : ""}`;
  const content = (
    <>
      <span className={tone}>{icon}</span>
      <p>{label}</p>
      {/* 「暂无数据」「不适用」这类文字撑不住 31px 的数值字号，单独降一档 */}
      <strong className={/^[\d.]+$/.test(value) ? undefined : "monitor-stat-text"}>
        {value}
        {unit ? <small> {unit}</small> : null}
      </strong>
      <em>{note}</em>
    </>
  );
  if (!onClick) {
    return <article className={className}>{content}</article>;
  }
  return (
    <button className={className} type="button" onClick={onClick} aria-pressed={active}>
      {content}
    </button>
  );
}

/** 学生明细行。只显示教师有权看到的内容，隐藏用例的完整输入输出不在本页出现 */
function StudentRow({
  row,
  scoreSupported,
  errorLabels,
  onOpenSubmission,
  onOpenReview,
}: {
  row: MonitorRow;
  scoreSupported: boolean;
  errorLabels: Map<string, string>;
  onOpenSubmission: () => void;
  onOpenReview: () => void;
}) {
  return (
    <article className={`class-card monitor-row${row.overdue ? " overdue" : ""}`}>
      <span className={`class-badge ${statusTone(row.status)}`}>
        {progressStatusText(row.status)}
      </span>

      <div className="monitor-row-main">
        <div className="monitor-row-title">
          <strong>{row.student_name}</strong>
          <small>{row.student_id}</small>
          {row.overdue ? (
            <em className="monitor-overdue-tag">
              <AlertTriangle size={12} /> 逾期
            </em>
          ) : null}
          {row.needs_teacher_review ? (
            <em className="monitor-review-tag">
              <ShieldCheck size={12} /> 待审核 AI
            </em>
          ) : null}
        </div>
        <div className="monitor-row-meta">
          <span>{row.class_name}</span>
          <span>提交 {row.version_count} 次</span>
          <span>
            <Lightbulb size={12} /> {hintLevelText(row.highest_hint_level)}
          </span>
          <span>最后提交：{formatDateTime(row.last_submitted_at)}</span>
        </div>
        {row.error_tags.length > 0 ? (
          <div className="monitor-row-errors">
            {row.error_tags.map((tag) => (
              <em key={tag} title={tag}>
                {errorLabels.get(tag) ?? tag}
              </em>
            ))}
          </div>
        ) : null}
      </div>

      <div className="monitor-row-score">
        <strong>{rowScoreText(row, scoreSupported)}</strong>
        <em>
          {scoreSupported
            ? "客观题得分"
            : row.total_required_count
              ? `必过 ${row.passed_count ?? 0}/${row.total_required_count}`
              : "通过情况"}
        </em>
      </div>

      <div className="monitor-row-actions">
        <button
          className={row.submission_id ? "primary" : ""}
          type="button"
          disabled={!row.submission_id}
          title={row.submission_id ? "查看提交详情" : "该学生还没有提交记录"}
          onClick={onOpenSubmission}
        >
          <ClipboardList size={14} /> 提交详情
        </button>
        {row.needs_teacher_review ? (
          <button type="button" onClick={onOpenReview}>
            AI 审核
          </button>
        ) : null}
      </div>
    </article>
  );
}

/**
 * 缺失能力说明。理由文案由后端给（与任务列表同一约定），前端不自己编一套说辞，
 * 否则两边对"为什么不能评分"的解释会不一致。
 */
function UnavailableActions({ actions }: { actions: MonitorBoardData["unavailable_actions"] }) {
  if (actions.length === 0) return null;
  return (
    <article className="class-card monitor-gaps">
      <div className="profile-section-head">
        <h2>本页暂不支持的操作</h2>
        <span className="diagnosis-head-note">原因由后端下发</span>
      </div>
      <ul>
        {actions.map((item) => (
          <li key={item.action}>{item.reason}</li>
        ))}
      </ul>
    </article>
  );
}

function BoardSkeleton() {
  return (
    <section aria-busy="true">
      <article className="class-card monitor-task-card skeleton-block" />
      <div className="review-stats monitor-stats">
        {Array.from({ length: 6 }).map((_, index) => (
          <article className="class-card class-stat skeleton-block" key={index} />
        ))}
      </div>
      <div className="review-list monitor-list">
        {Array.from({ length: 4 }).map((_, index) => (
          <article className="class-card monitor-row skeleton-block" key={index} />
        ))}
      </div>
    </section>
  );
}
