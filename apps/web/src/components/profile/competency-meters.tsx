'use client';

import type { CompetencySnapshotView, ProfileCompetency } from '@english-quest/shared';
import { useId, useState } from 'react';

import { Button, Meter } from '@/components/ui';

export const COMPETENCY_LABELS: Record<ProfileCompetency, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  fluency: 'Fluency',
  interaction: 'Interaction',
  comprehension: 'Comprehension',
  pronunciation: 'Pronunciation',
};

function CompetencyMeter({ entry, label }: { entry: CompetencySnapshotView; label: string }) {
  return (
    <Meter
      label={label}
      value={entry.warmingUp ? null : entry.score}
      state={entry.warmingUp ? 'warming-up' : 'scored'}
      delta={entry.delta ?? undefined}
    />
  );
}

function PronunciationMeters({ entry }: { entry: CompetencySnapshotView }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const subScores = entry.subScores;

  return (
    <div className="flex flex-col gap-sm">
      <CompetencyMeter entry={entry} label={COMPETENCY_LABELS.pronunciation} />
      {subScores ? (
        <>
          <Button
            variant="neutral"
            size="sm"
            className="self-start"
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? 'Hide accuracy and prosody' : 'Show accuracy and prosody'}
          </Button>
          {open ? (
            <div id={regionId} className="flex flex-col gap-sm border-l-2 border-outline-strong pl-md">
              <Meter
                label="Accuracy"
                value={entry.warmingUp ? null : subScores.accuracy}
                state={entry.warmingUp ? 'warming-up' : 'scored'}
              />
              {subScores.prosody === null ? (
                <p className="text-body-sm text-on-surface-variant">Prosody: not measured for this language</p>
              ) : (
                <Meter
                  label="Prosody"
                  value={entry.warmingUp ? null : subScores.prosody}
                  state={entry.warmingUp ? 'warming-up' : 'scored'}
                />
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export interface CompetencyMetersProps {
  /** Always six, Pronunciation last, so its expansion never pushes the other meters. */
  competencies: CompetencySnapshotView[];
}

/** The six competencies as meters: the current value, its change, or `Warming up` under 3 measurements. */
export function CompetencyMeters({ competencies }: CompetencyMetersProps) {
  return (
    <ul className="flex flex-col gap-md">
      {competencies.map((entry) => (
        <li key={entry.competency}>
          {entry.competency === 'pronunciation' ? (
            <PronunciationMeters entry={entry} />
          ) : (
            <CompetencyMeter entry={entry} label={COMPETENCY_LABELS[entry.competency]} />
          )}
        </li>
      ))}
    </ul>
  );
}
