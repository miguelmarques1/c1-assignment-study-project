import type { IconProps } from './icon-props';

/** A circular arrow — rerolling, retrying. */
export function RefreshIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M19 12A7 7 0 1 1 16.5 6.6" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 3V7H13" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
