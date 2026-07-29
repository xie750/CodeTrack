import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock3,
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
    return questions.filter((question) => (answers[question.question_id] ?? []).length > 0).length;
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
    return (answers[question.question_id] ?? []).length ? "answered" : "empty";
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
            <aside className="question-card question-nav-card">
              <header>
                <ListChecks size={20} />
                <div>
                  <h2>答题卡</h2>
                  <p>{answeredCount}/{questions.length} 已作答</p>
                </div>
              </header>
              <div className="question-progress-bar"><i style={{ width: `${progress}%` }} /></div>
              <div className="question-number-grid">
                {questions.map((question, index) => (
                  <button
                    className={`${activeIndex === index ? "active" : ""} ${questionState(question)}`}
                    type="button"
                    key={question.question_id}
                    onClick={() => setActiveIndex(index)}
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
            </aside>

            <article className="question-card question-main-card">
              <header className="question-main-header">
                <div>
                  <span className="question-type">{typeText(activeQuestion.question_type)}</span>
                  <span className="question-score">{activeQuestion.score} 分</span>
                </div>
                <div className="question-knowledge">
                  {activeQuestion.knowledge_points.map((point) => <span key={point}>{point}</span>)}
                </div>
              </header>

              <h2>{activeIndex + 1}. {activeQuestion.stem}</h2>
              <div className="question-options">
                {activeQuestion.options.map((option) => {
                  const selected = (answers[activeQuestion.question_id] ?? []).includes(option.option_id);
                  const correct = submitted && option.is_correct;
                  const wrongPick = submitted && selected && !option.is_correct;
                  return (
                    <button
                      className={`${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrongPick ? "wrong" : ""}`}
                      type="button"
                      key={option.option_id}
                      onClick={() => chooseOption(activeQuestion, option.option_id)}
                    >
                      <span className="option-marker">
                        {activeQuestion.question_type === "MULTIPLE_CHOICE"
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

              {submitted ? (
                <section className={`question-analysis ${activeQuestion.is_correct ? "correct" : "wrong"}`}>
                  <h3>{activeQuestion.is_correct ? "回答正确" : "回答有误"}</h3>
                  <p>{activeQuestion.analysis || "本题暂无解析。"}</p>
                </section>
              ) : (
                <section className="question-tip">
                  <ClipboardCheck size={18} />
                  <p>{activeQuestion.question_type === "MULTIPLE_CHOICE" ? "本题为多选，少选或多选都不得分。" : "选择后可继续切换题号，交卷前仍可修改。"}</p>
                </section>
              )}

              <footer className="question-main-footer">
                <button type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}><ChevronLeft size={16} /> 上一题</button>
                <button className="primary" type="button" disabled={activeIndex === questions.length - 1} onClick={() => setActiveIndex((index) => Math.min(questions.length - 1, index + 1))}>下一题 <ChevronRight size={16} /></button>
              </footer>
            </article>

            <aside className="question-card question-side-card">
              <section>
                <h2><Clock3 size={19} /> 作答概览</h2>
                <div className="question-score-ring">
                  <strong>{result ? Math.round(result.score_percent) : progress}<small>%</small></strong>
                  <span>{submitted ? "本次得分" : "完成进度"}</span>
                </div>
                <p>正确 {result?.correct_count ?? workspace.progress.passed_count} / {result?.total_count ?? questions.length} 题</p>
                {saveMessage ? <div className="question-save-message">{saveMessage}</div> : null}
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
