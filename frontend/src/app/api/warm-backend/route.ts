import { NextResponse } from 'next/server';

function backendBase(): string | null {
  const url =
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    // Match next.config.ts — local `make dev` without .env.local still warms localhost:8000
    (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : '');
  if (!url) return null;
  return url.replace(/\/$/, '');
}

/** Wake Render (or any sleeping backend) by hitting /health with a long timeout. */
export async function GET(request: Request) {
  const base = backendBase();
  if (!base) {
    return NextResponse.json(
      { warmed: false, reason: 'BACKEND_URL / NEXT_PUBLIC_API_URL not configured' },
      { status: 503 }
    );
  }

  const started = Date.now();
  try {
    const res = await fetch(`${base}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    });
    const elapsed_ms = Date.now() - started;
    const body = res.ok ? await res.json().catch(() => ({})) : null;

    if (res.ok) {
      // Preload rail metadata once per cold wake — skip when client only needs /health (lite=1).
      const lite = new URL(request.url).searchParams.get('lite') === '1';
      if (!lite) {
        void Promise.all([
          fetch(`${base}/railway/stations`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(30_000),
          }),
          fetch(`${base}/railway/model-info`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(30_000),
          }),
        ]).catch(() => {});
      }

      return NextResponse.json({ warmed: true, elapsed_ms, backend: base, health: body });
    }

    return NextResponse.json(
      { warmed: false, status: res.status, elapsed_ms, backend: base },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        warmed: false,
        elapsed_ms: Date.now() - started,
        backend: base,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }
}
