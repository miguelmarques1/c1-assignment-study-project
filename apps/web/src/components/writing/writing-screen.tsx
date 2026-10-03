'use client';

import { countWords, WRITING_MAX_SUBMIT_WORDS, WRITING_MIN_SUBMIT_WORDS, type WritingActivityView } from '@english-quest/shared';
import { useCallback, useEffect, useState } from 'react';

import { ErrorState, LoadingState } from '@/components/ui';
import { CheckingPanel } from './checking-panel';
import { SubmitDialog } from './submit-dialog';
import { useWritingActivity } from './use-writing-activity';
import { useWritingDraft, type WritingFlushResult } from './use-writing-draft';
import { WritingEditor } from './writing-editor';
import { WritingResult } from './writing-result';
import { WritingTaskCard } from './writing-task-card';

const NOT_FOUND_MESSAGE = 'This activity could not be found.';
const NOT_IN_PLAN_MESSAGE = 'This activity is no longer in your current plan.';

function errorTitleFor(code: string | null): string {
  if (code === 'PLAN003') return NOT_FOUND_MESSAGE;
  if (code === 'PLAN004') return NOT_IN_PLAN_MESSAGE;
  return 'We could not load this activity.';
}

interface EditableWritingProps {
  activityId: string;
  view: WritingActivityView;
  onServerSettled: (next: WritingActivityView) => void;
  onSubmit: (flush: () => Promise<WritingFlushResult>) => Promise<boolean>;
  onRetryFailure: () => Promise<boolean>;
  submitting: boolean;
  submitError: string | null;
}

/** Mounted only while the task is `draft`, `uncorrected` or `correction_failed` — a fresh instance per task id. */
function EditableWriting({ activityId, view, onServerSettled, onSubmit, onRetryFailure, submitting, submitError }: EditableWritingProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const draft = useWritingDraft({
    activityId,
    taskId: view.taskId,
    initial: { text: view.draft.text, revision: view.draft.revision, savedAt: view.draft.savedAt, status: view.status },
    onServerSettled,
  });

  const wordCount = countWords(draft.text);
  const limitReached = view.submission.dailyLimit.used >= view.submission.dailyLimit.max;
  const canSubmit =
    !submitting &&
    !draft.conflict &&
    view.submission.geminiKeyUsable &&
    !limitReached &&
    wordCount >= WRITING_MIN_SUBMIT_WORDS &&
    wordCount <= WRITING_MAX_SUBMIT_WORDS;

  const handleConfirm = useCallback(async () => {
    const succeeded = await onSubmit(draft.flush);
    if (succeeded) {
      setConfirmOpen(false);
    }
  }, [draft.flush, onSubmit]);

  // A conflict surfaced by the submit's own flush replaces the confirmation with the banner (A5, A6).
  useEffect(() => {
    if (draft.conflict) {
      setConfirmOpen(false);
    }
  }, [draft.conflict]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-md">
      <WritingTaskCard task={view.task} defaultExpanded={draft.text.trim().length === 0} />
      <WritingEditor
        text={draft.text}
        onTextChange={draft.setText}
        wordCount={wordCount}
        saveState={draft.saveState}
        savedAt={draft.savedAt}
        geminiKeyUsable={view.submission.geminiKeyUsable}
        limit={view.submission.dailyLimit}
        now={new Date(view.serverTime)}
        failure={view.failure}
        onRetryFailure={() => void onRetryFailure()}
        retryingFailure={submitting}
        conflict={draft.conflict}
        localVersionText={draft.localVersionText}
        onContinueWithLatest={draft.continueWithLatest}
        canSubmit={canSubmit}
        onSubmitClick={() => setConfirmOpen(true)}
      />
      <SubmitDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleConfirm()}
        submitting={submitting}
        error={submitError}
      />
    </div>
  );
}

function ReadOnlyWriting({ view }: { view: WritingActivityView }) {
  return (
    <div className="flex flex-col gap-md">
      <WritingTaskCard task={view.task} defaultExpanded />
      {view.status === 'corrected' && view.correction ? (
        <WritingResult correction={view.correction} />
      ) : (
        <div className="flex flex-col gap-sm rounded-md border-2 border-outline-strong bg-surface-container p-md">
          <p className="whitespace-pre-line text-body-md text-on-surface">{view.draft.text}</p>
        </div>
      )}
    </div>
  );
}

export interface WritingScreenProps {
  activityId: string;
}

/**
 * The writing runner (spec §4): opens the activity on mount, then switches
 * on its status — the editor, the checking panel while correcting, the
 * result once corrected, or a read-only view for an archived plan's
 * activity that was never carried forward.
 */
export function WritingScreen({ activityId }: WritingScreenProps) {
  const activity = useWritingActivity(activityId);

  if (activity.state === 'loading') {
    return <LoadingState variant="text-block" label="Loading your writing task…" />;
  }

  if (activity.state === 'error' || !activity.view) {
    return <ErrorState title={errorTitleFor(activity.errorCode)} description="Check your connection and try again." onRetry={activity.reload} />;
  }

  const { view } = activity;

  if (view.readOnly) {
    return <ReadOnlyWriting view={view} />;
  }

  if (view.status === 'correcting') {
    return <CheckingPanel text={view.draft.text} />;
  }

  if (view.status === 'corrected' && view.correction) {
    return <WritingResult correction={view.correction} />;
  }

  return (
    <EditableWriting
      key={view.taskId}
      activityId={activityId}
      view={view}
      onServerSettled={activity.setView}
      onSubmit={activity.submit}
      onRetryFailure={activity.retryCorrection}
      submitting={activity.submitting}
      submitError={activity.submitError}
    />
  );
}
