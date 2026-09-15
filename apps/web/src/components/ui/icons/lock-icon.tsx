import type { IconProps } from './icon-props';

export function LockIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="4" y="11" width="16" height="10" rx="2" className="stroke-outline-strong" strokeWidth="2" />
      <path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16" r="1.5" className="fill-outline-strong" />
    </svg>
  );
}
