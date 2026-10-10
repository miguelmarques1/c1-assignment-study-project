import type { IconProps } from './icon-props';

/** A crossed circle: the incorrect counterpart of `CheckCircleIcon`. */
export function CrossCircleIcon({ size = 20, className }: IconProps) {
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
      <path d="M9 9L15 15M15 9L9 15" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
