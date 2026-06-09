'use client';

import { create } from 'zustand';
import {
  listReports,
  createReport,
  updateReport,
  deleteReport,
  executeTrip,
  stopTrip,
  cancelTrip,
  restartTrip,
  getRouteHealth,
  reoptimizeTrip,
  saveRevision,
  updateShipmentLocation,
  reoptimizeTripV1,
  acceptReoptimization,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type ShipmentReport,
  type CreateReportPayload,
  type UpdateReportPayload,
  type RouteHealthResponse,
  type ReoptimizationRecommendation,
  type ReoptimizationResponse,
  type ReoptimizationV1Response,
  type ShipmentNotification,
} from '@/services/plannerApi';

interface PlannerState {
  reports: ShipmentReport[];
  loading: boolean;
  saving: boolean;
  error: string | null;

  // Route health
  routeHealth: RouteHealthResponse | null;
  routeHealthLoading: boolean;
  reoptimization: ReoptimizationResponse | null;
  reoptimizationLoading: boolean;
  // Reoptimization V1
  reoptimizationV1: ReoptimizationV1Response | null;
  reoptimizationV1Loading: boolean;

  // Notifications
  notifications: ShipmentNotification[];
  unreadCount: number;
  notificationsLoading: boolean;

  // Report CRUD
  fetchReports: () => Promise<void>;
  saveReport: (payload: CreateReportPayload) => Promise<ShipmentReport>;
  renameReport: (id: string, name: string) => Promise<void>;
  updateReportData: (id: string, payload: UpdateReportPayload) => Promise<void>;
  removeReport: (id: string) => Promise<void>;
  clearError: () => void;

  // Trip lifecycle
  executeTrip: (id: string) => Promise<void>;
  stopTrip: (id: string) => Promise<void>;
  cancelTrip: (id: string) => Promise<void>;
  restartTrip: (id: string) => Promise<void>;

  // Route health
  fetchRouteHealth: (id: string, actualLocation?: string) => Promise<void>;
  reoptimizeTrip: (id: string, payload: { current_location: string; remaining_stops: string[]; destination: string }) => Promise<ReoptimizationResponse>;
  saveRevision: (id: string, payload: {
    name?: string;
    current_location: string;
    remaining_stops: string[];
    destination: string;
    recommendation: ReoptimizationRecommendation;
  }) => Promise<ShipmentReport>;
  updateShipmentLocation: (id: string, payload: { current_location: string }) => Promise<ShipmentReport>;
  // Reoptimization V1
  runReoptimizationV1: (id: string) => Promise<ReoptimizationV1Response>;
  acceptReoptimizationV1: (id: string, result: ReoptimizationV1Response) => Promise<ShipmentReport>;
  dismissReoptimizationV1: () => void;

  // Notifications
  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  reports: [],
  loading: false,
  saving: false,
  error: null,

  routeHealth: null,
  routeHealthLoading: false,
  reoptimization: null,
  reoptimizationLoading: false,
  reoptimizationV1: null,
  reoptimizationV1Loading: false,

  notifications: [],
  unreadCount: 0,
  notificationsLoading: false,

  fetchReports: async () => {
    set({ loading: true, error: null });
    try {
      const reports = await listReports();
      set({ reports, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load reports' });
    }
  },

  saveReport: async (payload) => {
    set({ saving: true, error: null });
    try {
      const report = await createReport(payload);
      set(state => ({ reports: [report, ...state.reports], saving: false }));
      return report;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save report';
      set({ saving: false, error: msg });
      throw new Error(msg);
    }
  },

  renameReport: async (id, name) => {
    try {
      const updated = await updateReport(id, { name });
      set(state => ({
        reports: state.reports.map(r => (r.id === id ? updated : r)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to rename report' });
      throw err;
    }
  },

  updateReportData: async (id, payload) => {
    try {
      const updated = await updateReport(id, payload);
      set(state => ({
        reports: state.reports.map(r => (r.id === id ? updated : r)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update report' });
      throw err;
    }
  },

  removeReport: async (id) => {
    try {
      await deleteReport(id);
      set(state => ({ reports: state.reports.filter(r => r.id !== id) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete report' });
      throw err;
    }
  },

  clearError: () => set({ error: null }),

  // ── Trip lifecycle ──────────────────────────────────────────────────

  executeTrip: async (id) => {
    set({ saving: true, error: null });
    try {
      const updated = await executeTrip(id);
      set(state => ({
        reports: state.reports.map(r => (r.id === id ? updated : r)),
        saving: false,
      }));
      // Refresh notifications after trip event
      void get().fetchUnreadCount();
    } catch (err) {
      set({ saving: false, error: err instanceof Error ? err.message : 'Failed to execute trip' });
      throw err;
    }
  },

  stopTrip: async (id) => {
    set({ saving: true, error: null });
    try {
      const updated = await stopTrip(id);
      set(state => ({
        reports: state.reports.map(r => (r.id === id ? updated : r)),
        saving: false,
      }));
      void get().fetchUnreadCount();
    } catch (err) {
      set({ saving: false, error: err instanceof Error ? err.message : 'Failed to stop trip' });
      throw err;
    }
  },

  cancelTrip: async (id) => {
    set({ saving: true, error: null });
    try {
      const updated = await cancelTrip(id);
      set(state => ({
        reports: state.reports.map(r => (r.id === id ? updated : r)),
        saving: false,
      }));
      void get().fetchUnreadCount();
    } catch (err) {
      set({ saving: false, error: err instanceof Error ? err.message : 'Failed to cancel trip' });
      throw err;
    }
  },

  restartTrip: async (id) => {
    set({ saving: true, error: null });
    try {
      const updated = await restartTrip(id);
      set(state => ({
        reports: state.reports.map(r => (r.id === id ? updated : r)),
        saving: false,
      }));
      void get().fetchUnreadCount();
    } catch (err) {
      set({ saving: false, error: err instanceof Error ? err.message : 'Failed to restart trip' });
      throw err;
    }
  },

  // ── Route health ────────────────────────────────────────────────────

  fetchRouteHealth: async (id, actualLocation) => {
    set({ routeHealthLoading: true });
    try {
      const health = await getRouteHealth(id, actualLocation);
      set({ routeHealth: health, routeHealthLoading: false });
    } catch (err) {
      set({ routeHealthLoading: false, error: err instanceof Error ? err.message : 'Failed to fetch route health' });
    }
  },

  reoptimizeTrip: async (id, payload) => {
    set({ reoptimizationLoading: true, error: null });
    try {
      const response = await reoptimizeTrip(id, payload);
      set({ reoptimization: response, reoptimizationLoading: false });
      void get().fetchUnreadCount();
      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reoptimize trip';
      set({ reoptimizationLoading: false, error: msg });
      throw new Error(msg);
    }
  },

  saveRevision: async (id, payload) => {
    set({ saving: true, error: null });
    try {
      const report = await saveRevision(id, payload);
      set(state => ({
        reports: [report, ...state.reports.filter(r => r.id !== report.id)],
        saving: false,
      }));
      void get().fetchUnreadCount();
      return report;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save revision';
      set({ saving: false, error: msg });
      throw new Error(msg);
    }
  },

  updateShipmentLocation: async (id, payload) => {
    set({ saving: true, error: null });
    try {
      const updated = await updateShipmentLocation(id, payload);
      // Update the report in the list (single source of truth)
      set(state => ({
        reports: state.reports.map(r => (r.id === id ? updated : r)),
        saving: false,
      }));
      void get().fetchUnreadCount();
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update shipment location';
      set({ saving: false, error: msg });
      throw new Error(msg);
    }
  },

  runReoptimizationV1: async (id) => {
    set({ reoptimizationV1Loading: true, error: null });
    try {
      const result = await reoptimizeTripV1(id);
      set({ reoptimizationV1: result, reoptimizationV1Loading: false });
      void get().fetchUnreadCount();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to run reoptimization';
      set({ reoptimizationV1Loading: false, error: msg });
      throw new Error(msg);
    }
  },

  acceptReoptimizationV1: async (id, result) => {
    set({ saving: true, error: null });
    try {
      const altRoute = result.alternative_route;
      const updated = await acceptReoptimization(id, {
        optimization_result: altRoute.optimization_result,
        estimated_cost: altRoute.metrics.cost ?? undefined,
        estimated_time: altRoute.metrics.eta_minutes != null
          ? altRoute.metrics.eta_minutes / 60
          : undefined,
        risk_score: altRoute.metrics.risk ?? undefined,
      });
      set(state => ({
        reports: state.reports.map(r => (r.id === id ? updated : r)),
        reoptimizationV1: null,
        saving: false,
      }));
      void get().fetchUnreadCount();
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to accept reoptimization';
      set({ saving: false, error: msg });
      throw new Error(msg);
    }
  },

  dismissReoptimizationV1: () => set({ reoptimizationV1: null }),

  // ── Notifications ───────────────────────────────────────────────────

  fetchNotifications: async () => {
    set({ notificationsLoading: true });
    try {
      const notifs = await listNotifications();
      set({
        notifications: notifs,
        unreadCount: notifs.filter(n => !n.read).length,
        notificationsLoading: false,
      });
    } catch {
      set({ notificationsLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const count = await getUnreadCount();
      set({ unreadCount: count });
    } catch {
      // silent — non-critical
    }
  },

  markRead: async (id) => {
    try {
      await markNotificationRead(id);
      set(state => ({
        notifications: state.notifications.map(n =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch {
      // silent
    }
  },

  markAllRead: async () => {
    try {
      await markAllNotificationsRead();
      set(state => ({
        notifications: state.notifications.map(n => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch {
      // silent
    }
  },
}));
