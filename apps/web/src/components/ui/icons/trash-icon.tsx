import type { IconProps } from './icon-props';

export function TrashIcon({ size = 20, className }: IconProps) {
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
        d="M4 7H20"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M6 7L6.8 19.5A2 2 0 0 0 8.8 21.5H15.2A2 2 0 0 0 17.2 19.5L18 7"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 11V17" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 11V17" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
