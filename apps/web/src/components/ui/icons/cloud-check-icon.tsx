import type { IconProps } from './icon-props';

/** A cloud with a checkmark — the end dialog's "audio recorded safely" line. */
export function CloudCheckIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M7 18a4.5 4.5 0 0 1-.5-8.97 5 5 0 0 1 9.62-1.99A4 4 0 0 1 17 15.5"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 18h8" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M9.5 13.5L11 15l3-3"
        className="stroke-tertiary"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
