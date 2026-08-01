import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookMarked,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  EyeOff,
  Gauge,
  Lightbulb,
  Lock,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  acceptAiReview,
  getAiReviewDetail,
  modifyAiReview,
  rejectAiReview,
} from "../../teacherApi";
import type { AiReviewDetailData } from "../../teacherTypes";
import {
  LOW_CONFIDENCE_THRESHOLD,
  REVIEW_STATUS_TEXT,
  STUDENT_FACING_TEXT,
  confidencePercent,
  diagnosisTypeText,
  formatDateTime,
  queueReasonText,
  reviewBadgeClass,
} from "./aiReviewLabels";

/**
 * AI 审核详情（开发方案 §十一 11.2 B）
 *
 * 三栏：左「学生代码 + 测试结果」，中「原始 AI 诊断 + 置信度 + 知识引用」，
 * 右「教师修订 + 审核动作」。左中两栏全部只读 —— 原始 AI 输出不可编辑（§11.4），
 * 教师意见只能通过右栏写成新的审核记录。
 *
 * 「重新生成」按钮保持禁用：重跑模型需要复用学生侧诊断链路并处理同一版本只能有一条
 * 诊断的约束，后端尚未提供该接口，这里不做假的成功反馈。
 */

type ActionState = "" | "accept" | "modify" | "reject";

export default function AiReviewDetail() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<AiReviewDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<ActionState>("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const load = useCallback(() => {
    if (!reviewId) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    getAiReviewDetail(reviewId)
      .then((data) => {
        if (!alive) return;
        setDetail(data);
        // 已有修订正文时带出来，教师可以在原修订基础上继续调整
        setRevision(data.reviews[0]?.revised_explanation ?? "");
      })
      .catch(() => {
        if (!alive) return;
        setDetail(null);
        setError("审核详情加载失败。该诊断可能不存在，或不在你任教的班级范围内。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reviewId]);

  useEffect(() => load(), [load]);

  async function runAction(action: ActionState) {
    if (!reviewId || !action) return;
    if (action === "modify" && !revision.trim()) {
      setActionError("修改后接受必须先填写教师修订后的解释。");
      setActionSuccess("");
      return;
    }
    setSubmitting(action);
    setActionError("");
    setActionSuccess("");
    const payload = { note: note.trim(), revised_explanation: revision.trim() };
    try {
      const updated =
        action === "accept"
          ? await acceptAiReview(reviewId, { note: payload.note })
          : action === "modify"
            ? await modifyAiReview(reviewId, payload)
            : await rejectAiReview(reviewId, { note: payload.note });
      setDetail(updated);
      setNote("");
      setActionSuccess(
        `已保存审核结论：${REVIEW_STATUS_TEXT[updated.review_status]}。学生端将显示「${
          STUDENT_FACING_TEXT[updated.review_status]
        }」。`
      );
    } catch {
      setActionError("审核结论保存失败，原始 AI 诊断未受影响。请稍后重试。");
    } finally {
      setSubmitting("");
    }
  }

  if (!reviewId) {
    return (
      <div className="review-page">
        <p className="review-message error">缺少审核记录 ID，无法定位诊断。</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="review-page">
        <header className="review-head">
          <div className="review-head-copy">
            <h1>AI 审核详情</h1>
            <p>正在读取学生代码、测试结果与原始 AI 诊断。</p>
          </div>
        </header>
        <section className="review-detail-grid" aria-busy="true">
          <div className="review-column">
            <article className="class-card review-panel skeleton-block" style={{ minHeight: 360 }} />
          </div>
          <div className="review-column">
            <article className="class-card review-panel skeleton-block" style={{ minHeight: 360 }} />
          </div>
          <div className="review-column">
            <article className="class-card review-panel skeleton-block" style={{ minHeight: 300 }} />
          </div>
        </section>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="review-page">
        <header className="review-head">
          <div className="review-head-copy">
            <h1>AI 审核详情</h1>
          </div>
          <button className="review-back" type="button" onClick={() => navigate("/teacher/ai-review")}>
            <ArrowLeft size={15} /> 返回审核列表
          </button>
        </header>
        <p className="review-message error">{error || "没有读取到审核详情。"}</p>
      </div>
    );
  }

  const percent = confidencePercent(detail.confidence);
  const isLow = detail.confidence < LOW_CONFIDENCE_THRESHOLD;
  const currentReview = detail.reviews[0] ?? null;
  const codeLines = detail.source_code ? detail.source_code.replace(/\s+$/, "").split("\n") : [];
  const busy = submitting !== "";

  return (
    <div className="review-page">
      <header className="review-head">
        <div className="review-head-copy">
          <h1>AI 审核详情</h1>
          <p>
            对照学生代码和失败测试审核这条诊断。审核结果决定学生端显示「AI 建议」「教师已
            确认」还是「教师已修改」；原始 AI 输出始终保留，不会被覆盖。
          </p>
          <div className="review-row-meta">
            <span>
              <UserRound size={13} /> {detail.student_name || detail.student_id}
            </span>
            <span>{detail.task_title || detail.task_id}</span>
            <span>{detail.course_name}</span>
            <span>第 {detail.version_no} 版 · {detail.language}</span>
            <span>提交于 {formatDateTime(detail.submitted_at)}</span>
          </div>
        </div>
        <div className="review-head-actions">
          <span className={`review-badge ${reviewBadgeClass(detail.review_status)}`}>
            {detail.review_status === "PENDING" ? (
              <AlertTriangle size={13} />
            ) : (
              <ShieldCheck size={13} />
            )}
            {REVIEW_STATUS_TEXT[detail.review_status]}
          </span>
          <button className="review-back" type="button" onClick={() => navigate("/teacher/ai-review")}>
            <ArrowLeft size={15} /> 返回列表
          </button>
        </div>
      </header>

      <section className="review-detail-grid">
        {/* 左栏：审核依据 —— 学生代码与系统判题结果 */}
        <div className="review-column">
          <article className="class-card review-panel">
            <header>
              <h2>
                <Code2 size={16} /> 学生代码（只读）
              </h2>
              <span className="review-panel-note">第 {detail.version_no} 版 · {detail.language}</span>
            </header>
            {codeLines.length === 0 ? (
              <p className="review-panel-note">该版本没有保存源代码。</p>
            ) : (
              <pre className="review-code">
                {codeLines.map((line, index) => (
                  <span key={`${index}-${line}`}>
                    <em>{index + 1}</em>
                    <code>{line}</code>
                  </span>
                ))}
              </pre>
            )}
          </article>

          <article className="class-card review-panel">
            <header>
              <h2>系统判题结果</h2>
              <span className="review-panel-note">
                通过 {detail.passed_test_count}/{detail.tests.length}
                {detail.execution ? ` · 编译${detail.execution.compile_exit_code === 0 ? "成功" : "失败"}` : ""}
              </span>
            </header>

            {detail.execution && detail.execution.compiler_stderr ? (
              <pre className="review-code" style={{ maxHeight: 140, marginBottom: 12 }}>
                <span>
                  <em>!</em>
                  <code>{detail.execution.compiler_stderr}</code>
                </span>
              </pre>
            ) : null}

            {detail.tests.length === 0 ? (
              <p className="review-panel-note">该版本没有测试结果记录。</p>
            ) : (
              <div className="review-tests">
                {detail.tests.map((test) => (
                  <div
                    className={`review-test${test.status === "FAILED" ? " failed" : ""}`}
                    key={test.test_case_id}
                  >
                    <div className="review-test-head">
                      {test.status === "PASSED" ? <Check size={14} /> : <XCircle size={14} />}
                      {test.name}
                      {test.visibility !== "PUBLIC" ? (
                        <span className="review-tag hidden-case">
                          <EyeOff size={11} /> 隐藏用例
                        </span>
                      ) : null}
                      <span className={`review-tag ${test.status === "PASSED" ? "pass" : "fail"}`}>
                        {test.status === "PASSED" ? "通过" : "失败"}
                      </span>
                    </div>
                    <dl>
                      <dt>期望</dt>
                      <dd>{test.expected_output_summary || "-"}</dd>
                      <dt>实际</dt>
                      <dd>{test.actual_output || "-"}</dd>
                      {test.error_message ? (
                        <>
                          <dt>错误</dt>
                          <dd>{test.error_message}</dd>
                        </>
                      ) : null}
                      <dt>错误标签</dt>
                      <dd>{test.error_tag || "-"}</dd>
                    </dl>
                  </div>
                ))}
              </div>
            )}
            <p className="review-field-hint">
              隐藏用例的完整输入输出只在教师端展示，不会下发到学生端。
            </p>
          </article>
        </div>

        {/* 中栏：原始 AI 诊断与知识引用，全部只读 */}
        <div className="review-column">
          <article className="class-card review-panel">
            <header>
              <h2>
                <Bot size={16} /> 原始 AI 诊断
              </h2>
              <span className="review-panel-note">{diagnosisTypeText(detail.diagnosis_type)}</span>
            </header>

            <div className="review-ai-original">{detail.explanation}</div>
            <p className="review-ai-locked">
              <Lock size={12} /> 原始 AI 输出不可编辑。教师意见保存为独立记录。
            </p>

            <div className={`review-confidence${isLow ? " low" : ""}`} style={{ marginTop: 14 }}>
              <b>
                <Gauge size={14} /> 置信度 {percent}%
              </b>
              <i>
                <b style={{ width: `${Math.max(4, percent)}%` }} />
              </i>
              <em>{isLow ? `低于阈值 ${LOW_CONFIDENCE_THRESHOLD}，已自动进入审核队列` : "置信度正常"}</em>
            </div>

            <div className="review-reasons" style={{ marginTop: 12 }}>
              {detail.queue_reasons.map((reason) => (
                <span key={reason}>{queueReasonText(reason)}</span>
              ))}
            </div>

            <dl className="review-meta-list">
              <dt>诊断状态</dt>
              <dd>{detail.diagnosis_status}</dd>
              <dt>模型来源</dt>
              <dd>
                {detail.model_provider} / {detail.model_name}
              </dd>
              <dt>提示词版本</dt>
              <dd>{detail.prompt_version}</dd>
              <dt>验证证据</dt>
              <dd>{detail.verified_evidence_ids.join("、") || "无"}</dd>
              <dt>生成时间</dt>
              <dd>{formatDateTime(detail.created_at)}</dd>
            </dl>
          </article>

          <article className="class-card review-panel">
            <header>
              <h2>
                <BookMarked size={16} /> 知识引用
              </h2>
              <span className="review-panel-note">{detail.knowledge_sources.length} 条</span>
            </header>
            {detail.knowledge_sources.length === 0 ? (
              <p className="review-panel-note">
                这条诊断没有引用任何课程知识源，属于引用不足，需要重点核对结论是否可靠。
              </p>
            ) : (
              <div className="review-tests">
                {detail.knowledge_sources.map((source) => (
                  <div className="review-source" key={source.source_id}>
                    <h3>{source.title}</h3>
                    <p>{source.summary}</p>
                    <div className="review-source-meta">
                      <span className="review-tag">{source.source_type}</span>
                      <span className="review-tag">权威等级 {source.authority_level}</span>
                      <span className="review-tag">{source.version}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          {detail.hints.length > 0 ? (
            <article className="class-card review-panel">
              <header>
                <h2>
                  <Lightbulb size={16} /> 学生已查看的提示
                </h2>
                <span className="review-panel-note">最高 {detail.highest_hint_level} 级</span>
              </header>
              <div className="review-tests">
                {detail.hints.map((hint) => (
                  <div className="review-test" key={hint.level}>
                    <div className="review-test-head">
                      第 {hint.level} 级
                      <span className="review-tag">{formatDateTime(hint.viewed_at)}</span>
                    </div>
                    <p className="review-field-hint">{hint.content}</p>
                  </div>
                ))}
              </div>
            </article>
          ) : null}
        </div>

        {/* 右栏：教师修订与审核动作 */}
        <div className="review-column">
          <article className="class-card review-panel review-actions">
            <header>
              <h2>教师审核</h2>
              <span className="review-panel-note">学生端：{STUDENT_FACING_TEXT[detail.review_status]}</span>
            </header>

            {actionError ? <p className="review-message error">{actionError}</p> : null}
            {actionSuccess ? <p className="review-message success">{actionSuccess}</p> : null}

            <div className="review-field">
              <label htmlFor="review-revision">教师修订后的解释</label>
              <textarea
                id="review-revision"
                rows={7}
                value={revision}
                placeholder="仅在「修改后接受」时生效。写清学生真正错在哪里、下一步怎么改。"
                onChange={(event) => setRevision(event.target.value)}
              />
              <p className="review-field-hint">
                修订内容会作为最终解释发布给学生，原始 AI 诊断仍完整留档。
              </p>
            </div>

            <div className="review-field">
              <label htmlFor="review-note">审核备注</label>
              <textarea
                id="review-note"
                rows={3}
                value={note}
                placeholder="填写审核原因，供后续复盘与教学改进使用。"
                onChange={(event) => setNote(event.target.value)}
              />
              <p className="review-field-hint">备注属于教师内部记录，不展示给学生。</p>
            </div>

            <div className="review-action-buttons">
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => runAction("accept")}
              >
                <CheckCircle2 size={16} /> {submitting === "accept" ? "保存中..." : "接受原始诊断"}
              </button>
              <button
                type="button"
                disabled={busy || !revision.trim()}
                onClick={() => runAction("modify")}
              >
                <PencilLine size={16} /> {submitting === "modify" ? "保存中..." : "修改后接受"}
              </button>
              <button
                className="danger"
                type="button"
                disabled={busy}
                onClick={() => runAction("reject")}
              >
                <XCircle size={16} /> {submitting === "reject" ? "保存中..." : "驳回该诊断"}
              </button>
              <button type="button" disabled title="重新调用模型的接口尚未接入">
                <RefreshCw size={16} /> 重新生成（未接入）
              </button>
            </div>
            <p className="review-field-hint">
              审核只改变诊断的确认状态，不修改学生成绩，也不修改学习画像分数。
            </p>
          </article>

          <article className="class-card review-panel">
            <header>
              <h2>审核记录</h2>
              <span className="review-panel-note">{detail.reviews.length} 条</span>
            </header>
            {detail.reviews.length === 0 ? (
              <p className="review-panel-note">这条诊断还没有教师审核记录。</p>
            ) : (
              <div className="review-history">
                {detail.reviews.map((record) => (
                  <article
                    className={record.review_id === currentReview?.review_id ? "current" : ""}
                    key={record.review_id}
                  >
                    <header>
                      <span className={`review-badge ${reviewBadgeClass(record.action)}`}>
                        {REVIEW_STATUS_TEXT[record.action]}
                      </span>
                      {record.reviewer_name || record.reviewer_id}
                      <span style={{ marginLeft: "auto" }}>{formatDateTime(record.created_at)}</span>
                    </header>
                    {record.revised_explanation ? <p>{record.revised_explanation}</p> : null}
                    {record.note ? (
                      <p className="review-field-hint">备注：{record.note}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
            <p className="review-field-hint">
              审核记录只追加不覆盖，改变结论会新增一条，历史判断仍可追溯。
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
