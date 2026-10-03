'use client';

import { WRITING_POLL_INTERVAL_MS, type WritingActivityView } from '@english-quest/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiRequestError } from '@/lib/api-client';
import { getWriting, openWriting, submitWriting } from '@/lib/writing';
import type { WritingFlushResult } from './use-writing-draft';

export type WritingLoadState = 'loading' | 'error' | 'ready';

export interface UseWritingActivityResult {
  state: WritingLoadState;
  view: WritingActivityView | null;
  errorCode: string | null;
  reload: () => void;
  setView: (view: WritingActivityView) => void;
  submit: (flush: () => Promise<WritingFlushResult>) => Promise<boolean>;
  submitting: boolean;
  submitError: string | null;
  retryCorrection: () => Promise<boolean>;
}

/**
 * Opens a writing activity on mount, polls every 3 seconds while it is
 * `correcting` (spec A10), and submits by revision (A9): a flush first, then
 * the submit call with a fresh `submissionId`. A resubmission after a
 * failure reuses the same call with the current revision.
 */
export function useWritingActivity(activityId: string): UseWritingActivityResult {
  const [state, setState] = useState<WritingLoadState>('loading');
  const [view, setViewState] = useState<WritingActivityView | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const viewRef = useRef<WritingActivityView | null>(null);
  viewRef.current = view;

  const load = useCallback(() => {
    setState('loading');
    setErrorCode(null);
    openWriting(activityId)
      .then((result) => {
        setViewState(result);
        setState('ready');
      })
      .catch((error: unknown) => {
        setErrorCode(error instanceof ApiRequestError ? error.code : null);
        setState('error');
      });
  }, [activityId]);

  useEffect(() => {
    load();
  }, [load]);

  const setView = useCallback((next: WritingActivityView) => setViewState(next), []);

  // Poll every 3 seconds while correcting; one read is enough to stop once it settles.
  useEffect(() => {
    if (view?.status !== 'correcting') {
      return;
    }
    const timer = setInterval(() => {
      getWriting(activityId)
        .then((result) => setViewState(result))
        .catch(() => {
          // Transient; the next tick retries.
        });
    }, WRITING_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activityId, view?.status]);

  const doSubmit = useCallback(
    async (baseRevision: number): Promise<boolean> => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const submissionId = crypto.randomUUID();
        const result = await submitWriting(activityId, { submissionId, baseRevision });
        setViewState(result);
        return true;
      } catch (error) {
        setSubmitError(error instanceof ApiRequestError ? error.message : 'Something went wrong. Please try again.');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [activityId],
  );

  const submit = useCallback(
    async (flush: () => Promise<WritingFlushResult>): Promise<boolean> => {
      const flushed = await flush();
      if (flushed.status === 'conflict') {
        // The conflict banner now owns the screen; submitting against a revision we know is stale would be wrong (A5).
        return false;
      }
      const baseRevision = flushed.status === 'saved' ? flushed.revision : viewRef.current?.draft.revision;
      if (baseRevision === undefined) {
        setSubmitError('Your draft could not be saved. Please try again.');
        return false;
      }
      return doSubmit(baseRevision);
    },
    [doSubmit],
  );

  const retryCorrection = useCallback(async (): Promise<boolean> => {
    const current = viewRef.current;
    if (!current) {
      return false;
    }
    return doSubmit(current.draft.revision);
  }, [doSubmit]);

  return { state, view, errorCode, reload: load, setView, submit, submitting, submitError, retryCorrection };
}
