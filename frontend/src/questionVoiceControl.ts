import { useEffect, useRef, useState } from "react";
import type { QuestionItem } from "./api";

export type QuestionAnswerMap = Record<string, string[]>;
export type VoiceLogTone = "info" | "success" | "warning";

export type VoiceActionLog = {
  id: string;
  text: string;
  tone: VoiceLogTone;
};

type VoiceControlOptions = {
  questions: QuestionItem[];
  answers: QuestionAnswerMap;
  activeIndex: number;
  submitted: boolean;
  disabled?: boolean;
  submitting?: boolean;
  submitConfirmOpen?: boolean;
  onAnswersChange: (answers: QuestionAnswerMap) => void;
  onJumpToQuestion: (index: number) => void;
  onClearNotice?: () => void;
  onSaveDraft?: (answers: QuestionAnswerMap) => void;
  onRequestSubmit: (answers: QuestionAnswerMap) => void;
  onConfirmSubmit?: () => void;
  onCancelSubmit?: () => void;
  disabledMessage?: string;
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

function isFillQuestion(question: QuestionItem) {
  return ["FILL_BLANK", "FILL_IN_BLANK", "SHORT_ANSWER"].includes(question.question_type) || !question.options.length;
}

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

function applyVoiceChoice(questions: QuestionItem[], nextAnswers: QuestionAnswerMap, questionIndex: number, optionLabels: string[]) {
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

function applyVoiceFill(questions: QuestionItem[], nextAnswers: QuestionAnswerMap, questionIndex: number, value: string) {
  const question = questions[questionIndex];
  if (!question) return { answers: nextAnswers, message: `没有找到第 ${questionIndex + 1} 题`, tone: "warning" as const };
  if (!isFillQuestion(question)) return { answers: nextAnswers, message: `第 ${questionIndex + 1} 题是选择题，请说“第几题选A”`, tone: "warning" as const };
  return {
    answers: { ...nextAnswers, [question.question_id]: value.trim() ? [value.trim()] : [] },
    message: `已填写第 ${questionIndex + 1} 题`,
    tone: "success" as const
  };
}

export function useQuestionVoiceControl(options: VoiceControlOptions) {
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("语音控制待开启");
  const [voiceLogs, setVoiceLogs] = useState<VoiceActionLog[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceClosedAfterSubmitRef = useRef(false);
  const optionsRef = useRef(options);

  optionsRef.current = options;

  function addVoiceLog(text: string, tone: VoiceLogTone = "info") {
    setVoiceLogs((current) => [
      { id: `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`, text, tone },
      ...current
    ].slice(0, 4));
  }

  function handleVoiceTranscript(text: string) {
    const current = optionsRef.current;
    const spokenText = text.trim();
    if (!spokenText) return;
    if (current.submitted) {
      addVoiceLog("本次作答已提交，语音命令已暂停执行。", "warning");
      return;
    }
    if (current.disabled) {
      addVoiceLog(current.disabledMessage ?? "当前状态暂不能使用语音作答。", "warning");
      return;
    }
    if (current.submitConfirmOpen) {
      if (current.submitting) {
        addVoiceLog("正在提交批改，请稍等。", "info");
        return;
      }
      if (/取消|不提交|先不交|返回|关闭|算了/.test(spokenText)) {
        current.onCancelSubmit?.();
        addVoiceLog("已取消本次提交确认。", "info");
        return;
      }
      if (/确认|确定|是的|可以|提交|交卷|确认提交|确定提交|确认交卷|帮我提交|开始批改|提交批改/.test(spokenText)) {
        current.onConfirmSubmit?.();
        addVoiceLog("已确认提交，正在批改。", "success");
        return;
      }
      addVoiceLog("提交确认中，请说“确认提交”或“取消交卷”。", "info");
      return;
    }

    let nextAnswers = current.answers;
    let changedAnswers = false;
    const actionMessages: VoiceActionLog[] = [];
    const mentionedQuestionIndex = findMentionedQuestionIndex(spokenText, current.questions.length);
    const optionPattern = /(?:第\s*([一二三四五六七八九十两\d]+)\s*(?:题|道题)?\s*)?(?:选|选择|答案(?:是|为)?|定为|设为)\s*([A-HＡ-Ｈa-hａ-ｈ](?:\s*(?:和|及|、|，|,)?\s*[A-HＡ-Ｈa-hａ-ｈ])*)/g;
    const fillPattern = /(?:第\s*([一二三四五六七八九十两\d]+)\s*(?:题|道题)?(?:[^，。；;,.]{0,10}?))?(?:填写|填入|填|答案(?:是|为)?|写(?:成|为)?)\s*(.+?)(?=\s*(?:，|。|；|;|保存|存草稿|提交|交卷|确认提交|下一题|下一个|上一题|上一个|$))/g;

    for (const match of spokenText.matchAll(optionPattern)) {
      const questionNumber = parseSpokenNumber(match[1]);
      const targetIndex = questionNumber ? questionNumber - 1 : current.activeIndex;
      const optionLabels = splitOptionLabels(match[2]);
      const result = applyVoiceChoice(current.questions, nextAnswers, targetIndex, optionLabels);
      nextAnswers = result.answers;
      changedAnswers = result.tone === "success" || changedAnswers;
      actionMessages.push({ id: `voice-result-${Date.now()}-${actionMessages.length}`, text: result.message, tone: result.tone });
      if (result.tone === "success") current.onJumpToQuestion(targetIndex);
    }

    for (const match of spokenText.matchAll(fillPattern)) {
      const questionNumber = parseSpokenNumber(match[1]);
      const targetIndex = questionNumber ? questionNumber - 1 : current.activeIndex;
      const fillValue = cleanVoiceFillValue(match[2]);
      if (!fillValue) continue;
      const targetQuestion = current.questions[targetIndex];
      if (targetQuestion && !isFillQuestion(targetQuestion) && splitOptionLabels(fillValue).length > 0) continue;
      const result = applyVoiceFill(current.questions, nextAnswers, targetIndex, fillValue);
      nextAnswers = result.answers;
      changedAnswers = result.tone === "success" || changedAnswers;
      actionMessages.push({ id: `voice-fill-${Date.now()}-${actionMessages.length}`, text: result.message, tone: result.tone });
      if (result.tone === "success") current.onJumpToQuestion(targetIndex);
    }

    const jumpMatch = spokenText.match(/(?:跳到|转到|打开|查看)\s*第?\s*([一二三四五六七八九十两\d]+)\s*(?:题|道题)?/);
    if (jumpMatch) {
      const questionNumber = parseSpokenNumber(jumpMatch[1]);
      if (questionNumber && current.questions[questionNumber - 1]) {
        current.onJumpToQuestion(questionNumber - 1);
        actionMessages.push({ id: `voice-jump-${Date.now()}`, text: `已跳转到第 ${questionNumber} 题`, tone: "success" });
      }
    }
    if (/下一题|下一个/.test(spokenText)) {
      current.onJumpToQuestion(Math.min(current.questions.length - 1, current.activeIndex + 1));
      actionMessages.push({ id: `voice-next-${Date.now()}`, text: "已切换到下一题", tone: "success" });
    }
    if (/上一题|上一个/.test(spokenText)) {
      current.onJumpToQuestion(Math.max(0, current.activeIndex - 1));
      actionMessages.push({ id: `voice-prev-${Date.now()}`, text: "已切换到上一题", tone: "success" });
    }

    if (!actionMessages.length && mentionedQuestionIndex !== null) {
      const mentionedQuestion = current.questions[mentionedQuestionIndex];
      current.onJumpToQuestion(mentionedQuestionIndex);
      actionMessages.push({
        id: `voice-mention-${Date.now()}`,
        text: isFillQuestion(mentionedQuestion)
          ? `已定位到第 ${mentionedQuestionIndex + 1} 题。填空题请说“第 ${mentionedQuestionIndex + 1} 题填 答案内容”。`
          : `已定位到第 ${mentionedQuestionIndex + 1} 题。选择题请说“第 ${mentionedQuestionIndex + 1} 题选 A”。`,
        tone: "info"
      });
    }

    if (changedAnswers) {
      current.onAnswersChange(nextAnswers);
      current.onClearNotice?.();
    }
    if (/保存|存草稿/.test(spokenText)) {
      if (current.onSaveDraft) {
        current.onSaveDraft(nextAnswers);
        actionMessages.push({ id: `voice-save-${Date.now()}`, text: "正在保存草稿", tone: "info" });
      } else {
        actionMessages.push({ id: `voice-save-${Date.now()}`, text: "自主练习会保留当前页面作答，提交前无需单独保存。", tone: "info" });
      }
    }
    if (/提交|交卷|确认提交/.test(spokenText)) {
      current.onRequestSubmit(nextAnswers);
      actionMessages.push({ id: `voice-submit-${Date.now()}`, text: "已打开提交确认，请说“确认提交”或“取消交卷”。", tone: "info" });
    }

    if (!actionMessages.length) {
      actionMessages.push({ id: `voice-empty-${Date.now()}`, text: "未匹配到可执行命令，请换一种说法。", tone: "warning" });
    }
    setVoiceLogs((currentLogs) => [...actionMessages.reverse(), ...currentLogs].slice(0, 4));
  }

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
        setVoiceStatus("已提交，语音控制已关闭");
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
      if (finalText.trim()) handleVoiceTranscript(finalText.trim());
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
    setVoiceStatus("已提交，语音控制已关闭");
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

  useEffect(() => {
    if (options.submitted) {
      stopVoiceAfterSubmit();
    } else {
      voiceClosedAfterSubmitRef.current = false;
    }
  }, [options.submitted]);

  function toggleVoiceListening() {
    const current = optionsRef.current;
    if (!voiceSupported || current.submitted || current.disabled) return;
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

  return {
    voiceSupported,
    voiceListening,
    voiceTranscript,
    voiceStatus,
    voiceLogs,
    toggleVoiceListening,
    addVoiceLog,
    stopVoiceAfterSubmit
  };
}
