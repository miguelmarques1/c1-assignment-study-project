import type { IconProps } from './icon-props';

/**
 * A generic four-point sparkle, not Google's Gemini logomark — this is the
 * product's own "AI provider" glyph, not a reproduction of a brand asset.
 */
export function GeminiIcon({ size = 20, className }: IconProps) {
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
        d="M12 2Q13 10 22 12Q13 14 12 22Q11 14 2 12Q11 10 12 2Z"
        className="fill-primary stroke-outline-strong"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
