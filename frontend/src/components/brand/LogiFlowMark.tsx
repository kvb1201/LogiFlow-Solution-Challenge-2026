/** Shared LogiFlow brand mark — color via `currentColor` / parent theme accent. */
export function LogiFlowMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5.5"
        stroke="currentColor"
        strokeWidth="1.25"
        opacity="0.35"
      />
      <circle cx="8" cy="12" r="2.35" fill="currentColor" />
      <circle cx="16" cy="8" r="2.35" fill="currentColor" />
      <circle cx="16" cy="16" r="2.35" fill="currentColor" />
      <path
        d="M10.35 11.15L13.65 9.35M10.35 12.85L13.65 14.65"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
