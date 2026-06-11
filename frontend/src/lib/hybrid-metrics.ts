/** Hero metrics for hybrid multimodal composer landing. */
export const HYBRID_HERO_METRICS = [
  { value: '9,524', label: 'Mapped Stations' },
  { value: '56', label: 'Interchange Hubs' },
  { value: '55s', label: 'Compose Budget' },
] as const;

export const HYBRID_SECONDARY_METRICS = [
  { value: '7,466', label: 'IRCA Station Index' },
  { value: '6+', label: 'Route Templates' },
  { value: 'Rural', label: 'Village Access' },
] as const;

export const HYBRID_CAPABILITY_BADGES = [
  { icon: 'hub', label: 'Metro hubs' },
  { icon: 'train', label: 'Rail legs' },
  { icon: 'flight_takeoff', label: 'Air legs' },
  { icon: 'local_shipping', label: 'Road access' },
  { icon: 'swap_horiz', label: 'Changeovers' },
  { icon: 'psychology', label: 'ML scoring' },
] as const;
