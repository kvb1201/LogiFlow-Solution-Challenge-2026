import type { ComposedItinerary, ComposedLeg } from '@/services/api';

export const MODE_META: Record<
  string,
  { label: string; icon: string; tint: string; chip: string; ring: string }
> = {
  rail: {
    label: 'Train',
    icon: 'train',
    tint: 'text-primary',
    chip: 'bg-primary/15 border-primary/30 text-primary',
    ring: 'ring-primary/40',
  },
  road: {
    label: 'Road',
    icon: 'local_shipping',
    tint: 'text-secondary',
    chip: 'bg-secondary/15 border-secondary/30 text-secondary',
    ring: 'ring-secondary/40',
  },
  air: {
    label: 'Flight',
    icon: 'flight_takeoff',
    tint: 'text-sky-300',
    chip: 'bg-sky-400/15 border-sky-400/30 text-sky-200',
    ring: 'ring-sky-400/40',
  },
  water: {
    label: 'Ship',
    icon: 'directions_boat',
    tint: 'text-teal-300',
    chip: 'bg-teal-400/15 border-teal-400/30 text-teal-200',
    ring: 'ring-teal-400/40',
  },
};

export function modeMeta(mode: string) {
  return MODE_META[mode.toLowerCase()] || MODE_META.road;
}

export function modeLabel(mode: string): string {
  return modeMeta(mode).label;
}

/** Modes from template_id e.g. rail+road → ['rail','road'] */
export function templateModes(templateId: string): string[] {
  if (!templateId || templateId.startsWith('direct_')) {
    const single = templateId.replace('direct_', '');
    return single ? [single] : [];
  }
  return templateId.split('+').map((m) => m.trim().toLowerCase()).filter(Boolean);
}

/** Display slug: rail+rail, rail+road, direct_rail */
export function templateSlug(it: ComposedItinerary): string {
  return it.template_id || 'multimodal';
}

export function itineraryTitle(it: ComposedItinerary): string {
  return templateSlug(it);
}

export function corridorLabel(it: ComposedItinerary): string {
  const legs = it.legs || [];
  if (legs.length === 0) return '';
  const first = legs[0].source;
  const last = legs[legs.length - 1].destination;
  return `${first} → ${last}`;
}

export function itinerarySubtitle(it: ComposedItinerary): string {
  if (it.hub_cities?.length) {
    return `Hub at ${it.hub_cities.join(', ')}`;
  }
  return corridorLabel(it);
}

export function formatInr(n: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

export function formatHours(n: number): string {
  return `${n.toFixed(1)}h`;
}

export function formatRisk(n: number): string {
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return `${pct}%`;
}

export function legDetailLine(leg: ComposedLeg): string | null {
  if (leg.train_name || leg.train_no) {
    const train = [leg.train_no, leg.train_name].filter(Boolean).join(' · ');
    const dep = leg.departure ? ` · leaves ${leg.departure}` : '';
    return `${train}${dep}`;
  }
  const seg = leg.segments?.[0];
  if (!seg) return leg.flight_label || leg.vehicle_label || null;
  const train = (seg.train_name as string) || (seg.train_no as string);
  const dep = seg.departure ? ` · leaves ${String(seg.departure)}` : '';
  if (train) return `${train}${dep}`;
  return leg.flight_label || leg.vehicle_label || null;
}

export function legRouteLine(leg: ComposedLeg): string {
  return `${leg.source} → ${leg.destination}`;
}

export function legStationBoardLine(leg: ComposedLeg): string | null {
  const station = leg.board_station;
  if (!station) return null;
  const dep = leg.departure ? `, leaves around ${leg.departure}` : '';
  return `Starts from ${station}${dep}`;
}

export function legStationAlightLine(leg: ComposedLeg): string | null {
  const station = leg.alight_station;
  if (!station) return null;
  const arr = leg.arrival ? `, arrives around ${leg.arrival}` : '';
  return `Ends at ${station}${arr}`;
}

/** Plain heading for a trip segment — no "Leg 1" jargon */
export function segmentHeading(
  leg: ComposedLeg,
  index: number,
  total: number,
  hubCity?: string,
): string {
  const mode = modeLabel(leg.mode);
  const route = `${leg.source} → ${leg.destination}`;

  if (total === 1) {
    return `${mode}: ${route}`;
  }

  if (index === 0 && hubCity && leg.destination === hubCity) {
    return `${mode}: ${leg.source} → ${hubCity} hub`;
  }
  if (index === total - 1 && hubCity && leg.source === hubCity) {
    return `${mode}: ${hubCity} hub → ${leg.destination}`;
  }
  if (index === 0 && hubCity) {
    return `${mode} to ${hubCity}`;
  }
  if (index > 0 && hubCity && index === total - 1) {
    return `${mode} from ${hubCity} to ${leg.destination}`;
  }
  if (index > 0 && hubCity) {
    return `${mode} from ${hubCity} to ${leg.destination}`;
  }
  return `${mode}: ${route}`;
}

export function transferSeverityMeta(severity?: string) {
  switch (severity) {
    case 'warning':
      return {
        icon: 'warning',
        label: 'Tight connection',
        chip: 'border-amber-400/40 bg-amber-500/10 text-amber-50',
      };
    case 'caution':
      return {
        icon: 'schedule',
        label: 'Long wait at changeover',
        chip: 'border-orange-400/35 bg-orange-500/10 text-orange-50',
      };
    default:
      return {
        icon: 'sync_alt',
        label: 'Changeover',
        chip: 'border-violet-400/30 bg-violet-500/10 text-violet-50',
      };
  }
}

/** One node in the corridor summary strip — derived from every leg, not hub_cities[0] only. */
export type RoutePathNode =
  | { kind: 'place'; name: string; role: 'origin' | 'changeover' | 'destination' }
  | { kind: 'leg'; mode: string; label: string; icon: string };

function _normPlace(s: string): string {
  return s.trim().toLowerCase();
}

/** Build full origin → … → destination path including every changeover (e.g. Bhusaval). */
export function buildRoutePath(it: ComposedItinerary): RoutePathNode[] {
  const legs = it.legs || [];
  if (!legs.length) return [];

  const transferCities = new Set(
    (it.transfers || [])
      .map((t) => (t.at_display || t.at || '').trim())
      .filter(Boolean)
      .map(_normPlace)
  );

  const nodes: RoutePathNode[] = [];

  const pushPlace = (name: string, role: 'origin' | 'changeover' | 'destination') => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const last = nodes[nodes.length - 1];
    if (last?.kind === 'place' && _normPlace(last.name) === _normPlace(trimmed)) {
      if (role === 'destination') last.role = 'destination';
      else if (role === 'changeover' && last.role === 'origin') last.role = 'changeover';
      else if (role === 'changeover') last.role = 'changeover';
      return;
    }
    const isTransfer = transferCities.has(_normPlace(trimmed));
    const resolvedRole =
      role === 'destination'
        ? 'destination'
        : isTransfer || role === 'changeover'
          ? 'changeover'
          : role;
    nodes.push({ kind: 'place', name: trimmed, role: resolvedRole });
  };

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const meta = modeMeta(leg.mode);
    if (i === 0) pushPlace(leg.source, 'origin');
    else if (_normPlace(leg.source) !== _normPlace(legs[i - 1].destination)) {
      pushPlace(leg.source, 'changeover');
    }

    nodes.push({
      kind: 'leg',
      mode: leg.mode,
      label: meta.label,
      icon: meta.icon,
    });

    pushPlace(
      leg.destination,
      i === legs.length - 1 ? 'destination' : 'changeover'
    );
  }

  return nodes;
}

export function corridorEndpointLabel(it: ComposedItinerary): string {
  const legs = it.legs || [];
  if (!legs.length) return '';
  return `${legs[0].source} → ${legs[legs.length - 1].destination}`;
}

export function changeoverCount(it: ComposedItinerary): number {
  return Math.max(it.transshipments ?? 0, (it.transfers || []).length, (it.legs?.length ?? 1) - 1);
}
