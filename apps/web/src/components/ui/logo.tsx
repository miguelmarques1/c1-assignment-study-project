interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * From design/english_quest_logo — recoloured onto declared roles instead of
 * the reference's literal hex (`#FF6B4A` is exactly our `primary-container`;
 * the reference's light-peach front tile has no token equivalent, so it maps
 * to `outline-variant`, the nearest warm light role we have).
 */
export function Logo({ size = 40, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="English Quest"
      className={className}
    >
      <rect x="12" y="12" width="136" height="136" rx="32" className="fill-primary-container stroke-outline-strong" strokeWidth="6" />
      <rect x="8" y="8" width="136" height="136" rx="32" className="fill-outline-variant stroke-outline-strong" strokeWidth="6" />
      <path
        d="M42 46 C42 37 50 30 60 30 L100 30 C110 30 118 37 118 46 L118 78 C118 87 110 94 100 94 L76 94 L54 112 L56 94 L54 94 C46 94 42 87 42 78 Z"
        className="fill-surface-container-lowest stroke-outline-strong"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <circle cx="80" cy="62" r="14" className="fill-primary-container stroke-outline-strong" strokeWidth="4" />
      <path d="M89 71 L100 82" className="stroke-outline-strong" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
