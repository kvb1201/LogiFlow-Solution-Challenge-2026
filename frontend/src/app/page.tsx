'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import InputForm from '@/components/InputForm';

const MapView = dynamic(() => import('@/components/Map'), { ssr: false });

export default function Dashboard() {
  const {
    source,
    destination,
    budgetCap,
    maxDelay,
    carbonPriority,
    routes,
    selectedRouteIndex,
    loading,
    hasSearched,
    setSelectedRouteIndex,
    setBudgetCap,
    setMaxDelay,
    setCarbonPriority,
    handleRecalculate
  } = useLogiFlowStore();

  const activeRoute = routes[selectedRouteIndex] || null;

  if (!hasSearched) {
    return (
      <div className="bg-[var(--color-surface)] text-[var(--color-on-surface)] min-h-screen flex flex-col items-center p-6 relative">
      	{/* Simulated Map Background for Landing */}
        <div className="absolute inset-0 z-0 bg-[#0d1117]">
          <img className="w-full h-full object-cover opacity-10 grayscale" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCNcTP-TzWsdkpKgND0InBCfzfNp_SkmEevfBjcxjBgSNfrYv3PnreSaqxE9GYKboWBcKwG608iLb4VduCboU8yY7GjYZllcLH2c3f7P0yxe3HpfL2aUm7NbzUWnQjslFEQJh0As2WBcXJL0TE8IXXB7Xs5uE7J_lYZk2mc9v2614ax6tfmPmA0quU-LQGDWoH6hzfgJLBCUfeA1L5sRiBhpUAeYH2TKUnAQbbnPLYamKMQEDunsHKO6ukh-N4z4kxHgiD-Qr90P4o" alt="bg"/>
        </div>
        
        <div className="w-full max-w-4xl z-10 mt-16 max-w-[900px]">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-bold font-headline tracking-tighter text-primary mb-4">LogiFlow</h1>
            <p className="text-on-surface-variant max-w-xl mx-auto font-body">Optimize your supply chain routing with multimodal intelligence, dynamic risk mapping, and granular predictive alerts.</p>
          </div>
          <InputForm />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-background)] text-[var(--color-on-surface)] font-body overflow-hidden h-screen flex flex-col">
      {/* TopNavBar Component */}
      <header className="bg-[var(--color-surface)] border-b border-outline-variant/10 flex justify-between items-center w-full px-6 h-16 shrink-0 relative z-20">
        <div className="flex items-center gap-8">
          <span className="text-xl font-bold tracking-tighter text-primary cursor-pointer" onClick={() => window.location.reload()}>LogiFlow</span>
          <div className="flex items-center gap-2 text-on-surface-variant bg-surface-container-low px-4 py-1.5 rounded-full border border-outline-variant/10">
            <span className="text-sm font-medium">{source}</span>
            <span className="material-symbols-outlined text-xs text-primary">arrow_forward</span>
            <span className="text-sm font-medium">{destination}</span>
            <button className="material-symbols-outlined text-xs ml-3 text-outline hover:text-primary transition-colors" onClick={() => window.location.reload()}>edit</button>
          </div>
        </div>
        <nav className="flex items-center bg-surface-container-low p-1 rounded-full space-x-1">
          <button className="px-4 py-1.5 rounded-full text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all">Road</button>
          <button className="px-4 py-1.5 rounded-full text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all">Rail</button>
          <button className="px-4 py-1.5 rounded-full text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all">Air</button>
          <button className="px-4 py-1.5 rounded-full text-sm font-semibold text-primary bg-surface-container border border-primary/30 transition-all">Combined</button>
        </nav>
        <div className="flex items-center gap-4">
          <button className="material-symbols-outlined text-on-surface-variant hover:text-on-surface transition-colors">settings</button>
          <div className="w-8 h-8 rounded-full bg-surface-container-highest overflow-hidden border border-outline-variant/20">
            <img alt="User" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBG46pWvhOxxWiobtQLQlNR6e7Ams31T7a-MKnvWqtANlsbkJqe20ajV5slpYYKPo1WzYO1lQeBT67DllBjB60IcESJN2ttIhiTSwcnSmlCDPplTFykIxRFHRl7MsNS1k9hGWzO-A0P_XaM61hCLJBhs4h9FCMxz5PfxMkQ6jhGL483bylQ6P83alfoRrsjxhkKkazzobdN2GLqOufk3cIggclyVgTo_3Uc-BYSi9RG3MXvZl00ZLifMxfyApIN340rmKNJBvhPtGk" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Column: Route List (25%) */}
        <aside className="w-1/4 bg-surface-container-low flex flex-col border-r border-outline-variant/5">
          <div className="p-6 border-b border-outline-variant/10">
            <div className="flex justify-between items-baseline mb-4">
              <h2 className="headline-sm text-lg font-semibold">{routes.length} options found</h2>
              <span className="font-label text-xs text-on-surface-variant flex items-center gap-1">SORTED BY: <span className="text-primary">COST ↑</span></span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {routes.map((route, idx) => {
              const isActive = idx === selectedRouteIndex;
              const cost = route.total_cost || route.cost || 0;
              const time = route.total_time || route.time || 0;
              const risk = route.risk || 0;
              
              return (
                <div 
                  key={idx} 
                  onClick={() => setSelectedRouteIndex(idx)}
                  className={`border-l-4 p-4 rounded-r-lg cursor-pointer transition-colors ${isActive ? 'bg-surface-container border-primary shadow-xl' : 'bg-surface-container-lowest border-transparent hover:bg-surface-container border border-outline-variant/10 group'}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex gap-3">
                      <span className={`material-symbols-outlined ${isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary transition-colors'}`}>
                        {route.mode?.toLowerCase() === 'road' ? 'local_shipping' : route.mode?.toLowerCase() === 'rail' ? 'train' : 'hub'}
                      </span>
                      <div>
                        <p className="text-sm font-bold">{route.type || 'Standard Ground'}</p>
                        <p className="font-label text-xs text-on-surface-variant uppercase">{route.mode}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`mono font-bold ${isActive ? 'text-primary' : 'text-on-surface font-medium'}`}>₹{cost.toLocaleString()}</span>
                      <span className="font-label text-xs text-tertiary">{time}h</span>
                    </div>
                  </div>
                  
                  {isActive && (
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="flex justify-between bg-surface-container-low p-2 rounded">
                        <span className="text-outline">Risk</span>
                        <span className="mono text-on-surface">{(risk * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between bg-surface-container-low p-2 rounded">
                        <span className="text-outline">Stops</span>
                        <span className="mono text-on-surface">{route.segments?.length || 0}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="font-label text-[10px] text-on-surface-variant">PARETO SCORE</span>
                    <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden flex gap-0.5">
                      <div className="h-full w-1/5 bg-tertiary"></div>
                      <div className="h-full w-1/5 bg-tertiary"></div>
                      <div className="h-full w-1/5 bg-tertiary"></div>
                      <div className="h-full w-1/5 bg-tertiary"></div>
                      <div className="h-full w-1/5 bg-surface-variant"></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center Column: Map (45%) */}
        <section className="flex-1 relative bg-surface-container-lowest">
          <div className="absolute inset-0 z-0 bg-[#0d1117]">
             <MapView segments={activeRoute?.segments || []} sourceName={source} destName={destination} />
          </div>
          
          <div className="absolute top-6 left-6 z-10 pointer-events-none">
            <div className="bg-surface-container-highest/80 backdrop-blur-xl p-4 rounded-xl border border-outline-variant/20 shadow-2xl w-64 pointer-events-auto">
              <h3 className="font-label text-xs text-primary mb-2">SELECTED ROUTE SUMMARY</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-on-surface-variant text-xs">Total Distance</span>
                  <span className="mono text-sm">1,422 km</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-on-surface-variant text-xs">Transit Time</span>
                  <span className="mono text-sm">{activeRoute?.total_time || activeRoute?.time || 0}h</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-on-surface-variant text-xs">Stops</span>
                  <span className="mono text-sm">{activeRoute?.segments?.length || '0'}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-4">
            <div className="flex items-center gap-2 bg-surface-container-high/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-outline-variant/20 shadow-lg cursor-pointer hover:bg-surface-container-highest transition-colors">
              <span className="material-symbols-outlined text-xs text-secondary">bolt</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#dfe2eb]">Weather Warning</span>
            </div>
            <div className="flex items-center gap-2 bg-surface-container-high/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-outline-variant/20 shadow-lg cursor-pointer hover:bg-surface-container-highest transition-colors">
              <span className="material-symbols-outlined text-xs text-primary">toll</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#dfe2eb]">₹1,250 Toll Est.</span>
            </div>
          </div>
        </section>

        {/* Right Column: Detail Panels & Controls (30%) */}
        <aside className="w-[30%] bg-surface-container-lowest overflow-y-auto border-l border-outline-variant/5 text-sm p-6 space-y-8">
          {/* Cost Breakdown */}
          <section>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-headline text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Cost Breakdown</h3>
              <span className="bg-tertiary/10 text-tertiary px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">WITHIN BUDGET</span>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] mono">
                  <span className="text-outline">FUEL &amp; TRANSPORT</span>
                  <span>₹48,500</span>
                </div>
                <div className="w-full h-1.5 bg-surface-container rounded-full">
                  <div className="h-full w-[58%] bg-primary-container rounded-full"></div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] mono">
                  <span className="text-outline">TOLLS &amp; TAXES</span>
                  <span>₹12,400</span>
                </div>
                <div className="w-full h-1.5 bg-surface-container rounded-full">
                  <div className="h-full w-[15%] bg-primary-container rounded-full"></div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] mono">
                  <span className="text-outline">LABOR &amp; LOADING</span>
                  <span>₹15,000</span>
                </div>
                <div className="w-full h-1.5 bg-surface-container rounded-full">
                  <div className="h-full w-[18%] bg-primary-container rounded-full"></div>
                </div>
              </div>
              
              <div className="pt-2 border-t border-outline-variant/10 flex justify-between items-baseline mt-4">
                <span className="text-xs font-semibold">TOTAL ESTIMATE</span>
                <span className="mono text-lg font-bold text-primary">₹{(activeRoute?.total_cost || activeRoute?.cost || 82400).toLocaleString()}</span>
              </div>
            </div>
          </section>

          {/* Risk Assessment */}
          <section className="grid grid-cols-2 gap-6 bg-surface-container/30 p-4 rounded-xl border border-outline-variant/10">
            <div className="flex flex-col items-center justify-center border-r border-outline-variant/10">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle className="text-surface-container-high" cx="40" cy="40" fill="transparent" r="35" stroke="currentColor" strokeWidth="6"></circle>
                  <circle className="text-tertiary transition-all duration-1000" cx="40" cy="40" fill="transparent" r="35" stroke="currentColor" strokeDasharray="220" strokeDashoffset={220 - (220 * (activeRoute?.risk || 0.12))} strokeWidth="6"></circle>
                </svg>
                <span className="absolute mono text-sm font-bold">{((activeRoute?.risk || 0.12) * 100).toFixed(0)}%</span>
              </div>
              <span className="font-label text-[10px] text-outline mt-2 uppercase tracking-wide">TOTAL RISK</span>
            </div>
            
            <div className="space-y-3 py-2 flex justify-center flex-col">
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] mono uppercase">
                  <span>Security</span>
                  <span className="text-tertiary">Low</span>
                </div>
                <div className="h-1 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full w-1/4 bg-tertiary"></div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] mono uppercase">
                  <span>Perishability</span>
                  <span className="text-secondary">Mid</span>
                </div>
                <div className="h-1 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full w-2/3 bg-secondary"></div>
                </div>
              </div>
            </div>
          </section>

          {/* Optimization Sliders */}
          <section className="space-y-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">tune</span>
              <h3 className="font-headline text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Optimization Weights</h3>
            </div>
            
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between font-label text-xs">
                  <span className="text-outline">BUDGET CAP</span>
                  <span className="mono text-on-surface">₹{(budgetCap).toLocaleString()}</span>
                </div>
                <input 
                  type="range" min="10000" max="500000" step="5000"
                  value={budgetCap} 
                  onChange={(e) => setBudgetCap(Number(e.target.value))} 
                  className="w-full"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between font-label text-xs">
                  <span className="text-outline">MAX DELAY TOLERANCE</span>
                  <span className="mono text-on-surface">{maxDelay} Hours</span>
                </div>
                <input 
                  type="range" min="0" max="48" step="1"
                  value={maxDelay} 
                  onChange={(e) => setMaxDelay(Number(e.target.value))} 
                  className="w-full"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between font-label text-xs">
                  <span className="text-outline">CARBON QUALITY</span>
                  <span className="mono text-on-surface">{carbonPriority}% Impact</span>
                </div>
                <input 
                  type="range" min="0" max="100" step="1"
                  value={carbonPriority} 
                  onChange={(e) => setCarbonPriority(Number(e.target.value))} 
                  className="w-full"
                />
              </div>
            </div>
          </section>

          <div className="pt-4">
            <button 
              onClick={handleRecalculate}
              className={`w-full py-4 text-on-primary-container font-bold rounded-xl shadow-[0_0_20px_rgba(47,129,247,0.3)] transition-all flex items-center justify-center gap-2 ${loading ? 'opacity-70 bg-surface-container cursor-not-allowed text-outline' : 'bg-gradient-to-br from-primary to-primary-container hover:brightness-110 active:scale-[0.98]'}`}
            >
              <span className={`material-symbols-outlined text-xl ${loading ? 'animate-spin' : ''}`}>refresh</span>
              {loading ? 'RECALCULATING...' : 'RECALCULATE ROUTES'}
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
