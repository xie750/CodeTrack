import { CodeTrackBridgeClient } from './bridge-client';
import { isCodeTrackExport, type CodeTrackExport } from './bridge-schema';

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function loadCodeTrackExport(resourceId: string): Promise<{
  payload: CodeTrackExport | null;
  error: string | null;
}> {
  const apiBase = process.env.CODETRACK_API_BASE ?? 'http://127.0.0.1:8000';
  const demoUserId = process.env.CODETRACK_DEMO_USER_ID ?? 'user_student_001';
  const endpoint = `${apiBase.replace(/\/$/, '')}/api/v1/student/resources/${encodeURIComponent(
    resourceId,
  )}/openmaic-export`;

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        'X-Demo-User-Id': demoUserId,
      },
    });

    if (!response.ok) {
      return {
        payload: null,
        error: `CodeTrack export API failed: ${response.status} ${response.statusText}`,
      };
    }

    const body = await response.json();
    const payload = body?.data;

    if (!isCodeTrackExport(payload)) {
      return {
        payload: null,
        error: 'CodeTrack export API returned an invalid classroom payload.',
      };
    }

    return { payload, error: null };
  } catch (err) {
    return {
      payload: null,
      error: err instanceof Error ? err.message : 'Failed to load CodeTrack classroom export.',
    };
  }
}

export default async function CodeTrackBridgePage({
  searchParams,
}: {
  searchParams: SearchParams | Promise<SearchParams>;
}) {
  const params = await Promise.resolve(searchParams);
  const resourceId = firstParam(params.codetrackResourceId);

  if (!resourceId) {
    return (
      <CodeTrackBridgeClient
        initialPayload={null}
        initialError="Missing codetrackResourceId."
      />
    );
  }

  const { payload, error } = await loadCodeTrackExport(resourceId);

  return <CodeTrackBridgeClient initialPayload={payload} initialError={error} />;
}
