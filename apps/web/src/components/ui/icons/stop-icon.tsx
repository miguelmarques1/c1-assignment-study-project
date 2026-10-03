import type { IconProps } from './icon-props';

export function StopIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="6" y="6" width="12" height="12" rx="2" className="fill-outline-strong" />
    </svg>
  );
}
