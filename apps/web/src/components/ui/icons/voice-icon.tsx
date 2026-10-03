import type { IconProps } from './icon-props';

/** A microphone behind a small waveform — the pronunciation practice card's tile icon, distinct from `MicrophoneIcon`'s plain device glyph. */
export function VoiceIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" className="stroke-outline-strong" strokeWidth="2" />
      <path
        d="M5 11a7 7 0 0 0 14 0"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M12 18V21" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 21H16" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M2 9V13" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 9V13" className="stroke-outline-strong" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
