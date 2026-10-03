'use client';

import type { DifficultyRating, SpeakingActivityView } from '@english-quest/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DifficultyRating as DifficultyRatingWidget } from '@/components/activity/difficulty-rating';
import { ApiRequestError } from '@/lib/api-client';
import { fetchSpeakingActivity, rateSpeakingActivity, rescoreAttempt, uploadAttempt } from '@/lib/speaking';

import { AttemptList } from './attempt-list';
import { AttemptResult } from './attempt-result';
import { RecorderPanel } from './recorder-panel';
import { ReviewPanel, type UploadFailureKind } from './review-panel';
import { SpeakingBlocked, type SpeakingGate } from './speaking-blocked';
import { TaskCard } from './task-card';
import { useAttemptAudio } from './use-attempt-audio';
import { useWavRecorder } from './use-wav-recorder';

const POLL_INTERVAL_MS = 2_000;

/**
 * Client state machine: `ready` → `recording` → `review` → `submitting` →
 * `result`, plus `upload_failed`, `blocked`, `mic_denied`, `no_microphone`
 * and `unsupported`. Derived from `useWavRecorder`'s own status rather than
 * tracked separately, so the two never disagree about which screen is up.
 */
export function SpeakingRunner({ activity: initial }: { activity: SpeakingActivityView }) {
  const [activity, setActivity] = useState(initial);
  const [uploadFailure, setUploadFailure] = useState<UploadFailureKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rescoringId, setRescoringId] = useState<string | null>(null);
  const [resultAttemptId, setResultAttemptId] = useState<string | null>(null);

  const pendingClientIdRef = useRef<string | null>(null);

  const recorder = useWavRecorder(activity.limits.maxRecordingSeconds);
  const attemptAudio = useAttemptAudio();

  const hasUnsentRecording = recorder.status === 'stopped' || uploadFailure !== null;

  useEffect(() => {
    if (!hasUnsentRecording) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsentRecording]);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchSpeakingActivity(activity.activityId);
      setActivity(next);
    } catch {
      // The next poll (or the user's own retry) tries again — nothing shown breaks in the meantime.
    }
  }, [activity.activityId]);

  useEffect(() => {
    if (!activity.attempts.some((attempt) => attempt.state === 'scoring')) {
      return;
    }
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activity.attempts, refresh]);

  const startRecording = useCallback(() => {
    setUploadFailure(null);
    setResultAttemptId(null);
    void recorder.start();
  }, [recorder]);

  const discard = useCallback(() => {
    recorder.reset();
    pendingClientIdRef.current = null;
    setUploadFailure(null);
  }, [recorder]);

  const submit = useCallback(async () => {
    const wav = recorder.wav;
    if (!wav) {
      return;
    }
    if (!pendingClientIdRef.current) {
      pendingClientIdRef.current = crypto.randomUUID();
    }
    const clientAttemptId = pendingClientIdRef.current;

    setSubmitting(true);
    try {
      const attempt = await uploadAttempt(activity.activityId, clientAttemptId, wav);
      pendingClientIdRef.current = null;
      setUploadFailure(null);
      recorder.reset();
      setResultAttemptId(attempt.id);
      await refresh();
    } catch (error) {
      setUploadFailure(error instanceof ApiRequestError && error.code === 'CRED002' ? 'credential' : 'network');
    } finally {
      setSubmitting(false);
    }
  }, [activity.activityId, recorder, refresh]);

  const rescore = useCallback(
    async (attemptId: string) => {
      setRescoringId(attemptId);
      try {
        await rescoreAttempt(attemptId);
        await refresh();
      } finally {
        setRescoringId(null);
      }
    },
    [refresh],
  );

  const rate = useCallback(
    async (input: { rating: DifficultyRating | null; notUseful: boolean }) => {
      const next = await rateSpeakingActivity(activity.activityId, input);
      setActivity((previous) => ({ ...previous, rating: next }));
    },
    [activity.activityId],
  );

  const togglePlay = useCallback(
    (attemptId: string) => {
      if (attemptAudio.playingAttemptId === attemptId) {
        attemptAudio.stop();
      } else {
        void attemptAudio.play(attemptId);
      }
    },
    [attemptAudio],
  );

  const localGate: SpeakingGate | null =
    recorder.status === 'error' && recorder.errorReason
      ? recorder.errorReason === 'denied'
        ? 'mic_denied'
        : recorder.errorReason === 'not-found'
          ? 'no_microphone'
          : 'unsupported'
      : null;

  const serverBlock = activity.block;
  const readOnly = serverBlock === 'plan_archived' || serverBlock === 'activity_skipped';

  const resultAttempt = activity.attempts.find((attempt) => attempt.id === resultAttemptId) ?? null;

  return (
    <div className="flex flex-col gap-lg">
      {activity.task ? <TaskCard task={activity.task} /> : null}

      {readOnly ? (
        <SpeakingBlocked gate={serverBlock === 'plan_archived' ? 'plan_archived' : 'activity_skipped'} />
      ) : localGate ? (
        <SpeakingBlocked
          gate={localGate}
          onRetry={() => {
            recorder.reset();
            startRecording();
          }}
        />
      ) : serverBlock === 'azure_key_missing' && !hasUnsentRecording ? (
        <SpeakingBlocked gate="azure_key_missing" />
      ) : recorder.status === 'stopped' || uploadFailure ? (
        <ReviewPanel
          isPlaying={attemptAudio.isPlaying && attemptAudio.playingAttemptId === null}
          onPlay={() => {
            if (recorder.wav) {
              void attemptAudio.playLocal(new Blob([recorder.wav], { type: 'audio/wav' }));
            }
          }}
          onStop={attemptAudio.stop}
          onDiscard={discard}
          onSubmit={() => void submit()}
          submitting={submitting}
          uploadFailure={uploadFailure}
          onRetry={() => void submit()}
        />
      ) : (
        <RecorderPanel
          recording={recorder.status === 'recording'}
          canRecord={activity.attemptsRemaining > 0}
          elapsedMs={recorder.elapsedMs}
          maxRecordingSeconds={activity.limits.maxRecordingSeconds}
          level={recorder.level}
          hitLimit={recorder.hitLimit}
          attemptsUsed={activity.attemptsUsed}
          attemptsRemaining={activity.attemptsRemaining}
          maxAttempts={activity.limits.maxAttempts}
          onStart={startRecording}
          onStop={recorder.stop}
        />
      )}

      {resultAttempt?.result && activity.task ? (
        <AttemptResult
          result={resultAttempt.result}
          shape={activity.task.shape}
          onPlayRange={(startMs, durationMs) => void attemptAudio.playRange(resultAttempt.id, startMs, durationMs)}
        />
      ) : null}

      <AttemptList
        attempts={activity.attempts}
        attemptsRemaining={activity.attemptsRemaining}
        playingAttemptId={attemptAudio.playingAttemptId}
        onTogglePlay={togglePlay}
        onRescore={(id) => void rescore(id)}
        rescoringId={rescoringId}
      />

      {!readOnly ? <DifficultyRatingWidget value={activity.rating} onRate={rate} /> : null}

      <Link href="/dashboard" className="text-label-lg text-primary underline-offset-4 hover:underline">
        Back to today’s session
      </Link>
    </div>
  );
}
