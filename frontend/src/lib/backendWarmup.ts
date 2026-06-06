const WARM_PATH = '/api/warm-backend';
const RETRY_DELAY_MS = 5000;
/** Render free tier can take 30–90s to wake; must exceed /api/warm-backend server timeout. */
const WARM_PING_TIMEOUT_MS = 120_000;
/** Re-ping while the tab stays open (aggressive — Render can feel slow well before 15 min idle). */
const KEEPALIVE_INTERVAL_MS = 3 * 60 * 1000;

let inflight: Promise<boolean> | null = null;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingOnce(timeoutMs = WARM_PING_TIMEOUT_MS): Promise<boolean> {
  const res = await fetch(WARM_PATH, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { warmed?: boolean };
  return Boolean(data.warmed);
}

/**
 * Ping the backend until it responds or maxWaitMs elapses.
 * Deduplicates concurrent callers (layout + optimize share one flight).
 */
export async function ensureBackendWarm(maxWaitMs = 120_000): Promise<boolean> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      if (await pingOnce(6_000)) return true;
    } catch {
      // cold start — fall through to retry loop
    }

    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      try {
        if (await pingOnce()) return true;
      } catch {
        // Render may still be booting — retry
      }
      await sleep(RETRY_DELAY_MS);
    }
    return false;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function startKeepAliveLoop(): void {
  if (keepAliveTimer || typeof window === 'undefined') return;
  keepAliveTimer = window.setInterval(() => {
    void pingOnce(30_000).catch(() => {
      // best-effort — next interval or user action will retry
    });
  }, KEEPALIVE_INTERVAL_MS);
}

/** Fire-and-forget warmup on load, tab focus, and periodic keep-alive. */
export function warmBackendInBackground(): void {
  void ensureBackendWarm(120_000);
  startKeepAliveLoop();
}
