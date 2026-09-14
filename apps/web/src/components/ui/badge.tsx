import type { BadgeStatus } from '@english-quest/design-tokens';

const STATUS_CLASSES: Record<BadgeStatus, string> = {
  success: 'bg-badge-success-bg text-badge-success-fg',
  warning: 'bg-badge-warning-bg text-badge-warning-fg',
  info: 'bg-badge-info-bg text-badge-info-fg',
  danger: 'bg-badge-danger-bg text-badge-danger-fg',
  neutral: 'bg-badge-neutral-bg text-badge-neutral-fg',
};

interface BadgeProps {
  status: BadgeStatus;
  /** The label. A badge with no text would carry its status by colour alone. */
  children: string;
}

export function Badge({ status, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border-2 border-outline-strong px-sm py-xs text-label-sm uppercase tracking-wide ${STATUS_CLASSES[status]}`}
    >
      {children}
    </span>
  );
}
