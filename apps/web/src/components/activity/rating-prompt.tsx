'use client';

import type { ActivityRatingInput, DifficultyRating } from '@english-quest/shared';
import { useState } from 'react';

import { Button } from '@/components/ui';
import { rateActivity } from '@/lib/activities';

const OPTIONS: Array<{ rating: DifficultyRating; label: string }> = [
  { rating: 'too_easy', label: 'Too easy' },
  { rating: 'just_right', label: 'Just right' },
  { rating: 'too_hard', label: 'Too hard' },
];

export interface RatingPromptProps {
  activityId: string;
  initial?: ActivityRatingInput;
}

/**
 * The one-tap difficulty rating (A17): three large buttons and a `Not useful`
 * link, dismissible and never blocking. It saves optimistically; a failure
 * shows an inline retry and leaves everything else usable.
 */
export function RatingPrompt({ activityId, initial = { rating: null, notUseful: false } }: RatingPromptProps) {
  const [value, setValue] = useState<ActivityRatingInput>(initial);
  const [dismissed, setDismissed] = useState(false);
  const [failed, setFailed] = useState<ActivityRatingInput | null>(null);

  if (dismissed) {
    return null;
  }

  async function save(next: ActivityRatingInput): Promise<void> {
    const previous = value;
    setValue(next);
    setFailed(null);
    try {
      await rateActivity(activityId, next);
    } catch {
      setValue(previous);
      setFailed(next);
    }
  }

  return (
    <section aria-labelledby="rating-title" className="flex flex-col gap-md rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg">
      <h2 id="rating-title" className="text-title-md text-on-surface">
        How was this activity?
      </h2>
      <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
        {OPTIONS.map((option) => (
          <Button
            key={option.rating}
            type="button"
            size="lg"
            variant={value.rating === option.rating ? 'secondary' : 'neutral'}
            aria-pressed={value.rating === option.rating}
            onClick={() => void save({ rating: option.rating, notUseful: value.notUseful })}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-md">
        <button
          type="button"
          aria-pressed={value.notUseful}
          onClick={() => void save({ rating: value.rating, notUseful: !value.notUseful })}
          className="text-label-lg text-primary underline underline-offset-4"
        >
          Not useful
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="text-label-lg text-on-surface-variant underline-offset-4 hover:underline">
          Not now
        </button>
      </div>
      {failed ? (
        <p role="alert" className="flex items-center gap-md text-body-md text-error">
          Your rating could not be saved.
          <Button type="button" size="sm" variant="neutral" onClick={() => void save(failed)}>
            Retry
          </Button>
        </p>
      ) : null}
    </section>
  );
}
