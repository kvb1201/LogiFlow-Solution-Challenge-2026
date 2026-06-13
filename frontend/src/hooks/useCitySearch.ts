import { useState, useRef, useCallback } from 'react';
import { searchCities, type StationSearchResult } from '@/services/api';

/**
 * Converts raw city search results to a format compatible with LogiFlow autocomplete.
 */
export function citiesToStationRows(
  rows: { name: string; lat?: number; lng?: number }[]
): StationSearchResult[] {
  return rows.map((r) => {
    // Split by comma and take the first part (e.g., "New Delhi, Delhi" -> "New Delhi")
    const cityName = r.name.split(',')[0]?.trim() || r.name;
    return {
      code: cityName.slice(0, 5).toUpperCase() || 'CITY',
      name: cityName,
    };
  });
}

/**
 * Hook for debounced city searching.
 * Used to provide autocomplete suggestions in pipeline forms.
 */
export function useCitySearch(setGlobalSuggestions: (rows: StationSearchResult[]) => void) {
  const [results, setResults] = useState<StationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (query: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (!query || query.length < 2) {
        setResults([]);
        setGlobalSuggestions([]);
                return;
      }
      setLoading(true);
      timeoutRef.current = setTimeout(async () => {
        try {
          const data = await searchCities(query);
          const formatted = citiesToStationRows(data);
          setResults(formatted);
          setGlobalSuggestions(formatted);
        } catch (error) {
          console.error('City search failed:', error);
          setResults([]);
          setGlobalSuggestions([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [setGlobalSuggestions]
  );

  const clear = useCallback(() => {
    setResults([]);
    setGlobalSuggestions([]);
  }, [setGlobalSuggestions]);

  return { results, loading, search, clear };
}
