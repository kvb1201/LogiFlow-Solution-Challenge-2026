const AUTORUN_KEY = 'logiflow_autorun_mode';

/** Survives React Strict Mode remounts (unlike per-component refs). */
let pendingMode: string | null = null;
let runStartedFor: string | null = null;

type AutorunListener = () => void;
const listeners = new Set<AutorunListener>();

export function subscribeShipmentAutorun(listener: AutorunListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyAutorunListeners() {
  listeners.forEach((listener) => listener());
}

export function hasShipmentAutorunPending(mode: string): boolean {
  syncAutorunFromSession();
  return pendingMode === mode && runStartedFor !== mode;
}

export function setShipmentAutorun(mode: string) {
  pendingMode = mode;
  runStartedFor = null;
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(AUTORUN_KEY, mode);
  }
  notifyAutorunListeners();
}

export function syncAutorunFromSession(): string | null {
  if (pendingMode) return pendingMode;
  if (typeof sessionStorage === 'undefined') return null;
  const stored = sessionStorage.getItem(AUTORUN_KEY);
  if (stored) {
    pendingMode = stored;
    return stored;
  }
  return null;
}

export function shouldRunShipmentAutorun(mode: string): boolean {
  syncAutorunFromSession();
  return pendingMode === mode && runStartedFor !== mode;
}

/** Call right before starting optimize so Strict Mode remount does not double-run. */
export function markShipmentAutorunStarted(mode: string) {
  if (pendingMode === mode) {
    runStartedFor = mode;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(AUTORUN_KEY);
    }
  }
}

export function clearShipmentAutorun(mode?: string) {
  if (!mode || pendingMode === mode) {
    pendingMode = null;
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(AUTORUN_KEY);
  }
}

/** @deprecated Use shouldRunShipmentAutorun + markShipmentAutorunStarted */
export function consumeShipmentAutorun(mode: string): boolean {
  if (!shouldRunShipmentAutorun(mode)) return false;
  markShipmentAutorunStarted(mode);
  clearShipmentAutorun(mode);
  return true;
}
