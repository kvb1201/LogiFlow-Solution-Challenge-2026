export type WaterNoRouteKind = 'no_network' | 'constraints' | 'unknown';

export function classifyWaterNoRoute(message: string | null | undefined): WaterNoRouteKind {
  if (!message) return 'unknown';
  if (/no maritime routes found/i.test(message)) return 'no_network';
  if (/no water routes.*satisfy/i.test(message)) return 'constraints';
  return 'unknown';
}

export function isWaterNoRouteMessage(message: string | null | undefined): boolean {
  const kind = classifyWaterNoRoute(message);
  return kind === 'no_network' || kind === 'constraints';
}
