import type { IconProps } from './icon-props';

/** A warning triangle. */
export function WarningIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 4L21 19H3L12 4Z" className="stroke-outline-strong" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 10V13.5" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1" className="fill-outline-strong" />
    </svg>
  );
}
