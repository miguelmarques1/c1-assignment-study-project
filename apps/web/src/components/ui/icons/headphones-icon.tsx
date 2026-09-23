import type { IconProps } from './icon-props';

/** Headphones — audio output. */
export function HeadphonesIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 15V12A8 8 0 0 1 20 12V15" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" className="stroke-outline-strong" strokeWidth="2" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" className="stroke-outline-strong" strokeWidth="2" />
    </svg>
  );
}
