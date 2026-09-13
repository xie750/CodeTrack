import { NextRequest, NextResponse } from 'next/server';

const CODETRACK_API_BASE = process.env.CODETRACK_API_BASE || 'http://127.0.0.1:8000';
const CODETRACK_DEMO_USER_ID = process.env.CODETRACK_DEMO_USER_ID || 'user_student_001';

export async function GET(request: NextRequest) {
  const resourceId = request.nextUrl.searchParams.get('resourceId')?.trim();
  if (!resourceId) {
    return NextResponse.json({ error: 'resourceId is required' }, { status: 400 });
  }

  const upstream = new URL(
    `/api/v1/student/resources/${encodeURIComponent(resourceId)}/openmaic-export`,
    CODETRACK_API_BASE,
  );
  const response = await fetch(upstream, {
    headers: {
      'X-Demo-User-Id': CODETRACK_DEMO_USER_ID,
    },
    cache: 'no-store',
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
