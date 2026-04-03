import { create } from 'zustand';
import {
  optimizeCargoRoute,
  getLiveTrainMap,
  getStationInfoDirect,
  getTrainDelay,
  getLiveTrainStatus,
  fetchRoadRoutes,
  type OptimizeResult,
  type Recommendation,
  type RankedOption,
  type LiveTrainPosition,
  type StationInfo,
  type TrainDelayData,
  type LiveTrainStatus,
  type StationSearchResult,
} from '@/services/api';

// ── Types ────────────────────────────────────────────────────────────

interface StationCoord {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export type RoadRoute = {
  geometry: [number, number][];
  time: number;
  cost: number;
  risk: number;
};

type RoadOptimizeResponse = {
  all: RoadRoute[];
  best?: RoadRoute;
  cheapest?: RoadRoute;
  fastest?: RoadRoute;
  safest?: RoadRoute;
};

interface LogiFlowState {
  // Core inputs
  source: string;
  destination: string;
  priority: string;
  cargoWeight: number;
  cargoType: string;
  departureDate: string;
  budgetMax: number;
  deadlineHours: number;

  // Results
  recommendations: {
    cheapest: Recommendation | null;
    fastest: Recommendation | null;
    safest: Recommendation | null;
  };
  allOptions: RankedOption[];
  selectedOptionIndex: number;
  constraintsApplied: OptimizeResult['constraints_applied'] | null;
  routeMetadata: OptimizeResult['route_metadata'] | null;

  // Road results
  routes: RoadRoute[];
  selectedRoute: number;

  // Road preferences
  avoidTolls: boolean;
  avoidHighways: boolean;
  trafficAware: boolean;

  // Map data
  liveTrains: LiveTrainPosition[];
  stationCoords: Record<string, StationCoord>;
  liveMapMode: 'all' | 'route' | 'hidden';

  /** Per-station delay breakdown + live status for the selected / focused train */
  trainDelayDetail: TrainDelayData | null;
  selectedTrainLive: LiveTrainStatus | null;
  /** Train number used for detail panel delay/live (route selection) */
  detailTrainNumber: string | null;
  /** Train focused from map live dots (for live panel) */
  mapFocusedTrainNumber: string | null;

  /** Latest autocomplete results (RailRadar search) */
  stationSuggestions: StationSearchResult[];
  setStationSuggestions: (rows: StationSearchResult[]) => void;

  // UI state
  loading: boolean;
  hasSearched: boolean;
  activeView: 'recommendations' | 'all_options';
  error: string | null;

  // Actions
  setSource: (val: string) => void;
  setDestination: (val: string) => void;
  setPriority: (val: string) => void;
  setCargoWeight: (val: number) => void;
  setCargoType: (val: string) => void;
  setDepartureDate: (val: string) => void;
  setBudgetMax: (val: number) => void;
  setDeadlineHours: (val: number) => void;
  setSelectedOptionIndex: (idx: number) => void;
  setActiveView: (view: 'recommendations' | 'all_options') => void;
  setLiveMapMode: (mode: 'all' | 'route' | 'hidden') => void;
  setSelectedRoute: (idx: number) => void;

  setAvoidTolls: (val: boolean) => void;
  setAvoidHighways: (val: boolean) => void;
  setTrafficAware: (val: boolean) => void;

  handleOptimize: (opts?: {
    mode?: 'rail' | 'road';
    avoidTolls?: boolean;
    avoidHighways?: boolean;
    trafficAware?: boolean;
  }) => Promise<void>;
  fetchLiveTrains: () => Promise<void>;
  fetchStationCoord: (code: string) => Promise<StationCoord | null>;
  /** Load RailRadar delay + live for a train (route card or map) */
  fetchTrainDelayAndLive: (trainNumber: string) => Promise<void>;
  setMapFocusedTrain: (trainNumber: string | null) => void;
  resetSearch: () => void;
}

export const useLogiFlowStore = create<LogiFlowState>((set, get) => ({
  // Defaults
  source: '',
  destination: '',
  priority: 'cost',
  cargoWeight: 100,
  cargoType: 'General',
  departureDate: new Date().toISOString().split('T')[0],
  budgetMax: 50000,
  deadlineHours: 48,

  recommendations: { cheapest: null, fastest: null, safest: null },
  allOptions: [],
  selectedOptionIndex: 0,
  constraintsApplied: null,
  routeMetadata: null,

  routes: [],
  selectedRoute: 0,

  avoidTolls: false,
  avoidHighways: false,
  trafficAware: false,

  liveTrains: [],
  stationCoords: {},
  liveMapMode: 'all',

  trainDelayDetail: null,
  selectedTrainLive: null,
  detailTrainNumber: null,
  mapFocusedTrainNumber: null,

  stationSuggestions: [],
  setStationSuggestions: (rows) => set({ stationSuggestions: rows }),

  loading: false,
  hasSearched: false,
  activeView: 'recommendations',
  error: null,

  // Setters
  setSource: (val) => set({ source: val }),
  setDestination: (val) => set({ destination: val }),
  setPriority: (val) => set({ priority: val }),
  setCargoWeight: (val) => set({ cargoWeight: val }),
  setCargoType: (val) => set({ cargoType: val }),
  setDepartureDate: (val) => set({ departureDate: val }),
  setBudgetMax: (val) => set({ budgetMax: val }),
  setDeadlineHours: (val) => set({ deadlineHours: val }),
  setSelectedOptionIndex: (idx) => set({ selectedOptionIndex: idx }),
  setActiveView: (view) => set({ activeView: view }),
  setLiveMapMode: (mode) => set({ liveMapMode: mode }),
  setSelectedRoute: (idx) => set({ selectedRoute: idx }),

  setAvoidTolls: (val) => set({ avoidTolls: val }),
  setAvoidHighways: (val) => set({ avoidHighways: val }),
  setTrafficAware: (val) => set({ trafficAware: val }),

  resetSearch: () => set({
    hasSearched: false,
    recommendations: { cheapest: null, fastest: null, safest: null },
    allOptions: [],
    selectedOptionIndex: 0,
    routes: [],
    selectedRoute: 0,
    error: null,
    trainDelayDetail: null,
    selectedTrainLive: null,
    detailTrainNumber: null,
    mapFocusedTrainNumber: null,
    stationSuggestions: [],
  }),

  // ── Main optimize call ─────────────────────────────────────────────
  handleOptimize: async (opts) => {
    const { source, destination, priority, cargoWeight, cargoType, departureDate, budgetMax, deadlineHours } = get();
    if (!source.trim() || !destination.trim()) return;

    set({ loading: true, hasSearched: true, error: null });

    try {
      if (opts?.mode === 'road') {
        const avoidTolls = opts?.avoidTolls ?? get().avoidTolls ?? false;
        const avoidHighways = opts?.avoidHighways ?? get().avoidHighways ?? false;
        const trafficAware = opts?.trafficAware ?? get().trafficAware ?? false;
        console.log("ROAD PAYLOAD:", {
          avoidTolls,
          avoidHighways,
          trafficAware,
        });
        const raw = (await fetchRoadRoutes({
          source: source.trim(),
          destination: destination.trim(),
          priority,
          budget: budgetMax,
          deadline_hours: deadlineHours,
          cargo_weight_kg: cargoWeight,
          cargo_type: cargoType,
          avoid_tolls: avoidTolls,
          avoid_highways: avoidHighways,
          traffic_aware: trafficAware,
        })) as RoadOptimizeResponse;
        const all = Array.isArray(raw?.all) ? raw.all : [];
        set({
          routes: all,
          selectedRoute: 0,
        });
        return;
      }
      const result = await optimizeCargoRoute({
        origin_city: source.trim(),
        destination_city: destination.trim(),
        cargo_weight_kg: cargoWeight,
        cargo_type: cargoType,
        budget_max_inr: budgetMax,
        deadline_hours: deadlineHours,
        priority,
        departure_date: departureDate,
      });

      set({
        recommendations: {
          cheapest: result.cheapest,
          fastest: result.fastest,
          safest: result.safest,
        },
        allOptions: result.all_options || [],
        constraintsApplied: result.constraints_applied,
        routeMetadata: result.route_metadata,
        selectedOptionIndex: 0,
      });

      // Fetch station coordinates for map (from segments)
      const allSegments = [
        ...(result.cheapest?.segments || []),
        ...(result.fastest?.segments || []),
        ...(result.safest?.segments || []),
      ];
      const codes = new Set<string>();
      allSegments.forEach(seg => {
        if (seg.from && typeof seg.from === 'string') codes.add(seg.from);
        if (seg.to && typeof seg.to === 'string') codes.add(seg.to);
      });

      // Fetch coords in parallel
      const coordPromises = Array.from(codes).map(code => get().fetchStationCoord(code));
      await Promise.allSettled(coordPromises);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to optimize';
      set({
        error: msg,
        routes: [],
        selectedRoute: 0,
      });
      console.error('Optimize error:', err);
    } finally {
      set({ loading: false });
    }
  },

  // ── Live train positions ───────────────────────────────────────────
  fetchLiveTrains: async () => {
    try {
      const trains = await getLiveTrainMap();
      set({ liveTrains: trains });
    } catch (err) {
      console.warn('Failed to fetch live trains:', err);
    }
  },

  // ── Station coordinate lookup ──────────────────────────────────────
  fetchStationCoord: async (code: string): Promise<StationCoord | null> => {
    const existing = get().stationCoords[code];
    if (existing) return existing;

    try {
      const info = await getStationInfoDirect(code);
      if (info && info.lat && info.lng) {
        const coord: StationCoord = {
          code: info.code || code,
          name: info.name || code,
          lat: info.lat,
          lng: info.lng,
        };
        set(state => ({
          stationCoords: { ...state.stationCoords, [code]: coord },
        }));
        return coord;
      }
    } catch {
      // Ignore
    }
    return null;
  },

  fetchTrainDelayAndLive: async (trainNumber: string) => {
    const no = trainNumber.trim();
    if (!no) return;
    set({ detailTrainNumber: no });
    try {
      const [delay, live] = await Promise.all([
        getTrainDelay(no),
        getLiveTrainStatus(no),
      ]);
      set({
        trainDelayDetail: delay,
        selectedTrainLive: live,
      });
    } catch (e) {
      console.warn('Train detail fetch failed:', e);
      set({ trainDelayDetail: null, selectedTrainLive: null });
    }
  },

  /** Live map dot: only refresh live JSON — keep route delay breakdown intact */
  setMapFocusedTrain: (trainNumber) => {
    set({ mapFocusedTrainNumber: trainNumber });
    if (!trainNumber) return;
    void (async () => {
      try {
        const live = await getLiveTrainStatus(trainNumber);
        set({ selectedTrainLive: live });
      } catch (e) {
        console.warn('Live status fetch failed:', e);
      }
    })();
  },
}));
