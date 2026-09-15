import type { IconProps } from './icon-props';

export function MailIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" className="stroke-outline-strong" strokeWidth="2" />
      <path
        d="M4 6.5L12 13L20 6.5"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
