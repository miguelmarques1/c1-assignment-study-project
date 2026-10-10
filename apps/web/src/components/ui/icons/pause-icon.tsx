import type { IconProps } from './icon-props';

export function PauseIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="6" y="5" width="4" height="14" rx="1" className="fill-outline-strong" />
      <rect x="14" y="5" width="4" height="14" rx="1" className="fill-outline-strong" />
    </svg>
  );
}
