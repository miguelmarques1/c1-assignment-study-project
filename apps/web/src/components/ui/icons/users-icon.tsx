import type { IconProps } from './icon-props';

/** Two people — the room. */
export function UsersIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="9" cy="8.5" r="3.5" className="stroke-outline-strong" strokeWidth="2" />
      <path d="M3 19C3 15.7 5.7 13.5 9 13.5C12.3 13.5 15 15.7 15 19" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M15.5 5.2A3.5 3.5 0 0 1 15.5 11.8" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M17.5 14C19.6 14.6 21 16.5 21 19" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
