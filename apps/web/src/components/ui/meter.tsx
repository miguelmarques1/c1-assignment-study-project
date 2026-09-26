import type { MeterState } from '@english-quest/design-tokens';

export interface MeterProps {
  /** 0-100. Only `null` when `state` is `'warming-up'`. */
  value: number | null;
  state?: MeterState;
  /** The accessible name; also rendered as visible text. */
  label: string;
  /**
   * Signed change since the last measurement. `null` says there was no
   * previous measurement (a first lesson) and renders an em dash; omitted
   * renders nothing.
   */
  delta?: number | null;
}

/** `▲ +4`, `▼ −2` (U+2212), or nothing for no change. */
function DeltaText({ delta }: { delta: number }) {
  if (delta === 0) {
    return null;
  }
  return (
    <span className={delta > 0 ? 'text-tertiary' : 'text-error'}>
      {' '}
      {delta > 0 ? `▲ +${delta}` : `▼ −${Math.abs(delta)}`}
    </span>
  );
}

export function Meter({ value, state = 'scored', label, delta }: MeterProps) {
  const warmingUp = state === 'warming-up';

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center justify-between gap-sm">
        <span className="text-label-md text-on-surface-variant">{label}</span>
        {warmingUp ? (
          <span className="text-label-md text-on-surface-variant">Warming up</span>
        ) : (
          <span className="text-label-lg text-on-surface">
            {value}
            {typeof delta === 'number' ? <DeltaText delta={delta} /> : null}
            {delta === null ? (
              <span className="text-on-surface-variant">
                {' '}
                <span aria-hidden="true">—</span>
                <span className="sr-only">no previous result</span>
              </span>
            ) : null}
          </span>
        )}
      </div>
      <div
        className="h-sm w-full overflow-hidden rounded-full border-2 border-outline-strong bg-surface-container-highest"
        {...(warmingUp
          ? { role: 'img', 'aria-label': `${label}: warming up, not enough data yet` }
          : {
              role: 'meter',
              'aria-label': label,
              'aria-valuenow': value ?? 0,
              'aria-valuemin': 0,
              'aria-valuemax': 100,
            })}
      >
        {warmingUp ? (
          <div className="meter-track-warming h-full w-full" />
        ) : (
          <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
        )}
      </div>
    </div>
  );
}
