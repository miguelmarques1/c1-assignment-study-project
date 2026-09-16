import type { IconProps } from './icon-props';

export function HangUpIcon({ size = 20, className }: IconProps) {
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
        d="M4.5 13.5C7 9.5 17 9.5 19.5 13.5"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 13.5L7.2 15.4A1 1 0 0 0 8.6 15.1L9.6 13.4A1 1 0 0 1 11 13L13 13.4A1 1 0 0 1 14 13.4L15.4 15.1A1 1 0 0 0 16.8 15.4L19.5 13.5"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
