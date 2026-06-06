/** User-facing labels for rail delay / data provenance (LogiFlow team credit). */

const LEGACY_IR_LIVE = new Set(['railradar_api_real', 'railradar_api', 'logiflow_ir_live']);
const LOGIFLOW_ML = new Set([
  'logiflow_ml',
  'logiflow_ml_simulation',
  'ml_prediction',
  'simulation_engine',
]);

export function isLogiFlowVerifiedDelaySource(source?: string | null): boolean {
  if (!source) return false;
  return LEGACY_IR_LIVE.has(source);
}

export function isLogiFlowMlDelaySource(source?: string | null): boolean {
  if (!source) return false;
  return LOGIFLOW_ML.has(source);
}

export function formatRailDelaySource(source?: string | null): string {
  if (!source) return 'N/A';
  if (LEGACY_IR_LIVE.has(source)) return 'Indian Railways live';
  if (source === 'logiflow_ml_simulation' || source === 'simulation_engine') {
    return 'LogiFlow ML · simulation';
  }
  if (LOGIFLOW_ML.has(source)) return 'LogiFlow ML';
  if (source === 'simulation') return 'LogiFlow simulation';
  if (source === 'scraped' || source === 'confirmtkt') return 'Indian Railways schedule';
  return source.replace(/_/g, ' ');
}

export function formatRailDataSource(source?: string | null): string {
  if (!source) return '';
  if (source === 'simulation') return 'LogiFlow engine';
  if (source === 'scraped' || source === 'confirmtkt' || source === 'csv_fallback') {
    return 'Indian Railways schedule';
  }
  if (source.includes('logiflow') || LEGACY_IR_LIVE.has(source)) return 'LogiFlow optimized';
  return source.replace(/_/g, ' ');
}

export const RAIL_PIPELINE_BADGE = 'LogiFlow Railway Intelligence';
export const RAIL_PIPELINE_FOOTER =
  'Optimized by the LogiFlow team · Real Indian Railways data · ML delay prediction';
