import { VolumeIcon } from '@/components/ui';

const SEGMENTS = 16;

/**
 * The pre-call mockup's segmented level meter: sixteen discrete bars, green
 * through the normal speaking range, warming to coral at the top where the
 * input starts to clip. Lit bars are opaque, the rest faded.
 */
function segmentTone(index: number): string {
  if (index >= 14) return 'bg-primary';
  if (index >= 12) return 'bg-primary-container';
  return 'bg-badge-success-bg';
}

export interface LevelBarsProps {
  /** 0-100, or null while there is nothing to measure. */
  level: number | null;
  label: string;
}

export function LevelBars({ level, label }: LevelBarsProps) {
  const lit = Math.round(((level ?? 0) / 100) * SEGMENTS);

  return (
    <div className="flex w-full items-center gap-sm rounded-md border-2 border-outline-strong bg-surface-container p-sm">
      <VolumeIcon size={18} />
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={level ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        className="grid h-3.5 flex-1 grid-cols-16 gap-xs"
      >
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <span
            key={index}
            className={`h-full rounded-sm ${segmentTone(index)} ${index < lit ? 'opacity-100' : 'opacity-20'}`}
          />
        ))}
      </div>
      <VolumeIcon size={18} />
    </div>
  );
}
