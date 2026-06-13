'use client';

import { useEffect, useId, useState } from 'react';

type LogiFlowMarkProps = {
  className?: string;
  /** One-time formation + slow needle rotation (respects reduced motion). */
  animate?: boolean;
};

/**
 * Compass mark — body forms once and holds; needle rotates slowly inside the ring.
 */
export function LogiFlowMark({ className, animate = true }: LogiFlowMarkProps) {
  const gradId = useId().replace(/:/g, '');
  const clipId = useId().replace(/:/g, '');
  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    setMotionReady(true);
  }, []);

  const liveClass = animate && motionReady ? 'logiflow-mark--live' : 'logiflow-mark--static';

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
        <clipPath id={clipId}>
          <circle cx="12" cy="12" r="7.15" />
        </clipPath>
      </defs>

      <g className="logiflow-mark__body">
        <circle
          className="logiflow-mark__flow logiflow-mark__flow--ring"
          cx="12"
          cy="12"
          r="8.85"
          stroke={`url(#${gradId})`}
          strokeWidth="1.7"
          pathLength={1}
        />

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
      </g>

      <g clipPath={`url(#${clipId})`}>
        <g className="logiflow-mark__needle-spin">
          <path
            className="logiflow-mark__flow logiflow-mark__flow--north"
            d="M12 12V6.65"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            pathLength={1}
          />
          <path
            className="logiflow-mark__flow logiflow-mark__flow--south"
            d="M12 12V17.35"
            stroke="currentColor"
            strokeOpacity="0.38"
            strokeWidth="1.85"
            strokeLinecap="round"
            pathLength={1}
          />
          <path
            className="logiflow-mark__flow logiflow-mark__flow--cross"
            d="M10.35 12h3.3"
            stroke="currentColor"
            strokeOpacity="0.55"
            strokeWidth="1.35"
            strokeLinecap="round"
            pathLength={1}
          />
        </g>
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
