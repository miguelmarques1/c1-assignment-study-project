import { ConnectionQuality } from 'livekit-client';

import { SignalIcon } from '@/components/ui';

const LEVEL_BY_QUALITY: Record<ConnectionQuality, 0 | 1 | 2 | 3> = {
  [ConnectionQuality.Excellent]: 3,
  [ConnectionQuality.Good]: 2,
  [ConnectionQuality.Poor]: 1,
  [ConnectionQuality.Lost]: 0,
  [ConnectionQuality.Unknown]: 2,
};

const LABEL_BY_QUALITY: Record<ConnectionQuality, string> = {
  [ConnectionQuality.Excellent]: 'Excellent',
  [ConnectionQuality.Good]: 'Good',
  [ConnectionQuality.Poor]: 'Poor',
  [ConnectionQuality.Lost]: 'Lost',
  [ConnectionQuality.Unknown]: 'Unknown',
};

export interface ConnectionQualityIndicatorProps {
  quality: ConnectionQuality;
}

/** The three-bar icon always pairs with its text label — never colour or shape alone. */
export function ConnectionQualityIndicator({ quality }: ConnectionQualityIndicatorProps) {
  const label = LABEL_BY_QUALITY[quality];

  return (
    <span
      role="img"
      aria-label={`Connection: ${label}`}
      className="inline-flex items-center gap-xs rounded-md bg-surface-container-lowest px-sm py-xs"
    >
      <SignalIcon level={LEVEL_BY_QUALITY[quality]} size={16} />
      <span aria-hidden="true" className="text-label-sm text-on-surface">
        {label}
      </span>
    </span>
  );
}

/** Shown alongside (never instead of) the per-participant indicator when a quality drops to Poor or Lost. */
export function UnstableConnectionBanner() {
  return (
    <p
      role="status"
      className="rounded-md border-2 border-outline-strong bg-badge-warning-bg px-md py-sm text-body-sm text-badge-warning-fg"
    >
      Your connection is unstable.
    </p>
  );
}
