import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import ffmpegPath from 'ffmpeg-static';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PipelineDrainJob } from '../../src/pipeline/pipeline-drain.job';
import { PipelineStateService } from '../../src/pipeline/pipeline-state.service';
import { PIPELINE_QUEUE, pipelineJobId } from '../../src/pipeline/pipeline.constants';
import { PronunciationResultReader } from '../../src/pronunciation/pronunciation-result.reader';
import { audioObjectKey } from '../../src/recording/recording.constants';
import {
  createPipelineTestContext,
  makeTranscribedLesson,
  resetPipelineTables,
  seedSpeaker,
  startSelection,
  storeAzureKey,
  uploadAudio,
  waitForStage,
  type PipelineTestContext,
  type RecordedLesson,
  type SeedUtterance,
  type Speaker,
} from './helpers/pipeline-fixtures';

const execFileAsync = promisify(execFile);

let pipeline: PipelineTestContext;
let sharedAudioDir: string;
let sharedAudioPath: string;

const queue = () => pipeline.ctx.app.get<Queue>(getQueueToken(PIPELINE_QUEUE));
const reader = () => pipeline.ctx.app.get(PronunciationResultReader);

beforeAll(async () => {
  pipeline = await createPipelineTestContext();
  // One long real tone, generated once and re-uploaded per test under each
  // lesson's own object key: cheap (synthesis is not real-time), and long
  // enough to cover excerpts spread across several of F09's 5-minute windows.
  sharedAudioDir = await mkdtemp(join(tmpdir(), 'f10-shared-audio-'));
  sharedAudioPath = join(sharedAudioDir, 'audio.ogg');
  await execFileAsync(ffmpegPath as unknown as string, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=330:duration=1320',
    '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k',
    sharedAudioPath,
  ]);
}, 300_000);

afterAll(async () => {
  await pipeline?.close();
  await rm(sharedAudioDir, { recursive: true, force: true }).catch(() => undefined);
});

beforeEach(async () => {
  pipeline.speech.reset();
  pipeline.pronunciation.reset();
  await resetPipelineTables(pipeline.ctx);
});

/** One eligible turn: 10 words, well above the confidence and duration floors. */
function turn(index: number, startMs: number, durationMs: number, confidence = 0.6): SeedUtterance {
  return {
    startMs,
    endMs: startMs + durationMs,
    text: `Turn number ${index} has quite a few words spoken carefully today`,
    confidence,
  };
}

/** `count` turns, at most 3 per F09's 5-minute window, so every one is selected without competition. */
function turns(count: number, durationMs = 20_000): SeedUtterance[] {
  const result: SeedUtterance[] = [];
  let minute = 0;
  while (result.length < count) {
    for (let slot = 0; slot < 3 && result.length < count; slot += 1) {
      const startMs = minute * 60_000 + slot * (durationMs + 5_000);
      result.push(turn(result.length + 1, startMs, durationMs, 0.55 + 0.02 * result.length));
    }
    minute += 6;
  }
  return result;
}

interface StoredExcerptRow {
  id: string;
  rank: number;
  startMs: number;
  endMs: number;
  referenceText: string;
  utteranceId: string;
}

interface Setup {
  speaker: Speaker;
  lesson: RecordedLesson;
  branchId: string;
  excerpts: StoredExcerptRow[];
}

/**
 * A branch with `count` selected excerpts, real audio uploaded under its
 * owner's object key (the shared long tone by default), ready for F10 to
 * pick up the moment excerpt selection completes.
 */
async function selectedLesson(
  count: number,
  options: {
    durationMs?: number;
    audioSeconds?: number;
    skipAudio?: boolean;
    corruptAudio?: boolean;
    region?: string;
    withKey?: boolean;
    speakerName?: string;
  } = {},
): Promise<Setup> {
  const speaker = await seedSpeaker(pipeline.ctx, options.speakerName ?? 'Ana', {
    region: options.region,
    withKey: options.withKey,
  });
  const lesson = await makeTranscribedLesson(pipeline, [
    { speaker, utterances: turns(count, options.durationMs) },
  ]);
  const branchId = lesson.branches.get(speaker.id)!;
  const objectKey = audioObjectKey(lesson.lessonId, speaker.id);

  if (options.corruptAudio) {
    const dir = await mkdtemp(join(tmpdir(), 'f10-corrupt-'));
    const corruptPath = join(dir, 'audio.ogg');
    await writeFile(corruptPath, Buffer.from('not audio at all, just garbage bytes'));
    await pipeline.storage.uploadFile(objectKey, corruptPath, 'audio/ogg');
    await rm(dir, { recursive: true, force: true });
  } else if (options.audioSeconds !== undefined) {
    await uploadAudio(pipeline.storage, objectKey, options.audioSeconds);
  } else if (!options.skipAudio) {
    await pipeline.storage.uploadFile(objectKey, sharedAudioPath, 'audio/ogg');
  }

  await startSelection(pipeline, branchId);
  await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);
  const excerpts = await pipeline.ctx.prisma.lessonExcerpt.findMany({
    where: { lessonId: lesson.lessonId, userId: speaker.id },
    orderBy: { rank: 'asc' },
  });

  return { speaker, lesson, branchId, excerpts };
}

async function assessmentRows(lessonId: string, userId: string) {
  return pipeline.ctx.prisma.lessonExcerptAssessment.findMany({ where: { lessonId, userId } });
}

describe('pronunciation assessment stage', () => {
  it('each_excerpt_is_assessed_against_its_own_reference_text', async () => {
    const { speaker, branchId, excerpts } = await selectedLesson(4);

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const calls = pipeline.pronunciation.callsFor(speaker.azureKey!);
    expect(calls).toHaveLength(4);
    expect(calls.map((call) => call.referenceText).sort()).toEqual(excerpts.map((e) => e.referenceText).sort());
  }, 60_000);

  it('submits_exactly_the_selected_excerpts_cut_from_the_owners_object', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(4);

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const calls = pipeline.pronunciation.callsFor(speaker.azureKey!);
    expect(calls.map((call) => call.referenceText).sort()).toEqual(excerpts.map((e) => e.referenceText).sort());
    for (const excerpt of excerpts) {
      const call = calls.find((c) => c.referenceText === excerpt.referenceText)!;
      const expectedMs = excerpt.endMs - excerpt.startMs;
      expect(call.clipDurationMs).toBeGreaterThanOrEqual(expectedMs - 20);
      expect(call.clipDurationMs).toBeLessThanOrEqual(expectedMs + 20);
    }
    const rows = await assessmentRows(lesson.lessonId, speaker.id);
    for (const excerpt of excerpts) {
      const row = rows.find((r) => r.excerptId === excerpt.id)!;
      expect(row.clipStartMs).toBe(excerpt.startMs);
      expect(row.clipEndMs).toBe(excerpt.endMs);
    }
  }, 60_000);

  it('stores_scores_words_and_phonemes_per_excerpt', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(1);
    const excerpt = excerpts[0]!;
    pipeline.pronunciation.script(speaker.azureKey!, excerpt.referenceText, {
      kind: 'ok',
      scores: { pronunciation: 72, accuracy: 74, fluency: 70, prosody: 66, completeness: 95 },
      recognizedText: excerpt.referenceText,
      words: [
        {
          word: 'careful',
          accuracy: 41,
          errorTypes: ['Mispronunciation'],
          phonemes: [{ phoneme: 'k', accuracy: 90 }, { phoneme: 'ɛ', accuracy: 30 }],
        },
      ],
    });

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const rows = await assessmentRows(lesson.lessonId, speaker.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'assessed',
      pronunciation: 72,
      accuracy: 74,
      fluency: 70,
      prosody: 66,
      completeness: 95,
    });
    const words = rows[0]!.words as unknown as Array<{ word: string; accuracy: number; errorTypes: string[]; phonemes: unknown[] }>;
    expect(words).toEqual([
      expect.objectContaining({ word: 'careful', accuracy: 41, errorTypes: ['Mispronunciation'] }),
    ]);
    expect((words[0]!.phonemes as Array<{ phoneme: string; accuracy: number }>).map((p) => p.phoneme)).toEqual(['k', 'ɛ']);
  }, 60_000);

  it('the_result_is_duration_weighted_with_worst_phonemes_and_words', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(2, { durationMs: 10_000 });
    const [first, second] = excerpts;
    pipeline.pronunciation.script(speaker.azureKey!, first!.referenceText, {
      kind: 'ok',
      scores: { pronunciation: 90, accuracy: 90, fluency: 90, prosody: 90, completeness: 90 },
    });
    pipeline.pronunciation.script(speaker.azureKey!, second!.referenceText, {
      kind: 'ok',
      scores: { pronunciation: 50, accuracy: 50, fluency: 50, prosody: 50, completeness: 50 },
      words: [
        { word: 'thing', accuracy: 30, phonemes: [{ phoneme: 'θ', accuracy: 20 }] },
        { word: 'thing', accuracy: 35, phonemes: [{ phoneme: 'θ', accuracy: 25 }] },
      ],
    });

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const result = await pipeline.ctx.prisma.lessonPronunciationResult.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: speaker.id } },
    });
    // Both excerpts are the same duration, so the mean is the plain average here.
    expect(result.pronunciation).toBe(70);
    const worstPhonemes = result.worstPhonemes as unknown as Array<{ phoneme: string; occurrences: number }>;
    expect(worstPhonemes).toEqual([expect.objectContaining({ phoneme: 'θ', occurrences: 2 })]);
    const worstWords = result.worstWords as unknown as Array<{ word: string; occurrences: number }>;
    expect(worstWords[0]).toMatchObject({ word: 'thing', occurrences: 2 });
  }, 60_000);

  it('submitted_audio_never_exceeds_six_minutes', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(12, { durationMs: 30_000 });
    const flaky = excerpts[5]!;
    pipeline.pronunciation.script(
      speaker.azureKey!,
      flaky.referenceText,
      { kind: 'status', status: 503, message: 'Service unavailable.' },
      { kind: 'ok' },
    );

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const calls = pipeline.pronunciation.callsFor(speaker.azureKey!);
    const byReference = new Map<string, number>();
    let distinctMs = 0;
    for (const call of calls) {
      if (!byReference.has(call.referenceText)) {
        byReference.set(call.referenceText, 0);
        distinctMs += call.clipDurationMs;
      }
      byReference.set(call.referenceText, byReference.get(call.referenceText)! + 1);
    }
    expect(distinctMs).toBeLessThanOrEqual(360_000);
    expect(byReference.get(flaky.referenceText)).toBe(2);
    const rows = await assessmentRows(lesson.lessonId, speaker.id);
    expect(rows.filter((r) => r.status === 'assessed')).toHaveLength(12);
  }, 90_000);

  it('a_failing_excerpt_is_retried_twice_then_excluded', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(4);
    const bad = excerpts[2]!;
    pipeline.pronunciation.script(
      speaker.azureKey!,
      bad.referenceText,
      { kind: 'status', status: 503, message: 'Service unavailable.' },
      { kind: 'status', status: 503, message: 'Service unavailable.' },
      { kind: 'status', status: 503, message: 'Service unavailable.' },
    );

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const calls = pipeline.pronunciation.callsFor(speaker.azureKey!).filter((c) => c.referenceText === bad.referenceText);
    expect(calls).toHaveLength(3);
    const rows = await assessmentRows(lesson.lessonId, speaker.id);
    const badRow = rows.find((r) => r.excerptId === bad.id)!;
    expect(badRow).toMatchObject({ status: 'failed', failureCode: 'service_error' });
    expect(rows.filter((r) => r.status === 'assessed')).toHaveLength(3);
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch.stage).toBe('lesson_analysis');
    const result = await pipeline.ctx.prisma.lessonPronunciationResult.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: speaker.id } },
    });
    expect(result.partialAssessment).toBe(true);
  }, 60_000);

  it('eight_of_twelve_is_partial_with_the_count', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(12);
    for (const excerpt of excerpts.slice(0, 4)) {
      pipeline.pronunciation.script(
        speaker.azureKey!,
        excerpt.referenceText,
        { kind: 'status', status: 503 },
        { kind: 'status', status: 503 },
        { kind: 'status', status: 503 },
      );
    }

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed'], 60_000);

    const result = await pipeline.ctx.prisma.lessonPronunciationResult.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: speaker.id } },
    });
    expect(result).toMatchObject({ status: 'assessed', assessedCount: 8, excerptCount: 12, partialAssessment: true });
  }, 90_000);

  it('under_sixty_percent_fails_and_retry_reprocesses_only_failed', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(12);
    const failing = excerpts.slice(0, 7);
    for (const excerpt of failing) {
      pipeline.pronunciation.script(
        speaker.azureKey!,
        excerpt.referenceText,
        { kind: 'status', status: 503 },
        { kind: 'status', status: 503 },
        { kind: 'status', status: 503 },
      );
    }

    const failed = await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['failed'], 60_000);
    expect(failed).toMatchObject({
      reasonCode: 'pronunciation_too_few_assessed',
      reason: 'Too few excerpts could be assessed (5 of 12).',
    });
    pipeline.pronunciation.reset();
    // Re-scripting failures keyed by the OLD key only mattered on the first
    // run; a fresh request for the same reference text now falls through to
    // the fake's default success.

    const retried = await request(pipeline.ctx.app.getHttpServer())
      .post(`/lessons/${lesson.lessonId}/pipeline/retry`)
      .set('Cookie', speaker.cookie);
    expect(retried.status).toBe(202);

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed'], 60_000);
    const calls = pipeline.pronunciation.callsFor(speaker.azureKey!);
    const calledReferences = new Set(calls.map((c) => c.referenceText));
    expect(calledReferences.size).toBe(7);
    for (const excerpt of failing) {
      expect(calledReferences.has(excerpt.referenceText)).toBe(true);
    }
    for (const excerpt of excerpts.slice(7)) {
      expect(calledReferences.has(excerpt.referenceText)).toBe(false);
    }
    const rows = await assessmentRows(lesson.lessonId, speaker.id);
    expect(rows.filter((r) => r.status === 'assessed')).toHaveLength(12);
  }, 90_000);

  it('quota_exhaustion_abandons_the_rest', async () => {
    // 429 on the 9th of 12: 8 assessed, 4 abandoned — still >= 60%.
    const first = await selectedLesson(12, { speakerName: 'Ana' });
    pipeline.pronunciation.script(first.speaker.azureKey!, first.excerpts[8]!.referenceText, {
      kind: 'status',
      status: 429,
      message: 'Quota exceeded.',
    });

    const done = await waitForStage(pipeline.ctx, first.branchId, 'pronunciation_assessment', ['completed'], 60_000);
    expect(done).toBeTruthy();
    const firstRows = await assessmentRows(first.lesson.lessonId, first.speaker.id);
    expect(firstRows.filter((r) => r.status === 'assessed')).toHaveLength(8);
    expect(firstRows.filter((r) => r.status === 'abandoned')).toHaveLength(4);
    const firstResult = await pipeline.ctx.prisma.lessonPronunciationResult.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: first.lesson.lessonId, userId: first.speaker.id } },
    });
    expect(firstResult).toMatchObject({ status: 'assessed', assessedCount: 8, quotaExhausted: true });
    // At least the first 9 (1-8 assessed, the 9th throttled) were called;
    // never a 10th, 11th or 12th, which were abandoned without a request.
    // A transient infrastructure fault can force a same-run retry that
    // re-calls an in-flight excerpt, so this checks which excerpts were
    // ever called rather than an exact count.
    const firstCalledReferences = new Set(
      pipeline.pronunciation.callsFor(first.speaker.azureKey!).map((call) => call.referenceText),
    );
    for (const excerpt of first.excerpts.slice(0, 9)) {
      expect(firstCalledReferences.has(excerpt.referenceText)).toBe(true);
    }
    for (const excerpt of first.excerpts.slice(9)) {
      expect(firstCalledReferences.has(excerpt.referenceText)).toBe(false);
    }

    // 429 on the 4th of 12: 3 assessed, 9 abandoned — below 60%, fails.
    pipeline.pronunciation.reset();
    const second = await selectedLesson(12, { speakerName: 'Bruno' });
    pipeline.pronunciation.script(second.speaker.azureKey!, second.excerpts[3]!.referenceText, {
      kind: 'status',
      status: 429,
      message: 'Quota exceeded.',
    });

    const failed = await waitForStage(pipeline.ctx, second.branchId, 'pronunciation_assessment', ['failed'], 60_000);
    expect(failed).toMatchObject({ reasonCode: 'pronunciation_quota_exhausted' });
    const secondCalledReferences = new Set(
      pipeline.pronunciation.callsFor(second.speaker.azureKey!).map((call) => call.referenceText),
    );
    for (const excerpt of second.excerpts.slice(0, 4)) {
      expect(secondCalledReferences.has(excerpt.referenceText)).toBe(true);
    }
    for (const excerpt of second.excerpts.slice(4)) {
      expect(secondCalledReferences.has(excerpt.referenceText)).toBe(false);
    }
  }, 120_000);

  it('a_rejected_key_blocks_and_keeps_completed_excerpts', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(12);
    pipeline.pronunciation.script(speaker.azureKey!, excerpts[4]!.referenceText, {
      kind: 'status',
      status: 401,
      message: 'Access denied due to invalid subscription key.',
    });

    const blocked = await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['blocked_missing_key']);
    expect(blocked.reasonCode).toBe('credential_rejected');
    const rows = await assessmentRows(lesson.lessonId, speaker.id);
    expect(rows.filter((r) => r.status === 'assessed')).toHaveLength(4);
    const key = await pipeline.ctx.prisma.userCredential.findUniqueOrThrow({
      where: { userId_provider: { userId: speaker.id, provider: 'azure_speech' } },
    });
    expect(key.status).toBe('invalid');

    const newKey = 'azure-key-ana-saves-after-block-000000';
    await storeAzureKey(pipeline.ctx, speaker.id, newKey, speaker.region, 'valid');
    await pipeline.ctx.app.get(PipelineDrainJob).run();

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);
    const finalRows = await assessmentRows(lesson.lessonId, speaker.id);
    expect(finalRows.filter((r) => r.status === 'assessed')).toHaveLength(12);
    const resumedCalls = pipeline.pronunciation.callsFor(newKey);
    expect(resumedCalls).toHaveLength(8);
  }, 90_000);

  it('a_missing_key_blocks_without_any_call', async () => {
    const { branchId, lesson, speaker } = await selectedLesson(2, { withKey: false });

    const blocked = await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['blocked_missing_key']);
    expect(blocked.reasonCode).toBe('credential_missing');
    expect(pipeline.pronunciation.calls).toHaveLength(0);
    const rows = await assessmentRows(lesson.lessonId, speaker.id);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
  }, 60_000);

  it('a_failed_slice_drops_only_that_excerpt', async () => {
    // Only ~70s of real audio, so the excerpt starting at minute 6 (the
    // second window) falls entirely outside it and cannot be sliced.
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(4, { audioSeconds: 70 });

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const rows = await assessmentRows(lesson.lessonId, speaker.id);
    const dropped = rows.filter((r) => r.status === 'dropped');
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ failureCode: 'slice_failed' });
    expect(rows.filter((r) => r.status === 'assessed')).toHaveLength(3);
    const outOfRange = excerpts.find((e) => e.startMs >= 70_000);
    expect(dropped[0]!.excerptId).toBe(outOfRange!.id);
  }, 60_000);

  it('every_slice_failing_fails_the_stage', async () => {
    const { branchId, lesson, speaker } = await selectedLesson(3, { corruptAudio: true });

    const failed = await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['failed']);
    expect(failed).toMatchObject({
      reasonCode: 'pronunciation_audio_unprocessable',
      reason: 'Audio could not be processed for assessment.',
    });
    expect(pipeline.pronunciation.calls).toHaveLength(0);
    const rows = await assessmentRows(lesson.lessonId, speaker.id);
    expect(rows.every((r) => r.status === 'dropped')).toBe(true);
  }, 60_000);

  it('an_unreadable_recording_fails_without_retry', async () => {
    const { branchId, speaker } = await selectedLesson(2, { skipAudio: true });

    const failed = await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['failed']);
    expect(failed).toMatchObject({
      reasonCode: 'pronunciation_storage_unreadable',
      reason: 'Recording could not be read from storage.',
      attempts: 1,
    });
    expect(pipeline.pronunciation.calls).toHaveLength(0);
    expect(await pipeline.ctx.prisma.credentialUsage.count({ where: { userId: speaker.id } })).toBe(0);
  }, 60_000);

  it('an_empty_selection_completes_without_an_aggregate', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    // Backchannel-only turns: too short and too few words for F09 to select any.
    const lesson = await makeTranscribedLesson(pipeline, [
      { speaker: ana, utterances: [{ startMs: 0, endMs: 1_200, text: 'Yeah, right.', confidence: 0.9 }] },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    expect(pipeline.pronunciation.calls).toHaveLength(0);
    const result = await pipeline.ctx.prisma.lessonPronunciationResult.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: ana.id } },
    });
    expect(result).toMatchObject({ status: 'no_sample', excerptCount: 0, assessedCount: 0 });
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch.stage).toBe('lesson_analysis');
  }, 60_000);

  it('temporary_clips_are_deleted', async () => {
    const success = await selectedLesson(3, { speakerName: 'Ana' });
    await waitForStage(pipeline.ctx, success.branchId, 'pronunciation_assessment', ['completed']);
    expect(await readdir(pipeline.pronunciationWorkRoot)).toEqual([]);

    const failure = await selectedLesson(2, { speakerName: 'Bruno', corruptAudio: true });
    await waitForStage(pipeline.ctx, failure.branchId, 'pronunciation_assessment', ['failed']);
    expect(await readdir(pipeline.pronunciationWorkRoot)).toEqual([]);
  }, 90_000);

  it('phoneme_failures_are_recorded_as_ledger_tags', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(1);
    pipeline.pronunciation.script(speaker.azureKey!, excerpts[0]!.referenceText, {
      kind: 'ok',
      words: [
        { word: 'through', accuracy: 40, phonemes: [{ phoneme: 'θ', accuracy: 40 }] },
        { word: 'through', accuracy: 55, phonemes: [{ phoneme: 'θ', accuracy: 55 }] },
      ],
    });

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const result = await pipeline.ctx.prisma.lessonPronunciationResult.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: speaker.id } },
    });
    const tags = result.phonemeTags as unknown as Array<{ tag: string; occurrences: number; exampleWords: string[] }>;
    expect(tags).toEqual([
      expect.objectContaining({ tag: 'phoneme:/θ/', occurrences: 2, exampleWords: ['through'] }),
    ]);
  }, 60_000);

  it('progress_counts_settled_excerpts', async () => {
    const { speaker, branchId, excerpts } = await selectedLesson(6);
    for (const excerpt of excerpts) {
      pipeline.pronunciation.script(speaker.azureKey!, excerpt.referenceText, { kind: 'wait', ms: 150, then: { kind: 'ok' } });
    }

    let sawPartialProgress = false;
    const started = Date.now();
    while (Date.now() - started < 20_000) {
      const row = await pipeline.ctx.prisma.lessonPipelineStage.findUnique({
        where: { branchId_stage: { branchId, stage: 'pronunciation_assessment' } },
      });
      if (row?.progressTotal === 6 && row.progressDone !== null && row.progressDone > 0 && row.progressDone < 6) {
        sawPartialProgress = true;
      }
      if (row?.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    expect(sawPartialProgress).toBe(true);

    const finished = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId, stage: 'pronunciation_assessment' } },
    });
    expect(finished).toMatchObject({ status: 'completed', progressDone: 6, progressTotal: 6 });
  }, 60_000);

  it('each_participant_is_assessed_with_their_own_key', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { region: 'eastus2' });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { region: 'westeurope' });
    const lesson = await makeTranscribedLesson(pipeline, [
      { speaker: ana, utterances: turns(3) },
      { speaker: bruno, utterances: turns(3) },
    ]);
    await pipeline.storage.uploadFile(audioObjectKey(lesson.lessonId, ana.id), sharedAudioPath, 'audio/ogg');
    await pipeline.storage.uploadFile(audioObjectKey(lesson.lessonId, bruno.id), sharedAudioPath, 'audio/ogg');
    const anaBranch = lesson.branches.get(ana.id)!;
    const brunoBranch = lesson.branches.get(bruno.id)!;
    await startSelection(pipeline, anaBranch);
    await startSelection(pipeline, brunoBranch);

    await waitForStage(pipeline.ctx, anaBranch, 'pronunciation_assessment', ['completed']);
    await waitForStage(pipeline.ctx, brunoBranch, 'pronunciation_assessment', ['completed']);

    const anaCalls = pipeline.pronunciation.callsFor(ana.azureKey!);
    const brunoCalls = pipeline.pronunciation.callsFor(bruno.azureKey!);
    expect(anaCalls.length).toBeGreaterThan(0);
    expect(brunoCalls.length).toBeGreaterThan(0);
    expect(anaCalls.every((call) => call.region === 'eastus2')).toBe(true);
    expect(brunoCalls.every((call) => call.region === 'westeurope')).toBe(true);

    const usage = await pipeline.ctx.prisma.credentialUsage.findMany({ where: { feature: 'F10_lesson_pronunciation' } });
    expect(usage.some((row) => row.userId === ana.id)).toBe(true);
    expect(usage.some((row) => row.userId === bruno.id)).toBe(true);
  }, 90_000);

  it('completion_advances_to_lesson_analysis', async () => {
    const { lesson, speaker, branchId } = await selectedLesson(2);

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch).toMatchObject({ stage: 'lesson_analysis', status: 'queued' });
    const nextRow = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId, stage: 'lesson_analysis' } },
    });
    expect(nextRow).toMatchObject({ status: 'queued', run: 1 });
    expect(await queue().getJob(pipelineJobId('lesson_analysis', branchId, 1))).toBeUndefined();
    void lesson;
    void speaker;
  }, 60_000);

  it('a_stale_run_writes_nothing', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(2);
    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);
    const rowsBefore = await assessmentRows(lesson.lessonId, speaker.id);

    const staged = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId, stage: 'pronunciation_assessment' } },
    });
    const state = pipeline.ctx.app.get(PipelineStateService);
    await expect(
      state.withinRun({ id: staged.id, run: staged.run + 1 }, async () => undefined),
    ).rejects.toMatchObject({ name: 'StaleRunError' });

    const rowsAfter = await assessmentRows(lesson.lessonId, speaker.id);
    expect(rowsAfter).toEqual(rowsBefore);
    void excerpts;
  }, 60_000);

  it('the_reader_returns_the_aggregate_for_analysis', async () => {
    const { speaker, lesson, branchId } = await selectedLesson(2);
    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const view = await reader().forParticipant(lesson.lessonId, speaker.id);
    expect(view?.result).toMatchObject({ status: 'assessed', assessedCount: 2, excerptCount: 2 });
    expect(view?.excerpts).toHaveLength(2);
    expect(view?.excerpts.every((e) => e.status === 'assessed' && e.scores !== null)).toBe(true);

    const other = await seedSpeaker(pipeline.ctx, 'NoResult');
    expect(await reader().forParticipant(lesson.lessonId, other.id)).toBeNull();
  }, 60_000);
});
