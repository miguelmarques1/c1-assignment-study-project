import type { IconProps } from './icon-props';

/** The mute badge never relies on this icon alone — it always pairs with visible text. */
export function MicrophoneOffIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M9 5.5A3 3 0 0 1 15 5.5V11a3 3 0 0 1-.34 1.4"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9 9V11a3 3 0 0 0 4.24 2.73"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 11a7 7 0 0 0 11.3 5.5"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M19 11a6.97 6.97 0 0 0-.57-2.77"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M12 18V21" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 21H16" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 3L21 21" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
