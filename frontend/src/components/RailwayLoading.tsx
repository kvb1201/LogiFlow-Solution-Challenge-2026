'use client';

import React, { useEffect, useState } from 'react';

/**
 * Premium Loading Screen for LogiFlow (Railways)
 * Concept: "Analyzing Digital Telemetry"
 * Uses Tailwind + Framer-inspired animations (via CSS)
 */
export default function RailwayLoading() {
  const [dots, setDots] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 98) return prev;
        const inc = Math.random() * 15;
        return Math.min(prev + inc, 98);
      });
    }, 800);

    return () => {
      clearInterval(dotInterval);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[10000] bg-[#0a0e14] flex flex-col items-center justify-center overflow-hidden">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-tertiary/5 rounded-full blur-[100px] animate-mesh-1" />
        <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[110px] animate-mesh-2" />
        <div className="absolute inset-0 hero-dot-grid opacity-[0.2]" />
      </div>

      {/* Central Content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-md px-6">
        {/* Animated Icon */}
        <div className="relative mb-12">
          <div className="w-24 h-24 rounded-2xl bg-[#1c2026] border border-white/5 flex items-center justify-center shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-tertiary/20 opacity-50" />
            <div className="absolute inset-0 bg-shimmer animate-shimmer opacity-30" />
            
            <span className="material-symbols-outlined text-4xl text-primary animate-pulse-slow relative z-10">
              train
            </span>
            
            {/* Scanned Light Effect */}
            <div className="absolute top-0 left-0 w-full h-1 bg-primary/60 blur-sm animate-scan" style={{ animationDuration: '2s' }} />
          </div>
          
          {/* Outer Ring */}
          <div className="absolute inset-[-12px] border border-primary/20 rounded-[28px] animate-spin-slow pointer-events-none" />
          <div className="absolute inset-[-24px] border border-white/5 rounded-[36px] animate-reverse-spin-slow pointer-events-none opacity-50" />
        </div>

        {/* Text Telemetry */}
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-headline font-black tracking-tight text-on-surface flex items-center justify-center gap-2">
            OPTIMIZING TOPOLOGY<span className="w-8 text-left inline-block mono text-primary">{dots}</span>
          </h2>
          
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-label font-bold text-primary tracking-[0.3em] uppercase">
              RailRadar Pipeline Active
            </p>
            <p className="text-[11px] font-mono text-outline/60 italic">
              Accessing RTIS Satellite Data & IRCA API
            </p>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full mt-12 space-y-3">
          <div className="flex justify-between items-end mb-1">
            <span className="text-[10px] font-mono text-outline uppercase tracking-wider">Syncing Nodes</span>
            <span className="text-xs font-mono text-primary">{Math.floor(progress)}%</span>
          </div>
          
          <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-primary to-tertiary transition-all duration-700 ease-out shadow-[0_0_15px_rgba(47,129,247,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Random Status Items */}
          <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/5">
             <div className="space-y-1">
                <p className="text-[9px] font-label text-outline uppercase tracking-widest">Network Load</p>
                <p className="text-[11px] font-mono text-on-surface">NOMINAL (4.2ms)</p>
             </div>
             <div className="space-y-1 text-right">
                <p className="text-[9px] font-label text-outline uppercase tracking-widest">ML Prediction</p>
                <p className="text-[11px] font-mono text-tertiary">ENQUEUED</p>
             </div>
          </div>
        </div>
      </div>
      
      {/* Decorative Corners */}
      <div className="absolute top-12 left-12 w-24 h-24 border-t-2 border-l-2 border-primary/20 rounded-tl-3xl opacity-40" />
      <div className="absolute bottom-12 right-12 w-24 h-24 border-b-2 border-r-2 border-tertiary/20 rounded-br-3xl opacity-40" />
      
      <style jsx>{`
        @keyframes scan {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
        .animate-scan {
          animation: scan 2s ease-in-out infinite;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes reverse-spin-slow {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
        .animate-reverse-spin-slow {
          animation: reverse-spin-slow 20s linear infinite;
        }
      `}</style>
    </div>
  );
}
