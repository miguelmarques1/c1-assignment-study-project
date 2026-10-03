import type { IconProps } from './icon-props';

export function PlayIcon({ size = 20, className }: IconProps) {
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
        d="M7 4.5V19.5C7 20.2 7.78 20.6 8.36 20.22L18.36 13.22C18.9 12.85 18.9 12.08 18.36 11.71L8.36 4.71C7.78 4.33 7 4.73 7 4.5Z"
        className="fill-outline-strong"
      />
    </svg>
  );
}
