import { scopedStorageKey } from "./scopedStorage";

export type StudentFavoriteKind = "CODING_TASK" | "QUESTION";

export type StudentFavoriteRecord = {
  id: string;
  kind: StudentFavoriteKind;
  title: string;
  description: string;
  courseId: string;
  courseName: string;
  className: string;
  teacherName: string;
  taskId: string;
  assignmentId?: string;
  workspaceType: string;
  taskType: string;
  difficulty: string;
  knowledgePoints: string[];
  publishedAt: string | null;
  progressPercent: number;
  countLabel: string;
  questionId?: string;
  questionIndex?: number;
  questionType?: string;
  score?: number;
  isWrong?: boolean;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

const FAVORITES_STORAGE_BASE_KEY = "codetrack.studentFavorites.v1";
export const STUDENT_FAVORITES_CHANGED_EVENT = "codetrack:studentFavoritesChanged";

function favoritesStorageKey() {
  return scopedStorageKey(FAVORITES_STORAGE_BASE_KEY);
}

function normalizeFavoriteRecord(value: Partial<StudentFavoriteRecord>): StudentFavoriteRecord | null {
  if (!value.id || !value.title || !value.taskId) return null;
  const now = new Date().toISOString();
  return {
    id: value.id,
    kind: value.kind === "QUESTION" ? "QUESTION" : "CODING_TASK",
    title: value.title,
    description: value.description ?? "",
    courseId: value.courseId ?? "",
    courseName: value.courseName ?? "未关联课程",
    className: value.className ?? "课程任务",
    teacherName: value.teacherName ?? "教师端",
    taskId: value.taskId,
    assignmentId: value.assignmentId,
    workspaceType: value.workspaceType ?? (value.kind === "QUESTION" ? "QUESTION_SET" : "CODING"),
    taskType: value.taskType ?? (value.kind === "QUESTION" ? "QUIZ" : "CODING"),
    difficulty: value.difficulty ?? "MEDIUM",
    knowledgePoints: Array.isArray(value.knowledgePoints) ? value.knowledgePoints.filter((item) => typeof item === "string") : [],
    publishedAt: value.publishedAt ?? null,
    progressPercent: typeof value.progressPercent === "number" ? value.progressPercent : 0,
    countLabel: value.countLabel ?? "-",
    questionId: value.questionId,
    questionIndex: value.questionIndex,
    questionType: value.questionType,
    score: value.score,
    isWrong: value.isWrong,
    reason: value.reason ?? "手动收藏",
    createdAt: value.createdAt ?? now,
    updatedAt: value.updatedAt ?? now
  };
}

function emitFavoritesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STUDENT_FAVORITES_CHANGED_EVENT));
}

function writeStudentFavorites(records: StudentFavoriteRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(favoritesStorageKey(), JSON.stringify(records));
  emitFavoritesChanged();
}

export function readStudentFavorites() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(favoritesStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StudentFavoriteRecord>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeFavoriteRecord)
      .filter((item): item is StudentFavoriteRecord => Boolean(item))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

export function isStudentFavorite(id: string) {
  return readStudentFavorites().some((item) => item.id === id);
}

export function upsertStudentFavorite(record: StudentFavoriteRecord) {
  const current = readStudentFavorites();
  const existing = current.find((item) => item.id === record.id);
  const nextRecord = normalizeFavoriteRecord({
    ...record,
    createdAt: existing?.createdAt ?? record.createdAt,
    updatedAt: new Date().toISOString()
  });
  if (!nextRecord) return current;
  const next = [nextRecord, ...current.filter((item) => item.id !== record.id)];
  writeStudentFavorites(next);
  return next;
}

export function removeStudentFavorite(id: string) {
  const next = readStudentFavorites().filter((item) => item.id !== id);
  writeStudentFavorites(next);
  return next;
}

export function subscribeStudentFavorites(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onLocalChange = (event: StorageEvent) => {
    if (event.key === favoritesStorageKey()) listener();
  };
  window.addEventListener(STUDENT_FAVORITES_CHANGED_EVENT, listener);
  window.addEventListener("storage", onLocalChange);
  return () => {
    window.removeEventListener(STUDENT_FAVORITES_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onLocalChange);
  };
}

export function favoriteRecordId(kind: StudentFavoriteKind, ownerId: string, itemId?: string) {
  return kind === "QUESTION" ? `question:${ownerId}:${itemId ?? ""}` : `coding:${ownerId}`;
}
