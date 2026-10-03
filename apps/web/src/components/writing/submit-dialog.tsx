'use client';

import { Button, Dialog } from '@/components/ui';

export interface SubmitDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  error?: string | null;
}

/** Names the consequence before spending the caller's own Gemini quota (spec §4). */
export function SubmitDialog({ open, onCancel, onConfirm, submitting, error }: SubmitDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Submit for correction?"
      footer={
        <>
          <Button variant="neutral" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={submitting} loadingLabel="Submitting…">
            Submit
          </Button>
        </>
      }
    >
      <p className="text-body-md text-on-surface">
        Your text will be corrected with your Gemini key. Once submitted, it can’t be edited or undone.
      </p>
      {error ? (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
