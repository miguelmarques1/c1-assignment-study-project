import type { IconProps } from './icon-props';

export function HelpIcon({ size = 20, className }: IconProps) {
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
        d="M9.5 9.5C9.5 8 10.6 7 12 7C13.4 7 14.5 8 14.5 9.3C14.5 10.6 13.4 11 12.5 11.6C11.9 12 11.7 12.4 11.7 13.2"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="11.7" cy="16" r="1.1" className="fill-outline-strong" />
    </svg>
  );
}
