'use client';

import type { WritingCorrectionView } from '@english-quest/shared';
import Link from 'next/link';
import { useState } from 'react';

import { Card, cn } from '@/components/ui';
import { HighlightedText } from './highlighted-text';
import { RevisedText } from './revised-text';
import { WritingErrorGroups } from './writing-error-groups';
import { WritingScoreMeters } from './writing-score-meters';

export interface WritingResultProps {
  correction: WritingCorrectionView;
}

/** The correction result (spec §4): the comment, a toggle between the original and the revision, scores, and grouped errors. */
export function WritingResult({ correction }: WritingResultProps) {
  const [showRevised, setShowRevised] = useState(false);

  return (
    <div className="flex flex-col gap-lg">
      <Card tone="primary" header={<h2 className="text-title-md text-on-surface">Overall</h2>}>
        <p className="text-body-md text-on-surface">{correction.overallComment}</p>
      </Card>

      <div className="flex flex-col gap-sm">
        <div
          role="group"
          aria-label="Show your text or the revised version"
          className="inline-flex w-fit gap-xs rounded-md border-2 border-outline-strong p-xs"
        >
          <button
            type="button"
            aria-pressed={!showRevised}
            onClick={() => setShowRevised(false)}
            className={cn('press-button rounded-sm px-md py-sm text-label-md', !showRevised ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface')}
          >
            Your text
          </button>
          <button
            type="button"
            aria-pressed={showRevised}
            onClick={() => setShowRevised(true)}
            className={cn('press-button rounded-sm px-md py-sm text-label-md', showRevised ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface')}
          >
            Revised version
          </button>
        </div>
        {showRevised ? <RevisedText segments={correction.revision} /> : <HighlightedText segments={correction.text} errors={correction.errors} />}
      </div>

      <WritingScoreMeters scores={correction.scores} />

      <WritingErrorGroups groups={correction.errorGroups} errors={correction.errors} />

      <div className="flex flex-wrap items-center gap-md">
        <Link
          href="/plan"
          className="press-button inline-flex items-center justify-center gap-sm rounded-md border-2 border-outline-strong bg-primary px-md py-sm text-label-lg font-semibold text-on-primary outline-offset-2 outline-outline-strong focus-visible:outline-2"
        >
          Back to today
        </Link>
        <Link href="/plan" className="text-label-md text-primary underline">
          See the full plan
        </Link>
      </div>
    </div>
  );
}
