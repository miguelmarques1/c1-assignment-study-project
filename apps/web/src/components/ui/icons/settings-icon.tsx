import type { IconProps } from './icon-props';

/** The mockup's "tune" glyph — three sliders, not a gear. */
export function SettingsIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 6H20" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12H20" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 18H20" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="6" r="2" className="fill-surface-container-lowest stroke-outline-strong" strokeWidth="2" />
      <circle cx="16" cy="12" r="2" className="fill-surface-container-lowest stroke-outline-strong" strokeWidth="2" />
      <circle cx="10" cy="18" r="2" className="fill-surface-container-lowest stroke-outline-strong" strokeWidth="2" />
    </svg>
  );
}
