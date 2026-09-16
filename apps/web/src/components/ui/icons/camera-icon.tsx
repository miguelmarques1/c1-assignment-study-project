import type { IconProps } from './icon-props';

export function CameraIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="6" width="13" height="12" rx="2" className="stroke-outline-strong" strokeWidth="2" />
      <path
        d="M16 10.5L20.5 7.5A1 1 0 0 1 21 8.4V15.6A1 1 0 0 1 20.5 16.5L16 13.5"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
