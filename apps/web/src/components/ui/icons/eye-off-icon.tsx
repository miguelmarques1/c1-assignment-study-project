import type { IconProps } from './icon-props';

export function EyeOffIcon({ size = 20, className }: IconProps) {
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
        d="M2 12C4 7 8 4.5 12 4.5S20 7 22 12C20 17 16 19.5 12 19.5S4 17 2 12Z"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" className="stroke-outline-strong" strokeWidth="2" />
      <path
        d="M4 4L20 20"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
