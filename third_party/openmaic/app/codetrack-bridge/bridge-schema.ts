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

export function isCodeTrackExport(value: unknown): value is CodeTrackExport {
  const candidate = asRecord(value);
  return (
    candidate.schema === 'codetrack.openmaic.classroom.export.v1' &&
    candidate.runtime === 'openmaic'
  );
}
