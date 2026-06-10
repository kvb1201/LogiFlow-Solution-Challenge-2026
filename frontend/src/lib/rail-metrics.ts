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
  { icon: 'train', label: '186k+ train rows' },
  { icon: 'swap_horiz', label: 'Direct + transfer' },
  { icon: 'route', label: '9,524 geo points' },
  { icon: 'science', label: '15.6k ML samples' },
  { icon: 'payments', label: 'IRCA tariff slabs' },
  { icon: 'auto_awesome', label: '81% delay accuracy' },
] as const;
