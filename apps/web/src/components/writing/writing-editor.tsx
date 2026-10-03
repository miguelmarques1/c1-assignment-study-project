'use client';

import type { WritingLimitView } from '@english-quest/shared';

import { Button, TextArea } from '@/components/ui';
import { DraftConflictBanner } from './draft-conflict-banner';
import { SaveIndicator } from './save-indicator';
import type { WritingDraftConflict, WritingSaveState } from './use-writing-draft';
import { WordCounter } from './word-counter';
import { FailureNotice, LimitNotice, MissingKeyNotice } from './writing-notices';

export interface WritingEditorFailure {
  message: string;
}

export interface WritingEditorProps {
  text: string;
  onTextChange: (value: string) => void;
  wordCount: number;
  saveState: WritingSaveState;
  savedAt: string | null;
  geminiKeyUsable: boolean;
  limit: WritingLimitView;
  now: Date;
  failure: WritingEditorFailure | null;
  onRetryFailure: () => void;
  retryingFailure: boolean;
  conflict: WritingDraftConflict | null;
  localVersionText: string | null;
  onContinueWithLatest: () => void;
  canSubmit: boolean;
  onSubmitClick: () => void;
}

/**
 * The editor view (spec §4): notices and the conflict banner sit above a
 * full-height text area, with a sticky footer holding the word counter, the
 * save indicator and the primary action. Read-only while a conflict is
 * shown, so the losing device cannot keep typing over a copy it no longer
 * matches.
 */
export function WritingEditor({
  text,
  onTextChange,
  wordCount,
  saveState,
  savedAt,
  geminiKeyUsable,
  limit,
  now,
  failure,
  onRetryFailure,
  retryingFailure,
  conflict,
  localVersionText,
  onContinueWithLatest,
  canSubmit,
  onSubmitClick,
}: WritingEditorProps) {
  const limitReached = limit.used >= limit.max;
  const readOnly = Boolean(conflict);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-md">
      {!geminiKeyUsable ? <MissingKeyNotice /> : null}
      {limitReached ? <LimitNotice limit={limit} now={now} /> : null}
      {failure ? <FailureNotice message={failure.message} onRetry={onRetryFailure} retrying={retryingFailure} /> : null}
      {conflict && localVersionText !== null ? (
        <DraftConflictBanner variant="conflict" localText={localVersionText} onContinue={onContinueWithLatest} />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-sm">
        <TextArea
          label="Your writing"
          fill
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          readOnly={readOnly}
          readOnlyPresentation={readOnly}
        />
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-md border-t-2 border-outline-strong bg-surface-container-lowest px-md py-sm">
        <div className="flex flex-col gap-xs">
          <WordCounter count={wordCount} />
          <SaveIndicator saveState={saveState} savedAt={savedAt} />
        </div>
        <Button variant="primary" onClick={onSubmitClick} disabled={!canSubmit}>
          Submit for correction
        </Button>
      </div>
    </div>
  );
}
