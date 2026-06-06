'use client';

import React, { useEffect, useState } from 'react';

export default function RailwayLoading() {
  const [dots, setDots] = useState('');
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(0);

  const phases = [
    'Loading Indian Railways schedules...',
    'Building corridor candidates...',
    'Running LogiFlow feature engineering...',
    'Scoring routes by your priority...',
    'Applying ML delay predictions...',
    'Finalizing recommendations...',
  ];

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 98) return prev;
        const inc = Math.random() * 12 + 2;
        return Math.min(prev + inc, 98);
      });
    }, 700);

    const phaseInterval = setInterval(() => {
      setPhase(prev => (prev + 1) % phases.length);
    }, 1800);

    return () => {
      clearInterval(dotInterval);
      clearInterval(progressInterval);
      clearInterval(phaseInterval);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[10000] bg-[#080b12] flex flex-col items-center justify-center overflow-hidden">
      {/* Background atmosphere */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 h-[min(90vw,600px)] w-[min(90vw,600px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px] animate-pulse-slow" />
        <div className="absolute top-1/4 right-1/4 h-[min(70vw,350px)] w-[min(70vw,350px)] rounded-full bg-tertiary/5 blur-[100px] animate-mesh-1" />
        <div className="absolute bottom-1/4 left-1/4 h-[min(75vw,400px)] w-[min(75vw,400px)] rounded-full bg-primary/4 blur-[110px] animate-mesh-2" />
        <div className="absolute inset-0 hero-dot-grid opacity-[0.15]" />
      </div>

      {/* Decorative corners */}
      <div className="absolute top-6 left-4 h-14 w-14 rounded-tl-2xl border-t border-l border-primary/15 sm:top-10 sm:left-10 sm:h-20 sm:w-20" />
      <div className="absolute bottom-6 right-4 h-14 w-14 rounded-br-2xl border-b border-r border-tertiary/15 sm:bottom-10 sm:right-10 sm:h-20 sm:w-20" />

      {/* Central content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-6">
        {/* Icon */}
        <div className="relative mb-10">
          <div className="w-20 h-20 rounded-2xl bg-surface-container-low border border-white/5 flex items-center justify-center shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-tertiary/15" />
            <div className="absolute top-0 left-0 w-full h-0.5 bg-primary/50 blur-sm animate-scan" />
            <span
              className="material-symbols-outlined text-3xl text-primary relative z-10 animate-pulse-slow"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 48" }}
            >
              train
            </span>
          </div>
          <div className="absolute inset-[-10px] border border-primary/15 rounded-[26px] animate-spin-slow pointer-events-none" />
          <div className="absolute inset-[-20px] border border-white/4 rounded-[34px] animate-reverse-spin-slow pointer-events-none" />
        </div>

        {/* Text */}
        <div className="text-center space-y-2 mb-10">
          <h2 className="text-xl font-headline font-black tracking-tight text-on-surface">
            OPTIMIZING ROUTES<span className="w-6 inline-block text-left text-primary mono">{dots}</span>
          </h2>
          <p className="text-[11px] font-mono text-on-surface-variant/70 min-h-[16px] transition-all duration-500">
            {phases[phase]}
          </p>
          <p className="text-[10px] text-primary/60 tracking-[0.2em] uppercase font-semibold">
            LogiFlow Rail Pipeline
          </p>
        </div>

        {/* Progress */}
        <div className="w-full space-y-2">
          <div className="flex justify-between items-center text-[10px]">
            <span className="mono text-outline uppercase tracking-wider">Syncing Nodes</span>
            <span className="mono text-primary font-semibold">{Math.floor(progress)}%</span>
          </div>
          <div className="h-0.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-tertiary transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
