import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Inject, Injectable, Optional } from '@nestjs/common';
import { ERROR_CODES, type PronunciationScores, type SpeakingFailureCode, type SpeakingShape } from '@english-quest/shared';

import { AppError } from '../../common/app-error';
import { CredentialsService } from '../../credentials/credentials.service';
import { ExcerptClipSlicer } from '../../pronunciation/excerpt-clip.slicer';
import type { ClipAssessment } from '../../speech/pronunciation-assessment.service';
import { PronunciationAssessmentService } from '../../speech/pronunciation-assessment.service';
import {
  SpeechAudioRejectedError,
  SpeechAuthRejectedError,
  SpeechNoRecognitionError,
  SpeechRegionUnsupportedError,
  SpeechServiceError,
  SpeechThrottledError,
} from '../../speech/speech-errors';
import { SpeechToTextService } from '../../speech/speech-to-text.service';
import {
  SCORING_BUDGET_MS,
  SEGMENT_MAX_MS,
  SPEAKING_MIN_RECOGNIZED_WORDS,
  SPEAKING_RETRY_DELAYS,
  SPEAKING_RETRY_DELAYS_OVERRIDE,
  SPEAKING_USAGE_FEATURE,
  SPEAKING_WORK_ROOT,
  SPEECH_SPAN_PADDING_MS,
} from '../speaking.constants';
import {
  displayWords as buildDisplayWords,
  failingPhonemes,
  mergeSegments,
  recognizedWordCount,
  type FailingPhonemeGroup,
  type MergedWord,
} from './attempt-result';
import { planSegments, sliceReference, type RecognizedWord } from './segment-planner';
import { tokenizeDisplay } from './token-alignment';

export interface ScoreInput {
  userId: string;
  shape: SpeakingShape;
  /** The passage — set exactly for `read_aloud`. Null for `open_response`, whose reference is its own transcript. */
  referenceText: string | null;
  /** The whole recording, already on disk. */
  wavPath: string;
  durationMs: number;
}

export interface StoredSegment {
  startMs: number;
  endMs: number;
  referenceText: string;
  scores: PronunciationScores;
  latencyMs: number;
}

export type ScoreOutcome =
  | {
      kind: 'scored';
      scores: PronunciationScores;
      words: MergedWord[];
      displayWords: ReturnType<typeof buildDisplayWords>;
      failingPhonemes: FailingPhonemeGroup[];
      recognizedWordCount: number;
      transcript: string | null;
      segments: StoredSegment[];
      latencyMs: number;
      locale: string;
    }
  | { kind: 'discarded'; code: 'not_enough_speech' }
  | { kind: 'failed'; code: SpeakingFailureCode; providerMessage: string | null };

function usageFeature(shape: SpeakingShape): string {
  return shape === 'read_aloud' ? SPEAKING_USAGE_FEATURE.readAloud : SPEAKING_USAGE_FEATURE.openResponse;
}

/**
 * The synchronous provider pass behind one attempt's upload or re-score
 * (A28): transcribes when the shape or the length needs it, enforces the
 * 10-word floor, plans and slices segments past the 30 s REST cap, assesses
 * each sequentially with inline retries, and merges the result. Never
 * partial: if any segment's assessment fails after its retries, the whole
 * pass fails (A7). Always cleans up its own work directory.
 */
@Injectable()
export class SpeakingScorerService {
  private readonly workRoot: string;
  private readonly retryDelays: readonly number[];

  constructor(
    private readonly speech: SpeechToTextService,
    private readonly pronunciation: PronunciationAssessmentService,
    private readonly slicer: ExcerptClipSlicer,
    private readonly credentials: CredentialsService,
    @Optional() @Inject(SPEAKING_WORK_ROOT) workRoot?: string,
    @Optional() @Inject(SPEAKING_RETRY_DELAYS_OVERRIDE) retryDelays?: readonly number[],
  ) {
    this.workRoot = workRoot ?? tmpdir();
    this.retryDelays = retryDelays ?? SPEAKING_RETRY_DELAYS;
  }

  async score(input: ScoreInput): Promise<ScoreOutcome> {
    const startedAt = Date.now();
    const workDir = await mkdtemp(join(this.workRoot, 'f18-'));
    try {
      if (input.shape === 'read_aloud' && input.durationMs <= SEGMENT_MAX_MS) {
        return await this.scoreDirect(input, startedAt);
      }
      return await this.scoreTranscribed(input, workDir, startedAt);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** A read-aloud at or under the REST cap: assessed whole, directly against its passage (A5). */
  private async scoreDirect(input: ScoreInput, startedAt: number): Promise<ScoreOutcome> {
    const label = usageFeature(input.shape);
    const callStart = Date.now();
    let assessed: ClipAssessment;
    try {
      assessed = await this.assessWithRetries(input.userId, input.wavPath, input.referenceText!, label);
    } catch (error) {
      if (error instanceof SpeechNoRecognitionError) {
        return { kind: 'discarded', code: 'not_enough_speech' };
      }
      return this.failure(await this.classify(input.userId, error));
    }
    const latencyMs = Date.now() - callStart;

    const merged = mergeSegments([{ startMs: 0, durationMs: input.durationMs, scores: assessed.scores, words: assessed.words }]);
    const wordCount = recognizedWordCount(null, merged.words);
    if (wordCount < SPEAKING_MIN_RECOGNIZED_WORDS) {
      return { kind: 'discarded', code: 'not_enough_speech' };
    }

    const referenceTokens = tokenizeDisplay(input.referenceText!);
    return {
      kind: 'scored',
      scores: merged.scores,
      words: merged.words,
      displayWords: buildDisplayWords(referenceTokens, merged.words),
      failingPhonemes: failingPhonemes(merged.words),
      recognizedWordCount: wordCount,
      transcript: null,
      segments: [
        { startMs: 0, endMs: input.durationMs, referenceText: input.referenceText!, scores: assessed.scores, latencyMs },
      ],
      latencyMs: Date.now() - startedAt,
      locale: assessed.locale,
    };
  }

  /** An open response, or a read-aloud past the REST cap: transcribed first, then assessed per segment (A5, A6). */
  private async scoreTranscribed(input: ScoreInput, workDir: string, startedAt: number): Promise<ScoreOutcome> {
    const label = usageFeature(input.shape);

    let sttWords: RecognizedWord[];
    let fullTranscript: string;
    try {
      const stt = await this.speech.transcribeClip(input.userId, input.wavPath, label, 'audio/wav');
      sttWords = stt.words.map((word) => ({ startMs: word.startMs, durationMs: word.durationMs, text: word.text }));
      fullTranscript = stt.words.map((word) => word.text).join(' ');
    } catch (error) {
      return this.failure(await this.classify(input.userId, error));
    }

    if (sttWords.length < SPEAKING_MIN_RECOGNIZED_WORDS) {
      return { kind: 'discarded', code: 'not_enough_speech' };
    }

    const segments = planSegments({
      durationMs: input.durationMs,
      words: sttWords,
      maxMs: SEGMENT_MAX_MS,
      paddingMs: SPEECH_SPAN_PADDING_MS,
    });

    const segmentReferences =
      input.shape === 'open_response'
        ? segments.map((segment) => segment.wordIndexes.map((i) => sttWords[i]!.text).join(' '))
        : sliceReference(tokenizeDisplay(input.referenceText!), sttWords, segments);

    if (this.budgetExceeded(startedAt)) {
      return this.failure({ code: 'service_error', providerMessage: 'Scoring budget exceeded before assessment began.' });
    }

    let assessedSegments: Array<{ segment: (typeof segments)[number]; reference: string; result: ClipAssessment; latencyMs: number }>;
    try {
      assessedSegments = await this.assessSegments(input, workDir, segments, segmentReferences, label, startedAt);
    } catch (error) {
      return this.failure(await this.classify(input.userId, error));
    }

    const merged = mergeSegments(
      assessedSegments.map(({ segment, result }) => ({
        startMs: segment.startMs,
        durationMs: segment.endMs - segment.startMs,
        scores: result.scores,
        words: result.words,
      })),
    );
    const wordCount = recognizedWordCount(sttWords.length, merged.words);

    const displayReferenceTokens =
      input.shape === 'open_response' ? tokenizeDisplay(fullTranscript) : tokenizeDisplay(input.referenceText!);

    return {
      kind: 'scored',
      scores: merged.scores,
      words: merged.words,
      displayWords: buildDisplayWords(displayReferenceTokens, merged.words),
      failingPhonemes: failingPhonemes(merged.words),
      recognizedWordCount: wordCount,
      transcript: input.shape === 'open_response' ? fullTranscript : null,
      segments: assessedSegments.map(({ segment, reference, result, latencyMs }) => ({
        startMs: segment.startMs,
        endMs: segment.endMs,
        referenceText: reference,
        scores: result.scores,
        latencyMs,
      })),
      latencyMs: Date.now() - startedAt,
      locale: assessedSegments[0]?.result.locale ?? '',
    };
  }

  /** Skips any segment whose slice was empty (A6) — not assessed, and never counted in the weighting. */
  private async assessSegments(
    input: ScoreInput,
    workDir: string,
    segments: ReturnType<typeof planSegments>,
    segmentReferences: readonly string[],
    label: string,
    startedAt: number,
  ): Promise<Array<{ segment: (typeof segments)[number]; reference: string; result: ClipAssessment; latencyMs: number }>> {
    const assessed: Array<{ segment: (typeof segments)[number]; reference: string; result: ClipAssessment; latencyMs: number }> = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const reference = segmentReferences[i]!;
      if (reference.trim().length === 0) {
        continue;
      }
      if (this.budgetExceeded(startedAt)) {
        throw new SpeechServiceError('Scoring budget exceeded mid-pass.');
      }

      const clipPath = join(workDir, `segment-${i}.wav`);
      await this.slicer.slice(input.wavPath, segment.startMs, segment.endMs, clipPath);

      const callStart = Date.now();
      const result = await this.assessWithRetries(input.userId, clipPath, reference, label);
      assessed.push({ segment, reference, result, latencyMs: Date.now() - callStart });
    }

    return assessed;
  }

  private budgetExceeded(startedAt: number): boolean {
    return Date.now() - startedAt > SCORING_BUDGET_MS;
  }

  private failure(classified: { code: SpeakingFailureCode; providerMessage: string | null }): ScoreOutcome {
    return { kind: 'failed', code: classified.code, providerMessage: classified.providerMessage };
  }

  /** Two more attempts, 2 s then 8 s apart, for a service error, a rejected request or nothing recognized (F10's precedent). */
  private async assessWithRetries(userId: string, clipPath: string, referenceText: string, label: string): Promise<ClipAssessment> {
    const maxAttempts = 1 + this.retryDelays.length;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.pronunciation.assessClip(userId, clipPath, referenceText, label);
      } catch (error) {
        const retryable =
          error instanceof SpeechServiceError || error instanceof SpeechAudioRejectedError || error instanceof SpeechNoRecognitionError;
        const delay = this.retryDelays[attempt - 1];
        if (!retryable || delay === undefined) {
          throw error;
        }
        await sleep(delay);
      }
    }
    throw new Error('unreachable');
  }

  private async classify(userId: string, error: unknown): Promise<{ code: SpeakingFailureCode; providerMessage: string | null }> {
    if (error instanceof AppError && error.code === ERROR_CODES.CREDENTIAL_UNAVAILABLE) {
      const azure = (await this.credentials.list(userId)).find((entry) => entry.provider === 'azure_speech');
      return { code: azure?.status === 'missing' ? 'azure_key_missing' : 'azure_key_rejected', providerMessage: null };
    }
    if (error instanceof AppError && error.code === ERROR_CODES.CREDENTIAL_UNREADABLE) {
      return { code: 'azure_key_rejected', providerMessage: null };
    }
    if (error instanceof SpeechAuthRejectedError) {
      return { code: 'azure_key_rejected', providerMessage: error.providerMessage };
    }
    if (error instanceof SpeechThrottledError) {
      return { code: 'azure_quota', providerMessage: error.providerMessage };
    }
    if (error instanceof SpeechRegionUnsupportedError) {
      return { code: 'azure_region_unsupported', providerMessage: error.providerMessage };
    }
    if (error instanceof SpeechAudioRejectedError) {
      return { code: 'audio_rejected', providerMessage: error.providerMessage };
    }
    if (error instanceof SpeechServiceError || error instanceof SpeechNoRecognitionError) {
      return { code: 'service_error', providerMessage: error.providerMessage };
    }
    return { code: 'internal_error', providerMessage: error instanceof Error ? error.message : String(error) };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
