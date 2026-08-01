import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Archive,
  BookMarked,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
  Eye,
  FileQuestion,
  FlaskConical,
  Info,
  ListChecks,
  Lock,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Users,
} from "lucide-react";
import TeacherSubNav from "../../components/TeacherSubNav";
import { getTeacherTasks } from "../../teacherApi";
import type {
  TaskContentStatus,
  TeacherTaskListData,
  TeacherTaskRow,
} from "../../teacherTypes";
import { taskCenterNav } from "./taskCenterNav";
import {
  CONTENT_STATUS_HINT,
  actionReasonLookup,
  assignmentModeText,
  contentStatusBadgeClass,
  contentStatusText,
  formatDateTime,
  formatRate,
  publishStatusText,
  taskTypeText,
} from "./taskLabels";

/**
 * 任务列表（开发方案 §八 8.1）
 *
 * 本页只读。控件样式沿用学生端那套卡片 / 徽标 / 分段筛选（.class-card / .review-*），
 * 不使用 antd 默认外观。
 *
 * 两个容易踩的点：
 * 1. 内容状态（§14.1）和班级发布状态（§14.2）是两套独立枚举。左侧徽标是内容状态，
 *    每行「发布情况」列里的才是各班级的发布状态，不能合并成一个字段显示。
 * 2. 新建 / 编辑 / 复制 / 归档 / 发布 / 学生预览的写接口都还没有，按钮保持禁用并显示
 *    后端给出的原因，不做点了只 console.log 的假成功（迁移执行清单 §15.2）。
 */

type StatusTab = "ALL" | TaskContentStatus;

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "READY", label: "可发布" },
  { key: "PUBLISHED", label: "已发布" },
  { key: "CLOSED", label: "已结束" },
  { key: "DRAFT", label: "草稿" },
  { key: "ARCHIVED", label: "已归档" },
];

const PAGE_SIZE = 20;

export default function TaskList() {
  const navigate = useNavigate();

  const [courseId, setCourseId] = useState("");
  const [classId, setClassId] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("ALL");
  const [taskType, setTaskType] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<TeacherTaskListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 搜索框防抖，避免每敲一个字打一次接口
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(keywordInput.trim());
      setPage(1);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError("");
    getTeacherTasks({
      courseId: courseId || undefined,
      classId: classId || undefined,
      taskType: taskType || undefined,
      contentStatus: statusTab === "ALL" ? undefined : statusTab,
      keyword: keyword || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setError("任务列表加载失败。请确认已用教师账号登录，所选课程和班级属于当前教师。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId, classId, taskType, statusTab, keyword, page]);

  useEffect(() => load(), [load]);

  const stats = data?.stats;
  const items = data?.items ?? [];
  const reasonFor = useMemo(
    () => actionReasonLookup(data?.unavailable_actions),
    [data?.unavailable_actions]
  );

  const statCards = useMemo(
    () => [
      {
        key: "ALL" as StatusTab,
        title: "全部任务",
        value: stats?.total ?? 0,
        sub: `编程 ${stats?.programming ?? 0} 个 · 客观题 ${stats?.question ?? 0} 个`,
        icon: <ClipboardList size={28} />,
        color: "indigo",
      },
      {
        key: "PUBLISHED" as StatusTab,
        title: "已发布",
        value: stats?.published ?? 0,
        sub: CONTENT_STATUS_HINT.PUBLISHED,
        icon: <Send size={28} />,
        color: "green",
      },
      {
        key: "READY" as StatusTab,
        title: "可发布",
        value: stats?.ready ?? 0,
        sub: CONTENT_STATUS_HINT.READY,
        icon: <ListChecks size={28} />,
        color: "",
      },
      {
        key: "CLOSED" as StatusTab,
        title: "已结束",
        value: stats?.closed ?? 0,
        sub: CONTENT_STATUS_HINT.CLOSED,
        icon: <CheckCircle2 size={28} />,
        color: "orange",
      },
      {
        key: "ARCHIVED" as StatusTab,
        title: "草稿与归档",
        value: (stats?.draft ?? 0) + (stats?.archived ?? 0),
        sub: `草稿 ${stats?.draft ?? 0} 个 · 归档 ${stats?.archived ?? 0} 个`,
        icon: <Archive size={28} />,
        color: "",
      },
    ],
    [stats]
  );

  const createAction = reasonFor("CREATE_TASK");
  const hasNextPage = data ? page < data.total_pages : false;

  return (
    <div className="review-page task-page">
      <header className="review-head">
        <div className="review-head-copy">
          <h1>任务中心</h1>
          <p>
            管理编程任务、客观题、测验和补救任务。只有正式发布的任务才会进入学生端「班级
            任务」；任务内容状态与各班级发布状态是两套独立状态，下面分列显示。
          </p>
        </div>
        <div className="review-head-actions">
          <button className="review-back" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> {loading ? "加载中" : "刷新列表"}
          </button>
          <button
            className="task-primary-btn"
            type="button"
            title={createAction?.reason}
            onClick={() => createAction?.target_route && navigate(createAction.target_route)}
          >
            <Plus size={15} /> 新建任务
          </button>
        </div>
      </header>

      <TeacherSubNav items={taskCenterNav} ariaLabel="任务中心二级导航" />

      {error ? <p className="review-message error">{error}</p> : null}

      {data ? (
        <p className="diagnosis-sufficiency">
          <Info size={14} />
          {data.status_derivation}
        </p>
      ) : null}

      <section className="review-stats" aria-label="任务状态概览">
        {statCards.map((card) => (
          <button
            className="class-card class-stat"
            type="button"
            key={card.title}
            aria-pressed={statusTab === card.key}
            onClick={() => {
              setStatusTab(statusTab === card.key ? "ALL" : card.key);
              setPage(1);
            }}
          >
            <span className={card.color}>{card.icon}</span>
            <p>{card.title}</p>
            <strong>
              {loading && !stats ? "..." : card.value}
              <small> 个</small>
            </strong>
            <em>{card.sub}</em>
          </button>
        ))}
      </section>

      <div className="review-filters">
        <div className="class-tabs" role="group" aria-label="任务状态筛选">
          {STATUS_TABS.map((tab) => (
            <button
              type="button"
              key={tab.key}
              className={statusTab === tab.key ? "active" : ""}
              aria-pressed={statusTab === tab.key}
              onClick={() => {
                setStatusTab(tab.key);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="review-filter-group">
          <select
            className="review-select"
            aria-label="课程筛选"
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              // 班级选项跟着课程收窄，换课程时旧班级必然失效
              setClassId("");
              setPage(1);
            }}
          >
            <option value="">课程：全部</option>
            {(data?.course_options ?? []).map((option) => (
              <option value={option.course_id} key={option.course_id}>
                {option.name}
              </option>
            ))}
          </select>

          <select
            className="review-select"
            aria-label="班级筛选"
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">班级：全部</option>
            {(data?.class_options ?? []).map((option) => (
              <option value={option.class_id} key={option.class_id}>
                {option.name}
              </option>
            ))}
          </select>

          <select
            className="review-select"
            aria-label="任务类型筛选"
            value={taskType}
            onChange={(event) => {
              setTaskType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">类型：不限</option>
            {(data?.task_type_options ?? []).map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="review-search">
            <Search size={15} />
            <input
              type="search"
              aria-label="按任务名称搜索"
              placeholder="搜索任务名称"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <section className="review-list" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <article className="class-card task-row skeleton-block" key={index} />
          ))}
        </section>
      ) : items.length === 0 ? (
        <div className="class-empty">
          <h2>
            {stats?.total ? "当前筛选条件下没有匹配的任务" : "当前教师负责的课程下还没有任务"}
          </h2>
          <p>
            {stats?.total
              ? `本范围共有 ${stats.total} 个任务，换一个状态、类型或课程再看。`
              : "任务列表只收录当前教师生效教学安排覆盖课程下的任务。任务创建接口（§八 8.2）尚未实现，暂时无法在这里新增。"}
          </p>
        </div>
      ) : (
        <section className="review-list" aria-label="任务列表">
          {items.map((row) => (
            <TaskRow
              key={row.task_id}
              row={row}
              reasonFor={reasonFor}
              onOpenMonitor={() => navigate(`/teacher/monitor/tasks/${row.task_id}`)}
            />
          ))}
        </section>
      )}

      {!loading && data && (page > 1 || hasNextPage) ? (
        <div className="review-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            上一页
          </button>
          <span>
            第 {page} / {data.total_pages} 页 · 共 {data.total} 个任务
          </span>
          <button type="button" disabled={!hasNextPage} onClick={() => setPage((value) => value + 1)}>
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface RowProps {
  row: TeacherTaskRow;
  reasonFor: (action: string) => { reason: string; target_route: string | null } | undefined;
  onOpenMonitor: () => void;
}

function TaskRow({ row, reasonFor, onOpenMonitor }: RowProps) {
  const published = row.content_status === "PUBLISHED";
  const isProgramming = row.task_type === "PROGRAMMING";
  const rate = row.completion_rate;

  return (
    <article className={`class-card task-row${published ? " published" : ""}`}>
      <span className={`review-badge ${contentStatusBadgeClass(row.content_status)}`}>
        {published ? <Send size={13} /> : <Lock size={13} />}
        {contentStatusText(row.content_status)}
      </span>

      <div className="task-row-main">
        <h2>
          <span>{row.title}</span>
          <em className="task-type-tag">
            {isProgramming ? <Code2 size={12} /> : <FileQuestion size={12} />}
            {taskTypeText(row.task_type)}
          </em>
        </h2>
        <p>{row.description}</p>
        <div className="task-row-meta">
          <span>
            <BookMarked size={13} /> {row.course_name || row.course_id}
          </span>
          {isProgramming ? (
            <span>
              <FlaskConical size={13} /> 测试用例 {row.test_case_count} 个（公开{" "}
              {row.public_test_case_count} 个）
            </span>
          ) : (
            <span>
              <ListChecks size={13} /> 题目 {row.question_count} 道
              {row.question_total_score === null ? "" : ` · 总分 ${row.question_total_score}`}
            </span>
          )}
          {isProgramming ? <span>语言 {row.language}</span> : null}
          {row.capability_ids.length > 0 ? (
            <span>关联能力 {row.capability_ids.length} 项</span>
          ) : null}
        </div>
      </div>

      <div className="task-pubs">
        {row.publications.length === 0 ? (
          <span className="task-pub-empty">尚未下发到任何班级</span>
        ) : (
          row.publications.map((pub) => (
            <span className="task-pub" key={pub.assignment_id}>
              <b>{pub.class_name || pub.class_id}</b>
              <i>
                {publishStatusText(pub.publish_status)}·{assignmentModeText(pub.assignment_mode)}
              </i>
              <u>
                <CalendarClock size={11} /> 截止 {formatDateTime(pub.deadline)}
              </u>
            </span>
          ))
        )}
      </div>

      <div className="task-progress">
        {rate === null ? (
          <em className="task-progress-none">未发布，无完成率</em>
        ) : (
          <>
            <b>{formatRate(rate)}</b>
            <i>
              <b style={{ width: `${Math.max(2, Math.round(rate * 100))}%` }} />
            </i>
            <em>
              <Users size={11} /> {row.completed_count}/{row.roster_total} 完成 · 已提交{" "}
              {row.submitted_count}
            </em>
          </>
        )}
      </div>

      <div className="task-actions">
        <button
          className={published ? "primary" : ""}
          type="button"
          onClick={onOpenMonitor}
          disabled={!published}
          title={published ? "查看该任务的班级提交进度" : "任务尚未发布，还没有提交数据可看"}
        >
          <Activity size={14} /> 查看监控
        </button>
        <div className="task-actions-secondary">
          <button type="button" disabled title={reasonFor("EDIT_TASK")?.reason}>
            <PencilLine size={13} /> 编辑
          </button>
          <button type="button" disabled title={reasonFor("DUPLICATE_TASK")?.reason}>
            <Copy size={13} /> 复制
          </button>
          <button type="button" disabled title={reasonFor("STUDENT_PREVIEW")?.reason}>
            <Eye size={13} /> 学生视角
          </button>
          <button type="button" disabled title={reasonFor("PUBLISH_TASK")?.reason}>
            <Send size={13} /> 发布
          </button>
          <button type="button" disabled title={reasonFor("ARCHIVE_TASK")?.reason}>
            <Archive size={13} /> 归档
          </button>
        </div>
      </div>
    </article>
  );
}
