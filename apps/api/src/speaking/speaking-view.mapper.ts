import { Injectable } from '@nestjs/common';
import type { SpeakingAttempt, SpeakingTask } from '@prisma/client';
import type {
  CredentialStatus,
  DifficultyRating,
  PlanActivityState,
  PlanTag,
  SpeakingActivityKind,
  SpeakingActivityView,
  SpeakingAttemptResult,
  SpeakingAttemptState,
  SpeakingAttemptView,
  SpeakingFailingPhoneme,
  SpeakingFailure,
  SpeakingFailureCode,
  SpeakingShape,
  SpeakingTaskView,
  StudyPlanStatus,
} from '@english-quest/shared';

import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { bestAttempt, blockFor, isRescorable, isStale } from './scoring/attempt-policy';
import { displayWords } from './scoring/attempt-result';
import { storedFailingPhonemesSchema, storedWordsSchema } from './scoring/stored-shapes';
import { toAttemptSummary } from './speaking-attempt.repository';
import { tokenizeDisplay } from './scoring/token-alignment';
import { wordsOf } from './corpus/speaking-corpus';
import {
  OPEN_RESPONSE_TARGET_SECONDS,
  SPEAKING_FAILURE_MESSAGES,
  SPEAKING_MAX_ATTEMPTS,
  SPEAKING_MAX_RECORDING_MS,
  SPEAKING_MIN_RECOGNIZED_WORDS,
} from './speaking.constants';

export interface ActivityViewInput {
  activityId: string;
  kind: SpeakingActivityKind;
  title: string;
  state: PlanActivityState;
  planStatus: StudyPlanStatus;
  estimatedMinutes: number;
  targetTags: readonly string[];
  task: SpeakingTask | null;
  azureStatus: CredentialStatus;
  /** Every attempt of the task, oldest first — including `discarded` ones, which this mapper filters out. */
  attempts: readonly SpeakingAttempt[];
  rating: { rating: DifficultyRating | null; notUseful: boolean } | null;
  now: Date;
}

/** Rows to views: `SpeakingActivityView` and `SpeakingAttemptView` (spec §5). Tag labels come from the taxonomy in force. */
@Injectable()
export class SpeakingViewMapper {
  constructor(private readonly taxonomy: ErrorTaxonomyService) {}

  toTag(tag: string): PlanTag {
    return { tag, label: this.taxonomy.labelOf(tag) };
  }

  toTaskView(task: SpeakingTask): SpeakingTaskView {
    return {
      shape: task.shape as SpeakingShape,
      referenceText: task.referenceText,
      prompt: task.promptText,
      hint: task.hint,
      wordCount: task.referenceText ? wordsOf(task.referenceText).length : null,
      focusTags: task.focusTags.map((tag) => this.toTag(tag)),
      targetSeconds: task.shape === 'open_response' ? { ...OPEN_RESPONSE_TARGET_SECONDS } : null,
    };
  }

  private toFailingPhonemeView(group: ReturnType<typeof storedFailingPhonemesSchema.parse>[number]): SpeakingFailingPhoneme {
    const worst = group.examples[0]!;
    return {
      tag: group.tag,
      label: this.taxonomy.labelOf(group.tag),
      meanAccuracy: group.meanAccuracy,
      instances: group.instances,
      exampleWord: worst.word,
      exampleStartMs: worst.startMs,
      exampleDurationMs: worst.durationMs,
    };
  }

  /**
   * `referenceText` is the task's passage for a read-aloud, or the
   * attempt's own transcript for an open response — the same source
   * `displayWords` is re-run against on every read, so the view can never
   * drift from what is actually stored.
   */
  toAttemptView(attempt: SpeakingAttempt, isBest: boolean, referenceText: string | null, now: Date): SpeakingAttemptView {
    const stale = isStale({ state: toAttemptSummary(attempt).state, scoringStartedAt: attempt.scoringStartedAt }, now);
    const state: SpeakingAttemptState = stale ? 'failed' : (attempt.state as SpeakingAttemptState);
    const failureCode: SpeakingFailureCode | null = stale ? 'interrupted' : (attempt.failureCode as SpeakingFailureCode | null);
    const failureReason = stale ? SPEAKING_FAILURE_MESSAGES.interrupted : attempt.failureReason;

    let failure: SpeakingFailure | null = null;
    if (state === 'failed' || state === 'discarded') {
      const code = failureCode!;
      failure = { code, message: failureReason ?? SPEAKING_FAILURE_MESSAGES[code], rescorable: state === 'failed' && isRescorable(code) };
    }

    let result: SpeakingAttemptResult | null = null;
    if (state === 'scored') {
      const words = storedWordsSchema.parse(attempt.words);
      const failingGroups = storedFailingPhonemesSchema.parse(attempt.failingPhonemes);
      const displayTokens = tokenizeDisplay(referenceText ?? '');
      result = {
        scores: {
          pronunciation: attempt.pronunciation!,
          accuracy: attempt.accuracy!,
          fluency: attempt.fluency!,
          prosody: attempt.prosody,
          completeness: attempt.completeness!,
        },
        recognizedWordCount: attempt.recognizedWordCount!,
        transcript: attempt.transcriptText,
        words: displayWords(displayTokens, words),
        failingPhonemes: failingGroups.slice(0, 10).map((group) => this.toFailingPhonemeView(group)),
      };
    }

    return {
      id: attempt.id,
      clientAttemptId: attempt.clientAttemptId,
      ordinal: attempt.ordinal,
      state,
      createdAt: attempt.createdAt.toISOString(),
      scoredAt: attempt.scoredAt?.toISOString() ?? null,
      durationMs: attempt.durationMs,
      isBest,
      failure,
      result,
    };
  }

  toActivityView(input: ActivityViewInput): SpeakingActivityView {
    const block = blockFor({ planStatus: input.planStatus, activityState: input.state, azureStatus: input.azureStatus });
    const summaries = input.attempts.map(toAttemptSummary);
    const best = bestAttempt(summaries);
    const attemptsUsed = summaries.filter((summary) => summary.state === 'scored').length;
    const referenceText = input.task?.referenceText ?? null;

    return {
      activityId: input.activityId,
      kind: input.kind,
      title: input.title,
      state: input.state,
      planStatus: input.planStatus,
      estimatedMinutes: input.estimatedMinutes,
      targetTags: input.targetTags.map((tag) => this.toTag(tag)),
      task: input.task ? this.toTaskView(input.task) : null,
      block,
      limits: {
        maxAttempts: SPEAKING_MAX_ATTEMPTS,
        maxRecordingSeconds: SPEAKING_MAX_RECORDING_MS / 1000,
        minRecognizedWords: SPEAKING_MIN_RECOGNIZED_WORDS,
      },
      attemptsUsed,
      attemptsRemaining: SPEAKING_MAX_ATTEMPTS - attemptsUsed,
      bestAttemptId: best?.id ?? null,
      attempts: input.attempts
        .filter((attempt) => attempt.state !== 'discarded')
        .map((attempt) =>
          this.toAttemptView(
            attempt,
            attempt.id === best?.id,
            attempt.transcriptText ?? referenceText,
            input.now,
          ),
        ),
      rating: input.rating,
    };
  }
}
