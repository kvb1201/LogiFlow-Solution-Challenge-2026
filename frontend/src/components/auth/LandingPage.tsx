'use client';

import Link from 'next/link';
import { Radar, ArrowUpRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { AmbientBackdrop } from '@/components/cockpit/AmbientBackdrop';

export function LandingPage() {
  return (
    <div className="relative w-full overflow-hidden">
      <AmbientBackdrop variant="home" />

      <div className="relative z-10 pointer-events-auto mx-auto w-full px-4 sm:px-6">
        {/* Hero Section */}
        <div className="max-w-4xl mx-auto py-20 sm:py-32">
          <div className="mb-8 flex flex-wrap items-center gap-2 animate-slide-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
              <span className="live-dot" />
              AI-Powered Logistics
            </span>
          </div>

          <h1 className="text-balance font-display text-4xl font-black leading-[1.1] text-gradient sm:text-5xl md:text-6xl mb-6 animate-slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'backwards' }}>
            LogiFlow
          </h1>

          <p className="text-balance text-lg leading-relaxed text-muted-foreground sm:text-xl mb-8 max-w-2xl animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'backwards' }}>
            AI-Powered Logistics Planning & Optimization Platform
          </p>

          <p className="text-balance text-base leading-relaxed text-muted-foreground sm:text-lg mb-10 max-w-2xl animate-slide-up" style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}>
            Plan smarter shipments, optimize multimodal routes, monitor active trips, and respond to disruptions before they impact delivery.
          </p>

          <div className="flex flex-wrap gap-4 animate-slide-up" style={{ animationDelay: '0.4s', animationFillMode: 'backwards' }}>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-base font-semibold text-background shadow-[0_0_40px_-12px_var(--hybrid)] transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_52px_-8px_var(--hybrid)]"
            >
              Get Started
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <button
              onClick={() => document.getElementById('smart-ai-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/70 px-6 py-3 text-base font-semibold text-foreground backdrop-blur-sm transition-all duration-300 hover:border-border-strong hover:bg-surface-2"
            >
              Learn More
            </button>
          </div>
        </div>

        {/* Smart AI Planner Section */}
        <div id="smart-ai-section" className="max-w-5xl mx-auto py-20 sm:py-28 scroll-mt-16">
          <div className="mb-12 animate-fade-in">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Smart AI Planner</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Transform logistics planning from a reactive process into a proactive strategy. The Smart AI Planner helps logistics teams:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
            {[
              'Optimize shipment routes',
              'Compare cost, time, and risk tradeoffs',
              'Plan multi-stop deliveries',
              'Monitor route health',
              'Respond to disruptions dynamically',
              'Improve operational efficiency',
            ].map((benefit, i) => (
              <div key={benefit} className="flex items-start gap-3 animate-fade-in" style={{ animationDelay: `${0.1 + i * 0.05}s`, animationFillMode: 'backwards' }}>
                <CheckCircle2 className="h-5 w-5 text-rail flex-shrink-0 mt-0.5" />
                <span className="text-foreground font-medium">{benefit}</span>
              </div>
            ))}
          </div>

          {/* Visualization - Dashboard Preview */}
          <div className="rounded-2xl border border-border/50 bg-surface/30 backdrop-blur-sm p-6 sm:p-8 overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Planned', value: '0', icon: '📋' },
                { label: 'Active', value: '0', icon: '🚀' },
                { label: 'Completed', value: '0', icon: '✅' },
                { label: 'Alerts', value: '0', icon: '⚠️' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="rounded-lg border border-border/40 bg-surface/60 p-3 text-center">
                  <div className="text-2xl mb-2">{icon}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
                  <div className="text-lg font-bold text-foreground">{value}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-border/30 bg-surface/40 p-3 text-sm">
                <span className="text-muted-foreground">Shipment Request</span>
                <span className="text-rail">→</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/30 bg-surface/40 p-3 text-sm">
                <span className="text-muted-foreground">AI Optimization</span>
                <span className="text-hybrid">→</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/30 bg-surface/40 p-3 text-sm">
                <span className="text-muted-foreground">Execution</span>
                <span className="text-road">→</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/30 bg-surface/40 p-3 text-sm">
                <span className="text-muted-foreground">Route Health</span>
                <span className="text-water">→</span>
              </div>
              <div className="rounded-lg border border-border/30 bg-surface/40 p-3 text-sm">
                <span className="text-muted-foreground">Completion</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="max-w-5xl mx-auto py-20 sm:py-28">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-12">Key Features</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                title: 'Route Optimization',
                description: 'Optimize cost, time, and risk using AI-powered route recommendations.',
                icon: '🎯',
                accent: 'border-rail/30',
              },
              {
                title: 'Multi-Stop Planning',
                description: 'Plan complex shipment corridors with intelligent stop sequencing.',
                icon: '📍',
                accent: 'border-road/30',
              },
              {
                title: 'Shipment Monitoring',
                description: 'Track route health and identify potential disruptions.',
                icon: '📊',
                accent: 'border-water/30',
              },
              {
                title: 'Dynamic Replanning',
                description: 'Respond to changing traffic and weather conditions with updated recommendations.',
                icon: '🔄',
                accent: 'border-air/30',
              },
            ].map((feature, i) => (
              <div
                key={feature.title}
                className={`rounded-2xl border ${feature.accent} bg-surface/40 p-6 sm:p-7 hover:bg-surface/60 transition-colors animate-fade-in`}
                style={{ animationDelay: `${0.1 + i * 0.1}s`, animationFillMode: 'backwards' }}
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-bold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="max-w-4xl mx-auto py-20 sm:py-28 text-center animate-fade-in">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">Ready to optimize your logistics?</h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
            Start planning smarter shipments today. No credit card required.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-8 py-4 text-base font-semibold text-background shadow-[0_0_40px_-12px_var(--hybrid)] transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_52px_-8px_var(--hybrid)]"
          >
            Start Planning
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
