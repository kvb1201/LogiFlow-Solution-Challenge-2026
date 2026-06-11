/**
 * Hero metrics for railway landing — numbers sourced from repo data:
 * - station_coords_cache.json (9,524 entries)
 * - Train_details_22122017.csv (~186k schedule rows)
 * - scraped_delay_metrics.json (15,650 CV samples, 81% within 30 min)
 * - stations_from_pdf_cache.json (7,466 IRCA/PDF station names)
 * - RailRadar + IRCTC Connect + schedule API cache (3 live feeds)
 */

export const RAIL_METRICS = [
  { value: '9,524', label: 'Mapped Stations' },
  { value: '186k+', label: 'Schedule Records' },
  { value: '15,650', label: 'ML Delay Records' },
  { value: '81%', label: 'Within 30 Min' },
  { value: '7,466', label: 'IRCA Station Index' },
  { value: '3', label: 'Live API Feeds' },
] as const;

export const RAIL_CAPABILITY_BADGES = [
  { icon: 'schedule', label: 'Live Schedules' },
  { icon: 'psychology', label: 'ML Delay Model' },
  { icon: 'payments', label: 'IRCA Tariffs' },
  { icon: 'route', label: 'Track Geometry' },
  { icon: 'swap_horiz', label: 'Direct + Transfer' },
  { icon: 'monitoring', label: 'Delay Prediction' },
] as const;

/** Top-line hero stats — shown inline on landing (road/air style). */
export const RAIL_HERO_METRICS = RAIL_METRICS.slice(0, 3);

/** Secondary stats — second flex row on landing. */
export const RAIL_SECONDARY_METRICS = RAIL_METRICS.slice(3);
