import type { IconProps } from './icon-props';

/** A forward arrow. */
export function ArrowRightIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 12H19" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M13 6L19 12L13 18" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
