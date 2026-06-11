'use client';

import { useEffect, useState, useRef } from 'react';
import { usePlannerStore } from '@/store/usePlannerStore';
import Link from 'next/link';
import { AmbientMesh } from '@/components/cockpit/AmbientMesh';

const NOTIFICATION_ICONS: Record<string, string> = {
  trip_started: 'play_circle',
  trip_stopped: 'check_circle',
  trip_cancelled: 'cancel',
  trip_restarted: 'replay',
};

const NOTIFICATION_COLORS: Record<string, string> = {
  trip_started: 'text-emerald-300',
  trip_stopped: 'text-violet-300',
  trip_cancelled: 'text-red-400',
  trip_restarted: 'text-primary',
};

export function NotificationBell() {
  const {
    notifications,
    unreadCount,
    notificationsLoading,
    fetchNotifications,
    fetchUnreadCount,
    markRead,
    markAllRead,
  } = usePlannerStore();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    setOpen(v => !v);
    if (!open) {
      fetchNotifications();
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="relative h-8 w-8 grid place-items-center rounded-md border border-border bg-surface/60 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Notifications"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>
          notifications
        </span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary text-[9px] font-bold text-on-primary px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] animate-fade-in overflow-hidden rounded-2xl border border-border/50 bg-surface/95 shadow-2xl backdrop-blur-xl sm:w-96">
          <AmbientMesh variant="card" tone="hybrid" className="opacity-80" />
          <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
            <h3 className="text-sm font-bold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="text-[10px] text-primary hover:underline font-semibold"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notificationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <span className="text-2xl block mb-2">🔔</span>
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="text-[10px] text-outline mt-1">Trip events will appear here</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/15">
                {notifications.map(n => {
                  const icon = NOTIFICATION_ICONS[n.type] || 'info';
                  const color = NOTIFICATION_COLORS[n.type] || 'text-primary';
                  return (
                    <li key={n.id}>
                      <button
                        className={`w-full text-left px-4 py-3 hover:bg-surface/60 transition-colors flex items-start gap-3 ${
                          !n.read ? 'bg-primary/5' : ''
                        }`}
                        onClick={() => {
                          if (!n.read) markRead(n.id);
                          if (n.report_id) {
                            setOpen(false);
                            window.location.href = `/reports/${n.report_id}`;
                          }
                        }}
                      >
                        <span
                          className={`material-symbols-outlined mt-0.5 shrink-0 ${color}`}
                          style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
                        >
                          {icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] leading-relaxed ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {n.message}
                          </p>
                          <p className="text-[9px] text-outline mt-1">
                            {new Date(n.created_at).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        {!n.read && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
