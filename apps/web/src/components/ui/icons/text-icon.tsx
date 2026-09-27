import type { IconProps } from './icon-props';

/** A capital and lowercase A — F15's vocabulary activity kind. */
export function TextIcon({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" className={className}>
      <path
        d="M3 15L7 5L11 15M4.5 11.5H9.5"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M13 11C13 9.6 14.1 8.5 15.5 8.5C16.9 8.5 18 9.6 18 11V15M18 8.5V15"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
