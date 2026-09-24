import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveKitService } from '../../src/classroom/livekit.service';
import { PipelineDrainJob } from '../../src/pipeline/pipeline-drain.job';
import { PipelineQueueService } from '../../src/pipeline/pipeline-queue.service';
import { PipelineStateService } from '../../src/pipeline/pipeline-state.service';
import { EgressService } from '../../src/recording/egress.service';
import { RecordingFinalizationJob } from '../../src/recording/recording-finalization.job';
import {
  createPipelineTestContext,
  resetPipelineTables,
  seedSpeaker,
  waitForStage,
  type PipelineTestContext,
  type Speaker,
} from './helpers/pipeline-fixtures';
import { FakeEgressService, FakeLiveKitService } from './helpers/recording-fakes';
import { uploadTestSegment } from './helpers/segment-fixtures';

/**
 * F07 → F08 with nothing between them stubbed: F07's real finalizer
 * assembles and verifies each participant's audio in MinIO, its launch seam
 * hands the branch to the real pipeline, and the real worker transcribes
 * it — Azure being the only fake, at the class that calls it. F07's own
 * finalization suite replaces the launch seam with a mock by design, which
 * is why these cases live here.
 */

let pipeline: PipelineTestContext;

beforeAll(async () => {
  pipeline = await createPipelineTestContext({
    overrides: () => [
      { token: LiveKitService, useValue: new FakeLiveKitService() },
      { token: EgressService, useValue: new FakeEgressService() },
    ],
  });
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  pipeline.speech.reset();
  vi.restoreAllMocks();
  await pipeline.ctx.prisma.lessonRecordingSegment.deleteMany();
  await resetPipelineTables(pipeline.ctx);
});

/** A lesson that just ended, with one complete egress segment per speaker — what F07 finalizes. */
async function endedLessonWithSegments(speakers: Speaker[]): Promise<string> {
  const durationSeconds = 600;
  const startedAt = new Date(Date.now() - durationSeconds * 1000);
  // Created live and only ended once its segments exist: the finalization
  // job ticks on its own every 5 seconds and would otherwise finalize a
  // half-built lesson as `recording_missing`.
  const lesson = await pipeline.ctx.prisma.lesson.create({
    data: {
      room: 'classroom-main',
      openedBy: speakers[0]!.id,
      maxParticipants: 4,
      status: 'live',
      startedAt,
      recordingStatus: 'recording',
    },
  });

  for (const [index, speaker] of speakers.entries()) {
    await pipeline.ctx.prisma.lessonParticipant.create({
      data: {
        lessonId: lesson.id,
        userId: speaker.id,
        identity: speaker.id,
        joinedAt: startedAt,
        lastConnectedAt: startedAt,
        connected: false,
      },
    });
    const segmentId = randomUUID();
    const objectKey = await uploadTestSegment({
      storage: pipeline.storage,
      lessonId: lesson.id,
      userId: speaker.id,
      segmentId,
      durationSeconds: 4 + index,
    });
    // Timestamps span 4 minutes so F07's 3-minute rule is met; the fixture
    // audio itself stays short (F07's own suite does the same).
    const fileStartedAt = new Date(startedAt.getTime() + index * 10_000);
    await pipeline.ctx.prisma.lessonRecordingSegment.create({
      data: {
        id: segmentId,
        lessonId: lesson.id,
        userId: speaker.id,
        trackSid: `TR_${segmentId}`,
        objectKey,
        status: 'complete',
        fileStartedAt,
        fileEndedAt: new Date(fileStartedAt.getTime() + 240_000),
        durationMs: 240_000,
      },
    });
  }
  await pipeline.ctx.prisma.lesson.update({
    where: { id: lesson.id },
    data: {
      status: 'ended',
      endedAt: new Date(),
      endReason: 'ended_by_participant',
      durationSeconds,
      recordingStatus: 'finalizing',
      recordingFinalizingSince: new Date(),
    },
  });
  return lesson.id;
}

async function finalize(): Promise<void> {
  await pipeline.ctx.app.get(RecordingFinalizationJob).run();
}

/**
 * The finalization job also ticks on its own every 5 seconds and holds a
 * lease while it works, so a manual run can find the lesson taken. Keep
 * running it until the branch shows the expected launch state.
 */
async function finalizeUntilLaunched(lessonId: string, userId: string) {
  const started = Date.now();
  for (;;) {
    await finalize();
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
    });
    if (branch?.launchedAt) {
      return branch;
    }
    if (Date.now() - started > 45_000) {
      throw new Error(`Branch for ${userId} was never launched; last: ${JSON.stringify(branch)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe('recording hands off to transcription', () => {
  it('a_finalized_recording_is_transcribed_from_that_exact_object', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { region: 'eastus2' });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { region: 'brazilsouth' });
    const lessonId = await endedLessonWithSegments([ana, bruno]);

    for (const speaker of [ana, bruno]) {
      const branch = await finalizeUntilLaunched(lessonId, speaker.id);
      await waitForStage(pipeline.ctx, branch.id, 'transcription', ['completed']);

      const participant = await pipeline.ctx.prisma.lessonParticipant.findUniqueOrThrow({
        where: { lessonId_userId: { lessonId, userId: speaker.id } },
      });
      expect(participant.audioObjectKey).toBe(`lessons/${lessonId}/${speaker.id}/audio.ogg`);
      // The bytes Azure received are exactly the verified object F07 wrote, on that owner's key.
      expect(pipeline.speech.callsFor(speaker.azureKey!)).toEqual([
        expect.objectContaining({ region: speaker.region, bytes: Number(participant.audioBytes) }),
      ]);
    }
    expect(pipeline.speech.calls).toHaveLength(2);
  }, 90_000);

  it('a_failed_launch_never_costs_the_recording', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lessonId = await endedLessonWithSegments([ana]);
    // Even the stage row cannot be written — the launch's attempt and any drain tick's alike.
    const ensureStage = vi
      .spyOn(pipeline.ctx.app.get(PipelineStateService), 'ensureStage')
      .mockRejectedValue(new Error('database briefly unavailable'));

    // F07 still finalizes: the segments are gone by now, so the launch must not
    // send it back through assembly, where the good recording would read as missing.
    const branch = await finalizeUntilLaunched(lessonId, ana.id);
    // Exactly as F07 leaves a launched branch before the pipeline moves it on.
    expect(branch).toMatchObject({ stage: 'recording', status: 'queued', failureCode: null });
    const participant = await pipeline.ctx.prisma.lessonParticipant.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId, userId: ana.id } },
    });
    expect(participant.recordingStatus).toBe('complete');
    expect(await pipeline.storage.statObject(`lessons/${lessonId}/${ana.id}/audio.ogg`)).not.toBeNull();
    expect(await pipeline.ctx.prisma.lessonPipelineStage.count({ where: { branchId: branch.id } })).toBe(0);
    expect(pipeline.speech.calls).toHaveLength(0);

    // Once the database answers again, the drain's backfill picks the branch up.
    ensureStage.mockRestore();
    await pipeline.ctx.app.get(PipelineDrainJob).run();
    await waitForStage(pipeline.ctx, branch.id, 'transcription', ['completed']);
    expect(pipeline.speech.calls).toHaveLength(1);
  }, 90_000);

  it('a_redis_failure_at_launch_is_recovered_by_the_drain', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lessonId = await endedLessonWithSegments([ana]);
    // Every add fails while Redis is "down" — the launch's and any drain tick's alike.
    const enqueue = vi
      .spyOn(pipeline.ctx.app.get(PipelineQueueService), 'enqueue')
      .mockRejectedValue(new Error('Connection is closed.'));

    // A failed add does not stop the launch: the branch is launched on the stage row alone.
    const branch = await finalizeUntilLaunched(lessonId, ana.id);
    const row = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId: branch.id, stage: 'transcription' } },
    });
    expect(row.status).toBe('queued');
    expect(pipeline.speech.calls).toHaveLength(0);

    enqueue.mockRestore();
    await pipeline.ctx.app.get(PipelineDrainJob).run();
    await waitForStage(pipeline.ctx, branch.id, 'transcription', ['completed']);
    expect(pipeline.speech.calls).toHaveLength(1);
  }, 90_000);
});
