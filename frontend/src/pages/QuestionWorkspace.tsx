import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
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
  Mic,
  MicOff,
  Save,
  Send,
  XCircle
} from "lucide-react";
import { api, QuestionItem, QuestionWorkspace as QuestionWorkspaceData, SubmitQuestionResult } from "../api";
import StudentRouteBreadcrumb from "../components/StudentRouteBreadcrumb";
import { StudentState, studentErrorDetail, studentErrorMessage } from "../components/StudentState";
import { favoriteRecordId, readStudentFavorites, removeStudentFavorite, subscribeStudentFavorites, upsertStudentFavorite } from "../studentFavorites";
import { formatStudentDateTime, getScheduleInfo, resolveVisibleTaskStatus, visibleTaskStatusLabel } from "../studentTaskSchedule";

type PageProps = {
  assignmentId: string;
  focusQuestionId?: string;
  onBack: () => void;
};

type AnswerMap = Record<string, string[]>;
type VoiceLogTone = "info" | "success" | "warning";
type VoiceActionLog = {
  id: string;
  text: string;
  tone: VoiceLogTone;
};
type VoiceSubmitOptions = {
  answerOverride?: AnswerMap;
};
type SubmitConfirmState = {
  answers: AnswerMap;
  answeredCount: number;
  unanswered: number;
};
type CachedQuestionAnswers = {
  assignmentId: string;
  questionIds: string[];
  answers: AnswerMap;
};
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: {
    transcript?: string;
    confidence?: number;
  };
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};
type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function statusText(status: string, startAt: string | null) {
  return visibleTaskStatusLabel(resolveVisibleTaskStatus(status, startAt)).replace("进行中", "作答中");
}

function typeText(type: string) {
  if (type === "MULTIPLE_CHOICE") return "多选题";
  if (type === "TRUE_FALSE") return "判断题";
  if (type === "FILL_BLANK" || type === "FILL_IN_BLANK" || type === "SHORT_ANSWER") return "填空题";
  return "单选题";
}

function buildInitialAnswers(questions: QuestionItem[]): AnswerMap {
  return questions.reduce((map, question) => {
    map[question.question_id] = question.selected_option_ids ?? [];
    return map;
  }, {} as AnswerMap);
}

function questionAnswerCacheKey(assignmentId: string) {
  return `codetrack.questionWorkspace.answers.${assignmentId}.v1`;
}

function sanitizeAnswersForQuestions(questions: QuestionItem[], source: AnswerMap | undefined) {
  return questions.reduce((map, question) => {
    const value = source?.[question.question_id];
    map[question.question_id] = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return map;
  }, {} as AnswerMap);
}

function readCachedAnswers(assignmentId: string, questions: QuestionItem[]) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(questionAnswerCacheKey(assignmentId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedQuestionAnswers>;
    const questionIds = questions.map((question) => question.question_id);
    const samePaper = cached.assignmentId === assignmentId
      && Array.isArray(cached.questionIds)
      && cached.questionIds.length === questionIds.length
      && questionIds.every((questionId) => cached.questionIds?.includes(questionId));
    if (!samePaper || !cached.answers) return null;
    return sanitizeAnswersForQuestions(questions, cached.answers);
  } catch {
    return null;
  }
}

function writeCachedAnswers(assignmentId: string, questions: QuestionItem[], answers: AnswerMap) {
  if (typeof window === "undefined" || !questions.length) return;
  const payload: CachedQuestionAnswers = {
    assignmentId,
    questionIds: questions.map((question) => question.question_id),
    answers: sanitizeAnswersForQuestions(questions, answers)
  };
  window.sessionStorage.setItem(questionAnswerCacheKey(assignmentId), JSON.stringify(payload));
}

function clearCachedAnswers(assignmentId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(questionAnswerCacheKey(assignmentId));
}

function toAnswerPayload(answers: AnswerMap) {
  return Object.entries(answers).map(([question_id, selected_option_ids]) => ({
    question_id,
    selected_option_ids
  }));
}

function isAnswerPresent(question: QuestionItem, answers: AnswerMap) {
  const selected = answers[question.question_id] ?? [];
  if (isFillQuestion(question)) return Boolean(selected[0]?.trim());
  return selected.length > 0;
}

function isFillQuestion(question: QuestionItem) {
  return ["FILL_BLANK", "FILL_IN_BLANK", "SHORT_ANSWER"].includes(question.question_type) || !question.options.length;
}

const CHINESE_NUMBER_MAP: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
};

function parseSpokenNumber(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) return Number.parseInt(normalized, 10);
  if (normalized === "十") return 10;
  const tenIndex = normalized.indexOf("十");
  if (tenIndex >= 0) {
    const left = normalized.slice(0, tenIndex);
    const right = normalized.slice(tenIndex + 1);
    const tens = left ? CHINESE_NUMBER_MAP[left] ?? 0 : 1;
    const ones = right ? CHINESE_NUMBER_MAP[right] ?? 0 : 0;
    return tens * 10 + ones;
  }
  return CHINESE_NUMBER_MAP[normalized] ?? null;
}

function findMentionedQuestionIndex(text: string, questionCount: number) {
  const match = text.match(/(?:第\s*)?([一二三四五六七八九十两\d]+)\s*(?:题|道题)/);
  const questionNumber = parseSpokenNumber(match?.[1]);
  if (!questionNumber) return null;
  const index = questionNumber - 1;
  return index >= 0 && index < questionCount ? index : null;
}

function cleanVoiceFillValue(value: string) {
  const cleaned = value
    .replace(/^[\s：:，,。；;]+/, "")
    .replace(/[\s，,。；;？?！!]+$/, "")
    .trim();
  if (!cleaned) return null;
  if (/^(吗|么|嘛|呢|呀|啊|吧|一下|可以吗|行吗|不会吗|不会填写吗)$/.test(cleaned)) return null;
  return cleaned;
}

function normalizeOptionLabel(value: string) {
  const fullWidth = "ＡＢＣＤＥＦＧＨａｂｃｄｅｆｇｈ";
  const halfWidth = "ABCDEFGHabcdefgh";
  const mapped = value.replace(/[Ａ-Ｈａ-ｈ]/g, (char) => halfWidth[fullWidth.indexOf(char)] ?? char);
  return mapped.toUpperCase();
}

function splitOptionLabels(value: string) {
  return value
    .replace(/[和及、，,\s]/g, "")
    .split("")
    .map(normalizeOptionLabel)
    .filter((label) => /^[A-H]$/.test(label));
}

export default function QuestionWorkspace({ assignmentId, focusQuestionId, onBack }: PageProps) {
  const [workspace, setWorkspace] = useState<QuestionWorkspaceData | null>(null);
  const [result, setResult] = useState<SubmitQuestionResult | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set(readStudentFavorites().map((item) => item.id)));
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("语音控制待开启");
  const [voiceLogs, setVoiceLogs] = useState<VoiceActionLog[]>([]);
  const [submitConfirm, setSubmitConfirm] = useState<SubmitConfirmState | null>(null);
  const questionRefs = useRef<Array<HTMLElement | null>>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceHandlerRef = useRef<(text: string) => void>(() => undefined);
  const focusedQuestionIndexRef = useRef(0);
  const submitConfirmRef = useRef<SubmitConfirmState | null>(null);
  const voiceClosedAfterSubmitRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    api
      .getQuestionWorkspace(assignmentId)
      .then((data) => {
        if (!alive) return;
        setWorkspace(data);
        const initialAnswers = buildInitialAnswers(data.questions);
        if (data.attempt.status === "SUBMITTED") {
          clearCachedAnswers(assignmentId);
          setAnswers(initialAnswers);
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
            ai_feedback: data.ai_feedback,
            profile_signal: {
              overall_progress: 0,
              logic_error_rate: 0,
              recent_task_completion: 0,
              summary: "本次作答结果已同步到学习画像。",
              recommendation: "可在学习画像页查看最新掌握度。"
            }
          });
        } else {
          setResult(null);
          setAnswers(readCachedAnswers(assignmentId, data.questions) ?? initialAnswers);
        }
      })
      .catch((err) => {
        if (!alive) return;
        setError(studentErrorMessage(err, "题目任务加载失败，请返回任务列表后重试。"));
        setErrorDetail(studentErrorDetail(err));
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
  const favoriteCount = questions.filter((question) => favoriteIds.has(favoriteRecordId("QUESTION", assignmentId, question.question_id))).length;
  const scheduleInfo = getScheduleInfo(workspace?.assignment.start_at);
  const assignmentOpen = scheduleInfo.isOpen;

  useEffect(() => {
    if (!workspace || submitted) return;
    writeCachedAnswers(assignmentId, questions, answers);
  }, [answers, assignmentId, questions, submitted, workspace]);

  useEffect(() => {
    submitConfirmRef.current = submitConfirm;
  }, [submitConfirm]);

  useEffect(() => {
    if (submitted) stopVoiceAfterSubmit();
  }, [submitted]);

  useEffect(() => {
    return subscribeStudentFavorites(() => {
      setFavoriteIds(new Set(readStudentFavorites().map((item) => item.id)));
    });
  }, []);

  useEffect(() => {
    if (!focusQuestionId || !questions.length) return;
    const targetIndex = questions.findIndex((question) => question.question_id === focusQuestionId);
    if (targetIndex < 0) return;
    if (activeIndex !== targetIndex) setCurrentQuestion(targetIndex);
    window.setTimeout(() => {
      questionRefs.current[targetIndex]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, [activeIndex, focusQuestionId, questions]);

  function setCurrentQuestion(index: number) {
    focusedQuestionIndexRef.current = index;
    setActiveIndex(index);
  }

  function addVoiceLog(text: string, tone: VoiceLogTone = "info") {
    setVoiceLogs((current) => [
      { id: `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`, text, tone },
      ...current
    ].slice(0, 4));
  }

  function chooseOption(question: QuestionItem, optionId: string) {
    if (submitted || !assignmentOpen) return;
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
    if (submitted || !assignmentOpen) return;
    setAnswers((current) => ({
      ...current,
      [question.question_id]: value.trim() ? [value] : []
    }));
    setSaveMessage(null);
  }

  function jumpToQuestion(index: number) {
    setCurrentQuestion(index);
    questionRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveDraft(answerOverride?: AnswerMap) {
    if (!workspace || submitted || !assignmentOpen) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await api.saveQuestionAnswers(workspace.assignment.assignment_id, toAnswerPayload(answerOverride ?? answers));
      setSaveMessage("草稿已保存");
    } catch (err) {
      setSaveMessage("草稿保存失败");
      setErrorDetail(studentErrorDetail(err));
    } finally {
      setSaving(false);
    }
  }

  function submitAnswers(options?: VoiceSubmitOptions) {
    if (!workspace || submitted || !assignmentOpen) return;
    const payloadAnswers = options?.answerOverride ?? answers;
    const payloadAnsweredCount = questions.filter((question) => isAnswerPresent(question, payloadAnswers)).length;
    const unanswered = questions.length - payloadAnsweredCount;
    const nextConfirm = { answers: payloadAnswers, answeredCount: payloadAnsweredCount, unanswered };
    submitConfirmRef.current = nextConfirm;
    setSubmitConfirm(nextConfirm);
    if (voiceListening) {
      setVoiceStatus("等待提交确认，请说“确认提交”或“取消交卷”");
    }
  }

  function cancelSubmitConfirm() {
    submitConfirmRef.current = null;
    setSubmitConfirm(null);
    if (voiceListening) setVoiceStatus("正在听你说话");
  }

  async function confirmSubmitAnswers() {
    const pending = submitConfirmRef.current;
    if (!pending || !workspace || submitted || submitting || !assignmentOpen) return;
    setSubmitting(true);
    setSaveMessage(null);
    try {
      const submittedResult = await api.submitQuestionAnswers(workspace.assignment.assignment_id, toAnswerPayload(pending.answers));
      setResult(submittedResult);
      submitConfirmRef.current = null;
      setSubmitConfirm(null);
      clearCachedAnswers(assignmentId);
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
      addVoiceLog("批改完成，AI 学习反馈已生成。", "success");
      stopVoiceAfterSubmit();
    } catch (err) {
      setSaveMessage("提交失败，请稍后重试");
      setErrorDetail(studentErrorDetail(err));
      addVoiceLog("提交失败，请稍后重试。", "warning");
    } finally {
      setSubmitting(false);
    }
  }

  function questionState(question: QuestionItem) {
    if (submitted) return question.is_correct ? "correct" : "wrong";
    return isAnswerPresent(question, answers) ? "answered" : "empty";
  }

  function toggleQuestionFavorite(question: QuestionItem, index: number) {
    if (!workspace) return;
    const id = favoriteRecordId("QUESTION", workspace.assignment.assignment_id, question.question_id);
    if (favoriteIds.has(id)) {
      removeStudentFavorite(id);
      setFavoriteIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setSaveMessage(`已取消收藏第 ${index + 1} 题`);
      return;
    }

    upsertStudentFavorite({
      id,
      kind: "QUESTION",
      title: `${workspace.task.title} · 第 ${index + 1} 题`,
      description: question.stem,
      courseId: workspace.task.course_id,
      courseName: workspace.task.course_name,
      className: "课程任务",
      teacherName: workspace.task.teacher_name,
      taskId: workspace.task.task_id,
      assignmentId: workspace.assignment.assignment_id,
      workspaceType: "QUESTION_SET",
      taskType: workspace.assignment.assignment_mode === "EXAM" ? "EXAM" : "QUIZ",
      difficulty: question.difficulty,
      knowledgePoints: question.knowledge_points,
      publishedAt: workspace.assignment.published_at,
      progressPercent: submitted ? (question.is_correct ? 100 : 0) : 0,
      countLabel: submitted ? `${question.earned_score ?? 0}/${question.score} 分` : `${question.score} 分`,
      questionId: question.question_id,
      questionIndex: index + 1,
      questionType: question.question_type,
      score: question.score,
      isWrong: submitted ? question.is_correct === false : false,
      reason: submitted && question.is_correct === false ? "错题收藏" : "手动收藏",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setFavoriteIds((current) => new Set(current).add(id));
    setSaveMessage(submitted && question.is_correct === false ? `已收藏第 ${index + 1} 题到错题复盘` : `已收藏第 ${index + 1} 题`);
  }

  function applyVoiceChoice(nextAnswers: AnswerMap, questionIndex: number, optionLabels: string[]) {
    const question = questions[questionIndex];
    if (!question) return { answers: nextAnswers, message: `没有找到第 ${questionIndex + 1} 题`, tone: "warning" as const };
    if (isFillQuestion(question)) return { answers: nextAnswers, message: `第 ${questionIndex + 1} 题是填空题，请说“第几题填...”`, tone: "warning" as const };

    const optionIds = optionLabels
      .map((label) => question.options.find((option) => option.label.toUpperCase() === label)?.option_id)
      .filter((optionId): optionId is string => Boolean(optionId));
    if (!optionIds.length) return { answers: nextAnswers, message: `第 ${questionIndex + 1} 题没有匹配到 ${optionLabels.join("、")} 选项`, tone: "warning" as const };

    const selectedOptionIds = question.question_type === "MULTIPLE_CHOICE"
      ? Array.from(new Set(optionIds))
      : [optionIds[optionIds.length - 1]];
    return {
      answers: { ...nextAnswers, [question.question_id]: selectedOptionIds },
      message: `已将第 ${questionIndex + 1} 题选为 ${optionLabels.join("、")}`,
      tone: "success" as const
    };
  }

  function applyVoiceFill(nextAnswers: AnswerMap, questionIndex: number, value: string) {
    const question = questions[questionIndex];
    if (!question) return { answers: nextAnswers, message: `没有找到第 ${questionIndex + 1} 题`, tone: "warning" as const };
    if (!isFillQuestion(question)) return { answers: nextAnswers, message: `第 ${questionIndex + 1} 题是选择题，请说“第几题选A”`, tone: "warning" as const };
    return {
      answers: { ...nextAnswers, [question.question_id]: value.trim() ? [value.trim()] : [] },
      message: `已填写第 ${questionIndex + 1} 题`,
      tone: "success" as const
    };
  }

  function handleVoiceTranscript(text: string) {
    const spokenText = text.trim();
    if (!spokenText) return;
    if (submitted) {
      addVoiceLog("本次作答已交卷，语音命令已暂停执行。", "warning");
      return;
    }
    if (submitConfirmRef.current) {
      if (submitting) {
        addVoiceLog("正在提交批改，请稍等。", "info");
        return;
      }
      if (/取消|不提交|先不交|返回|关闭|算了/.test(spokenText)) {
        cancelSubmitConfirm();
        addVoiceLog("已取消本次交卷确认。", "info");
        return;
      }
      if (/确认|确定|是的|可以|提交|交卷|确认提交|确定提交|确认交卷|帮我提交|开始批改|提交批改/.test(spokenText)) {
        void confirmSubmitAnswers();
        addVoiceLog("已确认交卷，正在提交批改。", "success");
        return;
      }
      addVoiceLog("提交确认中，请说“确认提交”或“取消交卷”。", "info");
      return;
    }

    let nextAnswers = answers;
    let changedAnswers = false;
    const actionMessages: VoiceActionLog[] = [];
    const mentionedQuestionIndex = findMentionedQuestionIndex(spokenText, questions.length);
    const optionPattern = /(?:第\s*([一二三四五六七八九十两\d]+)\s*(?:题|道题)?\s*)?(?:选|选择|答案(?:是|为)?|定为|设为)\s*([A-HＡ-Ｈa-hａ-ｈ](?:\s*(?:和|及|、|，|,)?\s*[A-HＡ-Ｈa-hａ-ｈ])*)/g;
    const fillPattern = /(?:第\s*([一二三四五六七八九十两\d]+)\s*(?:题|道题)?(?:[^，。；;,.]{0,10}?))?(?:填写|填入|填|答案(?:是|为)?|写(?:成|为)?)\s*(.+?)(?=\s*(?:，|。|；|;|保存|存草稿|提交|交卷|确认提交|下一题|下一个|上一题|上一个|$))/g;

    for (const match of spokenText.matchAll(optionPattern)) {
      const questionNumber = parseSpokenNumber(match[1]);
      const targetIndex = questionNumber ? questionNumber - 1 : focusedQuestionIndexRef.current;
      const optionLabels = splitOptionLabels(match[2]);
      const result = applyVoiceChoice(nextAnswers, targetIndex, optionLabels);
      nextAnswers = result.answers;
      changedAnswers = result.tone === "success" || changedAnswers;
      actionMessages.push({ id: `voice-result-${Date.now()}-${actionMessages.length}`, text: result.message, tone: result.tone });
      if (result.tone === "success") jumpToQuestion(targetIndex);
    }

    for (const match of spokenText.matchAll(fillPattern)) {
      const questionNumber = parseSpokenNumber(match[1]);
      const targetIndex = questionNumber ? questionNumber - 1 : focusedQuestionIndexRef.current;
      const fillValue = cleanVoiceFillValue(match[2]);
      if (!fillValue) continue;
      const targetQuestion = questions[targetIndex];
      if (targetQuestion && !isFillQuestion(targetQuestion) && splitOptionLabels(fillValue).length > 0) continue;
      const result = applyVoiceFill(nextAnswers, targetIndex, fillValue);
      nextAnswers = result.answers;
      changedAnswers = result.tone === "success" || changedAnswers;
      actionMessages.push({ id: `voice-fill-${Date.now()}-${actionMessages.length}`, text: result.message, tone: result.tone });
      if (result.tone === "success") jumpToQuestion(targetIndex);
    }

    const jumpMatch = spokenText.match(/(?:跳到|转到|打开|查看)\s*第?\s*([一二三四五六七八九十两\d]+)\s*(?:题|道题)?/);
    if (jumpMatch) {
      const questionNumber = parseSpokenNumber(jumpMatch[1]);
      if (questionNumber && questions[questionNumber - 1]) {
        jumpToQuestion(questionNumber - 1);
        actionMessages.push({ id: `voice-jump-${Date.now()}`, text: `已跳转到第 ${questionNumber} 题`, tone: "success" });
      }
    }
    if (/下一题|下一个/.test(spokenText)) {
      jumpToQuestion(Math.min(questions.length - 1, activeIndex + 1));
      actionMessages.push({ id: `voice-next-${Date.now()}`, text: "已切换到下一题", tone: "success" });
    }
    if (/上一题|上一个/.test(spokenText)) {
      jumpToQuestion(Math.max(0, activeIndex - 1));
      actionMessages.push({ id: `voice-prev-${Date.now()}`, text: "已切换到上一题", tone: "success" });
    }

    if (!actionMessages.length && mentionedQuestionIndex !== null) {
      const mentionedQuestion = questions[mentionedQuestionIndex];
      jumpToQuestion(mentionedQuestionIndex);
      actionMessages.push({
        id: `voice-mention-${Date.now()}`,
        text: isFillQuestion(mentionedQuestion)
          ? `已定位到第 ${mentionedQuestionIndex + 1} 题。填空题请说“第 ${mentionedQuestionIndex + 1} 题填 答案内容”。`
          : `已定位到第 ${mentionedQuestionIndex + 1} 题。选择题请说“第 ${mentionedQuestionIndex + 1} 题选 A”。`,
        tone: "info"
      });
    }

    if (changedAnswers) {
      setAnswers(nextAnswers);
      setSaveMessage(null);
    }
    if (/保存|存草稿/.test(spokenText)) {
      void saveDraft(nextAnswers);
      actionMessages.push({ id: `voice-save-${Date.now()}`, text: "正在保存草稿", tone: "info" });
    }
    if (/提交|交卷|确认提交/.test(spokenText)) {
      void submitAnswers({ answerOverride: nextAnswers });
      actionMessages.push({ id: `voice-submit-${Date.now()}`, text: "已打开交卷确认，请说“确认提交”或“取消交卷”。", tone: "info" });
    }

    if (!actionMessages.length) {
      actionMessages.push({ id: `voice-empty-${Date.now()}`, text: "未匹配到可执行命令，请换一种说法。", tone: "warning" });
    }
    setVoiceLogs((current) => [...actionMessages.reverse(), ...current].slice(0, 4));
  }

  voiceHandlerRef.current = handleVoiceTranscript;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceSupported(false);
      setVoiceStatus("当前浏览器暂不支持语音识别");
      return undefined;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setVoiceListening(true);
      setVoiceStatus("正在听你说话");
    };
    recognition.onend = () => {
      setVoiceListening(false);
      if (voiceClosedAfterSubmitRef.current) {
        setVoiceStatus("已交卷，语音控制已关闭");
        return;
      }
      setVoiceStatus("语音控制已暂停");
    };
    recognition.onerror = (event) => {
      if (voiceClosedAfterSubmitRef.current) return;
      setVoiceListening(false);
      setVoiceStatus(event.error === "not-allowed" ? "麦克风权限未开启" : "语音识别暂时不可用");
      addVoiceLog(event.error === "not-allowed" ? "请允许浏览器使用麦克风后再开启语音控制。" : "识别中断，可再次点击开启。", "warning");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const resultItem = event.results[index];
        const transcript = resultItem[0]?.transcript ?? "";
        if (resultItem.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      const visibleText = (finalText || interimText).trim();
      if (visibleText) setVoiceTranscript(visibleText);
      if (finalText.trim()) voiceHandlerRef.current(finalText.trim());
    };

    recognitionRef.current = recognition;
    setVoiceSupported(true);
    setVoiceStatus("语音控制待开启");
    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  function stopVoiceAfterSubmit() {
    voiceClosedAfterSubmitRef.current = true;
    setVoiceListening(false);
    setVoiceStatus("已交卷，语音控制已关闭");
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        // Browser speech implementations can throw when already stopped.
      }
    }
  }

  function toggleVoiceListening() {
    if (!voiceSupported || submitted || !assignmentOpen) return;
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      if (voiceListening) {
        recognition.stop();
      } else {
        recognition.start();
      }
    } catch {
      setVoiceStatus("语音服务启动中，请稍后再试");
    }
  }

  return (
    <div className="question-shell" data-assignment-id={assignmentId}>
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
          <StudentState
            kind="unavailable"
            title="题目暂不可用"
            description={error ?? "没有读取到当前题目任务。"}
            detail={errorDetail}
            actions={[{ label: "返回班级任务", onClick: onBack, icon: <ArrowLeft size={15} /> }]}
            className="question-card question-empty"
          />
        </main>
      ) : (
        <main className="question-page">
          <section className="question-head">
            <div>
              <StudentRouteBreadcrumb
                className="question-route-breadcrumb"
                items={[
                  { label: "学习入口", to: "/" },
                  { label: "我的课程", to: "/" },
                  { label: workspace.task.course_name, to: `/courses/${encodeURIComponent(workspace.task.course_id)}` },
                  { label: "课程任务", to: `/courses/${encodeURIComponent(workspace.task.course_id)}/tasks` },
                  { label: workspace.task.title }
                ]}
              />
              <button className="program-back" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回班级任务</button>
              <div className="question-title-line">
                <h1>{workspace.task.title}</h1>
                <span>{workspace.assignment.assignment_mode === "EXAM" ? "考核任务" : "练习任务"} · {statusText(workspace.progress.status, workspace.assignment.start_at)}</span>
              </div>
              <p>{workspace.task.course_name} · 发布老师：{workspace.task.teacher_name} · 开始：{formatStudentDateTime(workspace.assignment.start_at, "未设置")} · 截止：{formatStudentDateTime(workspace.assignment.deadline, "未设置")}</p>
            </div>
            <div className="question-head-actions">
              <button type="button" disabled={saving || submitted || !assignmentOpen} onClick={() => saveDraft()}><Save size={16} /> {saving ? "保存中" : "保存草稿"}</button>
              <button className="primary" type="button" disabled={submitting || submitted || !assignmentOpen} onClick={() => submitAnswers()}><Send size={16} /> {submitted ? "已交卷" : submitting ? "提交中" : assignmentOpen ? "交卷" : "未开放"}</button>
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
                  <strong>{assignmentOpen ? "作答说明" : "开始信息"}</strong>
                  <p>{assignmentOpen ? "请按题目要求完成选择或填空。答案会自动保留在当前页面，交卷前可继续修改。" : `本任务将于 ${scheduleInfo.absoluteLabel} 开放，开始前可查看题目安排，暂不能保存草稿或交卷。`}</p>
                </div>
              </section>

              <div className="question-list">
                {questions.map((question, index) => {
                  const selectedAnswers = answers[question.question_id] ?? [];
                  const fillQuestion = isFillQuestion(question);
                  const favoriteId = favoriteRecordId("QUESTION", assignmentId, question.question_id);
                  const isFavorite = favoriteIds.has(favoriteId);
                  return (
                    <section
                      className={`question-item ${activeIndex === index ? "active" : ""}`}
                      key={question.question_id}
                      ref={(node) => {
                        questionRefs.current[index] = node;
                      }}
                      onFocus={() => setCurrentQuestion(index)}
                    >
                      <header className="question-main-header">
                        <div>
                          <span className="question-index">{index + 1}</span>
                          <span className="question-type">{typeText(question.question_type)}</span>
                          <span className="question-score">{question.score} 分</span>
                        </div>
                        <div className="question-main-tools">
                          <div className="question-knowledge">
                            {question.knowledge_points.map((point) => <span key={point}>{point}</span>)}
                          </div>
                          <button
                            className={`question-favorite-btn ${isFavorite ? "active" : ""}`}
                            type="button"
                            onClick={() => toggleQuestionFavorite(question, index)}
                            aria-pressed={isFavorite}
                            aria-label={`${isFavorite ? "取消收藏" : "收藏"}第 ${index + 1} 题`}
                          >
                            <Bookmark size={15} fill={isFavorite ? "currentColor" : "none"} />
                            {isFavorite ? "已收藏" : submitted && question.is_correct === false ? "收藏错题" : "收藏本题"}
                          </button>
                        </div>
                      </header>

                      <h3>{question.stem}</h3>

                      {fillQuestion ? (
                        <label className="question-fill">
                          <span>我的答案</span>
                          <textarea
                            value={selectedAnswers[0] ?? ""}
                            disabled={submitted || !assignmentOpen}
                            rows={3}
                            onChange={(event) => fillAnswer(question, event.target.value)}
                            onFocus={() => setCurrentQuestion(index)}
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
                                disabled={!assignmentOpen}
                                key={option.option_id}
                                onClick={() => {
                                  setCurrentQuestion(index);
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
                      className={`${activeIndex === index ? "active" : ""} ${questionState(question)} ${favoriteIds.has(favoriteRecordId("QUESTION", assignmentId, question.question_id)) ? "favorited" : ""}`}
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
                  <span><i className="favorited" /> 已收藏 {favoriteCount}</span>
                  {submitted ? <><span><i className="correct" /> 正确</span><span><i className="wrong" /> 错误</span></> : null}
                </div>
              </section>

              <section className={`question-voice-panel ${voiceListening ? "listening" : ""}`}>
                <header>
                  <div>
                    <h2><Mic size={20} /> 语音作答控制</h2>
                    <p>{voiceStatus}</p>
                  </div>
                  <button type="button" disabled={!voiceSupported || submitted || !assignmentOpen} onClick={toggleVoiceListening} aria-pressed={voiceListening}>
                    {voiceListening ? <MicOff size={16} /> : <Mic size={16} />}
                    {voiceListening ? "暂停" : "开启"}
                  </button>
                </header>
                <div className="question-voice-transcript" aria-live="polite">
                  <span>最近识别</span>
                  <strong>{voiceTranscript || "等待语音命令"}</strong>
                </div>
                {voiceLogs.length > 0 ? (
                  <div className="question-voice-log">
                    {voiceLogs.map((item) => (
                      <p className={item.tone} key={item.id}>{item.text}</p>
                    ))}
                  </div>
                ) : null}
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
                    <div className="question-ai-feedback-meta">
                      <span>{result.ai_feedback?.source === "RULE_FALLBACK" ? "规则兜底" : "AI 生成"}</span>
                      <span>置信度 {Math.round((result.ai_feedback?.confidence ?? 0.7) * 100)}%</span>
                      {result.ai_feedback?.needs_teacher_review ? <span>建议教师复核</span> : null}
                    </div>
                    <p>{result.ai_feedback?.summary ?? result.profile_signal.summary}</p>
                    {result.ai_feedback?.wrong_question_explanations.length ? (
                      <div className="question-ai-wrong-list">
                        {result.ai_feedback.wrong_question_explanations.slice(0, 3).map((item) => (
                          <article key={item.question_id}>
                            <strong>第 {item.question_index} 题 · {item.error_label}</strong>
                            <p>{item.explanation}</p>
                            <small>{item.next_step}</small>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p>本次没有错题解释，建议进入下一组迁移练习。</p>
                    )}
                    {result.ai_feedback?.recommended_actions.length ? (
                      <div className="question-ai-actions">
                        {result.ai_feedback.recommended_actions.slice(0, 2).map((item) => (
                          <span key={item.action}>{item.label}</span>
                        ))}
                      </div>
                    ) : null}
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
      {submitConfirm ? (
        <div className="question-submit-confirm-backdrop" role="presentation">
          <section
            className={`question-submit-confirm ${submitting ? "submitting" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="question-submit-confirm-title"
            aria-describedby="question-submit-confirm-desc"
          >
            <div className="question-submit-confirm-icon">
              {submitting ? <Clock3 size={24} /> : <Send size={24} />}
            </div>
            <div>
              <span className="question-submit-confirm-eyebrow">交卷确认</span>
              <h2 id="question-submit-confirm-title">{submitting ? "正在提交批改" : "确认提交本次作答吗？"}</h2>
              <p id="question-submit-confirm-desc">
                {submitConfirm.unanswered > 0
                  ? `当前已完成 ${submitConfirm.answeredCount}/${questions.length} 题，还有 ${submitConfirm.unanswered} 题未作答。提交后会生成批改结果并更新学习画像。`
                  : "当前所有题目已作答。提交后会生成批改结果并更新学习画像。"}
              </p>
            </div>
            <div className="question-submit-confirm-stats">
              <span><strong>{submitConfirm.answeredCount}</strong> 已作答</span>
              <span><strong>{submitConfirm.unanswered}</strong> 未作答</span>
              <span><strong>{questions.length}</strong> 总题数</span>
            </div>
            {voiceSupported ? (
              <p className="question-submit-confirm-voice">
                语音确认：说“确认提交”继续批改，说“取消交卷”返回修改。
              </p>
            ) : null}
            <footer>
              <button type="button" disabled={submitting} onClick={cancelSubmitConfirm}>
                <XCircle size={16} />
                取消
              </button>
              <button className="primary" type="button" disabled={submitting} onClick={confirmSubmitAnswers}>
                {submitting ? <Clock3 size={16} /> : <CheckCircle2 size={16} />}
                {submitting ? "批改中" : "确认提交"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
