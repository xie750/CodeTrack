import type { StudentAiModelOption } from "./api";
import { scopedStorageKey } from "./scopedStorage";

export const STUDENT_AI_MODEL_STORAGE_BASE_KEY = "codetrack.aiTutor.modelKey.v1";

export const fallbackStudentAiModelOptions: StudentAiModelOption[] = [
  {
    key: "default",
    label: "通用模型",
    provider: "OPENAI_COMPATIBLE",
    model_name: "默认配置",
    configured: true,
    description: "保留当前通用模型配置，适合常规助学问答。"
  },
  {
    key: "fine_tuned",
    label: "微调模型",
    provider: "OPENAI_COMPATIBLE",
    model_name: "等待后端配置",
    configured: false,
    description: "需要后端返回可用的本地微调模型配置后才能切换。"
  }
];

export function readStudentAiModelKey() {
  try {
    const stored = window.localStorage.getItem(scopedStorageKey(STUDENT_AI_MODEL_STORAGE_BASE_KEY));
    return stored === "fine_tuned" ? "fine_tuned" : "default";
  } catch {
    return "default";
  }
}

export function saveStudentAiModelKey(key: string) {
  try {
    window.localStorage.setItem(scopedStorageKey(STUDENT_AI_MODEL_STORAGE_BASE_KEY), key);
  } catch {
    // 浏览器隐私模式下可能禁用 localStorage，当前页面状态仍可继续使用。
  }
}
