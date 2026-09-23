import type { IconProps } from './icon-props';

/** A bar chart in a frame — analysis. */
export function ChartIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="4" y="4" width="16" height="16" rx="2" className="stroke-outline-strong" strokeWidth="2" />
      <path d="M8.5 16V12" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16V8" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M15.5 16V10.5" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
