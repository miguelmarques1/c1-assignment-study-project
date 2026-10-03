import type { WritingScoreView } from '@english-quest/shared';

import { Meter } from '@/components/ui';

export interface WritingScoreMetersProps {
  scores: WritingScoreView[];
}

/** The four scores as meters, in their fixed order, with no delta (spec §4). */
export function WritingScoreMeters({ scores }: WritingScoreMetersProps) {
  return (
    <div className="flex flex-col gap-sm">
      {scores.map((score) => (
        <Meter key={score.dimension} label={score.label} value={score.score} />
      ))}
    </div>
  );
}
