const AUTORUN_KEY = 'logiflow_autorun_mode';

export function hasShipmentAutorunPending(mode: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(AUTORUN_KEY) === mode;
}

export function setShipmentAutorun(mode: string) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(AUTORUN_KEY, mode);
}

/** Returns true once per navigation when mode matches, then clears the flag. */
export function consumeShipmentAutorun(mode: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  const stored = sessionStorage.getItem(AUTORUN_KEY);
  if (stored === mode) {
    sessionStorage.removeItem(AUTORUN_KEY);
    return true;
  }
  return false;
}
