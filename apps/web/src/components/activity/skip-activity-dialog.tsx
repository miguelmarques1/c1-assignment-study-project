'use client';

import type { ActivityView } from '@english-quest/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Dialog, TextField } from '@/components/ui';
import { ApiRequestError } from '@/lib/api-client';
import { skipActivity } from '@/lib/activities';
import { clearDraft } from '@/lib/activity-draft';
import { nextStep } from '@/lib/activity-navigation';

const OTHER = 'Other';
const PRESETS = ['Not relevant to me', 'Too difficult right now', 'Not enough time today', "Something isn't working"] as const;

export interface SkipActivityDialogProps {
  open: boolean;
  onClose: () => void;
  view: ActivityView;
}

/**
 * Skipping asks for a reason (A18): four presets for a one-handed skip, and
 * `Other` with a free-text field. The stored reason is the preset's text or
 * what was typed. On success it leaves for the next step (A22); on failure
 * the dialog stays open with the message.
 */
export function SkipActivityDialog({ open, onClose, view }: SkipActivityDialogProps) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>(PRESETS[0]);
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = choice === OTHER ? other.trim() : choice;

  async function skip(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const skipped = await skipActivity(view.activity.id, reason);
      clearDraft(view.activity.lineage);
      const step = nextStep(skipped);
      router.push(step.href);
    } catch (failure) {
      setError(failure instanceof ApiRequestError ? failure.message : 'The activity could not be skipped. Check your connection and try again.');
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Skip this activity?"
      footer={
        <>
          <Button type="button" variant="neutral" onClick={onClose} fullWidth>
            Keep going
          </Button>
          <Button type="button" variant="destructive" loading={saving} loadingLabel="Skipping…" disabled={reason === ''} onClick={() => void skip()} fullWidth>
            Skip activity
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-sm">
        <legend className="mb-sm text-body-md text-on-surface-variant">Tell us why, so your plan can do better next time.</legend>
        {[...PRESETS, OTHER].map((option) => (
          <label key={option} className="flex items-center gap-sm text-body-md text-on-surface">
            <input type="radio" name="skip-reason" value={option} checked={choice === option} onChange={() => setChoice(option)} className="accent-primary" />
            {option}
          </label>
        ))}
      </fieldset>
      {choice === OTHER ? (
        <TextField label="Your reason" value={other} maxLength={200} onChange={(event) => setOther(event.target.value)} />
      ) : null}
      {error ? (
        <p role="alert" className="text-body-md text-error">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
