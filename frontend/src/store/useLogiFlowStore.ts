import { create } from 'zustand';
import { fetchOptimizedRoute } from '@/services/api';

interface RouteSegment {
  mode: string;
  from: string | { name: string; lat: number; lng: number };
  to: string | { name: string; lat: number; lng: number };
}

interface RouteOption {
  type: string;
  mode: string;
  total_time?: number;
  time?: number;
  total_cost?: number;
  cost?: number;
  risk?: number;
  segments?: RouteSegment[];
}

interface LogiFlowState {
  source: string;
  destination: string;
  priority: string;
  preferredMode: string;
  excludedModes: string[];
  budgetCap: number;
  maxDelay: number;
  carbonPriority: number;
  selectedRouteIndex: number;
  routes: RouteOption[];
  loading: boolean;
  hasSearched: boolean;
  
  setSource: (val: string) => void;
  setDestination: (val: string) => void;
  setPriority: (val: string) => void;
  setPreferredMode: (val: string) => void;
  setExcludedModes: (val: string[]) => void;
  setBudgetCap: (val: number) => void;
  setMaxDelay: (val: number) => void;
  setCarbonPriority: (val: number) => void;
  setSelectedRouteIndex: (idx: number) => void;
  setRoutes: (routes: RouteOption[]) => void;
  setLoading: (loading: boolean) => void;
  handleRecalculate: () => Promise<void>;
}

export const useLogiFlowStore = create<LogiFlowState>((set, get) => ({
  source: '',
  destination: '',
  priority: 'Fast',
  preferredMode: 'Any',
  excludedModes: [],
  budgetCap: 120000,
  maxDelay: 6,
  carbonPriority: 50,
  selectedRouteIndex: 0,
  routes: [],
  loading: false,
  hasSearched: false,
  
  setSource: (val) => set({ source: val }),
  setDestination: (val) => set({ destination: val }),
  setPriority: (val) => set({ priority: val }),
  setPreferredMode: (val) => set({ preferredMode: val }),
  setExcludedModes: (val) => set({ excludedModes: val }),
  setBudgetCap: (val) => set({ budgetCap: val }),
  setMaxDelay: (val) => set({ maxDelay: val }),
  setCarbonPriority: (val) => set({ carbonPriority: val }),
  setSelectedRouteIndex: (idx) => set({ selectedRouteIndex: idx }),
  setRoutes: (routes) => set({ routes }),
  setLoading: (loading) => set({ loading }),
  
  handleRecalculate: async () => {
    const { source, destination, priority, preferredMode, excludedModes } = get();
    if (!source || !destination) return;
    
    set({ loading: true, hasSearched: true });
    try {
      const data = await fetchOptimizedRoute(
        source, 
        destination, 
        priority, 
        { preferred_mode: preferredMode === 'Any' ? null : preferredMode.toLowerCase() }, 
        { excluded_modes: excludedModes }
      );
      if (data?.best_route && data?.alternatives) {
        set({ routes: [data.best_route, ...data.alternatives], selectedRouteIndex: 0 });
      } else {
        set({ routes: [] });
      }
    } catch (err) {
      console.warn('Could not fetch optimized route.', err);
    } finally {
      set({ loading: false });
    }
  }
}));
