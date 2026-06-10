'use client';

import { useEffect, useState } from 'react';
import {
  fetchWaterPortCatalog,
  type WaterPortCatalog,
  type WaterPortOption,
} from '@/lib/water-port-catalog';

const EMPTY_CATALOG: WaterPortCatalog = {
  ports: [],
  total: 0,
  routable: 0,
  regions: 0,
};

export function useWaterPortCatalog() {
  const [catalog, setCatalog] = useState<WaterPortCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchWaterPortCatalog()
      .then((data) => {
        if (!cancelled) {
          setCatalog(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load ports');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ports: catalog.ports as WaterPortOption[],
    total: catalog.total,
    routable: catalog.routable,
    regions: catalog.regions,
    loading,
    error,
  };
}
