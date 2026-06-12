'use client';

import { useId } from 'react';

type LogiFlowMarkProps = {
  className?: string;
  /** Looping draw-on formation animation (respects reduced motion). */
  animate?: boolean;
};

/**
 * Compass mark — ring traces on, needle forms, cardinals lock in.
 * Minimal rose for navigation / multimodal routing.
 */
export function LogiFlowMark({ className, animate = true }: LogiFlowMarkProps) {
  const gradId = useId().replace(/:/g, '');
  const glowId = useId().replace(/:/g, '');
  const liveClass = animate ? 'logiflow-mark--live' : 'logiflow-mark--static';

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`logiflow-mark ${liveClass}${className ? ` ${className}` : ''}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle
        className="logiflow-mark__flow logiflow-mark__flow--a"
        cx="12"
        cy="12"
        r="8.85"
        stroke={`url(#${gradId})`}
        strokeWidth="1.7"
        pathLength={1}
      />

      <g className="logiflow-mark__orbit-wrap">
        <circle
          className="logiflow-mark__orbit"
          cx="12"
          cy="12"
          r="6.15"
          stroke="currentColor"
          strokeOpacity="0.16"
          strokeWidth="0.55"
          strokeDasharray="1.75 3.25"
        />
      </g>

      <g filter={`url(#${glowId})`}>
        <path
          className="logiflow-mark__flow logiflow-mark__flow--b"
          d="M12 11.35V4.35"
          stroke="currentColor"
          strokeWidth="3.1"
          strokeLinecap="round"
          pathLength={1}
        />
        <path
          className="logiflow-mark__flow logiflow-mark__flow--c"
          d="M12 12.65V19.65"
          stroke="currentColor"
          strokeOpacity="0.38"
          strokeWidth="2.35"
          strokeLinecap="round"
          pathLength={1}
        />
        <path
          className="logiflow-mark__flow logiflow-mark__flow--d"
          d="M9.15 12h5.7"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1.65"
          strokeLinecap="round"
          pathLength={1}
        />
      </g>

      <g className="logiflow-mark__tips">
        <circle className="logiflow-mark__tip logiflow-mark__tip--a" cx="12" cy="3.15" r="1" fill="currentColor" />
        <circle
          className="logiflow-mark__tip logiflow-mark__tip--b"
          cx="20.85"
          cy="12"
          r="0.75"
          fill="currentColor"
          fillOpacity="0.7"
        />
        <circle
          className="logiflow-mark__tip logiflow-mark__tip--c"
          cx="12"
          cy="20.85"
          r="0.75"
          fill="currentColor"
          fillOpacity="0.7"
        />
        <circle
          className="logiflow-mark__tip logiflow-mark__tip--d"
          cx="3.15"
          cy="12"
          r="0.75"
          fill="currentColor"
          fillOpacity="0.7"
        />
      </g>

      <g className="logiflow-mark__hub-wrap">
        <circle className="logiflow-mark__hub" cx="12" cy="12" r="1.85" fill="currentColor" />
        <circle
          className="logiflow-mark__hub-ring"
          cx="12"
          cy="12"
          r="3.05"
          stroke="currentColor"
          strokeWidth="0.7"
          strokeOpacity="0.4"
        />
      </g>
    </svg>
  );
}
