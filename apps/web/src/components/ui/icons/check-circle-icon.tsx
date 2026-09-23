import type { IconProps } from './icon-props';

/** A ticked circle. */
export function CheckCircleIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="8" className="stroke-outline-strong" strokeWidth="2" />
      <path d="M8.5 12.5L11 15L15.5 9.5" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
