import type { IconProps } from './icon-props';

export function AzureSpeechIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" className="stroke-secondary" strokeWidth="2" />
      <path
        d="M5 11V12A7 7 0 0 0 19 12V11"
        className="stroke-secondary"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M12 19V22" className="stroke-secondary" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 22H16" className="stroke-secondary" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
