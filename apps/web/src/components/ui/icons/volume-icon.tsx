import type { IconProps } from './icon-props';

/** A speaker with sound waves. */
export function VolumeIcon({ size = 20, className }: IconProps) {
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
      <path d="M16.5 9A4 4 0 0 1 16.5 15" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 6.5A7.5 7.5 0 0 1 19 17.5" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
