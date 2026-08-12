import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock3,
  FileText,
  ListChecks,
  Save,
  Send,
  XCircle
} from "lucide-react";
import { api, QuestionItem, QuestionWorkspace as QuestionWorkspaceData, SubmitQuestionResult } from "../api";
import avatarImg from "../assets/ui-home/avatar.png";

type PageProps = {
  assignmentId: string;
  onBack: () => void;
};

type AnswerMap = Record<string, string[]>;

function statusText(status: string) {
  const map: Record<string, string> = {
    NOT_STARTED: "未开始",
    DRAFT: "作答中",
    IN_PROGRESS: "作答中",
    SUBMITTED: "已提交",
    COMPLETED: "已完成"
  };
  return map[status] ?? status;
}

function typeText(type: string) {
  if (type === "MULTIPLE_CHOICE") return "多选题";
  if (type === "TRUE_FALSE") return "判断题";
  if (type === "FILL_BLANK" || type === "FILL_IN_BLANK" || type === "SHORT_ANSWER") return "填空题";
  return "单选题";
}

function deadlineText(value: string | null) {
  if (!value) return "未设置截止时间";
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

function buildInitialAnswers(questions: QuestionItem[]): AnswerMap {
  return questions.reduce((map, question) => {
    map[question.question_id] = question.selected_option_ids ?? [];
    return map;
  }, {} as AnswerMap);
}

function toAnswerPayload(answers: AnswerMap) {
  return Object.entries(answers).map(([question_id, selected_option_ids]) => ({
    question_id,
    selected_option_ids
  }));
}

function isAnswerPresent(question: QuestionItem, answers: AnswerMap) {
  const selected = answers[question.question_id] ?? [];
  if (!question.options.length) return Boolean(selected[0]?.trim());
  return selected.length > 0;
}

export default function QuestionWorkspace({ assignmentId, onBack }: PageProps) {
  const [workspace, setWorkspace] = useState<QuestionWorkspaceData | null>(null);
  const [result, setResult] = useState<SubmitQuestionResult | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const questionRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .getQuestionWorkspace(assignmentId)
      .then((data) => {
        if (!alive) return;
        setWorkspace(data);
        setAnswers(buildInitialAnswers(data.questions));
        if (data.attempt.status === "SUBMITTED") {
          setResult({
            attempt_id: data.attempt.attempt_id ?? "",
            status: data.attempt.status,
            score: data.attempt.score ?? 0,
            max_score: data.attempt.max_score,
            score_percent: data.progress.score ?? 0,
            correct_count: data.attempt.correct_count,
            total_count: data.attempt.total_count,
            submitted_at: data.attempt.submitted_at,
            questions: data.questions,
            profile_signal: {
              overall_progress: 0,
              logic_error_rate: 0,
              recent_task_completion: 0,
              summary: "本次作答结果已同步到学习画像。",
              recommendation: "可在学习画像页查看最新掌握度。"
            }
          });
        }
      })
      .catch(() => {
        if (alive) setError("题目任务加载失败，请返回任务列表后重试。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [assignmentId]);

  const questions = result?.questions ?? workspace?.questions ?? [];
  const activeQuestion = questions[activeIndex];
  const answeredCount = useMemo(() => {
    return questions.filter((question) => isAnswerPresent(question, answers)).length;
  }, [answers, questions]);
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const submitted = Boolean(result);

  function chooseOption(question: QuestionItem, optionId: string) {
    if (submitted) return;
    setAnswers((current) => {
      const selected = current[question.question_id] ?? [];
      const isMulti = question.question_type === "MULTIPLE_CHOICE";
      const nextSelected = isMulti
        ? selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId]
        : [optionId];
      return { ...current, [question.question_id]: nextSelected };
    });
    setSaveMessage(null);
  }

  function fillAnswer(question: QuestionItem, value: string) {
    if (submitted) return;
    setAnswers((current) => ({
      ...current,
      [question.question_id]: value.trim() ? [value] : []
    }));
    setSaveMessage(null);
  }

  function jumpToQuestion(index: number) {
    setActiveIndex(index);
    questionRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveDraft() {
    if (!workspace || submitted) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await api.saveQuestionAnswers(workspace.assignment.assignment_id, toAnswerPayload(answers));
      setSaveMessage("草稿已保存");
    } catch {
      setSaveMessage("草稿保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function submitAnswers() {
    if (!workspace || submitted) return;
    const unanswered = questions.length - answeredCount;
    const confirmed = unanswered > 0
      ? window.confirm(`还有 ${unanswered} 道题未作答，确认交卷吗？`)
      : window.confirm("确认提交本次作答吗？提交后会生成批改结果并更新学习画像。");
    if (!confirmed) return;
    setSubmitting(true);
    setSaveMessage(null);
    try {
      const submittedResult = await api.submitQuestionAnswers(workspace.assignment.assignment_id, toAnswerPayload(answers));
      setResult(submittedResult);
      setWorkspace((current) => current ? {
        ...current,
        progress: {
          ...current.progress,
          status: "COMPLETED",
          score: submittedResult.score_percent,
          passed_count: submittedResult.correct_count,
          total_required_count: submittedResult.total_count
        },
        questions: submittedResult.questions
      } : current);
      setSaveMessage("已交卷，学习画像已更新");
    } catch {
      setSaveMessage("提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  function questionState(question: QuestionItem) {
    if (submitted) return question.is_correct ? "correct" : "wrong";
    return isAnswerPresent(question, answers) ? "answered" : "empty";
  }

  return (
    <div className="question-shell" data-assignment-id={assignmentId}>
      <header className="program-topbar">
        <div className="program-brand">
          <span className="program-brand-mark ct-brand-mark" aria-hidden="true" />
          <strong>Code<span>Track</span></strong>
        </div>
        <div className="program-top-actions">
          <img src={avatarImg} alt="学生头像" />
          <strong>学生端</strong>
        </div>
      </header>

      {loading ? (
        <main className="question-page">
          <section className="question-head skeleton-block" />
          <section className="question-layout">
            <aside className="question-card skeleton-block" />
            <article className="question-card skeleton-block" />
            <aside className="question-card skeleton-block" />
          </section>
        </main>
      ) : error || !workspace || !activeQuestion ? (
        <main className="question-page">
          <section className="question-card question-empty">
            <h1>题目暂不可用</h1>
            <p>{error ?? "没有读取到当前题目任务。"}</p>
            <button className="program-back" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回班级任务</button>
          </section>
        </main>
      ) : (
        <main className="question-page">
          <section className="question-head">
            <div>
              <button className="program-back" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回班级任务</button>
              <div className="question-title-line">
                <h1>{workspace.task.title}</h1>
                <span>{workspace.assignment.assignment_mode === "EXAM" ? "考核任务" : "练习任务"} · {statusText(workspace.progress.status)}</span>
              </div>
              <p>{workspace.task.course_name} · 发布老师：{workspace.task.teacher_name} · 截止：{deadlineText(workspace.assignment.deadline)}</p>
            </div>
            <div className="question-head-actions">
              <button type="button" disabled={saving || submitted} onClick={saveDraft}><Save size={16} /> {saving ? "保存中" : "保存草稿"}</button>
              <button className="primary" type="button" disabled={submitting || submitted} onClick={submitAnswers}><Send size={16} /> {submitted ? "已交卷" : submitting ? "提交中" : "交卷"}</button>
            </div>
          </section>

          <section className="question-layout">
            <article className="question-card question-main-card">
              <header className="question-paper-header">
                <div>
                  <span className="question-paper-eyebrow">{workspace.task.course_name}</span>
                  <h2>{workspace.task.title}</h2>
                  <p>{workspace.task.description}</p>
                </div>
                <div className="question-paper-score">
                  <strong>{workspace.attempt.max_score}</strong>
                  <span>总分</span>
                </div>
              </header>

              <section className="question-notice">
                <AlertCircle size={17} />
                <div>
                  <strong>作答说明</strong>
                  <p>请按题目要求完成选择或填空。答案会自动保留在当前页面，交卷前可继续修改。</p>
                </div>
              </section>

              <div className="question-list">
                {questions.map((question, index) => {
                  const selectedAnswers = answers[question.question_id] ?? [];
                  const isFillQuestion = !question.options.length;
                  return (
                    <section
                      className={`question-item ${activeIndex === index ? "active" : ""}`}
                      key={question.question_id}
                      ref={(node) => {
                        questionRefs.current[index] = node;
                      }}
                    >
                      <header className="question-main-header">
                        <div>
                          <span className="question-index">{index + 1}</span>
                          <span className="question-type">{typeText(question.question_type)}</span>
                          <span className="question-score">{question.score} 分</span>
                        </div>
                        <div className="question-knowledge">
                          {question.knowledge_points.map((point) => <span key={point}>{point}</span>)}
                        </div>
                      </header>

                      <h3>{question.stem}</h3>

                      {isFillQuestion ? (
                        <label className="question-fill">
                          <span>我的答案</span>
                          <textarea
                            value={selectedAnswers[0] ?? ""}
                            disabled={submitted}
                            rows={3}
                            onChange={(event) => fillAnswer(question, event.target.value)}
                            placeholder="在这里填写答案"
                          />
                        </label>
                      ) : (
                        <div className="question-options">
                          {question.options.map((option) => {
                            const selected = selectedAnswers.includes(option.option_id);
                            const correct = submitted && option.is_correct;
                            const wrongPick = submitted && selected && !option.is_correct;
                            return (
                              <button
                                className={`${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrongPick ? "wrong" : ""}`}
                                type="button"
                                key={option.option_id}
                                onClick={() => {
                                  setActiveIndex(index);
                                  chooseOption(question, option.option_id);
                                }}
                                aria-pressed={selected}
                              >
                                <span className="option-marker">
                                  {question.question_type === "MULTIPLE_CHOICE"
                                    ? selected ? <Check size={15} /> : null
                                    : selected ? <Circle size={10} fill="currentColor" /> : null}
                                </span>
                                <strong>{option.label}</strong>
                                <p>{option.content}</p>
                                {correct ? <CheckCircle2 size={18} /> : wrongPick ? <XCircle size={18} /> : null}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {submitted ? (
                        <section className={`question-analysis ${question.is_correct ? "correct" : "wrong"}`}>
                          <h4>{question.is_correct ? "回答正确" : "回答有误"}</h4>
                          <p>{question.analysis || "本题暂无解析。"}</p>
                        </section>
                      ) : null}
                    </section>
                  );
                })}
              </div>

              <section className="question-tip">
                <ClipboardCheck size={18} />
                <p>{activeQuestion.question_type === "MULTIPLE_CHOICE" ? "当前题为多选，少选或多选都不得分。" : "可以通过右侧题号快速定位题目，交卷前仍可修改答案。"}</p>
              </section>

              <footer className="question-main-footer">
                <button type="button" disabled={activeIndex === 0} onClick={() => jumpToQuestion(Math.max(0, activeIndex - 1))}><ChevronLeft size={16} /> 上一题</button>
                <span>{activeIndex + 1} / {questions.length}</span>
                <button className="primary" type="button" disabled={activeIndex === questions.length - 1} onClick={() => jumpToQuestion(Math.min(questions.length - 1, activeIndex + 1))}>下一题 <ChevronRight size={16} /></button>
              </footer>
            </article>

            <aside className="question-card question-side-card">
              <section>
                <h2><Clock3 size={19} /> 作答进度</h2>
                <div className="question-timer">
                  <strong>{result ? `${Math.round(result.score_percent)}%` : `${progress}%`}</strong>
                  <span>{submitted ? "本次得分" : "当前完成"}</span>
                </div>
                <div className="question-progress-row">
                  <span>已答 {answeredCount} / {questions.length} 题</span>
                  <b>{progress}%</b>
                </div>
                <div className="question-progress-bar"><i style={{ width: `${progress}%` }} /></div>
                <p>正确 {result?.correct_count ?? workspace.progress.passed_count} / {result?.total_count ?? questions.length} 题</p>
                {saveMessage ? <div className="question-save-message">{saveMessage}</div> : null}
              </section>

              <section className="question-nav-card">
                <header>
                  <ListChecks size={19} />
                  <div>
                    <h2>题目列表</h2>
                    <p>{answeredCount}/{questions.length} 已作答</p>
                  </div>
                </header>
                <div className="question-number-grid">
                  {questions.map((question, index) => (
                    <button
                      className={`${activeIndex === index ? "active" : ""} ${questionState(question)}`}
                      type="button"
                      key={question.question_id}
                      onClick={() => jumpToQuestion(index)}
                      aria-label={`第 ${index + 1} 题`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
                <div className="question-legend">
                  <span><i className="answered" /> 已答</span>
                  <span><i className="empty" /> 未答</span>
                  {submitted ? <><span><i className="correct" /> 正确</span><span><i className="wrong" /> 错误</span></> : null}
                </div>
              </section>

              <section>
                <h2><FileText size={19} /> 温馨提示</h2>
                <ul className="question-side-tips">
                  <li>请仔细阅读题目，确认后再提交答案。</li>
                  <li>可通过题目列表快速跳转。</li>
                  <li>交卷后将无法撤回，请确认所有题目已完成。</li>
                </ul>
              </section>

              <section className="question-ai-panel">
                <h2><Bot size={20} /> AI 学习反馈</h2>
                {result ? (
                  <>
                    <p>{result.profile_signal.summary}</p>
                    <div className="question-profile-signal">
                      <span>画像进度</span>
                      <strong>{Math.round(result.profile_signal.overall_progress)}%</strong>
                    </div>
                    <p>{result.profile_signal.recommendation}</p>
                  </>
                ) : (
                  <p>交卷后会根据正确率、错因和知识点生成画像事件，并更新掌握度与下一步建议。</p>
                )}
              </section>
            </aside>
          </section>
        </main>
      )}
    </div>
  );
}
