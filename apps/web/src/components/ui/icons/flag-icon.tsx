import type { IconProps } from './icon-props';

/** A flag — an objective. */
export function FlagIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 21V4" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 5H17L15 9L17 13H6" className="stroke-outline-strong" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
