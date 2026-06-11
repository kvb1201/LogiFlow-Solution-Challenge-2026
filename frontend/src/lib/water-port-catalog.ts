import { BACKEND_BASE } from '@/services/api';

export type WaterPortOption = {
  id: string;
  name: string;
  country: string;
  region: string;
  routable: boolean;
  lat: number;
  lng: number;
};

export type WaterPortCatalog = {
  ports: WaterPortOption[];
  total: number;
  routable: number;
  regions: number;
};

type PortIndex = {
  byId: Map<string, WaterPortOption>;
  byName: Map<string, WaterPortOption>;
};

let catalogPromise: Promise<WaterPortCatalog> | null = null;
let portIndex: PortIndex | null = null;

function buildIndex(ports: WaterPortOption[]): PortIndex {
  const byId = new Map<string, WaterPortOption>();
  const byName = new Map<string, WaterPortOption>();
  for (const port of ports) {
    byId.set(port.id, port);
    byName.set(port.name.toLowerCase(), port);
  }
  return { byId, byName };
}

function cityMatchesPort(city: string, port: WaterPortOption): boolean {
  const cityNorm = city.trim().toLowerCase();
  if (!cityNorm) return false;

  const nameNorm = port.name.toLowerCase();
  const root = nameNorm.split(',')[0].trim();
  const base = root.split('(')[0].trim();
  const idNorm = port.id.toLowerCase();

  if ([idNorm, nameNorm, root, base].includes(cityNorm)) return true;
  if (root.startsWith(`${cityNorm}-`) || root.startsWith(`${cityNorm} `)) return true;
  if (base.startsWith(`${cityNorm} `) || base.startsWith(`${cityNorm}(`)) return true;
  return false;
}

export function filterWaterPorts(ports: WaterPortOption[], query: string, limit = 25): WaterPortOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return ports.slice(0, limit);

  const matches: WaterPortOption[] = [];
  for (const port of ports) {
    const haystack = `${port.id} ${port.name} ${port.country} ${port.region}`.toLowerCase();
    if (haystack.includes(q)) {
      matches.push(port);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export async function fetchWaterPortCatalog(): Promise<WaterPortCatalog> {
  if (catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    const res = await fetch(`${BACKEND_BASE}/water/ports`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      catalogPromise = null;
      throw new Error(`Failed to load water ports (${res.status})`);
    }
    const data = (await res.json()) as WaterPortCatalog & { ports: WaterPortOption[] };
    portIndex = buildIndex(data.ports);
    return {
      ports: data.ports,
      total: data.total ?? data.ports.length,
      routable: data.routable ?? data.ports.filter((p) => p.routable).length,
      regions: data.regions ?? new Set(data.ports.map((p) => p.region)).size,
    };
  })();

  return catalogPromise;
}

export function resolveWaterPort(
  ports: WaterPortOption[],
  value: string,
  portId?: string | null,
): WaterPortOption | null {
  const normalized = value.trim().toLowerCase();
  const fromIndex = normalized ? portIndex?.byName.get(normalized) : null;
  const fromListByName = normalized
    ? ports.find(
        (p) =>
          p.name.toLowerCase() === normalized ||
          p.id.toLowerCase() === normalized ||
          cityMatchesPort(normalized, p),
      ) ?? null
    : null;
  const nameMatch = fromIndex ?? fromListByName;

  if (portId) {
    const byId = portIndex?.byId.get(portId);
    if (byId) return !value.trim() || nameMatch?.id === byId.id ? byId : null;
    const fromList = ports.find((p) => p.id === portId);
    if (fromList) return !value.trim() || nameMatch?.id === fromList.id ? fromList : null;
  }

  if (!normalized) return null;

  return nameMatch;
}

export function validateWaterPortSelection(
  ports: WaterPortOption[],
  value: string,
  portId: string | null | undefined,
  label: string,
): string | null {
  const port = resolveWaterPort(ports, value, portId);
  if (!port) {
    return `${label} must be selected from the port list.`;
  }
  if (!port.routable) {
    return `${port.name} is in our database but not yet connected in the routing network.`;
  }
  return null;
}
