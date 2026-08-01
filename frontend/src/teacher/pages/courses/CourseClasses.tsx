import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  GraduationCap,
  LineChart,
  Pencil,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import TeacherSubNav from "../../components/TeacherSubNav";
import { getCourseClasses, getCourseRoster, updateCourseDescription } from "../../teacherApi";
import type {
  CourseClassCard,
  CourseClassListData,
  CourseRosterData,
  CourseRosterStudent,
  StudentRiskLevel,
} from "../../teacherTypes";
import { coursesNav } from "./coursesNav";
import {
  RISK_EFFECT,
  RISK_OPTIONS,
  completionText,
  formatDate,
  riskBadgeClass,
  riskText,
  scoreText,
} from "./courseLabels";

/**
 * 课程与班级（开发方案 §六 6.1）
 *
 * 一张卡 = 一个「行政班 × 课程」教学安排，不是按课程聚合 —— 同一门课的两个班要分开看，
 * 学生数和任务数才有意义。所以这里用 `/course-classes` 而不是 `getTeacherCourses()`。
 *
 * 本页**只有一个写操作**：编辑课程教学说明。§二 2.3 把创建行政班、调整学生专业和班级、
 * 删除学生账号划给管理员端，所以名单是只读的，也没有"添加学生"按钮。
 *
 * 学生风险等级直接来自 §10.3 预警中心那套规则（后端复用 `compute_class_alerts`），
 * 并把命中的规则名一起显示 —— 同一个学生在两个页面必须是同一个风险等级，而且不能
 * 只靠颜色表达状态（§7 可访问性）。
 *
 * 「查看班级」与「查看学生」在第一版合并成同一个"展开名单"动作：目前没有独立的班级
 * 详情页，名单本身就是班级详情，再拆一层只会多一次跳转。
 *
 * 概览卡片覆盖整个教学范围，不随学期和搜索变化，否则筛一下总数就掉，教师会以为数据丢了。
 *
 * 控件样式沿用学生端那套 token，与资料中心 / 任务监控一致：.review-page / .review-head /
 * .class-card / .class-stat / .review-select / .review-search / .review-list /
 * .review-pagination / .class-empty，不使用 antd 默认外观。
 *
 * 后端：backend/app/api/teacher_courses.py
 */

const PAGE_SIZE = 20;

export default function CourseClasses() {
  const navigate = useNavigate();

  const [term, setTerm] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");

  const [data, setData] = useState<CourseClassListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // 展开中的教学班（一次只展开一个名单，避免同屏几百行）
  const [expandedId, setExpandedId] = useState("");
  // 正在编辑说明的课程
  const [editingCourseId, setEditingCourseId] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // 搜索框防抖，避免每敲一个字发一次请求
  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(keywordInput.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  const filters = useMemo(
    () => ({ term: term || undefined, keyword: keyword || undefined }),
    [term, keyword]
  );

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError("");
    getCourseClasses(filters)
      .then((result) => {
        if (!alive) return;
        setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setError("课程与班级数据加载失败。请确认已用教师账号登录，并且当前账号有生效的教学安排。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filters]);

  useEffect(load, [load]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function startEditing(card: CourseClassCard) {
    setEditingCourseId(card.course_id);
    setDraftDescription(card.description);
  }

  async function saveDescription(courseId: string) {
    setSaving(true);
    setError("");
    try {
      const updated = await updateCourseDescription(courseId, draftDescription);
      // 同一门课可能有多个教学班，说明是课程级的，要一起刷新
      setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.course_id === courseId
                  ? { ...item, description: updated.description }
                  : item
              ),
            }
          : current
      );
      setEditingCourseId("");
      flash("课程教学说明已保存，学生端课程入口同步更新。");
    } catch {
      setError("课程说明保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  const stats = data?.stats;

  return (
    <div className="review-page course-page">
      <header className="review-head">
        <div className="review-head-copy">
          <h1>课程与班级</h1>
          <p>
            查看自己负责的课程、教学班和学生名单。本页只读取真实教学安排与学生数据，
            仅课程教学说明可编辑；创建行政班、调整学生归属属于管理员职责，教师端不提供。
          </p>
        </div>
        <div className="review-head-actions">
          <button className="review-back" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> 刷新
          </button>
        </div>
      </header>

      <TeacherSubNav items={coursesNav} ariaLabel="课程教学二级导航" />

      {error ? <p className="review-message error">{error}</p> : null}
      {notice ? <p className="review-message success">{notice}</p> : null}

      <section className="review-stats" aria-label="教学范围概览">
        <StatCard
          icon={<GraduationCap size={26} />}
          tone="blue"
          label="教学班"
          value={loading && !data ? "…" : String(stats?.class_count ?? 0)}
          unit="个"
          note="按行政班 × 课程统计"
        />
        <StatCard
          icon={<BookOpen size={26} />}
          tone="indigo"
          label="负责课程"
          value={loading && !data ? "…" : String(stats?.course_count ?? 0)}
          unit="门"
          note="仅含生效教学安排"
        />
        <StatCard
          icon={<Users size={26} />}
          tone="green"
          label="学生总数"
          value={loading && !data ? "…" : String(stats?.student_total ?? 0)}
          unit="人"
          note="跨班去重后的在册学生"
        />
        <StatCard
          icon={<ClipboardList size={26} />}
          tone="orange"
          label="已发布任务"
          value={loading && !data ? "…" : String(stats?.task_total ?? 0)}
          unit="个"
          note="学生端可见的任务数"
        />
      </section>

      <div className="review-filters course-filters">
        <div className="review-filter-group">
          <select
            className="review-select"
            value={term}
            disabled={loading && !data}
            onChange={(event) => setTerm(event.target.value)}
          >
            <option value="">学期：全部</option>
            {data?.filters.terms.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>

          <div className="review-search">
            <Search size={15} />
            <input
              type="search"
              value={keywordInput}
              placeholder="搜索课程名或班级名"
              onChange={(event) => setKeywordInput(event.target.value)}
            />
          </div>
        </div>
      </div>

      {loading && !data ? (
        <section className="course-class-grid" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <article className="class-card course-class-card skeleton-block" key={index} />
          ))}
        </section>
      ) : !data || data.items.length === 0 ? (
        <div className="class-empty">
          <h2>没有符合条件的教学班</h2>
          <p>
            {!data || data.stats.class_count === 0
              ? "当前账号还没有生效的教学安排。教学安排由管理员按「行政班 + 课程 + 教师」分配，分配后这里会自动出现。"
              : `当前学期与关键词下没有教学班。清空筛选即可看到全部 ${data.stats.class_count} 个教学班。`}
          </p>
        </div>
      ) : (
        <section className="course-class-grid" aria-label="教学班列表">
          {data.items.map((card) => (
            <ClassCard
              key={card.teaching_assignment_id}
              card={card}
              expanded={expandedId === card.teaching_assignment_id}
              editing={editingCourseId === card.course_id}
              draft={draftDescription}
              saving={saving}
              onToggleRoster={() =>
                setExpandedId((current) =>
                  current === card.teaching_assignment_id ? "" : card.teaching_assignment_id
                )
              }
              onStartEditing={() => startEditing(card)}
              onDraftChange={setDraftDescription}
              onCancelEditing={() => setEditingCourseId("")}
              onSaveDescription={() => saveDescription(card.course_id)}
              onOpenAnalytics={() =>
                navigate(
                  `/teacher/diagnosis?course_id=${encodeURIComponent(card.course_id)}` +
                    `&class_id=${encodeURIComponent(card.class_id)}`
                )
              }
            />
          ))}
        </section>
      )}

      {expandedId ? (
        <RosterPanel
          teachingAssignmentId={expandedId}
          onClose={() => setExpandedId("")}
          onOpenStudent={(student, courseId, classId) =>
            navigate(
              `/teacher/diagnosis?course_id=${encodeURIComponent(courseId)}` +
                `&class_id=${encodeURIComponent(classId)}` +
                `&student_id=${encodeURIComponent(student.student_id)}`
            )
          }
        />
      ) : null}
    </div>
  );
}

// --- 教学班卡片 -------------------------------------------------------------

function ClassCard({
  card,
  expanded,
  editing,
  draft,
  saving,
  onToggleRoster,
  onStartEditing,
  onDraftChange,
  onCancelEditing,
  onSaveDescription,
  onOpenAnalytics,
}: {
  card: CourseClassCard;
  expanded: boolean;
  editing: boolean;
  draft: string;
  saving: boolean;
  onToggleRoster: () => void;
  onStartEditing: () => void;
  onDraftChange: (value: string) => void;
  onCancelEditing: () => void;
  onSaveDescription: () => void;
  onOpenAnalytics: () => void;
}) {
  return (
    <article className="class-card course-class-card">
      <header className="course-class-head">
        <div>
          <h2>{card.class_name || "未命名班级"}</h2>
          <p className="course-class-course">{card.title}</p>
        </div>
        <span className="class-badge blue">{card.semester || "未设学期"}</span>
      </header>

      <div className="class-tag-row">
        {card.major_name ? <span>{card.major_name}</span> : null}
        {card.grade ? <span>{card.grade} 级</span> : null}
      </div>

      {editing ? (
        <div className="course-desc-editor">
          <label>
            <span>课程教学说明</span>
            <textarea
              value={draft}
              rows={4}
              maxLength={4000}
              placeholder="填写本课程的教学说明，学生端课程入口会看到这段文字"
              onChange={(event) => onDraftChange(event.target.value)}
            />
          </label>
          <p className="course-desc-hint">
            说明是课程级的，同一门课的其它教学班会一起更新。
          </p>
          <div className="course-class-actions">
            <button className="review-back" type="button" onClick={onCancelEditing} disabled={saving}>
              取消
            </button>
            <button
              className="class-primary"
              type="button"
              onClick={onSaveDescription}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存说明"}
            </button>
          </div>
        </div>
      ) : (
        <p className="course-class-desc">{card.description || "还没有填写课程教学说明。"}</p>
      )}

      <div className="course-class-metrics">
        <div>
          <span>学生</span>
          <b>
            {card.student_count}
            <small> 人</small>
          </b>
        </div>
        <div>
          <span>已发布任务</span>
          <b>
            {card.task_count}
            <small> 个</small>
          </b>
        </div>
      </div>

      {editing ? null : (
        <div className="course-class-actions">
          <button className="review-back" type="button" onClick={onToggleRoster}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{" "}
            {expanded ? "收起名单" : "查看学生"}
          </button>
          <button className="review-back" type="button" onClick={onOpenAnalytics}>
            <LineChart size={15} /> 查看学情
          </button>
          <button className="review-back" type="button" onClick={onStartEditing}>
            <Pencil size={15} /> 编辑课程说明
          </button>
        </div>
      )}
    </article>
  );
}

// --- 学生名单 ---------------------------------------------------------------

function RosterPanel({
  teachingAssignmentId,
  onClose,
  onOpenStudent,
}: {
  teachingAssignmentId: string;
  onClose: () => void;
  onOpenStudent: (student: CourseRosterStudent, courseId: string, classId: string) => void;
}) {
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [risk, setRisk] = useState<StudentRiskLevel | "">("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<CourseRosterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(keywordInput.trim());
      setPage(1);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  // 切换教学班时把筛选和分页重置，否则会带着上一个班的条件请求
  useEffect(() => {
    setKeywordInput("");
    setKeyword("");
    setRisk("");
    setPage(1);
  }, [teachingAssignmentId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    getCourseRoster(teachingAssignmentId, {
      keyword: keyword || undefined,
      risk: risk || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (!alive) return;
        setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setError("学生名单加载失败。该教学班可能不属于当前教师，或名单尚未导入。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [teachingAssignmentId, keyword, risk, page]);

  // stats.total 是整班人数，data.total 是当前筛选后的条数 —— 分页要用后者
  const rosterTotal = data?.stats.total ?? 0;
  const filteredTotal = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  return (
    <section className="class-card course-roster" aria-label="学生名单">
      <header className="course-roster-head">
        <div>
          <h2>学生名单</h2>
          <p>
            名单只读。风险等级与「学情诊断 → 预警中心」使用同一套规则，命中的规则名一并列出。
          </p>
        </div>
        <button className="review-back" type="button" onClick={onClose}>
          <ChevronUp size={15} /> 收起
        </button>
      </header>

      {error ? <p className="review-message error">{error}</p> : null}

      <div className="review-filters">
        <div className="review-filter-group">
          <select
            className="review-select"
            value={risk}
            disabled={loading && !data}
            onChange={(event) => {
              setRisk(event.target.value as StudentRiskLevel | "");
              setPage(1);
            }}
          >
            <option value="">风险：全部</option>
            {RISK_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
                {data ? `（${data.stats.risk_counts[option.value] ?? 0}）` : ""}
              </option>
            ))}
          </select>

          <div className="review-search">
            <Search size={15} />
            <input
              type="search"
              value={keywordInput}
              placeholder="搜索姓名或学号"
              onChange={(event) => setKeywordInput(event.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="review-list" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <article className="class-card course-roster-row skeleton-block" key={index} />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="empty-panel wide">
          {!data || rosterTotal === 0
            ? "该教学班还没有在册学生，请确认行政班名单已由管理员导入。"
            : `当前筛选条件下没有学生。清空筛选即可看到全部 ${rosterTotal} 人。`}
        </div>
      ) : (
        <div className="review-list">
          {data.items.map((student) => (
            <RosterRow
              key={student.student_id}
              student={student}
              onOpen={() => onOpenStudent(student, data.scope.course_id, data.scope.class_id)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="review-pagination">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </button>
          <span>
            第 {page} / {totalPages} 页 · 共 {filteredTotal} 人
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RosterRow({
  student,
  onOpen,
}: {
  student: CourseRosterStudent;
  onOpen: () => void;
}) {
  return (
    <article className="class-card course-roster-row">
      <div className="course-roster-name">
        <strong>{student.student_name}</strong>
        <span>{student.username || student.student_id}</span>
      </div>

      <div className="course-roster-risk">
        <span
          className={`class-badge ${riskBadgeClass(student.risk_level)}`}
          title={RISK_EFFECT[student.risk_level]}
        >
          {student.risk_level === "HIGH" ? <AlertTriangle size={13} /> : null}
          {riskText(student.risk_level)}
        </span>
        {student.risk_rules.length ? (
          <div className="class-tag-row">
            {student.risk_rules.map((rule) => (
              <span key={rule}>{rule}</span>
            ))}
          </div>
        ) : (
          <em>未命中预警规则</em>
        )}
      </div>

      <div className="course-roster-metric">
        <span>完成</span>
        <b>
          {student.completed_count}/{student.task_total}
        </b>
        <em>{completionText(student.completed_count, student.task_total)}</em>
      </div>

      <div className="course-roster-metric">
        <span>逾期</span>
        <b>{student.overdue_count}</b>
        <em>{student.overdue_count ? "需要跟进" : "无逾期"}</em>
      </div>

      <div className="course-roster-metric">
        <span>平均分</span>
        <b>{scoreText(student.avg_score)}</b>
        <em>最近活动 {formatDate(student.last_activity_at)}</em>
      </div>

      <button className="review-back" type="button" onClick={onOpen}>
        <LineChart size={15} /> 查看学情
      </button>
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
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  unit?: string;
  note: string;
}) {
  return (
    <article className="class-card class-stat">
      <span className={tone}>{icon}</span>
      <p>{label}</p>
      <strong>
        {value}
        {unit ? <small> {unit}</small> : null}
      </strong>
      <em>{note}</em>
    </article>
  );
}
