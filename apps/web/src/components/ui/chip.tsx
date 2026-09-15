import type { ChipTone } from '@english-quest/design-tokens';
import type { ReactNode } from 'react';

const TONE_CLASSES: Record<ChipTone, string> = {
  neutral: 'bg-surface-container text-on-surface',
  accent: 'bg-primary-container text-on-primary-container',
  success: 'bg-badge-success-bg text-badge-success-fg',
  warning: 'bg-badge-warning-bg text-badge-warning-fg',
  danger: 'bg-badge-danger-bg text-badge-danger-fg',
};

export interface ChipProps {
  tone?: ChipTone;
  children: ReactNode;
  /** Recurrence count, rendered appended to the label. */
  count?: number;
  onRemove?: () => void;
}

export function Chip({ tone = 'neutral', children, count, onRemove }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-xs rounded-full border-2 border-outline-strong px-sm py-xs text-label-md ${TONE_CLASSES[tone]}`}
    >
      <span>{children}</span>
      {typeof count === 'number' ? <span className="text-label-sm">×{count}</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${typeof children === 'string' ? children : 'item'}`}
          className="ml-xs rounded-sm leading-none outline-offset-2 outline-outline-strong focus-visible:outline-2"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
