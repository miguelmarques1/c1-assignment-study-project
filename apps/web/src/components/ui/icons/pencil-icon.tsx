import type { IconProps } from './icon-props';

/** A pencil — F15's writing activity kind. */
export function PencilIcon({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 20L4.8 16.4L15.6 5.6C16.4 4.8 17.6 4.8 18.4 5.6C19.2 6.4 19.2 7.6 18.4 8.4L7.6 19.2L4 20Z"
        className="stroke-outline-strong"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 7L17 10" className="stroke-outline-strong" strokeWidth="2" />
    </svg>
  );
}
