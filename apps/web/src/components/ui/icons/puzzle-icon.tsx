import type { IconProps } from './icon-props';

/** A puzzle piece — F15's grammar activity kind. */
export function PuzzleIcon({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" className={className}>
      <path
        d="M9 3H15V5.5C15 6 15.4 6 15.7 5.8C16.1 5.5 16.5 5.3 17 5.3C18.4 5.3 19.5 6.4 19.5 7.8C19.5 8.3 19.3 8.7 19.1 9.1C18.9 9.4 18.9 9.8 19.4 9.8H21V15H19.4C18.9 15 18.9 15.4 19.1 15.7C19.3 16.1 19.5 16.5 19.5 17C19.5 18.4 18.4 19.5 17 19.5C16.5 19.5 16.1 19.3 15.7 19.1C15.4 18.9 15 18.9 15 19.4V21H9V19.4C9 18.9 8.6 18.9 8.3 19.1C7.9 19.3 7.5 19.5 7 19.5C5.6 19.5 4.5 18.4 4.5 17C4.5 16.5 4.7 16.1 4.9 15.7C5.1 15.4 5.1 15 4.6 15H3V9.8H4.6C5.1 9.8 5.1 9.4 4.9 9.1C4.7 8.7 4.5 8.3 4.5 7.8C4.5 6.4 5.6 5.3 7 5.3C7.5 5.3 7.9 5.5 8.3 5.8C8.6 6 9 6 9 5.5V3Z"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
