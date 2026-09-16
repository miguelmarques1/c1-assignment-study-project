import type { IconProps } from './icon-props';

export function VerifiedIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9" className="stroke-outline-strong" strokeWidth="2" />
      <path
        d="M8 12.5L10.5 15L16 9"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
