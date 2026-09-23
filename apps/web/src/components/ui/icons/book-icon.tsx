import type { IconProps } from './icon-props';

/** An open book — the mockup's scenario glyph. */
export function BookIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 6.5C10 5 7 4.5 4 5V18C7 17.5 10 18 12 19.5C14 18 17 17.5 20 18V5C17 4.5 14 5 12 6.5Z" className="stroke-outline-strong" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 6.5V19.5" className="stroke-outline-strong" strokeWidth="2" />
    </svg>
  );
}
