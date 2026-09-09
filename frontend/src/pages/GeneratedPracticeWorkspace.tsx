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
  FileText,
  ListChecks,
  Mic,
  MicOff,
  Send,
  XCircle
} from "lucide-react";
import { api, type GeneratedPracticeWorkspace as GeneratedPracticeWorkspaceData, type QuestionItem, type SubmitQuestionResult } from "../api";
import AIContentDisclosure from "../components/AIContentDisclosure";
import StudentRouteBreadcrumb from "../components/StudentRouteBreadcrumb";
import { StudentState, studentErrorDetail, studentErrorMessage } from "../components/StudentState";
import { useQuestionVoiceControl, type QuestionAnswerMap } from "../questionVoiceControl";

type PageProps = {
  resourceId: string;
  onBack: () => void;
};

type AnswerMap = Record<string, string[]>;
type SubmitConfirmState = {
  answers: AnswerMap;
  answeredCount: number;
  unanswered: number;
};

function typeText(type: string) {
  if (type === "MULTIPLE_CHOICE") return "多选题";
  if (type === "TRUE_FALSE") return "判断题";
  if (type === "SHORT_ANSWER" || type === "FILL_BLANK" || type === "FILL_IN_BLANK") return "简答题";
  return "单选题";
}

function buildInitialAnswers(questions: QuestionItem[]): AnswerMap {
  return questions.reduce((map, question) => {
    map[question.question_id] = question.selected_option_ids ?? [];
    return map;
  }, {} as AnswerMap);
}

function isAnswerPresent(question: QuestionItem, answers: AnswerMap) {
  const selected = answers[question.question_id] ?? [];
  if (!question.options.length) return Boolean(selected[0]?.trim());
  return selected.length > 0;
}

function toAnswerPayload(answers: AnswerMap) {
  return Object.entries(answers).map(([question_id, selected_option_ids]) => ({
    question_id,
    selected_option_ids
  }));
}

export default function GeneratedPracticeWorkspace({ resourceId, onBack }: PageProps) {
  const [workspace, setWorkspace] = useState<GeneratedPracticeWorkspaceData | null>(null);
  const [result, setResult] = useState<SubmitQuestionResult | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitConfirm, setSubmitConfirm] = useState<SubmitConfirmState | null>(null);
  const questionRefs = useRef<Array<HTMLElement | null>>([]);
  const submitConfirmRef = useRef<SubmitConfirmState | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    api.getGeneratedPracticeWorkspace(resourceId)
      .then((data) => {
        if (!alive) return;
        setWorkspace(data);
        setAnswers(buildInitialAnswers(data.questions));
      })
      .catch((err) => {
        if (!alive) return;
        setError(studentErrorMessage(err, "练习题加载失败，请返回资源中心后重试。"));
        setErrorDetail(studentErrorDetail(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [resourceId]);

  const questions = result?.questions ?? workspace?.questions ?? [];
  const activeQuestion = questions[activeIndex];
  const submitted = Boolean(result);
  const answeredCount = useMemo(() => questions.filter((question) => isAnswerPresent(question, answers)).length, [answers, questions]);
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  useEffect(() => {
    submitConfirmRef.current = submitConfirm;
  }, [submitConfirm]);

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
    setNotice(null);
  }

  function fillAnswer(question: QuestionItem, value: string) {
    if (submitted) return;
    setAnswers((current) => ({
      ...current,
      [question.question_id]: value.trim() ? [value] : []
    }));
    setNotice(null);
  }

  function jumpToQuestion(index: number) {
    setActiveIndex(index);
    questionRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function requestSubmitAnswers(answerOverride?: QuestionAnswerMap) {
    if (!workspace || submitted) return;
    const pendingAnswers = answerOverride ?? answers;
    const pendingAnsweredCount = questions.filter((question) => isAnswerPresent(question, pendingAnswers)).length;
    const nextConfirm = {
      answers: pendingAnswers,
      answeredCount: pendingAnsweredCount,
      unanswered: questions.length - pendingAnsweredCount
    };
    submitConfirmRef.current = nextConfirm;
    setSubmitConfirm(nextConfirm);
  }

  function cancelSubmitConfirm() {
    submitConfirmRef.current = null;
    setSubmitConfirm(null);
  }

  async function confirmSubmitAnswers() {
    const pending = submitConfirmRef.current;
    if (!pending || !workspace || submitted || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const submittedResult = await api.submitGeneratedPractice(resourceId, toAnswerPayload(pending.answers));
      setResult(submittedResult);
      submitConfirmRef.current = null;
      setSubmitConfirm(null);
      setNotice("已提交，本次资源练习已纳入学习画像。");
    } catch (err) {
      setNotice("提交失败，请稍后重试。");
      setErrorDetail(studentErrorDetail(err));
    } finally {
      setSubmitting(false);
    }
  }

  const voiceControl = useQuestionVoiceControl({
    questions,
    answers,
    activeIndex,
    submitted,
    submitting,
    submitConfirmOpen: Boolean(submitConfirm),
    onAnswersChange: setAnswers,
    onJumpToQuestion: jumpToQuestion,
    onClearNotice: () => setNotice(null),
    onRequestSubmit: requestSubmitAnswers,
    onConfirmSubmit: confirmSubmitAnswers,
    onCancelSubmit: cancelSubmitConfirm
  });

  function questionState(question: QuestionItem) {
    if (submitted) return question.is_correct ? "correct" : "wrong";
    return isAnswerPresent(question, answers) ? "answered" : "empty";
  }

  if (loading) {
    return (
      <main className="question-page generated-practice-page">
        <section className="question-head skeleton-block" />
        <section className="question-layout">
          <article className="question-card skeleton-block" />
          <aside className="question-card skeleton-block" />
        </section>
      </main>
    );
  }

  if (error || !workspace || !activeQuestion) {
    return (
      <main className="question-page generated-practice-page">
        <StudentState
          kind="unavailable"
          title="练习题暂不可用"
          description={error ?? "没有读取到当前资源练习。"}
          detail={errorDetail}
          actions={[{ label: "返回资源中心", onClick: onBack, icon: <ArrowLeft size={15} /> }]}
          className="question-card question-empty"
        />
      </main>
    );
  }

  return (
    <main className="question-page generated-practice-page" data-resource-id={resourceId}>
      <section className="question-head">
        <div>
          <StudentRouteBreadcrumb
            className="question-route-breadcrumb"
            items={[
              { label: "学习入口", to: "/" },
              { label: "自主学习", to: "/self-study" },
              { label: "资源中心", to: "/self-study/library" },
              { label: workspace.resource.title }
            ]}
          />
          <button className="program-back" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回资源中心</button>
          <div className="question-title-line">
            <h1>{workspace.resource.title}</h1>
            <AIContentDisclosure
              compact
              confidence={workspace.resource.confidence}
              sourceLabel={(workspace.resource.citations ?? []).length ? "课程知识库与引用资料" : "自主学习上下文"}
              citationsCount={(workspace.resource.citations ?? []).length}
            />
            <span>资源中心练习 · {submitted ? "已提交" : "作答中"}</span>
          </div>
          <p>{workspace.course.course_name} · 知识点：{workspace.resource.knowledge_point || "自主学习"} · 来源：AI 生成练习题</p>
        </div>
        <div className="question-head-actions">
          <button className="primary" type="button" disabled={submitting || submitted} onClick={() => requestSubmitAnswers()}>
            <Send size={16} /> {submitted ? "已提交" : submitting ? "提交中" : "提交练习"}
          </button>
        </div>
      </section>

      <section className="question-layout">
        <article className="question-card question-main-card">
          <header className="question-paper-header">
            <div>
              <span className="question-paper-eyebrow">资源中心作答内核</span>
              <h2>{workspace.resource.title}</h2>
              <p>{workspace.resource.summary}</p>
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
              <p>生成预览只用于查看题面；正式作答从资源中心进入，提交后会把正确率、错因和知识点证据写入学习画像。</p>
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
                      <span className="question-score">{Math.round(question.score)} 分</span>
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
            <p>{activeQuestion.question_type === "MULTIPLE_CHOICE" ? "当前题为多选，少选或多选都不得分。" : "完成后可以在学习画像中看到这组练习带来的掌握度变化。"}</p>
          </section>

          <footer className="question-main-footer">
            <button type="button" disabled={activeIndex === 0} onClick={() => jumpToQuestion(Math.max(0, activeIndex - 1))}><ChevronLeft size={16} /> 上一题</button>
            <span>{activeIndex + 1} / {questions.length}</span>
            <button className="primary" type="button" disabled={activeIndex === questions.length - 1} onClick={() => jumpToQuestion(Math.min(questions.length - 1, activeIndex + 1))}>下一题 <ChevronRight size={16} /></button>
          </footer>
        </article>

        <aside className="question-card question-side-card">
          <section>
            <h2><FileText size={19} /> 作答进度</h2>
            <div className="question-timer">
              <strong>{result ? `${Math.round(result.score_percent)}%` : `${progress}%`}</strong>
              <span>{submitted ? "本次得分" : "当前完成"}</span>
            </div>
            <div className="question-progress-row">
              <span>已答 {answeredCount} / {questions.length} 题</span>
              <b>{progress}%</b>
            </div>
            <div className="question-progress-bar"><i style={{ width: `${progress}%` }} /></div>
            <p>正确 {result?.correct_count ?? 0} / {result?.total_count ?? questions.length} 题</p>
            {notice ? <div className="question-save-message">{notice}</div> : null}
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
          </section>

          <section className={`question-voice-panel ${voiceControl.voiceListening ? "listening" : ""}`}>
            <header>
              <div>
                <h2><Mic size={20} /> 语音作答控制</h2>
                <p>{voiceControl.voiceStatus}</p>
              </div>
              <button type="button" disabled={!voiceControl.voiceSupported || submitted} onClick={voiceControl.toggleVoiceListening} aria-pressed={voiceControl.voiceListening}>
                {voiceControl.voiceListening ? <MicOff size={16} /> : <Mic size={16} />}
                {voiceControl.voiceListening ? "暂停" : "开启"}
              </button>
            </header>
            <div className="question-voice-transcript" aria-live="polite">
              <span>最近识别</span>
              <strong>{voiceControl.voiceTranscript || "等待语音命令"}</strong>
            </div>
            {voiceControl.voiceLogs.length > 0 ? (
              <div className="question-voice-log">
                {voiceControl.voiceLogs.map((item) => (
                  <p className={item.tone} key={item.id}>{item.text}</p>
                ))}
              </div>
            ) : null}
          </section>

          <section className="question-ai-panel">
            <h2><Bot size={20} /> 学习画像反馈</h2>
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
              <p>提交后会根据正确率、错因和知识点生成画像事件，并更新掌握度与下一步建议。</p>
            )}
          </section>
        </aside>
      </section>

      {submitConfirm ? (
        <div className="question-submit-confirm-backdrop" role="presentation">
          <section
            className={`question-submit-confirm ${submitting ? "submitting" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="generated-practice-submit-confirm-title"
            aria-describedby="generated-practice-submit-confirm-desc"
          >
            <div className="question-submit-confirm-icon">
              <ClipboardCheck size={26} />
            </div>
            <div>
              <span className="question-submit-confirm-eyebrow">练习提交确认</span>
              <h2 id="generated-practice-submit-confirm-title">{submitting ? "正在提交批改" : "确认提交本次自主练习吗？"}</h2>
              <p id="generated-practice-submit-confirm-desc">
                {submitConfirm.unanswered > 0
                  ? `当前已完成 ${submitConfirm.answeredCount}/${questions.length} 题，还有 ${submitConfirm.unanswered} 题未作答。提交后会更新学习画像。`
                  : "当前所有题目已作答。提交后会生成批改结果并更新学习画像。"}
              </p>
            </div>
            <div className="question-submit-confirm-stats">
              <span><strong>{questions.length}</strong> 总题数</span>
              <span><strong>{submitConfirm.answeredCount}</strong> 已作答</span>
              <span><strong>{submitConfirm.unanswered}</strong> 未作答</span>
            </div>
            {voiceControl.voiceSupported ? (
              <p className="question-submit-confirm-voice">
                语音确认：说“确认提交”继续批改，说“取消交卷”返回修改。
              </p>
            ) : null}
            <footer>
              <button type="button" disabled={submitting} onClick={cancelSubmitConfirm}>取消</button>
              <button className="primary" type="button" disabled={submitting} onClick={confirmSubmitAnswers}>
                <Send size={16} />
                {submitting ? "提交中" : "确认提交"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
