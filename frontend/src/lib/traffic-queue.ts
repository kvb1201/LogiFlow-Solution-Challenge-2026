const QUEUE_SESSION_KEY = 'logiflow_queue';

export type TrafficQueueReason = 'rate_limit' | 'capacity' | 'cold_start';

export interface TrafficQueueContext {
  reason: TrafficQueueReason;
  retryAfterSec: number;
  returnPath: string;
  autorunMode?: string;
  corridor?: string;
  queuedAt: number;
}

export class TrafficQueueError extends Error {
  readonly redirected: boolean;

  constructor(message = 'Traffic queue', redirected = false) {
    super(message);
    this.name = 'TrafficQueueError';
    this.redirected = redirected;
  }
}

export function isQueueStatus(status: number): boolean {
  return status === 429 || status === 503;
}

export function parseRetryAfter(res: Response): number {
  const header = res.headers.get('Retry-After');
  if (header) {
    const seconds = parseInt(header, 10);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 120);
  }
  return res.status === 429 ? 45 : 8;
}

export function getCurrentReturnPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname + window.location.search;
}

/** Map current route to shipment autorun mode (see shipmentAutorun.ts). */
export function inferAutorunModeFromPath(path = getCurrentReturnPath()): string | undefined {
  const base = path.split('?')[0];
  if (base === '/comparator') return 'comparator';
  if (base === '/hybrid') return 'hybrid';
  if (base === '/railway') return 'rail';
  if (base === '/road') return 'road';
  if (base === '/air') return 'air';
  if (base === '/water') return 'water';
  if (base === '/') return 'hybrid';
  return undefined;
}

export function saveTrafficQueueContext(ctx: Omit<TrafficQueueContext, 'queuedAt'>): void {
  if (typeof sessionStorage === 'undefined') return;
  const payload: TrafficQueueContext = { ...ctx, queuedAt: Date.now() };
  sessionStorage.setItem(QUEUE_SESSION_KEY, JSON.stringify(payload));
}

export function loadTrafficQueueContext(): TrafficQueueContext | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(QUEUE_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrafficQueueContext;
  } catch {
    return null;
  }
}

export function clearTrafficQueueContext(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(QUEUE_SESSION_KEY);
}

export function redirectToWaitingRoom(opts: {
  retryAfter: number;
  reason: TrafficQueueReason;
  returnPath?: string;
  autorunMode?: string;
  corridor?: string;
}): void {
  if (typeof window === 'undefined') return;

  const returnPath = opts.returnPath ?? getCurrentReturnPath();
  const autorunMode = opts.autorunMode ?? inferAutorunModeFromPath(returnPath);

  saveTrafficQueueContext({
    reason: opts.reason,
    retryAfterSec: opts.retryAfter,
    returnPath,
    autorunMode,
    corridor: opts.corridor,
  });

  const params = new URLSearchParams({
    reason: opts.reason,
    retry: String(opts.retryAfter),
    return: returnPath,
  });
  if (autorunMode) params.set('mode', autorunMode);
  if (opts.corridor) params.set('corridor', opts.corridor);

  window.location.assign(`/waiting?${params.toString()}`);
}

export function reasonCopy(reason: TrafficQueueReason): { title: string; subtitle: string } {
  switch (reason) {
    case 'rate_limit':
      return {
        title: 'High traffic ahead',
        subtitle: 'Too many planning requests right now — we hold your spot in line.',
      };
    case 'capacity':
      return {
        title: 'Optimization bay full',
        subtitle: 'All route engines are busy. Your corridor is queued for the next slot.',
      };
    default:
      return {
        title: 'Warming the corridor',
        subtitle: 'LogiFlow is spinning up compute — you will enter automatically.',
      };
  }
}
