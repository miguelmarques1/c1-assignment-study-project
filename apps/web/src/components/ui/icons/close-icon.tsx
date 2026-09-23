import type { IconProps } from './icon-props';

/** A cross — closing a panel or dialog. */
export function CloseIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 6L18 18" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 6L6 18" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
