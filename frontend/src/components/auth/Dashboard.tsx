'use client';

import Link from 'next/link';
import { ArrowUpRight, Plus, TrendingUp, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name.split(' ')[0] || 'User';

  return (
    <div className="relative w-full overflow-hidden">
      <AmbientBackdrop variant="subtle" />

      <div className="relative z-10 pointer-events-auto mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
        {/* Welcome Section */}
        <div className="mb-10 sm:mb-14">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            Welcome back, {firstName}
          </h1>
          <p className="text-muted-foreground">
            Manage your shipments, monitor active trips, and optimize routes.
          </p>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[
            {
              label: 'Planned Shipments',
              value: '0',
              icon: '📋',
              trend: 'Ready to create your first shipment',
            },
            {
              label: 'Active Trips',
              value: '0',
              icon: '🚀',
              trend: 'No active shipments',
            },
            {
              label: 'Completed Trips',
              value: '0',
              icon: '✅',
              trend: 'Track completed shipments',
            },
            {
              label: 'Notifications',
              value: '0',
              icon: '🔔',
              trend: 'Stay updated on route changes',
            },
          ].map((card, i) => (
            <div
              key={card.label}
              className="rounded-2xl border border-border/50 bg-surface/40 backdrop-blur-sm p-5 sm:p-6 hover:border-border-strong hover:bg-surface/60 transition-all animate-fade-in"
              style={{
                animationDelay: `${0.1 + i * 0.05}s`,
                animationFillMode: 'backwards',
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    {card.label}
                  </p>
                </div>
                <span className="text-2xl">{card.icon}</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold text-foreground mb-1">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.trend}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={() => alert('Shipment planner coming soon!')}
              className="rounded-xl border border-border/50 bg-surface/40 backdrop-blur-sm p-6 hover:border-hybrid/50 hover:bg-surface/60 transition-all group"
            >
              <div className="flex items-center gap-3 mb-2">
                <Plus className="h-5 w-5 text-hybrid" />
                <span className="font-semibold text-foreground">Create Shipment</span>
              </div>
              <p className="text-sm text-muted-foreground">Plan a new shipment with AI assistance</p>
            </button>

            <Link
              href="/hybrid"
              className="rounded-xl border border-border/50 bg-surface/40 backdrop-blur-sm p-6 hover:border-rail/50 hover:bg-surface/60 transition-all group"
            >
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="h-5 w-5 text-rail" />
                <span className="font-semibold text-foreground">Optimize Routes</span>
              </div>
              <p className="text-sm text-muted-foreground">Compare and optimize multimodal routes</p>
            </Link>

            <button
              onClick={() => alert('Reports coming soon!')}
              className="rounded-xl border border-border/50 bg-surface/40 backdrop-blur-sm p-6 hover:border-water/50 hover:bg-surface/60 transition-all group"
            >
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle className="h-5 w-5 text-water" />
                <span className="font-semibold text-foreground">View Reports</span>
              </div>
              <p className="text-sm text-muted-foreground">Analyze shipment performance</p>
            </button>
          </div>
        </div>

        {/* Planned Features Section */}
        <div className="rounded-2xl border border-border/30 bg-surface/20 backdrop-blur-sm p-6 sm:p-8">
          <h2 className="text-lg font-bold text-foreground mb-4">Coming Soon</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                title: 'Shipment Planner',
                description: 'Create and manage planned shipments with AI assistance',
              },
              {
                title: 'Route Execution',
                description: 'Execute optimized trips and track shipments in real-time',
              },
              {
                title: 'Route Health',
                description: 'Monitor shipment status and identify disruptions',
              },
              {
                title: 'Smart Notifications',
                description: 'Receive alerts for traffic, weather, and ETA changes',
              },
              {
                title: 'Saved Reports',
                description: 'Generate and archive shipment performance reports',
              },
              {
                title: 'Shipment Lifecycle',
                description: 'Track complete journey from planning to completion',
              },
            ].map((feature) => (
              <div key={feature.title} className="rounded-lg border border-border/30 bg-surface/40 p-4">
                <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-12 text-center animate-fade-in">
          <p className="text-muted-foreground mb-6">Ready to start optimizing your logistics?</p>
          <Link
            href="/hybrid"
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-[0_0_40px_-12px_var(--hybrid)] transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_52px_-8px_var(--hybrid)]"
          >
            Start Optimizing Routes
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
