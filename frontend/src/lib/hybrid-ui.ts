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
        label: 'Short connection — check delays',
        chip: 'border-amber-400/50 bg-amber-500/15 text-amber-100',
      };
    case 'caution':
      return {
        icon: 'schedule',
        label: 'Long wait at changeover',
        chip: 'border-orange-400/40 bg-orange-500/10 text-orange-100',
      };
    default:
      return {
        icon: 'pause_circle',
        label: 'Changeover',
        chip: 'border-violet-400/30 bg-violet-500/10 text-violet-100',
      };
  }
}
