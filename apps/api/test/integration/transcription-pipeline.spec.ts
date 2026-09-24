import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TranscriptWriter } from '../../src/transcription/transcript-writer.service';
import type { SpeechTranscription } from '../../src/speech/speech-to-text.service';
import {
  createPipelineTestContext,
  launchAll,
  makeRecordedLesson,
  resetPipelineTables,
  seedSpeaker,
  waitForStage,
  type PipelineTestContext,
} from './helpers/pipeline-fixtures';

/**
 * Fails its first use halfway through the utterance insert — the header is
 * already written in the same transaction — to prove a crash mid-write
 * leaves no partial transcript behind.
 */
class HalfwayFailingWriter extends TranscriptWriter {
  failNext = false;

  protected override async insertUtterances(
    tx: Prisma.TransactionClient,
    transcriptId: string,
    lessonId: string,
    userId: string,
    transcription: SpeechTranscription,
  ): Promise<void> {
    if (!this.failNext) {
      return super.insertUtterances(tx, transcriptId, lessonId, userId, transcription);
    }
    this.failNext = false;
    const half = { ...transcription, utterances: transcription.utterances.slice(0, 1) };
    await super.insertUtterances(tx, transcriptId, lessonId, userId, half);
    throw new Error('simulated crash mid-write');
  }
}

let pipeline: PipelineTestContext;
const writer = new HalfwayFailingWriter();

beforeAll(async () => {
  pipeline = await createPipelineTestContext({ overrides: [{ token: TranscriptWriter, useValue: writer }] });
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  pipeline.speech.reset();
  writer.failNext = false;
  await resetPipelineTables(pipeline.ctx);
});

describe('transcription stage', () => {
  it('each_track_is_transcribed_with_its_owners_key_and_region', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { region: 'eastus2' });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { region: 'brazilsouth' });
    const lesson = await makeRecordedLesson(pipeline, [
      { speaker: ana, audioSeconds: 3 },
      { speaker: bruno, audioSeconds: 6 },
    ]);

    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['completed']);

    const anaCalls = pipeline.speech.callsFor(ana.azureKey!);
    const brunoCalls = pipeline.speech.callsFor(bruno.azureKey!);
    expect(anaCalls).toHaveLength(1);
    expect(brunoCalls).toHaveLength(1);
    expect(anaCalls[0]).toMatchObject({ region: 'eastus2', bytes: lesson.audioBytes.get(ana.id) });
    expect(brunoCalls[0]).toMatchObject({ region: 'brazilsouth', bytes: lesson.audioBytes.get(bruno.id) });
    expect(pipeline.speech.calls).toHaveLength(2);
  }, 60_000);

  it('stores_ordered_utterances_with_timings_confidence_and_words', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    pipeline.speech.script(ana.azureKey!, {
      kind: 'ok',
      durationMs: 600_000,
      phrases: [
        { offsetMs: 9_000, durationMs: 2_000, text: 'Second one.', confidence: 0.62, words: [{ text: 'Second', offsetMs: 9_000, durationMs: 700 }, { text: 'one.', offsetMs: 9_700, durationMs: 1_300 }] },
        { offsetMs: 500, durationMs: 300, text: '  ' },
        { offsetMs: 1_000, durationMs: 1_500, text: 'First one.', confidence: 0.95, words: [{ text: 'First', offsetMs: 1_000, durationMs: 600 }, { text: 'one.', offsetMs: 1_600, durationMs: 900 }] },
      ],
    });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);

    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);

    const utterances = await pipeline.ctx.prisma.lessonUtterance.findMany({
      where: { lessonId: lesson.lessonId },
      orderBy: { idx: 'asc' },
    });
    expect(utterances.map((utterance) => [utterance.idx, utterance.startMs, utterance.endMs, utterance.text])).toEqual([
      [0, 1_000, 2_500, 'First one.'],
      [1, 9_000, 11_000, 'Second one.'],
    ]);
    expect(utterances[0]!.confidence).toBeCloseTo(0.95, 5);
    expect(utterances[1]!.words).toEqual([
      { text: 'Second', startMs: 9_000, durationMs: 700, confidence: null },
      { text: 'one.', startMs: 9_700, durationMs: 1_300, confidence: null },
    ]);

    const transcript = await pipeline.ctx.prisma.lessonTranscript.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: ana.id } },
    });
    expect(transcript).toMatchObject({
      provider: 'azure_fast_transcription',
      apiVersion: '2025-10-15',
      locale: 'en-US',
      audioDurationMs: 600_000,
      utteranceCount: 2,
      wordCount: 4,
    });
    expect(transcript.latencyMs).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('every_utterance_belongs_to_the_track_owner_without_diarization', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }, { speaker: bruno }]);

    await launchAll(pipeline, lesson);
    for (const speaker of [ana, bruno]) {
      await waitForStage(pipeline.ctx, lesson.branches.get(speaker.id)!, 'transcription', ['completed']);
    }

    const transcripts = await pipeline.ctx.prisma.lessonTranscript.findMany({
      where: { lessonId: lesson.lessonId },
      include: { utterances: true },
    });
    expect(transcripts).toHaveLength(2);
    for (const transcript of transcripts) {
      expect(transcript.utterances.length).toBeGreaterThan(0);
      expect(transcript.utterances.every((utterance) => utterance.userId === transcript.userId)).toBe(true);
    }
    // One request per track, never a shared one to split by speaker.
    expect(pipeline.speech.calls).toHaveLength(2);
  }, 60_000);

  it('completion_advances_the_branch_to_excerpt_selection', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;

    await launchAll(pipeline, lesson);
    const done = await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed']);

    expect(done.startedAt).not.toBeNull();
    expect(done.finishedAt).not.toBeNull();
    expect(done.finishedAt!.getTime()).toBeGreaterThanOrEqual(done.startedAt!.getTime());
    expect(done.attempts).toBe(1);

    // Completion queued excerpt selection at run 1, which F09's handler now
    // runs straight away; the branch comes to rest at the stage after it.
    const next = await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);
    expect(next.run).toBe(1);
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch).toMatchObject({ stage: 'pronunciation_assessment', status: 'queued', failureCode: null });
  }, 60_000);

  it('a_missing_key_blocks_rather_than_fails', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withKey: false });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }, { speaker: bruno }]);

    await launchAll(pipeline, lesson);
    const blocked = await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['blocked_missing_key', 'failed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);

    expect(blocked).toMatchObject({
      status: 'blocked_missing_key',
      reasonCode: 'credential_missing',
      reason: 'Blocked — add your Azure Speech key to continue.',
      blockedProvider: 'azure_speech',
      finishedAt: null,
    });
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({
      where: { id: lesson.branches.get(bruno.id)! },
    });
    expect(branch).toMatchObject({ stage: 'transcription', status: 'blocked_missing_key', failureCode: null });
    // Only Ana's key ever reached Azure.
    expect(pipeline.speech.calls.map((call) => call.key)).toEqual([ana.azureKey]);
  }, 60_000);

  it('an_authentication_error_marks_the_key_invalid_and_does_not_retry', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    pipeline.speech.script(ana.azureKey!, {
      kind: 'status',
      status: 401,
      message: 'Access denied due to invalid subscription key or wrong API endpoint.',
    });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);

    await launchAll(pipeline, lesson);
    const blocked = await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['blocked_missing_key', 'failed', 'retrying']);

    expect(blocked).toMatchObject({
      status: 'blocked_missing_key',
      reasonCode: 'credential_rejected',
      reason: 'Your Azure Speech key was rejected. Update it in settings to resume.',
      providerMessage: 'Access denied due to invalid subscription key or wrong API endpoint.',
      attempts: 1,
    });
    expect(blocked.providerMessage).not.toContain(ana.azureKey!);
    const credential = await pipeline.ctx.prisma.userCredential.findUniqueOrThrow({
      where: { userId_provider: { userId: ana.id, provider: 'azure_speech' } },
    });
    expect(credential.status).toBe('invalid');
    // Give a retry every chance to happen, then prove it did not.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(pipeline.speech.calls).toHaveLength(1);
  }, 60_000);

  it('a_transient_error_retries_three_times_then_fails', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    for (let i = 0; i < 4; i += 1) {
      pipeline.speech.script(ana.azureKey!, { kind: 'status', status: 503, message: 'Service unavailable.' });
    }
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;

    await launchAll(pipeline, lesson);
    const retrying = await waitForStage(pipeline.ctx, branchId, 'transcription', ['retrying', 'failed']);
    expect(retrying.status).toBe('retrying');
    expect(retrying.nextAttemptAt).not.toBeNull();
    expect(retrying.reasonCode).toBe('transcription_service_error');

    const failed = await waitForStage(pipeline.ctx, branchId, 'transcription', ['failed']);
    expect(failed).toMatchObject({
      reasonCode: 'transcription_service_error',
      reason: 'Azure Speech could not transcribe this recording.',
      attempts: 4,
      nextAttemptAt: null,
    });
    expect(failed.finishedAt).not.toBeNull();
    expect(pipeline.speech.calls).toHaveLength(4);
    // A transient failure never touches the stored key.
    const credential = await pipeline.ctx.prisma.userCredential.findUniqueOrThrow({
      where: { userId_provider: { userId: ana.id, provider: 'azure_speech' } },
    });
    expect(credential.status).toBe('valid');
  }, 60_000);

  it('quota_errors_fail_with_quota_exceeded', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    for (let i = 0; i < 4; i += 1) {
      pipeline.speech.script(ana.azureKey!, { kind: 'status', status: 429, message: 'Quota exceeded.' });
    }
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;

    await launchAll(pipeline, lesson);
    const failed = await waitForStage(pipeline.ctx, branchId, 'transcription', ['failed']);

    expect(failed).toMatchObject({ reasonCode: 'transcription_quota_exceeded', reason: 'Azure Speech quota exceeded.' });
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch).toMatchObject({
      stage: 'transcription',
      status: 'failed',
      failureCode: 'transcription_quota_exceeded',
      failureReason: 'Azure Speech quota exceeded.',
    });
  }, 60_000);

  it('a_transient_error_that_recovers_completes', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    pipeline.speech.script(ana.azureKey!, { kind: 'status', status: 503 });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);

    await launchAll(pipeline, lesson);
    const done = await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed', 'failed']);

    expect(done).toMatchObject({ status: 'completed', attempts: 2, reasonCode: null });
  }, 60_000);

  it('an_unreadable_recording_fails_immediately_without_retry', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana, withoutObject: true }]);

    await launchAll(pipeline, lesson);
    const failed = await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['failed', 'retrying']);

    expect(failed).toMatchObject({
      status: 'failed',
      reasonCode: 'transcription_storage_unreadable',
      reason: 'Recording could not be read from storage.',
      attempts: 1,
    });
    expect(pipeline.speech.calls).toHaveLength(0);
    expect(await pipeline.ctx.prisma.lessonUtterance.count({ where: { lessonId: lesson.lessonId } })).toBe(0);
    // A storage fault is not the user's key failing: nothing is audited against it.
    expect(await pipeline.ctx.prisma.credentialUsage.count({ where: { userId: ana.id } })).toBe(0);
  }, 60_000);

  it('a_track_with_no_speech_fails_with_no_speech_detected', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    pipeline.speech.script(ana.azureKey!, { kind: 'ok', phrases: [], durationMs: 300_000 });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;

    await launchAll(pipeline, lesson);
    const failed = await waitForStage(pipeline.ctx, branchId, 'transcription', ['failed', 'retrying', 'completed']);

    expect(failed).toMatchObject({
      status: 'failed',
      reasonCode: 'transcription_no_speech',
      reason: 'No speech detected in this recording.',
    });
    expect(await pipeline.ctx.prisma.lessonTranscript.count({ where: { lessonId: lesson.lessonId } })).toBe(0);
    expect(
      await pipeline.ctx.prisma.lessonPipelineStage.count({ where: { branchId, stage: 'excerpt_selection' } }),
    ).toBe(0);
    expect(pipeline.speech.calls).toHaveLength(1);
  }, 60_000);

  it('a_failure_mid_write_persists_no_partial_transcript', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;
    writer.failNext = true;

    await launchAll(pipeline, lesson);
    // The crash rolls the whole completing transaction back, then the runner retries.
    const retrying = await waitForStage(pipeline.ctx, branchId, 'transcription', ['retrying', 'completed', 'failed']);
    if (retrying.status === 'retrying') {
      expect(retrying.reasonCode).toBe('internal_error');
    }
    const done = await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed', 'failed']);

    expect(done.status).toBe('completed');
    expect(done.attempts).toBe(2);
    const transcripts = await pipeline.ctx.prisma.lessonTranscript.findMany({ where: { lessonId: lesson.lessonId } });
    expect(transcripts).toHaveLength(1);
    // The full set, once — not the half the crashed attempt inserted.
    expect(await pipeline.ctx.prisma.lessonUtterance.count({ where: { lessonId: lesson.lessonId } })).toBe(2);
  }, 60_000);

  it('a_stale_run_commits_nothing', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;

    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed']);

    // The same run delivered again — as BullMQ does for a job it thinks stalled.
    const { PipelineProcessor } = await import('../../src/pipeline/pipeline.processor');
    const processor = pipeline.ctx.app.get(PipelineProcessor);
    const outcome = await processor.process(
      { id: 'redelivered', data: { branchId, stage: 'transcription', run: 1 }, attemptsStarted: 2 } as never,
      undefined,
    );

    expect(outcome).toBe('stale');
    expect(pipeline.speech.calls).toHaveLength(1);
    expect(await pipeline.ctx.prisma.lessonUtterance.count({ where: { lessonId: lesson.lessonId } })).toBe(2);
  }, 60_000);

  it('three_participants_transcribe_independently', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withKey: false });
    const carla = await seedSpeaker(pipeline.ctx, 'Carla');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }, { speaker: bruno }, { speaker: carla }]);

    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(carla.id)!, 'transcription', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['blocked_missing_key']);

    expect(await pipeline.ctx.prisma.lessonTranscript.count({ where: { lessonId: lesson.lessonId } })).toBe(2);
    expect(new Set(pipeline.speech.calls.map((call) => call.key))).toEqual(new Set([ana.azureKey, carla.azureKey]));
  }, 60_000);

  it('records_credential_usage_per_owner', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withKey: false });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }, { speaker: bruno }]);

    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['blocked_missing_key']);

    const usage = await pipeline.ctx.prisma.credentialUsage.findMany({ orderBy: { occurredAt: 'asc' } });
    expect(usage.map((row) => [row.userId, row.provider, row.feature, row.outcome]).sort()).toEqual(
      [
        [ana.id, 'azure_speech', 'F08_lesson_transcription', 'ok'],
        [bruno.id, 'azure_speech', 'F08_lesson_transcription', 'blocked'],
      ].sort(),
    );
  }, 60_000);
});
