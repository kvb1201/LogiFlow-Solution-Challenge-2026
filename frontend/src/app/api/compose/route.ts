import { NextRequest, NextResponse } from 'next/server';

/** Vercel / long-running compose — default rewrite proxy drops connection too early. */
export const maxDuration = 90;

function backendBase(): string | null {
  const url =
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : '');
  if (!url) return null;
  return url.replace(/\/$/, '');
}

export async function POST(req: NextRequest) {
  const base = backendBase();
  if (!base) {
    return NextResponse.json({ error: 'Backend URL not configured' }, { status: 503 });
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const res = await fetch(`${base}/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(90_000),
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = msg.includes('abort') || msg.includes('timeout');
    return NextResponse.json(
      {
        error: timedOut
          ? 'Compose took too long. Retry — results are cached after the first successful run.'
          : `Compose proxy error: ${msg}`,
      },
      { status: timedOut ? 504 : 502 },
    );
  }
}
