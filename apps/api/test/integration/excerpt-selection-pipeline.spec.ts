import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadExcerptRulesFile } from '../../src/excerpts/excerpt-rules';
import { EXCERPT_RULES_PATH } from '../../src/excerpts/excerpt-selection.constants';
import { ExcerptSelectionReader } from '../../src/excerpts/excerpt-selection.reader';
import {
  NO_PRONUNCIATION_FOCUS,
  PronunciationFocusPort,
  type PronunciationFocus,
} from '../../src/profile/pronunciation-focus.port';
import { PIPELINE_QUEUE, pipelineJobId } from '../../src/pipeline/pipeline.constants';
import { PipelineDrainJob } from '../../src/pipeline/pipeline-drain.job';
import { PipelineStateService } from '../../src/pipeline/pipeline-state.service';
import { audioObjectKey } from '../../src/recording/recording.constants';
import type { FakePhrase } from './helpers/fake-speech';
import {
  createPipelineTestContext,
  launchAll,
  makeRecordedLesson,
  makeTranscribedLesson,
  resetPipelineTables,
  seedSpeaker,
  startSelection,
  uploadAudio,
  waitForStage,
  type PipelineTestContext,
  type SeedUtterance,
} from './helpers/pipeline-fixtures';

/**
 * Records whose focus was asked for, and answers with whatever the test
 * sets. Structural rather than a subclass: F12's real port reads the ledger
 * through injected readers this suite doesn't need.
 */
class FakePronunciationFocus implements Pick<PronunciationFocusPort, 'focusFor'> {
  asked: string[] = [];
  focus: PronunciationFocus = NO_PRONUNCIATION_FOCUS;

  async focusFor(userId: string): Promise<PronunciationFocus> {
    this.asked.push(userId);
    return this.focus;
  }
}

const MINUTE = 60_000;
const focus = new FakePronunciationFocus();
let pipeline: PipelineTestContext;

const queue = () => pipeline.ctx.app.get<Queue>(getQueueToken(PIPELINE_QUEUE));

/** An utterance every version-1 rule accepts: 10 words, `seconds` long, at `minute`. */
function said(minute: number, confidence: number | null, seconds = 5, text?: string): SeedUtterance {
  const startMs = minute * MINUTE;
  return {
    startMs,
    endMs: startMs + seconds * 1_000,
    text: text ?? `At minute ${minute} we should really move the whole meeting`,
    confidence,
  };
}

/** A two-word turn no rule accepts. */
function backchannel(minute: number): SeedUtterance {
  const startMs = minute * MINUTE + 30_000;
  return { startMs, endMs: startMs + 1_200, text: 'Yeah, right.', confidence: 0.9 };
}

function phraseAt(minute: number, confidence: number, text: string): FakePhrase {
  const words = text.split(' ');
  const offsetMs = minute * MINUTE;
  return {
    offsetMs,
    durationMs: words.length * 500,
    text,
    confidence,
    words: words.map((word, i) => ({ text: word, offsetMs: offsetMs + i * 500, durationMs: 500 })),
  };
}

beforeAll(async () => {
  pipeline = await createPipelineTestContext({ overrides: [{ token: PronunciationFocusPort, useValue: focus }] });
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  pipeline.speech.reset();
  focus.asked = [];
  focus.focus = NO_PRONUNCIATION_FOCUS;
  await resetPipelineTables(pipeline.ctx);
});

describe('excerpt selection stage', () => {
  it('selects_from_exactly_the_owners_stored_utterances', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    pipeline.speech.script(ana.azureKey!, {
      kind: 'ok',
      durationMs: 20 * MINUTE,
      phrases: [
        phraseAt(1, 0.9, 'I would rather we moved the meeting to Thursday afternoon'),
        phraseAt(7, 0.55, 'The budget has to be signed off before anyone books flights'),
        phraseAt(13, 0.7, 'Honestly I think the client will understand the delay this time'),
      ],
    });
    pipeline.speech.script(bruno.azureKey!, {
      kind: 'ok',
      durationMs: 20 * MINUTE,
      phrases: [
        phraseAt(2, 0.5, 'That seems a bit drastic but I can see where you are coming from'),
        phraseAt(9, 0.8, 'Maybe we could ask finance to approve a smaller amount first'),
      ],
    });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }, { speaker: bruno }]);

    await launchAll(pipeline, lesson);
    for (const speaker of [ana, bruno]) {
      await waitForStage(pipeline.ctx, lesson.branches.get(speaker.id)!, 'excerpt_selection', ['completed']);
    }

    for (const speaker of [ana, bruno]) {
      const utterances = await pipeline.ctx.prisma.lessonUtterance.findMany({
        where: { lessonId: lesson.lessonId, userId: speaker.id },
      });
      const byId = new Map(utterances.map((utterance) => [utterance.id, utterance]));
      const excerpts = await pipeline.ctx.prisma.lessonExcerpt.findMany({
        where: { lessonId: lesson.lessonId, userId: speaker.id },
        orderBy: { rank: 'asc' },
      });

      expect(excerpts).toHaveLength(utterances.length);
      for (const excerpt of excerpts) {
        const source = byId.get(excerpt.utteranceId);
        expect(source, 'every excerpt comes from its owner’s own transcript').toBeDefined();
        expect(excerpt.startMs).toBe(source!.startMs);
        expect(excerpt.endMs).toBe(source!.endMs);
        expect(excerpt.referenceText).toBe(source!.text);
        expect(excerpt.confidence).toBe(source!.confidence);
      }
    }

    const anaFirst = await pipeline.ctx.prisma.lessonExcerpt.findFirstOrThrow({
      where: { lessonId: lesson.lessonId, userId: ana.id, rank: 1 },
      include: { utterance: true },
    });
    expect(anaFirst.utterance.text).toBe('The budget has to be signed off before anyone books flights');
    // No transcription call beyond F08's one per track.
    expect(pipeline.speech.calls).toHaveLength(2);
  }, 60_000);

  it('completion_advances_the_branch_to_lesson_analysis', async () => {
    // Short, closely-spaced utterances (rather than said()'s minute-scale
    // offsets) so a short, real uploaded clip covers every excerpt's range:
    // F10 now has a handler and actually slices and assesses them.
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeTranscribedLesson(pipeline, [
      {
        speaker: ana,
        utterances: [
          { startMs: 0, endMs: 5_000, text: 'At minute one we should really move the whole meeting', confidence: 0.8 },
          { startMs: 6_000, endMs: 11_000, text: 'At minute two we should really move the whole meeting', confidence: 0.7 },
          { startMs: 12_000, endMs: 17_000, text: 'At minute three we should really move the whole meeting', confidence: 0.6 },
          { startMs: 18_000, endMs: 23_000, text: 'At minute four we should really move the whole meeting', confidence: 0.9 },
        ],
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await uploadAudio(pipeline.storage, audioObjectKey(lesson.lessonId, ana.id), 25);

    await startSelection(pipeline, branchId);
    const done = await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    expect(done.attempts).toBe(1);
    expect(done.finishedAt!.getTime() - done.startedAt!.getTime()).toBeLessThan(2_000);

    // F10's handler now runs the selected excerpts straight away (against
    // the fake Azure client's default scores); the branch moves one stage
    // further, to lesson analysis, which now has F11's own handler. Ana
    // holds no Gemini key in this fixture, so it blocks immediately rather
    // than sitting queued — exactly the state a keyless branch settles into.
    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);
    const next = await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['blocked_missing_key']);
    expect(next).toMatchObject({ status: 'blocked_missing_key', run: 1, reasonCode: 'credential_missing' });
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch).toMatchObject({ stage: 'lesson_analysis', status: 'blocked_missing_key' });
  }, 60_000);

  it('every_excerpt_stores_its_selection_rule_version', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeTranscribedLesson(pipeline, [
      { speaker: ana, utterances: [said(1, 0.8), said(8, 0.7), said(15, 0.6), said(22, 0.9), said(29, 0.5)] },
    ]);
    const branchId = lesson.branches.get(ana.id)!;

    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    const committed = loadExcerptRulesFile(EXCERPT_RULES_PATH);
    const selection = await pipeline.ctx.prisma.lessonExcerptSelection.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: ana.id } },
      include: { excerpts: true },
    });
    expect(selection.ruleVersion).toBe('1');
    expect(selection.ruleFingerprint).toBe(committed.fingerprint);
    expect(selection.rules).toEqual(committed.rules);
    expect(selection.excerpts).toHaveLength(5);
    expect(selection.excerpts.every((excerpt) => excerpt.selectionRuleVersion === '1')).toBe(true);
  }, 60_000);

  it('runs_without_any_provider_call_or_credential', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withKey: false });
    const lesson = await makeTranscribedLesson(pipeline, [
      { speaker: ana, utterances: [said(1, 0.8), said(8, 0.7), said(15, 0.6), said(22, 0.9)] },
    ]);
    const branchId = lesson.branches.get(ana.id)!;

    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    expect(pipeline.speech.calls).toHaveLength(0);
    expect(await pipeline.ctx.prisma.credentialUsage.count()).toBe(0);
    expect(await pipeline.ctx.prisma.lessonExcerpt.count({ where: { userId: ana.id } })).toBe(4);
  }, 60_000);

  it('a_lesson_with_fewer_than_4_eligible_is_flagged_sparse', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeTranscribedLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said(1, 0.8), backchannel(2), said(8, 0.7), backchannel(9), said(15, 0.6), backchannel(16)],
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;

    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    const selection = await pipeline.ctx.prisma.lessonExcerptSelection.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: ana.id } },
    });
    expect(selection).toMatchObject({ utteranceCount: 6, eligibleCount: 3, selectedCount: 3, sparseSample: true });
  }, 60_000);

  it('no_eligible_utterance_completes_with_an_empty_selection', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeTranscribedLesson(pipeline, [
      { speaker: ana, utterances: [backchannel(1), backchannel(2), backchannel(3)] },
    ]);
    const branchId = lesson.branches.get(ana.id)!;

    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    const selection = await pipeline.ctx.prisma.lessonExcerptSelection.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: ana.id } },
      include: { excerpts: true },
    });
    expect(selection).toMatchObject({ eligibleCount: 0, selectedCount: 0, selectedAudioMs: 0, sparseSample: true });
    expect(selection.excerpts).toEqual([]);

    // An empty selection completes F10 at once, as no_sample, with no audio
    // access — the branch moves one stage further, to lesson analysis,
    // which blocks at once since this fixture user holds no Gemini key.
    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['blocked_missing_key']);
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch).toMatchObject({ stage: 'lesson_analysis', status: 'blocked_missing_key' });
  }, 60_000);

  it('participants_select_independently', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const carla = await seedSpeaker(pipeline.ctx, 'Carla');
    const lesson = await makeTranscribedLesson(pipeline, [
      { speaker: ana, utterances: [said(1, 0.8), said(8, 0.7)] },
      { speaker: bruno, failedAtTranscription: true },
      { speaker: carla, utterances: [said(3, 0.6), said(10, 0.9), said(17, 0.5), said(24, 0.7)] },
    ]);

    await startSelection(pipeline, lesson.branches.get(ana.id)!);
    await startSelection(pipeline, lesson.branches.get(carla.id)!);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'excerpt_selection', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(carla.id)!, 'excerpt_selection', ['completed']);

    const selections = await pipeline.ctx.prisma.lessonExcerptSelection.findMany({
      where: { lessonId: lesson.lessonId },
      include: { excerpts: { include: { utterance: true } } },
    });
    expect(new Map(selections.map((selection) => [selection.userId, selection.selectedCount]))).toEqual(
      new Map([
        [ana.id, 2],
        [carla.id, 4],
      ]),
    );
    for (const selection of selections) {
      expect(selection.excerpts.every((excerpt) => excerpt.utterance.userId === selection.userId)).toBe(true);
    }
    const brunoBranch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({
      where: { id: lesson.branches.get(bruno.id)! },
    });
    expect(brunoBranch).toMatchObject({ stage: 'transcription', status: 'failed' });
    expect(focus.asked.sort()).toEqual([ana.id, carla.id].sort());
  }, 60_000);

  it('a_rerun_replaces_the_previous_selection', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeTranscribedLesson(pipeline, [
      { speaker: ana, utterances: [said(1, 0.8), said(8, 0.7), said(15, 0.6), said(22, 0.9), backchannel(23)] },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);
    const first = await pipeline.ctx.prisma.lessonExcerpt.findMany({ where: { userId: ana.id }, orderBy: { rank: 'asc' } });

    // What a manual retry upstream does to every stage after it.
    const rerun = await pipeline.ctx.app.get(PipelineStateService).queueStage(branchId, 'excerpt_selection', new Date());
    await startSelection(pipeline, branchId, rerun.run);
    const done = await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    expect(done.run).toBe(2);
    expect(await pipeline.ctx.prisma.lessonExcerptSelection.count({ where: { userId: ana.id } })).toBe(1);
    const second = await pipeline.ctx.prisma.lessonExcerpt.findMany({ where: { userId: ana.id }, orderBy: { rank: 'asc' } });
    const shape = (rows: typeof first) => rows.map((row) => [row.rank, row.utteranceId, row.reason]);
    expect(shape(second)).toEqual(shape(first));
  }, 60_000);

  it('a_stale_run_commits_nothing', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeTranscribedLesson(pipeline, [{ speaker: ana, utterances: [said(1, 0.8), said(8, 0.7)] }]);
    const branchId = lesson.branches.get(ana.id)!;
    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    // The same run delivered again — as BullMQ does for a job it thinks stalled.
    const { PipelineProcessor } = await import('../../src/pipeline/pipeline.processor');
    const outcome = await pipeline.ctx.app.get(PipelineProcessor).process(
      { id: 'redelivered', data: { branchId, stage: 'excerpt_selection', run: 1 }, attemptsStarted: 2 } as never,
      undefined,
    );

    expect(outcome).toBe('stale');
    expect(await pipeline.ctx.prisma.lessonExcerptSelection.count()).toBe(1);
    expect(await pipeline.ctx.prisma.lessonExcerpt.count()).toBe(2);
  }, 60_000);

  it('a_transcript_rewrite_takes_its_selection_with_it', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeTranscribedLesson(pipeline, [{ speaker: ana, utterances: [said(1, 0.8), said(8, 0.7)] }]);
    const branchId = lesson.branches.get(ana.id)!;
    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    await pipeline.ctx.prisma.lessonTranscript.deleteMany({ where: { lessonId: lesson.lessonId, userId: ana.id } });

    expect(await pipeline.ctx.prisma.lessonExcerptSelection.count()).toBe(0);
    expect(await pipeline.ctx.prisma.lessonExcerpt.count()).toBe(0);
  }, 60_000);

  it('a_missing_transcript_fails_without_retry', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeTranscribedLesson(pipeline, [{ speaker: ana, utterances: null }]);
    const branchId = lesson.branches.get(ana.id)!;

    await startSelection(pipeline, branchId);
    const failed = await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['failed']);

    expect(failed).toMatchObject({ attempts: 1, reasonCode: 'internal_error', nextAttemptAt: null });
    const view = await request(pipeline.ctx.app.getHttpServer())
      .get(`/lessons/${lesson.lessonId}/pipeline`)
      .set('Cookie', ana.cookie)
      .expect(200);
    const stage = (view.body.data.branch.stages as Array<{ stage: string; retryable: boolean }>).find(
      (entry) => entry.stage === 'excerpt_selection',
    );
    expect(stage).toMatchObject({ status: 'failed', reasonCode: 'internal_error', retryable: true });
  }, 60_000);

  it('ranks_with_the_owners_pronunciation_focus', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    focus.focus = {
      source: 'test-ledger@1',
      tags: ['phoneme:/θ/'],
      matchesWord: (token) => token === 'think' || token === 'through',
    };
    const plain = said(1, 0.8, 9);
    const twoTargets = said(8, 0.8, 4, 'I think we should go through the numbers once more');
    const oneTarget = said(15, 0.8, 4, 'I think we should look at the numbers once more');
    const lesson = await makeTranscribedLesson(pipeline, [{ speaker: ana, utterances: [plain, twoTargets, oneTarget] }]);
    const branchId = lesson.branches.get(ana.id)!;

    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    const excerpts = await pipeline.ctx.prisma.lessonExcerpt.findMany({ where: { userId: ana.id }, orderBy: { rank: 'asc' } });
    expect(excerpts.map((excerpt) => [excerpt.referenceText, excerpt.focusWordCount])).toEqual([
      [twoTargets.text, 2],
      [oneTarget.text, 1],
      [plain.text, 0],
    ]);
    expect(excerpts[0]!.reason).toBe(
      "Selected: recognition confidence 0.80, 10 words, 2 words with sounds you're practicing",
    );
    expect(focus.asked).toEqual([ana.id]);
    const selection = await pipeline.ctx.prisma.lessonExcerptSelection.findFirstOrThrow({ where: { userId: ana.id } });
    expect(selection).toMatchObject({ focusSource: 'test-ledger@1', focusTags: ['phoneme:/θ/'] });
  }, 60_000);

  it('drains_branches_already_waiting_at_excerpt_selection', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeTranscribedLesson(pipeline, [{ speaker: ana, utterances: [said(1, 0.8), said(8, 0.7)] }]);
    const branchId = lesson.branches.get(ana.id)!;
    expect(await queue().getJob(pipelineJobId('excerpt_selection', branchId, 1))).toBeUndefined();

    await pipeline.ctx.app.get(PipelineDrainJob).run();

    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);
    expect(await pipeline.ctx.prisma.lessonExcerpt.count({ where: { userId: ana.id } })).toBe(2);
  }, 60_000);

  it('the_reader_returns_exactly_the_stored_excerpts', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const lesson = await makeTranscribedLesson(pipeline, [
      { speaker: ana, utterances: [said(1, 0.8), said(8, 0.55), said(15, 0.6), said(22, 0.9), backchannel(23)] },
      // Not waiting at selection, so the app's own drain cannot select it mid-test.
      { speaker: bruno, failedAtTranscription: true },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    const reader = pipeline.ctx.app.get(ExcerptSelectionReader);
    const read = await reader.forParticipant(lesson.lessonId, ana.id);
    const stored = await pipeline.ctx.prisma.lessonExcerpt.findMany({ where: { userId: ana.id }, orderBy: { rank: 'asc' } });

    expect(read!.selection).toMatchObject({
      ruleVersion: '1',
      focusSource: 'none',
      focusTags: [],
      utteranceCount: 5,
      eligibleCount: 4,
      selectedCount: 4,
      sparsePronunciationSample: false,
    });
    expect(read!.excerpts.map((excerpt) => [excerpt.id, excerpt.rank, excerpt.startMs, excerpt.endMs, excerpt.referenceText])).toEqual(
      stored.map((row) => [row.id, row.rank, row.startMs, row.endMs, row.referenceText]),
    );
    expect(read!.excerpts.map((excerpt) => excerpt.confidence)).toEqual([
      expect.closeTo(0.55, 5),
      expect.closeTo(0.6, 5),
      expect.closeTo(0.8, 5),
      expect.closeTo(0.9, 5),
    ]);
    // Bruno's branch never reached selection.
    expect(await reader.forParticipant(lesson.lessonId, bruno.id)).toBeNull();
  }, 60_000);
});
