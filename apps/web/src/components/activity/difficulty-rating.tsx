'use client';

import type { DifficultyRating as DifficultyRatingValue } from '@english-quest/shared';
import { useState } from 'react';

import { Button, CloseIcon } from '@/components/ui';

export interface DifficultyRatingInput {
  rating: DifficultyRatingValue | null;
  notUseful: boolean;
}

const OPTIONS: Array<{ rating: DifficultyRatingValue; label: string }> = [
  { rating: 'too_easy', label: 'Too easy' },
  { rating: 'just_right', label: 'Just right' },
  { rating: 'too_hard', label: 'Too hard' },
];

/**
 * Three difficulty buttons plus a `Not useful` link, dismissible on its own
 * and never blocking the rest of the activity (F16's shared widget, built
 * here first since F18 shipped ahead of it).
 */
export function DifficultyRating({ value, onRate }: { value: DifficultyRatingInput | null; onRate: (input: DifficultyRatingInput) => Promise<void> | void }) {
  const [dismissed, setDismissed] = useState(false);
  const [submitting, setSubmitting] = useState<DifficultyRatingValue | 'not_useful' | null>(null);

  if (dismissed) {
    return null;
  }

  const submit = async (input: DifficultyRatingInput, key: DifficultyRatingValue | 'not_useful') => {
    setSubmitting(key);
    try {
      await onRate(input);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-sm" role="group" aria-label="Rate this activity's difficulty">
      <span className="text-label-md text-on-surface-variant">How was this activity?</span>
      {OPTIONS.map((option) => (
        <Button
          key={option.rating}
          type="button"
          variant={value?.rating === option.rating ? 'secondary' : 'neutral'}
          size="sm"
          loading={submitting === option.rating}
          onClick={() => void submit({ rating: option.rating, notUseful: value?.notUseful ?? false }, option.rating)}
        >
          {option.label}
        </Button>
      ))}
      <button
        type="button"
        onClick={() => void submit({ rating: value?.rating ?? null, notUseful: true }, 'not_useful')}
        className="text-label-md text-primary underline-offset-4 hover:underline"
      >
        {submitting === 'not_useful' ? 'Working…' : 'Not useful'}
      </button>
      <button type="button" aria-label="Dismiss rating" onClick={() => setDismissed(true)} className="text-on-surface-variant">
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
