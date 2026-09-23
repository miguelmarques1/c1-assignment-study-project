import type { IconProps } from './icon-props';

/** A speaker, crossed out. */
export function VolumeOffIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 9.5H8L13 5.5V18.5L8 14.5H4V9.5Z" className="stroke-outline-strong" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 9.5L21 14.5" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 9.5L16 14.5" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
