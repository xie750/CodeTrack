import type { OpenMaicClassroom } from "./openmaicCompat";

export type AIClassroomResource = {
  id: string;
  title: string;
  summary: string;
  knowledgePoint: string;
  courseId?: string;
  classroom: OpenMaicClassroom;
  confidence: number;
  createdAt: string;
  savedAt: string;
};

const storageKey = "codetrack.selfStudy.aiClassroom.resources.v1";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ai_classroom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeResource(value: unknown): AIClassroomResource | null {
  if (!isRecord(value) || !isRecord(value.classroom)) return null;
  const classroom = value.classroom as OpenMaicClassroom;
  if (!classroom.stage?.name || !Array.isArray(classroom.scenes)) return null;
  const now = new Date().toISOString();
  return {
    id: typeof value.id === "string" ? value.id : createId(),
    title: typeof value.title === "string" ? value.title : classroom.stage.name,
    summary: typeof value.summary === "string" ? value.summary : "AI 讲解课堂资源",
    knowledgePoint: typeof value.knowledgePoint === "string" ? value.knowledgePoint : "自主学习",
    courseId: typeof value.courseId === "string" ? value.courseId : undefined,
    classroom,
    confidence: typeof value.confidence === "number" ? value.confidence : 0.86,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    savedAt: typeof value.savedAt === "string" ? value.savedAt : now
  };
}

export function readAIClassroomResources() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeResource).filter((item): item is AIClassroomResource => Boolean(item));
  } catch {
    return [];
  }
}

export function writeAIClassroomResources(resources: AIClassroomResource[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(resources));
}

export function saveAIClassroomResource({
  classroom,
  courseId,
  prompt
}: {
  classroom: OpenMaicClassroom;
  courseId?: string;
  prompt?: string;
}) {
  const now = new Date().toISOString();
  const resource: AIClassroomResource = {
    id: createId(),
    title: classroom.stage.name,
    summary: `基于${classroom.material.fileName}生成的可播放 AI 讲解课堂，包含 ${classroom.scenes.length} 个场景与 ${classroom.scenes.reduce((total, scene) => total + scene.actions.length, 0)} 个动作。`,
    knowledgePoint: prompt?.includes("过拟合") ? "过拟合与正则化" : classroom.scenes[0]?.title ?? "自主学习",
    courseId,
    classroom,
    confidence: 0.86,
    createdAt: now,
    savedAt: now
  };
  const existing = readAIClassroomResources();
  writeAIClassroomResources([resource, ...existing.filter((item) => item.id !== resource.id)]);
  return resource;
}

export function findAIClassroomResource(resourceId: string) {
  return readAIClassroomResources().find((item) => item.id === resourceId) ?? null;
}
