import type { IconProps } from './icon-props';

/** Replacing the tile with initials never relies on this icon alone as the signal. */
export function CameraOffIcon({ size = 20, className }: IconProps) {
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
        d="M3 8.5V16a2 2 0 0 0 2 2H13"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 6H5a2 2 0 0 0-1.4.57"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 10.5L20.5 7.5A1 1 0 0 1 21 8.4V15.6A1 1 0 0 1 20.5 16.5L16 13.5"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M3 3L21 21" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
