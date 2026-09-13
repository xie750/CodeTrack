export type CodeTrackExport = {
  schema: string;
  runtime: string;
  resource: {
    id: string;
    title: string;
    summary?: string;
    course_id?: string;
    knowledge_point?: string;
  };
  stage?: Record<string, unknown>;
  scenes?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Native exports already match the renderer contract; do not project away fields. */
export function nativeScenes(payload: CodeTrackExport): Scene[] | null {
  if (payload.metadata?.generation_pipeline !== 'openmaic_native') return null;
  if (!payload.scenes?.length) throw new Error('课堂没有可播放的内容。');
  for (const scene of payload.scenes) {
    const result = validateScene(scene);
    if (!result.valid) {
      throw new Error(`课堂数据不完整：${result.errors.map((error) => error.path).join(', ')}`);
    }
  }
  return payload.scenes as unknown as Scene[];
}

export function isCodeTrackExport(value: unknown): value is CodeTrackExport {
  const candidate = asRecord(value);
  return (
    candidate.schema === 'codetrack.openmaic.classroom.export.v1' &&
    candidate.runtime === 'openmaic'
  );
}
import { validateScene } from '@openmaic/dsl';
import type { Scene } from '@/lib/types/stage';
