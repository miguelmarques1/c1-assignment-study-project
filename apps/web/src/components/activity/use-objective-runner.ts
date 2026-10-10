'use client';

import type { ActivityView, ObjectiveAnswer, ObjectiveQuestionView } from '@english-quest/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiRequestError } from '@/lib/api-client';
import { startAttempt, submitAttempt } from '@/lib/activities';
import {
  clearDraft,
  DRAFT_UPDATED_NOTICE,
  firstUnansweredIndex,
  loadDraft,
  reconcileDraft,
  saveDraft,
} from '@/lib/activity-draft';
import { nextStep, type NextStep } from '@/lib/activity-navigation';
import { useActiveTime } from '@/lib/use-active-time';

export type RunnerPhase = 'answering' | 'submitting' | 'waiting_for_connection' | 'save_failed' | 'results' | 'unavailable';
export type UnavailableReason = 'replaced' | 'skipped' | 'not_runnable' | 'not_objective';

/** The wait between automatic retries while the connection is down (A31); the last value repeats. */
export const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

export const RESUMED_NOTICE = 'Picking up where you left off.';

const EXPIRED_SESSION_PATH = '/login?expired=1';

function questionIsAnswerable(question: ObjectiveQuestionView): boolean {
  return question.format !== 'unscored';
}

function unavailableFor(error: unknown): UnavailableReason | 'session' | null {
  if (!(error instanceof ApiRequestError)) {
    return null;
  }
  switch (error.code) {
    case 'AUTH003':
      return 'session';
    case 'ACT003':
      return 'skipped';
    case 'PLAN004':
      return 'replaced';
    case 'ACT006':
      return 'not_runnable';
    case 'ACT001':
      return 'not_objective';
    default:
      return null;
  }
}

/**
 * The runner's state machine (spec §2): draft reconciliation on mount, the
 * attempt created lazily on the first confirmed answer (A4), answers locked
 * and saved to the local draft one at a time, and a submission that waits and
 * retries rather than losing anything (A31). Results appear only after the
 * server answered 200.
 */
export function useObjectiveRunner(initialView: ActivityView) {
  const [view, setViewState] = useState(initialView);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<RunnerPhase>('answering');
  const [unavailable, setUnavailable] = useState<UnavailableReason | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ObjectiveAnswer[]>([]);
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<ObjectiveAnswer | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [audioFailed, setAudioFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const viewRef = useRef(view);
  const answersRef = useRef(answers);
  const attemptRef = useRef<string | null>(initialView.objective?.attempt?.status === 'open' ? initialView.objective.attempt.id : null);
  const startingRef = useRef<Promise<string | null> | null>(null);
  const submittingRef = useRef(false);
  /** Set once the runner has moved to a state no retry can leave (results or unavailable). */
  const settledRef = useRef(false);
  const retryIndex = useRef(0);
  const time = useActiveTime(phase === 'answering');

  const setView = useCallback((next: ActivityView) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  const applyAnswers = useCallback((next: ObjectiveAnswer[]) => {
    answersRef.current = next;
    setAnswers(next);
  }, []);

  const persist = useCallback(
    (nextAnswers: ObjectiveAnswer[], pendingSubmission: boolean) => {
      const current = viewRef.current;
      if (!current.objective) {
        return;
      }
      saveDraft({
        activityId: current.activity.id,
        attemptId: attemptRef.current,
        fingerprint: current.objective.item.questionsFingerprint,
        answers: nextAnswers,
        activeSeconds: time.read(),
        pendingSubmission,
        savedAt: new Date().toISOString(),
      });
    },
    [time],
  );

  const goUnavailable = useCallback((reason: UnavailableReason) => {
    settledRef.current = true;
    clearDraft(viewRef.current.activity.lineage);
    setUnavailable(reason);
    setPhase('unavailable');
  }, []);

  const leaveForLogin = useCallback(() => {
    // The draft stays: after signing in, the runner resumes from it.
    window.location.assign(EXPIRED_SESSION_PATH);
  }, []);

  /** Creates the attempt once, on the first interaction. A failure keeps the learner going locally. */
  const ensureAttempt = useCallback((): Promise<string | null> => {
    if (attemptRef.current) {
      return Promise.resolve(attemptRef.current);
    }
    if (startingRef.current) {
      return startingRef.current;
    }
    const run = (async (): Promise<string | null> => {
      try {
        const next = await startAttempt(viewRef.current.activity.id);
        const attempt = next.objective?.attempt ?? null;
        if (next.objective?.result) {
          settledRef.current = true;
          clearDraft(viewRef.current.activity.lineage);
          setView(next);
          setPhase('results');
          return null;
        }
        if (!attempt) {
          return null;
        }
        attemptRef.current = attempt.id;
        const changed = next.objective && next.objective.item.questionsFingerprint !== viewRef.current.objective?.item.questionsFingerprint;
        if (changed) {
          // The item was re-imported after the page loaded: the attempt snapshots the new questions.
          clearDraft(viewRef.current.activity.lineage);
          applyAnswers([]);
          setIndex(0);
          setPending(null);
          setViewing(null);
          setNotice(DRAFT_UPDATED_NOTICE);
        }
        setView(next);
        persist(answersRef.current, false);
        return attempt.id;
      } catch (error) {
        const kind = unavailableFor(error);
        if (kind === 'session') {
          leaveForLogin();
        } else if (kind) {
          goUnavailable(kind);
        }
        return null;
      } finally {
        startingRef.current = null;
      }
    })();
    startingRef.current = run;
    return run;
  }, [applyAnswers, goUnavailable, leaveForLogin, persist, setView]);

  const submit = useCallback(
    async (toSend: ObjectiveAnswer[]): Promise<void> => {
      if (submittingRef.current) {
        return;
      }
      submittingRef.current = true;
      setPhase('submitting');
      persist(toSend, true);
      try {
        const attemptId = await ensureAttempt();
        if (!attemptId) {
          // Either the activity became unavailable (already handled) or the start call could not reach the server.
          if (settledRef.current) {
            return;
          }
          setPhase('waiting_for_connection');
          return;
        }
        if (toSend.length > 0 && answersRef.current.length === 0) {
          // The item changed under the learner while the attempt was being created: the answers were cleared.
          setPhase('answering');
          return;
        }
        const current = viewRef.current;
        const next = await submitAttempt(current.activity.id, attemptId, {
          questionsFingerprint: current.objective?.item.questionsFingerprint ?? '',
          timeSpentSeconds: time.read(),
          answers: toSend,
        });
        settledRef.current = true;
        clearDraft(current.activity.lineage);
        retryIndex.current = 0;
        setView(next);
        setPhase('results');
      } catch (error) {
        const kind = unavailableFor(error);
        if (kind === 'session') {
          leaveForLogin();
        } else if (kind) {
          goUnavailable(kind);
        } else if (error instanceof ApiRequestError) {
          setPhase('save_failed');
        } else {
          setPhase('waiting_for_connection');
        }
      } finally {
        submittingRef.current = false;
      }

    },
    [ensureAttempt, goUnavailable, leaveForLogin, persist, setView, time],
  );

  // Draft reconciliation, once, on the client (storage is not available while rendering on the server).
  useEffect(() => {
    const current = viewRef.current;
    const outcome = reconcileDraft(current, loadDraft(current.activity.lineage));
    if (outcome.kind === 'results') {
      clearDraft(current.activity.lineage);
      setPhase(current.objective?.result ? 'results' : 'unavailable');
      if (!current.objective?.result) {
        setUnavailable(current.objective ? 'replaced' : 'not_objective');
      }
    } else if (outcome.kind === 'unavailable') {
      clearDraft(current.activity.lineage);
      setUnavailable(current.activity.state === 'skipped' ? 'skipped' : 'replaced');
      setPhase('unavailable');
    } else if (!current.objective?.runnable) {
      setUnavailable('not_runnable');
      setPhase('unavailable');
    } else if (outcome.kind === 'fresh') {
      if (outcome.notice) {
        setNotice(outcome.notice);
        clearDraft(current.activity.lineage);
      }
      attemptRef.current = outcome.attemptId;
    } else {
      attemptRef.current = outcome.attemptId;
      applyAnswers(outcome.draft.answers);
      time.seed(outcome.draft.activeSeconds);
      const questions = current.objective.item.questions;
      setIndex(firstUnansweredIndex(questions, outcome.draft.answers));
      setNotice(RESUMED_NOTICE);
      if (outcome.resumeSubmit) {
        void submit(outcome.draft.answers);
      }
    }
    setReady(true);
    // Intentionally once: the dependencies are refs and stable callbacks.
  }, []);

  // While the connection is down, retry on reconnect and on a growing backoff (A31).
  useEffect(() => {
    if (phase !== 'waiting_for_connection') {
      return;
    }
    const delay = RETRY_DELAYS_MS[Math.min(retryIndex.current, RETRY_DELAYS_MS.length - 1)] ?? 60_000;
    const timer = window.setTimeout(() => {
      retryIndex.current += 1;
      setRetryTick((value) => value + 1);
    }, delay);
    const onOnline = () => {
      retryIndex.current = 0;
      setRetryTick((value) => value + 1);
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [phase, retryTick]);

  useEffect(() => {
    if (retryTick > 0 && phase === 'waiting_for_connection') {
      void submit(answersRef.current);
    }
    // Only a new tick should trigger a resend.
  }, [retryTick]);

  const objective = view.objective;
  const questions = useMemo(() => objective?.item.questions ?? [], [objective]);
  const lastIndex = questions.length - 1;
  const current = questions[index];

  const lockedAnswer = useCallback(
    (question: ObjectiveQuestionView): ObjectiveAnswer | null => answers.find((answer) => answer.index === question.index) ?? null,
    [answers],
  );

  const select = useCallback((answer: ObjectiveAnswer) => setPending(answer), []);

  /** `Next question` locks the answer and saves the draft; on the last question it submits. */
  const confirm = useCallback(() => {
    if (!current || phase !== 'answering') {
      return;
    }
    let nextAnswers = answersRef.current;
    if (questionIsAnswerable(current)) {
      if (!pending || pending.index !== current.index) {
        return;
      }
      nextAnswers = [...answersRef.current.filter((answer) => answer.index !== current.index), pending];
      applyAnswers(nextAnswers);
      persist(nextAnswers, false);
      void ensureAttempt();
    }
    setPending(null);
    setViewing(null);
    if (index >= lastIndex) {
      void submit(nextAnswers);
    } else {
      setIndex(index + 1);
    }
  }, [applyAnswers, current, ensureAttempt, index, lastIndex, pending, persist, phase, submit]);

  const retryNow = useCallback(() => {
    retryIndex.current = 0;
    void submit(answersRef.current);
  }, [submit]);

  const next: NextStep = useMemo(() => nextStep(view), [view]);

  return {
    view,
    ready,
    phase,
    unavailable,
    notice,
    questions,
    index,
    current,
    answers,
    pending,
    viewing,
    setViewing,
    lockedAnswer,
    select,
    confirm,
    isLast: index >= lastIndex,
    canConfirm: current ? !questionIsAnswerable(current) || pending?.index === current.index : false,
    onFirstPlay: () => void ensureAttempt(),
    audioFailed,
    onAudioError: () => setAudioFailed(true),
    onAudioRetry: () => setAudioFailed(false),
    retryNow,
    next,
  };
}
