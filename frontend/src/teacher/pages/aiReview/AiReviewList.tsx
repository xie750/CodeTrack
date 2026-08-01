import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BookMarked,
  CheckCircle2,
  FileWarning,
  Gauge,
  Lightbulb,
  PencilLine,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { getAiReviewQueue } from "../../teacherApi";
import type { AiReviewQueue, AiReviewRow, AiReviewStatus } from "../../teacherTypes";
import {
  LOW_CONFIDENCE_THRESHOLD,
  REVIEW_STATUS_TEXT,
  confidencePercent,
  diagnosisTypeText,
  formatDateTime,
  queueReasonText,
  reviewBadgeClass,
} from "./aiReviewLabels";

/**
 * AI 审核列表（开发方案 §十一 11.2 A）
 *
 * 队列口径由后端定（低置信度、规则兜底、引用不足、模型请求复核都会入队），前端只
 * 负责筛选和展示。控件样式沿用学生端那套卡片 / 徽标 / 分段筛选，不使用 antd 默认外观。
 */

type StatusTab = "ALL" | AiReviewStatus;

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "PENDING", label: "待审核" },
  { key: "ACCEPTED", label: "已接受" },
  { key: "MODIFIED", label: "已修改" },
  { key: "REJECTED", label: "已驳回" },
];

const CONFIDENCE_OPTIONS = [
  { value: "", label: "置信度：不限" },
  { value: "0.6", label: `置信度 ≤ ${LOW_CONFIDENCE_THRESHOLD}（低置信）` },
  { value: "0.4", label: "置信度 ≤ 0.4" },
  { value: "0.2", label: "置信度 ≤ 0.2" },
];

const PAGE_SIZE = 20;

export default function AiReviewList() {
  const navigate = useNavigate();

  const [statusTab, setStatusTab] = useState<StatusTab>("PENDING");
  const [confidenceMax, setConfidenceMax] = useState("");
  const [diagnosisType, setDiagnosisType] = useState("");
  const [studentInput, setStudentInput] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [page, setPage] = useState(1);

  const [queue, setQueue] = useState<AiReviewQueue | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 搜索框防抖，避免每敲一个字就打一次接口
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStudentQuery(studentInput.trim());
      setPage(1);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [studentInput]);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError("");
    getAiReviewQueue({
      reviewStatus: statusTab === "ALL" ? undefined : statusTab,
      confidenceMax: confidenceMax ? Number(confidenceMax) : undefined,
      diagnosisType: diagnosisType || undefined,
      student: studentQuery || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        if (!alive) return;
        setQueue(data);
        // 后端把筛选后的总数放在 meta 里，request 只透传 data，
        // 所以这里用当前页长度反推是否还有下一页
        setTotal(data.items.length);
      })
      .catch(() => {
        if (!alive) return;
        setQueue(null);
        setError("审核队列加载失败。请确认已用教师账号登录，后端服务可用后重试。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [statusTab, confidenceMax, diagnosisType, studentQuery, page]);

  useEffect(() => load(), [load]);

  const stats = queue?.stats;
  const items = queue?.items ?? [];

  const statCards = useMemo(
    () => [
      {
        key: "PENDING" as StatusTab,
        title: "待审核",
        value: stats?.pending ?? 0,
        sub: "低置信或规则兜底，需人工确认",
        icon: <FileWarning size={28} />,
        color: "orange",
      },
      {
        key: "ALL" as StatusTab,
        title: "低置信度",
        value: stats?.low_confidence ?? 0,
        sub: `置信度低于 ${LOW_CONFIDENCE_THRESHOLD} 自动入队`,
        icon: <Gauge size={28} />,
        color: "indigo",
      },
      {
        key: "ACCEPTED" as StatusTab,
        title: "已接受",
        value: stats?.accepted ?? 0,
        sub: "学生端显示教师已确认",
        icon: <CheckCircle2 size={28} />,
        color: "green",
      },
      {
        key: "MODIFIED" as StatusTab,
        title: "已修改",
        value: stats?.modified ?? 0,
        sub: "学生端显示教师已修改",
        icon: <PencilLine size={28} />,
        color: "",
      },
      {
        key: "REJECTED" as StatusTab,
        title: "已驳回",
        value: stats?.rejected ?? 0,
        sub: "原始诊断仍完整留档",
        icon: <XCircle size={28} />,
        color: "orange",
      },
    ],
    [stats]
  );

  const typeOptions = queue?.diagnosis_types ?? [];
  const hasNextPage = items.length === PAGE_SIZE;

  return (
    <div className="review-page">
      <header className="review-head">
        <div className="review-head-copy">
          <h1>AI 审核</h1>
          <p>
            审核低置信度、规则兜底和引用不足的 AI 诊断。教师结论单独保存，不覆盖原始 AI
            输出；审核不会修改学生成绩，也不会改动学习画像分数。
          </p>
        </div>
        <div className="review-head-actions">
          <button className="review-back" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> {loading ? "加载中" : "刷新队列"}
          </button>
        </div>
      </header>

      {error ? <p className="review-message error">{error}</p> : null}

      <section className="review-stats" aria-label="审核队列概览">
        {statCards.map((card) => (
          <button
            className="class-card class-stat"
            type="button"
            key={card.title}
            aria-pressed={statusTab === card.key}
            onClick={() => {
              setStatusTab(card.key);
              setPage(1);
            }}
          >
            <span className={card.color}>{card.icon}</span>
            <p>{card.title}</p>
            <strong>
              {loading && !stats ? "..." : card.value}
              <small> 条</small>
            </strong>
            <em>{card.sub}</em>
          </button>
        ))}
      </section>

      <div className="review-filters">
        <div className="class-tabs" role="group" aria-label="审核状态筛选">
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
            aria-label="置信度筛选"
            value={confidenceMax}
            onChange={(event) => {
              setConfidenceMax(event.target.value);
              setPage(1);
            }}
          >
            {CONFIDENCE_OPTIONS.map((option) => (
              <option value={option.value} key={option.label}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            className="review-select"
            aria-label="诊断类型筛选"
            value={diagnosisType}
            onChange={(event) => {
              setDiagnosisType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">诊断类型：不限</option>
            {typeOptions.map((type) => (
              <option value={type} key={type}>
                {diagnosisTypeText(type)}
              </option>
            ))}
          </select>

          <div className="review-search">
            <Search size={15} />
            <input
              type="search"
              aria-label="按学生姓名或学号搜索"
              placeholder="搜索学生姓名或学号"
              value={studentInput}
              onChange={(event) => setStudentInput(event.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <section className="review-list" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <article className="class-card review-row skeleton-block" key={index} />
          ))}
        </section>
      ) : items.length === 0 ? (
        <div className="class-empty">
          <h2>当前筛选条件下没有待审核的 AI 诊断</h2>
          <p>
            审核队列只收录教师本人任教班级、已发布任务上产生的诊断。学生完成提交并触发
            诊断后，低置信度、规则兜底或引用不足的结果会自动出现在这里。
          </p>
        </div>
      ) : (
        <section className="review-list" aria-label="待审核 AI 诊断">
          {items.map((row) => (
            <ReviewRow
              key={row.diagnosis_id}
              row={row}
              onOpen={() => navigate(`/teacher/ai-review/${row.diagnosis_id}`)}
            />
          ))}
        </section>
      )}

      {!loading && (page > 1 || hasNextPage) ? (
        <div className="review-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            上一页
          </button>
          <span>
            第 {page} 页 · 本页 {total} 条
          </span>
          <button type="button" disabled={!hasNextPage} onClick={() => setPage((value) => value + 1)}>
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ReviewRow({ row, onOpen }: { row: AiReviewRow; onOpen: () => void }) {
  const percent = confidencePercent(row.confidence);
  const isLow = row.confidence < LOW_CONFIDENCE_THRESHOLD;
  const pending = row.review_status === "PENDING";

  return (
    <article className={`class-card review-row${pending ? " pending" : ""}`}>
      <span className={`review-badge ${reviewBadgeClass(row.review_status)}`}>
        {row.review_status === "PENDING" ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
        {REVIEW_STATUS_TEXT[row.review_status]}
      </span>

      <div className="review-row-main">
        <h2>
          <span>{row.task_title || row.task_id}</span>
          <em className="review-tag">{diagnosisTypeText(row.diagnosis_type)}</em>
        </h2>
        <p>{row.explanation}</p>
        <div className="review-row-meta">
          <span>
            <UserRound size={13} /> {row.student_name || row.student_id}
          </span>
          <span>第 {row.version_no} 版</span>
          <span>
            <XCircle size={13} /> 失败测试 {row.failed_test_count}
          </span>
          <span>
            <BookMarked size={13} /> 引用 {row.citation_count}
          </span>
          <span>
            <Lightbulb size={13} /> 最高提示 {row.highest_hint_level} 级
          </span>
          <span>{formatDateTime(row.created_at)}</span>
        </div>
      </div>

      <div className="review-reasons">
        {row.queue_reasons.length === 0 ? (
          <span>无入队标记</span>
        ) : (
          row.queue_reasons.slice(0, 2).map((reason) => (
            <span key={reason}>{queueReasonText(reason)}</span>
          ))
        )}
      </div>

      <div className={`review-confidence${isLow ? " low" : ""}`}>
        <b>{percent}%</b>
        <i>
          <b style={{ width: `${Math.max(4, percent)}%` }} />
        </i>
        <em>{isLow ? "低置信度" : "置信度正常"}</em>
      </div>

      <button className={pending ? "primary" : ""} type="button" onClick={onOpen}>
        {pending ? "去审核" : "查看审核"}
      </button>
    </article>
  );
}
