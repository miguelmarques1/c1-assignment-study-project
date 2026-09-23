import type { IconProps } from './icon-props';

/** A stopwatch — elapsed lesson time. */
export function TimerIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="13" r="7" className="stroke-outline-strong" strokeWidth="2" />
      <path d="M12 13V9.5" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 3H14" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
