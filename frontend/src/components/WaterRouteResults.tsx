'use client';

import React from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

function formatCurrency(val: unknown) {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

export default function WaterRouteResults() {
  const routes = useLogiFlowStore((s) => s.waterRoutes);
  const selected = useLogiFlowStore((s) => s.selectedWaterRoute);
  const setSelected = useLogiFlowStore((s) => s.setSelectedWaterRoute);

  if (!routes || routes.length === 0) return null;

  const active = routes[Math.min(Math.max(selected, 0), routes.length - 1)];

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-3">
        <div className="text-xs text-on-surface-variant">
          {routes.length} route(s) generated · Best: ₹{formatCurrency(routes[0]?.cost)} · {Number(routes[0]?.time ?? 0).toFixed(1)}h · Risk{' '}
          {Math.round(Number(routes[0]?.risk ?? 0) * 100)}%
        </div>

        {routes.map((r, idx) => {
          const isActive = idx === selected;
          return (
            <button
              key={`${idx}-${r.origin_port ?? ''}-${r.destination_port ?? ''}`}
              onClick={() => setSelected(idx)}
              className={[
                'w-full text-left p-4 rounded-2xl border transition-all',
                isActive
                  ? 'bg-surface-container border-primary/40 shadow-md'
                  : 'bg-surface-container-lowest/30 border-outline-variant/15 hover:bg-surface-container/40 hover:border-outline-variant/30',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-on-surface">
                    {r.origin_port ?? 'Origin Port'} → {r.destination_port ?? 'Destination Port'}
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-1">
                    {r.transshipments ?? 0} transshipment(s) · {Number(r.distance_nm ?? 0).toFixed(1)} nm
                    {r.notes ? ` · ${r.notes}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="mono text-sm font-bold text-primary">₹{formatCurrency(r.cost)}</div>
                  <div className="mono text-[11px] text-on-surface-variant">
                    {Number(r.time).toFixed(1)}h · Risk {Math.round(Number(r.risk) * 100)}%
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-surface-container-low/60 border border-outline-variant/20 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold">Selected Route</div>
          <div className="mono text-xs text-on-surface-variant">
            Delay ~{Number(active.expected_delay_hours ?? 0).toFixed(1)}h · Reliability {Math.round(Number(active.reliability_score ?? 0) * 100)}%
          </div>
        </div>

        <div className="space-y-2">
          {(active.segments || []).map((s, i) => (
            <div
              key={`${i}-${s.from}-${s.to}`}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-surface-container-lowest/40 border border-outline-variant/10"
            >
              <div className="text-xs">
                <span className="mono text-outline mr-2">{s.mode}</span>
                <span className="text-on-surface">{s.from}</span>
                <span className="text-outline mx-2">→</span>
                <span className="text-on-surface">{s.to}</span>
              </div>
            </div>
          ))}
        </div>

        {active.risk_breakdown && (
          <div className="mt-4 text-xs text-on-surface-variant">
            Risk breakdown:{' '}
            {Object.entries(active.risk_breakdown)
              .map(([k, v]) => `${k} ${(Number(v) * 100).toFixed(0)}%`)
              .join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

