import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { audioObjectKey } from '../../src/recording/recording.constants';
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
  type Speaker,
} from './helpers/pipeline-fixtures';

let pipeline: PipelineTestContext;

interface Utterance {
  id: string;
  userId: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number | null;
  words?: Array<{ text: string; startMs: number; durationMs: number; confidence: number | null }>;
  excerpt?: Record<string, unknown>;
}

const MINUTE = 60_000;

/** An utterance every version-1 rule accepts, at `minute` of its speaker's file. */
function said(minute: number, confidence: number): SeedUtterance {
  const text = `By minute ${minute} we should have moved the whole meeting`;
  return { startMs: minute * MINUTE, endMs: minute * MINUTE + 5_000, text, confidence };
}

/** Ana and Bruno each transcribed and selected; Ana also said one turn too short to select. */
async function selectedLesson() {
  const ana = await seedSpeaker(pipeline.ctx, 'Ana');
  const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
  const lesson = await makeTranscribedLesson(pipeline, [
    {
      speaker: ana,
      utterances: [
        said(1, 0.83),
        said(8, 0.62),
        { startMs: 9 * MINUTE, endMs: 9 * MINUTE + 1_000, text: 'Yeah, right.', confidence: 0.9 },
      ],
    },
    { speaker: bruno, utterances: [said(2, 0.7), said(9, 0.5), said(16, 0.8), said(23, 0.6)] },
  ]);
  for (const speaker of [ana, bruno]) {
    await startSelection(pipeline, lesson.branches.get(speaker.id)!);
    await waitForStage(pipeline.ctx, lesson.branches.get(speaker.id)!, 'excerpt_selection', ['completed']);
  }
  return { ana, bruno, lesson };
}

function readTranscript(lessonId: string, speaker: Speaker) {
  return request(pipeline.ctx.app.getHttpServer()).get(`/lessons/${lessonId}/transcript`).set('Cookie', speaker.cookie);
}

beforeAll(async () => {
  pipeline = await createPipelineTestContext();
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  pipeline.speech.reset();
  pipeline.pronunciation.reset();
  await resetPipelineTables(pipeline.ctx);
});

/** Ana starts recording with the lesson, Bruno 40 seconds in; their speech interleaves in lesson time. */
async function interleavedLesson() {
  const ana = await seedSpeaker(pipeline.ctx, 'Ana');
  const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
  pipeline.speech.script(ana.azureKey!, {
    kind: 'ok',
    phrases: [
      { offsetMs: 30_000, durationMs: 4_000, text: 'Ana speaks first.', confidence: 0.9, words: [{ text: 'Ana', offsetMs: 30_000, durationMs: 400 }] },
      { offsetMs: 50_000, durationMs: 3_000, text: 'Ana answers.', confidence: 0.7, words: [{ text: 'Ana', offsetMs: 50_000, durationMs: 300 }] },
    ],
  });
  pipeline.speech.script(bruno.azureKey!, {
    kind: 'ok',
    phrases: [{ offsetMs: 2_000, durationMs: 5_000, text: 'Bruno replies.', confidence: 0.8, words: [{ text: 'Bruno', offsetMs: 2_000, durationMs: 500 }] }],
  });
  const lesson = await makeRecordedLesson(pipeline, [
    { speaker: ana, recordingOffsetMs: 0 },
    { speaker: bruno, recordingOffsetMs: 40_000 },
  ]);
  await launchAll(pipeline, lesson);
  await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);
  await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['completed']);
  return { ana, bruno, lesson };
}

describe('GET /lessons/:lessonId/transcript', () => {
  it('merges_all_participants_chronologically_by_wall_clock', async () => {
    const { ana, bruno, lesson } = await interleavedLesson();

    const response = await readTranscript(lesson.lessonId, ana);

    expect(response.status).toBe(200);
    const utterances = response.body.data.utterances as Utterance[];
    expect(utterances.map((utterance) => [utterance.text, utterance.userId, utterance.startMs, utterance.endMs])).toEqual([
      ['Ana speaks first.', ana.id, 30_000, 34_000],
      // Bruno's file starts 40 s into the lesson: offset 2 s becomes 42 s.
      ['Bruno replies.', bruno.id, 42_000, 47_000],
      ['Ana answers.', ana.id, 50_000, 53_000],
    ]);
    expect(response.body.data.lessonStartedAt).toBe(lesson.startedAt.toISOString());
  }, 60_000);

  it('other_participants_utterances_carry_no_confidence_or_words', async () => {
    const { ana, bruno, lesson } = await interleavedLesson();

    const asAna = (await readTranscript(lesson.lessonId, ana)).body.data.utterances as Utterance[];
    const asBruno = (await readTranscript(lesson.lessonId, bruno)).body.data.utterances as Utterance[];

    for (const utterance of asAna.filter((entry) => entry.userId === bruno.id)) {
      expect(utterance).not.toHaveProperty('confidence');
      expect(utterance).not.toHaveProperty('words');
    }
    for (const utterance of asBruno.filter((entry) => entry.userId === ana.id)) {
      expect(utterance).not.toHaveProperty('confidence');
      expect(utterance).not.toHaveProperty('words');
    }
  }, 60_000);

  it('the_callers_own_utterances_carry_confidence_and_words', async () => {
    const { bruno, lesson } = await interleavedLesson();

    const asBruno = (await readTranscript(lesson.lessonId, bruno)).body.data.utterances as Utterance[];
    const own = asBruno.find((entry) => entry.userId === bruno.id)!;

    expect(own.confidence).toBeCloseTo(0.8, 5);
    // Word timings are in lesson time too.
    expect(own.words).toEqual([{ text: 'Bruno', startMs: 42_000, durationMs: 500, confidence: null }]);
  }, 60_000);

  it('a_transcript_is_readable_before_later_stages_finish', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    await launchAll(pipeline, lesson);
    // The fake speech client's default phrases are under F09's word-count
    // floor, so nothing is selected and F10 completes at once as no_sample —
    // the branch moves one stage further, to lesson analysis, which blocks
    // at once (Ana holds no Gemini key): exactly a "later stage" still
    // pending, just not queued for it.
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'pronunciation_assessment', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'lesson_analysis', ['blocked_missing_key']);

    const response = await readTranscript(lesson.lessonId, ana);

    expect(response.status).toBe(200);
    expect(response.body.data.utterances).toHaveLength(2);
  }, 60_000);

  it('marks_the_callers_selected_utterances_with_their_excerpt', async () => {
    const { ana, lesson } = await selectedLesson();

    const view = (await readTranscript(lesson.lessonId, ana)).body.data;
    const own = (view.utterances as Utterance[]).filter((entry) => entry.userId === ana.id);
    const byText = new Map(own.map((entry) => [entry.text, entry]));

    expect(byText.get(said(8, 0.62).text)!.excerpt).toEqual({
      rank: 1,
      reason: 'Selected: recognition confidence 0.62, 10 words',
      confidence: expect.closeTo(0.62, 5),
      wordCount: 10,
      durationMs: 5_000,
      focusWordCount: 0,
      ruleVersion: '1',
      // F10 has not assessed anything yet in this suite.
      pronunciation: { status: 'pending', scores: null },
      assessedWords: null,
    });
    expect(byText.get(said(1, 0.83).text)!.excerpt).toMatchObject({ rank: 2 });
    expect(byText.get('Yeah, right.')).not.toHaveProperty('excerpt');
    expect(view.myExcerptSelection).toEqual({
      ruleVersion: '1',
      utteranceCount: 3,
      eligibleCount: 2,
      selectedCount: 2,
      selectedAudioMs: 10_000,
      sparsePronunciationSample: true,
    });
  }, 60_000);

  it('never_exposes_another_participants_excerpts_or_selection', async () => {
    const { ana, bruno, lesson } = await selectedLesson();
    const cases: Array<[Speaker, Speaker, number]> = [
      [ana, bruno, 2],
      [bruno, ana, 4],
    ];

    for (const [reader, other, ownCount] of cases) {
      const response = await readTranscript(lesson.lessonId, reader);
      const view = response.body.data;
      const utterances = view.utterances as Utterance[];
      const theirs = utterances.filter((entry) => entry.userId === other.id);
      const mine = utterances.filter((entry) => entry.userId === reader.id);

      expect(theirs.length).toBeGreaterThan(0);
      for (const entry of theirs) {
        expect(entry).not.toHaveProperty('excerpt');
      }
      expect(mine.filter((entry) => entry.excerpt)).toHaveLength(ownCount);
      expect(view.myExcerptSelection.selectedCount).toBe(ownCount);

      // Nothing of the other participant's selection anywhere in the body.
      const otherSelection = await pipeline.ctx.prisma.lessonExcerptSelection.findFirstOrThrow({
        where: { userId: other.id },
        include: { excerpts: true },
      });
      const body = JSON.stringify(response.body);
      expect(body).not.toContain(otherSelection.id);
      for (const excerpt of otherSelection.excerpts) {
        expect(body).not.toContain(excerpt.id);
      }
      expect(view.myExcerptSelection.utteranceCount).not.toBe(otherSelection.utteranceCount);
    }
  }, 60_000);

  it('own_excerpts_carry_assessed_words_with_bands', async () => {
    pipeline.pronunciation.defaultStep = {
      kind: 'ok',
      words: [
        { word: 'moved', accuracy: 54.4, errorTypes: ['Mispronunciation'] },
        { word: 'whole', accuracy: 71.2 },
        { word: 'meeting', accuracy: 92.6 },
      ],
    };
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    // Both of Ana's turns fall inside the first 30 seconds, so the uploaded audio covers them.
    const early = (startMs: number, confidence: number): SeedUtterance => ({ ...said(0, confidence), startMs, endMs: startMs + 5_000 });
    const lesson = await makeTranscribedLesson(pipeline, [
      { speaker: ana, utterances: [early(2_000, 0.83), early(15_000, 0.62)] },
      { speaker: bruno, utterances: [said(2, 0.7), said(9, 0.5)] },
    ]);
    // Only Ana's audio exists, so only her excerpts get assessed; Bruno's stay unassessed.
    await uploadAudio(pipeline.storage, audioObjectKey(lesson.lessonId, ana.id), 30);
    for (const speaker of [ana, bruno]) {
      await startSelection(pipeline, lesson.branches.get(speaker.id)!);
    }
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'pronunciation_assessment', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'pronunciation_assessment', ['failed']);

    const asAna = (await readTranscript(lesson.lessonId, ana)).body.data.utterances as Utterance[];
    const anaBadges = asAna.filter((entry) => entry.excerpt).map((entry) => entry.excerpt!);
    expect(anaBadges).toHaveLength(2);
    for (const badge of anaBadges) {
      expect(badge.pronunciation).toMatchObject({ status: 'assessed' });
      expect(badge.assessedWords).toEqual([
        { text: 'moved', accuracy: 54, errorTypes: ['Mispronunciation'], band: 'poor' },
        { text: 'whole', accuracy: 71, errorTypes: [], band: 'fair' },
        { text: 'meeting', accuracy: 93, errorTypes: [], band: 'good' },
      ]);
    }
    // Another participant's lines never carry a badge, words or not.
    for (const entry of asAna.filter((u) => u.userId === bruno.id)) {
      expect(entry).not.toHaveProperty('excerpt');
    }

    // An excerpt that was not assessed carries no words.
    const asBruno = (await readTranscript(lesson.lessonId, bruno)).body.data.utterances as Utterance[];
    const brunoBadges = asBruno.filter((entry) => entry.excerpt).map((entry) => entry.excerpt!);
    expect(brunoBadges.length).toBeGreaterThan(0);
    for (const badge of brunoBadges) {
      expect((badge.pronunciation as { status: string }).status).not.toBe('assessed');
      expect(badge.assessedWords).toBeNull();
    }
    expect(JSON.stringify(asBruno)).not.toContain('Mispronunciation');
  }, 90_000);

  it('my_excerpt_selection_is_null_until_selection_runs', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeTranscribedLesson(pipeline, [
      { speaker: ana, utterances: [said(1, 0.8), said(8, 0.7)], selectionFailed: true },
    ]);

    const view = (await readTranscript(lesson.lessonId, ana)).body.data;

    expect(view.myExcerptSelection).toBeNull();
    const own = view.utterances as Utterance[];
    expect(own).toHaveLength(2);
    for (const entry of own) {
      expect(entry).not.toHaveProperty('excerpt');
      expect(entry).toHaveProperty('confidence');
      expect(entry).toHaveProperty('words');
    }
  }, 60_000);

  it('reports_each_speakers_coarse_status', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withKey: false });
    const carla = await seedSpeaker(pipeline.ctx, 'Carla');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }, { speaker: bruno }, { speaker: carla }]);
    await pipeline.ctx.prisma.lessonPipelineBranch.update({
      where: { id: lesson.branches.get(carla.id)! },
      data: { stage: 'recording', status: 'failed', failureCode: 'recording_missing', failureReason: 'Recording is empty or missing.', launchedAt: null },
    });
    await launchAll(pipeline, { ...lesson, branches: new Map([...lesson.branches].filter(([id]) => id !== carla.id)) });
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['blocked_missing_key']);

    const response = await readTranscript(lesson.lessonId, ana);

    const speakers = response.body.data.speakers as Array<Record<string, unknown>>;
    expect(speakers).toHaveLength(3);
    expect(speakers).toEqual(
      expect.arrayContaining([
        { userId: ana.id, displayName: 'Ana', isMe: true, status: 'available' },
        { userId: bruno.id, displayName: 'Bruno', isMe: false, status: 'pending' },
        { userId: carla.id, displayName: 'Carla', isMe: false, status: 'unavailable' },
      ]),
    );
    const body = JSON.stringify(response.body);
    for (const leaked of ['credential_missing', 'recording_missing', 'Recording is empty or missing.', 'blocked', 'azure_speech']) {
      expect(body).not.toContain(leaked);
    }
  }, 60_000);

  it('rejects_a_non_participant', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const outsider = await seedSpeaker(pipeline.ctx, 'Outsider');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);

    const response = await readTranscript(lesson.lessonId, outsider);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CLASS004');
  }, 60_000);

  it('rejects_a_malformed_lesson_id', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');

    const response = await readTranscript('not-a-uuid', ana);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VAL001');
  }, 60_000);

  it('requires_authentication', async () => {
    const response = await request(pipeline.ctx.app.getHttpServer()).get(
      '/lessons/9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21/transcript',
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH003');
  }, 60_000);
});
