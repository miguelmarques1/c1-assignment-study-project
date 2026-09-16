import type { IconProps } from './icon-props';

export interface SignalIconProps extends IconProps {
  /** Bars filled, 0-3. The paired text label — never this icon alone — carries the meaning. */
  level?: 0 | 1 | 2 | 3;
}

/** Three ascending bars; unfilled bars are outlined only, filled bars are solid. */
export function SignalIcon({ size = 20, className, level = 3 }: SignalIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="3"
        y="14"
        width="4"
        height="7"
        rx="1"
        className={level >= 1 ? 'fill-outline-strong' : 'stroke-outline-strong'}
        strokeWidth="2"
      />
      <rect
        x="10"
        y="9"
        width="4"
        height="12"
        rx="1"
        className={level >= 2 ? 'fill-outline-strong' : 'stroke-outline-strong'}
        strokeWidth="2"
      />
      <rect
        x="17"
        y="3"
        width="4"
        height="18"
        rx="1"
        className={level >= 3 ? 'fill-outline-strong' : 'stroke-outline-strong'}
        strokeWidth="2"
      />
    </svg>
  );
}
