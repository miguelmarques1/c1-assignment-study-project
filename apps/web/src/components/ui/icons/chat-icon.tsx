import type { IconProps } from './icon-props';

/** A speech bubble — the talking points. */
export function ChatIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 5H20V16H10L6 19.5V16H4V5Z" className="stroke-outline-strong" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
