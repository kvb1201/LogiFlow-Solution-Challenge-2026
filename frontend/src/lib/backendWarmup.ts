const WARM_PATH = '/api/warm-backend';
const RETRY_DELAY_MS = 5000;

let inflight: Promise<boolean> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingOnce(timeoutMs = 8_000): Promise<boolean> {
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
export async function ensureBackendWarm(maxWaitMs = 90_000): Promise<boolean> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      if (await pingOnce(4_000)) return true;
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

/** Fire-and-forget warmup (e.g. on first page load). */
export function warmBackendInBackground(): void {
  void ensureBackendWarm(90_000);
}
