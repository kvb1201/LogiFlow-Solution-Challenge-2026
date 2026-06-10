export type WaterNoRouteKind = 'no_network' | 'constraints' | 'unknown';

export function classifyWaterNoRoute(message: string | null | undefined): WaterNoRouteKind {
  if (!message) return 'unknown';
  if (/no maritime routes found|too far from the coastline|not close enough to the coastline/i.test(message)) {
    return 'no_network';
  }
  if (/no water routes.*satisfy/i.test(message)) return 'constraints';
  return 'unknown';
}

export function isWaterNoRouteMessage(message: string | null | undefined): boolean {
  const kind = classifyWaterNoRoute(message);
  return kind === 'no_network' || kind === 'constraints';
}
