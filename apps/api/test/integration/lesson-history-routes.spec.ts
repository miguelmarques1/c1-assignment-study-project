import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/genai', async () => (await import('./helpers/fake-gemini')).fakeGeminiModule);

import { PasswordService } from '../../src/auth/password.service';
import { headlineText, type LessonDeltas } from '../../src/lessons/lesson-headline';
import { audioObjectKey } from '../../src/recording/recording.constants';
import { gemini } from './helpers/fake-gemini';
import type { FakePhrase } from './helpers/fake-speech';
import {
  analysisOf,
  defaultSituation,
  makeHistoryLesson,
  markedCard,
  type HistoryLessonOptions,
  type HistoryParticipant,
} from './helpers/history-fixtures';
import {
  createPipelineTestContext,
  launchAll,
  makeRecordedLesson,
  resetPipelineTables,
  seedSpeaker,
  waitForStage,
  type PipelineTestContext,
  type SeedUtterance,
  type Speaker,
} from './helpers/pipeline-fixtures';

let pipeline: PipelineTestContext;

beforeAll(async () => {
  pipeline = await createPipelineTestContext();
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  gemini.reset();
  pipeline.speech.reset();
  pipeline.pronunciation.reset();
  await resetPipelineTables(pipeline.ctx);
});

function http() {
  return request(pipeline.ctx.app.getHttpServer());
}

function list(speaker: Speaker, query = '') {
  return http().get(`/lessons${query}`).set('Cookie', speaker.cookie);
}

function detail(lessonId: string, speaker: Speaker) {
  return http().get(`/lessons/${lessonId}`).set('Cookie', speaker.cookie);
}

interface Row {
  lessonId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  participants: Array<{ userId: string; displayName: string; isMe: boolean }>;
  scenarioTitle: string | null;
  vocabularyDomain: string | null;
  status: string;
  flags: string[];
  activeStage: string | null;
  statusReason: string | null;
  headline: string | null;
  storageBytes: number;
}

async function allRows(speaker: Speaker): Promise<Row[]> {
  const response = await list(speaker, '?limit=50');
  expect(response.status).toBe(200);
  return response.body.data.lessons as Row[];
}

function rowOf(rows: Row[], lessonId: string): Row {
  const row = rows.find((candidate) => candidate.lessonId === lessonId);
  expect(row, `lesson ${lessonId} is listed`).toBeDefined();
  return row!;
}

function said(text: string, startMs: number, confidence = 0.8): SeedUtterance {
  return { startMs, endMs: startMs + 5_000, text, confidence };
}

/** A full, ready participant: transcript, two assessed excerpts, a pronunciation result and an analysis. */
function readyParticipant(speaker: Speaker, marker: string, pronunciation = 72.4): HistoryParticipant {
  return {
    speaker,
    branch: 'ready',
    utterances: [said(`If I would have known ${marker} I would have booked earlier.`, 5_000), said(`We should postpone the budget ${marker} meeting.`, 20_000)],
    excerpts: [
      {
        utterance: 0,
        scores: { pronunciation: 71, accuracy: 74.5, fluency: 70.2, prosody: 66.8, completeness: 100 },
        words: [
          { word: 'known', accuracy: 54.2, errorTypes: ['Mispronunciation'] },
          { word: 'booked', accuracy: 91 },
        ],
      },
      {
        utterance: 1,
        scores: { pronunciation: 80, accuracy: 82, fluency: 78, prosody: null, completeness: 100 },
        words: [{ word: 'postpone', accuracy: 71.4 }],
      },
    ],
    pronunciation: { pronunciation },
    analysis: analysisOf(
      { grammar: 60, vocabulary: 70, fluency: 70, interaction: 70, comprehension: 70 },
      {
        justification: `Justification ${marker}`,
        errors: [
          {
            quote: `If I would have known ${marker}`,
            correction: `If I had known ${marker}`,
            explanation: `Explanation ${marker}`,
            severity: 'major',
            tag: 'grammar:conditional-3',
            utterance: 0,
          },
        ],
      },
    ),
  };
}

describe('GET /lessons', () => {
  it('lists_every_lesson_newest_first_with_its_fields', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(
        await makeHistoryLesson(pipeline.ctx, {
          participants: [
            { speaker: ana, branch: { stage: 'transcription', status: 'running' } },
            { speaker: bruno, branch: { stage: 'transcription', status: 'running' } },
          ],
          scenario: i % 2 === 0 ? defaultSituation(`lesson ${i}`) : { status: 'no_scenario' },
          durationSeconds: 1_800 + i,
        }),
      );
    }

    const rows = await allRows(ana);
    expect(rows.map((row) => row.lessonId)).toEqual(created.map((lesson) => lesson.lessonId).reverse());
    const starts = rows.map((row) => Date.parse(row.startedAt));
    expect([...starts].sort((a, b) => b - a)).toEqual(starts);

    const newest = rows[0]!;
    expect(newest).toMatchObject({
      startedAt: created[4]!.startedAt!.toISOString(),
      durationSeconds: 1_804,
      vocabularyDomain: 'travel',
      scenarioTitle: 'The missed connection (lesson 4)',
      status: 'processing',
      activeStage: 'transcription',
    });
    expect(Date.parse(newest.endedAt!)).toBeGreaterThan(Date.parse(newest.startedAt));
    expect(newest.participants).toEqual([
      { userId: ana.id, displayName: 'Ana', isMe: true },
      { userId: bruno.id, displayName: 'Bruno', isMe: false },
    ]);
    expect(rows[1]).toMatchObject({ vocabularyDomain: null, scenarioTitle: null, flags: ['no_scenario'] });
  }, 60_000);

  it('excludes_open_and_abandoned_lessons', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const ended = await makeHistoryLesson(pipeline.ctx, { participants: [{ speaker: ana, branch: 'ready' }] });
    const hidden = [];
    for (const lessonStatus of ['waiting', 'live', 'abandoned'] as const) {
      hidden.push(await makeHistoryLesson(pipeline.ctx, { participants: [{ speaker: ana, branch: null }], lessonStatus }));
    }

    const rows = await allRows(ana);
    expect(rows.map((row) => row.lessonId)).toEqual([ended.lessonId]);
    for (const lesson of hidden) {
      const response = await detail(lesson.lessonId, ana);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CLASS004');
    }
  }, 60_000);

  it('pages_through_history_with_a_cursor', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    for (let i = 0; i < 25; i++) {
      await makeHistoryLesson(pipeline.ctx, { participants: [{ speaker: ana, branch: { stage: 'transcription', status: 'queued' } }] });
    }
    const expected = (await allRows(ana)).map((row) => row.lessonId);
    expect(expected).toHaveLength(25);

    const first = (await list(ana, '?limit=10')).body.data;
    expect(first.lessons).toHaveLength(10);
    expect(first.nextCursor).toEqual(expect.any(String));

    // A lesson ending while someone pages is newer than every cursor, so it never shifts a page.
    await makeHistoryLesson(pipeline.ctx, { participants: [{ speaker: ana, branch: 'ready' }] });

    const second = (await list(ana, `?limit=10&cursor=${first.nextCursor}`)).body.data;
    expect(second.lessons).toHaveLength(10);
    const third = (await list(ana, `?limit=10&cursor=${second.nextCursor}`)).body.data;
    expect(third.lessons).toHaveLength(5);
    expect(third.nextCursor).toBeNull();

    const paged = [...first.lessons, ...second.lessons, ...third.lessons].map((row: Row) => row.lessonId);
    expect(paged).toEqual(expected);
    expect(new Set(paged).size).toBe(25);

    // The default page size is 20.
    expect((await list(ana)).body.data.lessons).toHaveLength(20);
  }, 120_000);

  it('rejects_a_bad_cursor_and_limit', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const garbage = Buffer.from(JSON.stringify({ s: 'yesterday', i: 'x' })).toString('base64url');
    for (const query of ['?cursor=not-a-cursor', `?cursor=${garbage}`, `?cursor=${'a'.repeat(201)}`, '?limit=0', '?limit=51', '?limit=ten']) {
      const response = await list(ana, query);
      expect(response.status, query).toBe(400);
      expect(response.body.error.code).toBe('VAL001');
    }
  }, 60_000);

  it('derives_each_status_and_flag_end_to_end', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const make = (participant: Omit<HistoryParticipant, 'speaker'>, extra: Partial<HistoryLessonOptions> = {}) =>
      makeHistoryLesson(pipeline.ctx, {
        participants: [{ speaker: ana, ...participant }],
        scenario: defaultSituation(),
        ...extra,
      });

    const processing = await make({ branch: { stage: 'excerpt_selection', status: 'queued' } });
    const ready = await make({ ...readyParticipant(ana, 'r') });
    const blocked = await make({
      branch: {
        stage: 'lesson_analysis',
        status: 'blocked_missing_key',
        reason: 'Blocked — add your Gemini key to analyze this lesson.',
        blockedProvider: 'gemini',
      },
    });
    const failed = await make({
      branch: {
        stage: 'pronunciation_assessment',
        status: 'failed',
        reasonCode: 'pronunciation_audio_unprocessable',
        reason: 'Audio could not be processed for assessment.',
      },
    });
    const tooShort = await make({ branch: null }, { recordingStatus: 'too_short' });
    const recordingFailed = await make({ branch: null }, { recordingStatus: 'recording_failed' });
    const partial = await make({ ...readyParticipant(ana, 'p') }, { recordingStatus: 'recording_partial' });
    const noScenario = await make({ branch: { stage: 'lesson_analysis', status: 'blocked_missing_key', blockedProvider: 'gemini' } }, { scenario: { status: 'no_scenario' } });
    const unexpected = await make({ ...readyParticipant(ana, 'u') }, { lessonStatus: 'ended_unexpectedly', scenario: null });

    const rows = await allRows(ana);
    expect(rowOf(rows, processing.lessonId)).toMatchObject({ status: 'processing', flags: [], activeStage: 'excerpt_selection', statusReason: null, headline: null });
    expect(rowOf(rows, ready.lessonId)).toMatchObject({ status: 'ready', flags: [], activeStage: null, statusReason: null, headline: expect.any(String) });
    expect(rowOf(rows, blocked.lessonId)).toMatchObject({
      status: 'blocked',
      activeStage: 'lesson_analysis',
      statusReason: 'Blocked — add your Gemini key to analyze this lesson.',
      headline: null,
    });
    expect(rowOf(rows, failed.lessonId)).toMatchObject({
      status: 'failed',
      activeStage: 'pronunciation_assessment',
      statusReason: 'Audio could not be processed for assessment.',
    });
    expect(rowOf(rows, tooShort.lessonId)).toMatchObject({ status: 'too_short', activeStage: null });
    expect(rowOf(rows, recordingFailed.lessonId)).toMatchObject({
      status: 'recording_failed',
      statusReason: 'This lesson was not recorded, so it could not be analyzed.',
    });
    expect(rowOf(rows, partial.lessonId)).toMatchObject({ status: 'ready', flags: ['partial'] });
    expect(rowOf(rows, noScenario.lessonId)).toMatchObject({ status: 'blocked', flags: ['no_scenario'] });
    expect(rowOf(rows, unexpected.lessonId)).toMatchObject({ status: 'ready', flags: ['no_scenario', 'ended_unexpectedly'] });
  }, 90_000);

  it('a_processing_row_names_its_active_stage', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [{ speaker: ana, branch: { stage: 'pronunciation_assessment', status: 'running', progress: { done: 4, total: 12 } } }],
    });
    expect(rowOf(await allRows(ana), lesson.lessonId)).toMatchObject({
      status: 'processing',
      activeStage: 'pronunciation_assessment',
      statusReason: null,
      headline: null,
    });
  }, 60_000);

  it('a_blocked_row_carries_its_fix_inline', async () => {
    // The real pipeline, so the sentence is F08's own rather than a fixture's.
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withKey: false });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['blocked_missing_key']);

    expect(rowOf(await allRows(ana), lesson.lessonId)).toMatchObject({
      status: 'blocked',
      activeStage: 'transcription',
      statusReason: 'Blocked — add your Azure Speech key to continue.',
    });
  }, 60_000);

  it('a_too_short_lesson_reads_its_reason', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [{ speaker: ana, branch: null }],
      recordingStatus: 'too_short',
      durationSeconds: 95,
    });
    expect(rowOf(await allRows(ana), lesson.lessonId)).toMatchObject({
      status: 'too_short',
      statusReason: 'Too short to analyze (minimum 3 minutes)',
      durationSeconds: 95,
    });
  }, 60_000);

  it('the_list_headline_matches_the_detail_deltas', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const base = readyParticipant(ana, 'h');
    const lessons = [
      await makeHistoryLesson(pipeline.ctx, { participants: [{ ...base, pronunciation: { pronunciation: 72.4 } }] }),
      await makeHistoryLesson(pipeline.ctx, {
        participants: [
          {
            ...base,
            excerpts: [],
            pronunciation: 'no_sample',
            analysis: analysisOf({ grammar: 64, vocabulary: 68, fluency: 70, interaction: 70, comprehension: 70 }),
          },
        ],
      }),
      await makeHistoryLesson(pipeline.ctx, {
        participants: [
          {
            ...base,
            pronunciation: { pronunciation: 69.6 },
            analysis: analysisOf({ grammar: 61, vocabulary: 68, fluency: 75, interaction: 70, comprehension: 70 }),
          },
        ],
      }),
    ];

    const rows = await allRows(ana);
    const headlines = [];
    for (const lesson of lessons) {
      const analysis = (await http().get(`/lessons/${lesson.lessonId}/analysis`).set('Cookie', ana.cookie)).body.data.analysis;
      const pronunciation = (await http().get(`/lessons/${lesson.lessonId}/pronunciation`).set('Cookie', ana.cookie)).body.data;
      const deltas = Object.fromEntries(
        (analysis.competencies as Array<{ competency: string; delta: number | null }>).map((c) => [c.competency, c.delta]),
      ) as LessonDeltas;
      deltas.pronunciation = pronunciation.result?.overall.delta ?? null;

      const row = rowOf(rows, lesson.lessonId);
      // The list's sentence is built from exactly the numbers the detail routes show.
      expect(row.headline).toBe(headlineText(deltas));
      expect((await detail(lesson.lessonId, ana)).body.data.headline).toBe(row.headline);
      headlines.push(row.headline);
    }
    expect(headlines).toEqual([
      'Your first result',
      'Grammar +4 · Vocabulary −2',
      'Fluency +5 · Grammar −3',
    ]);
  }, 90_000);

  it('the_list_domain_is_the_situations_domain', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const ready = await makeHistoryLesson(pipeline.ctx, {
      participants: [{ speaker: ana, branch: 'ready' }],
      scenario: { ...defaultSituation(), vocabularyDomain: 'healthcare' },
    });
    const failed = await makeHistoryLesson(pipeline.ctx, {
      participants: [{ speaker: ana, branch: 'ready' }],
      scenario: { status: 'failed', vocabularyDomain: 'travel' },
    });
    const noScenario = await makeHistoryLesson(pipeline.ctx, {
      participants: [{ speaker: ana, branch: 'ready' }],
      scenario: { status: 'no_scenario' },
    });
    const noRow = await makeHistoryLesson(pipeline.ctx, { participants: [{ speaker: ana, branch: 'ready' }], scenario: null });

    const rows = await allRows(ana);
    const stored = await pipeline.ctx.prisma.lessonScenario.findUniqueOrThrow({ where: { lessonId: ready.lessonId } });
    expect(rowOf(rows, ready.lessonId).vocabularyDomain).toBe(stored.vocabularyDomain);
    expect(rowOf(rows, ready.lessonId).vocabularyDomain).toBe('healthcare');
    for (const lesson of [failed, noScenario, noRow]) {
      expect(rowOf(rows, lesson.lessonId).vocabularyDomain).toBeNull();
    }
  }, 60_000);

  it('reports_storage_per_lesson_and_in_total', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const carla = await seedSpeaker(pipeline.ctx, 'Carla');
    const both = await makeHistoryLesson(pipeline.ctx, {
      participants: [
        { speaker: ana, branch: 'ready', audioBytes: 150_000 },
        { speaker: bruno, branch: 'ready', audioBytes: 250_000 },
      ],
    });
    const oneMissing = await makeHistoryLesson(pipeline.ctx, {
      participants: [
        { speaker: ana, branch: 'ready', audioBytes: 300_000 },
        { speaker: bruno, branch: null, audioBytes: null },
      ],
      recordingStatus: 'recording_partial',
    });
    // Not Ana's lesson, and not in anyone's history yet: neither counts toward her total.
    await makeHistoryLesson(pipeline.ctx, { participants: [{ speaker: bruno, branch: 'ready', audioBytes: 999_999 }, { speaker: carla, branch: 'ready' }] });
    await makeHistoryLesson(pipeline.ctx, { participants: [{ speaker: ana, branch: null, audioBytes: 777_777 }], lessonStatus: 'live' });

    const page = (await list(ana, '?limit=1')).body.data;
    expect(page.lessons).toHaveLength(1);
    expect(page.totalStorageBytes).toBe(700_000);
    const rows = await allRows(ana);
    expect(rowOf(rows, both.lessonId).storageBytes).toBe(400_000);
    expect(rowOf(rows, oneMissing.lessonId).storageBytes).toBe(300_000);
  }, 60_000);

  it('a_blocked_participant_does_not_change_the_others_status', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [
        readyParticipant(ana, 'a'),
        { speaker: bruno, branch: { stage: 'transcription', status: 'blocked_missing_key', reason: 'Blocked — add your Azure Speech key to continue.' } },
      ],
    });

    expect(rowOf(await allRows(ana), lesson.lessonId)).toMatchObject({ status: 'ready', statusReason: null });
    expect(rowOf(await allRows(bruno), lesson.lessonId)).toMatchObject({
      status: 'blocked',
      activeStage: 'transcription',
      statusReason: 'Blocked — add your Azure Speech key to continue.',
    });
  }, 60_000);

  it('a_directly_inserted_user_sees_their_own_history', async () => {
    const password = 'a perfectly fine password';
    await pipeline.ctx.prisma.$executeRaw`
      INSERT INTO users (email, display_name, password_hash)
      VALUES (${'direct@example.com'}, ${'Direct'}, ${await new PasswordService().hash(password)})
    `;
    const user = await pipeline.ctx.prisma.user.findUniqueOrThrow({ where: { email: 'direct@example.com' } });
    const login = await http().post('/auth/login').send({ email: 'direct@example.com', password });
    const direct: Speaker = {
      id: user.id,
      displayName: 'Direct',
      cookie: (login.headers['set-cookie'] as unknown as string[])[0]!,
      azureKey: null,
      region: 'eastus2',
      geminiKey: null,
    };
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [
        { speaker: ana, branch: 'ready' },
        { speaker: direct, branch: { stage: 'transcription', status: 'blocked_missing_key', reason: 'Blocked — add your Azure Speech key to continue.' } },
      ],
    });

    const rows = await allRows(direct);
    expect(rows).toHaveLength(1);
    expect(rowOf(rows, lesson.lessonId)).toMatchObject({ status: 'blocked', activeStage: 'transcription' });
  }, 60_000);
});

describe('GET /lessons/:lessonId', () => {
  it('detail_lists_every_other_participants_stages_coarsely', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [
        readyParticipant(ana, 'a'),
        {
          speaker: bruno,
          branch: {
            stage: 'transcription',
            status: 'blocked_missing_key',
            reason: 'BRUNO-REASON-MARKER',
            providerMessage: 'BRUNO-PROVIDER-MARKER',
          },
        },
      ],
      scenario: defaultSituation(),
      cards: [markedCard(ana.id, 'ANA-CARD'), { ...markedCard(bruno.id, 'BRUNO-CARD', 'Airline agent'), status: 'failed' }],
    });

    const response = await detail(lesson.lessonId, ana);
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data).toMatchObject({ lessonId: lesson.lessonId, status: 'ready', scenario: { status: 'ready', myCardStatus: 'ready' } });
    expect(data.others).toHaveLength(1);
    const other = data.others[0];
    expect(other).toMatchObject({ userId: bruno.id, displayName: 'Bruno' });
    expect(other.stages.map((stage: { stage: string; state: string }) => [stage.stage, stage.state])).toEqual([
      ['recording', 'completed'],
      ['transcription', 'pending'],
      ['excerpt_selection', 'not_started'],
      ['pronunciation_assessment', 'not_started'],
      ['lesson_analysis', 'not_started'],
      ['profile_update', 'not_started'],
      ['plan_generation', 'not_started'],
    ]);
    for (const stage of other.stages) {
      expect(Object.keys(stage).sort()).toEqual(['finishedAt', 'stage', 'startedAt', 'state']);
    }
    const body = JSON.stringify(response.body);
    for (const marker of ['BRUNO-REASON-MARKER', 'BRUNO-PROVIDER-MARKER', 'BRUNO-CARD', 'retryable', 'blockedProvider', 'providerMessage']) {
      expect(body).not.toContain(marker);
    }

    // Bruno's own view carries his card's status, and Ana's stages coarsely.
    const asBruno = (await detail(lesson.lessonId, bruno)).body.data;
    expect(asBruno).toMatchObject({ status: 'blocked', scenario: { myCardStatus: 'failed' } });
    // Ana's branch is ready: analysed, and waiting from profile_update on.
    expect(
      asBruno.others[0].stages.every(
        (stage: { stage: string; state: string }) =>
          stage.state === 'completed' || stage.stage === 'profile_update' || stage.stage === 'plan_generation',
      ),
    ).toBe(true);
    expect(JSON.stringify(asBruno)).not.toContain('ANA-CARD');
  }, 60_000);

  it('a_third_participant_sees_two_others', async () => {
    const speakers = [
      await seedSpeaker(pipeline.ctx, 'Ana'),
      await seedSpeaker(pipeline.ctx, 'Bruno'),
      await seedSpeaker(pipeline.ctx, 'Carla'),
    ];
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [
        { speaker: speakers[0]!, branch: 'ready' },
        { speaker: speakers[1]!, branch: { stage: 'lesson_analysis', status: 'failed' } },
        { speaker: speakers[2]!, branch: { stage: 'transcription', status: 'running' } },
      ],
    });
    const expectedStatus = ['ready', 'failed', 'processing'];

    for (const [index, speaker] of speakers.entries()) {
      const data = (await detail(lesson.lessonId, speaker)).body.data;
      expect(data.status).toBe(expectedStatus[index]);
      expect(data.others.map((other: { userId: string }) => other.userId)).toEqual(
        speakers.filter((s) => s !== speaker).map((s) => s.id),
      );
      expect(data.participants).toHaveLength(3);
    }
  }, 60_000);

  it('retry_reruns_the_failed_stage_and_downstream_reusing_upstream', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const text = (n: number) => `By minute ${n} we should have moved the whole meeting`;
    const phrase = (n: number, offsetMs: number, confidence: number): FakePhrase => ({
      offsetMs,
      durationMs: 5_000,
      text: text(n),
      confidence,
      words: text(n)
        .split(' ')
        .map((word, i) => ({ text: word, offsetMs: offsetMs + i * 450, durationMs: 400 })),
    });
    pipeline.speech.script(ana.azureKey!, { kind: 'ok', phrases: [phrase(1, 2_000, 0.83), phrase(2, 15_000, 0.62)] });
    gemini.scriptAnalysis(ana.geminiKey!, { kind: 'invalid' }, { kind: 'invalid' });

    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana, audioSeconds: 30 }]);
    const branchId = lesson.branches.get(ana.id)!;
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['failed'], 60_000);

    const before = await pipeline.ctx.prisma.lessonPipelineStage.findMany({ where: { branchId } });
    const runOf = (rows: typeof before, stage: string) => rows.find((row) => row.stage === stage)!.run;
    const speechCalls = pipeline.speech.callsFor(ana.azureKey!).length;
    const pronunciationCalls = pipeline.pronunciation.callsFor(ana.azureKey!).length;
    expect(speechCalls).toBe(1);
    expect(pronunciationCalls).toBeGreaterThan(0);
    expect(rowOf(await allRows(ana), lesson.lessonId)).toMatchObject({ status: 'failed', activeStage: 'lesson_analysis' });

    gemini.analysisScripts.delete(ana.geminiKey!);
    const retried = await http().post(`/lessons/${lesson.lessonId}/pipeline/retry`).set('Cookie', ana.cookie);
    expect(retried.status).toBe(202);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['completed'], 60_000);
    // F12's profile_update handler runs at once; the branch then rests at plan_generation.
    await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);

    const after = await pipeline.ctx.prisma.lessonPipelineStage.findMany({ where: { branchId } });
    expect(runOf(after, 'lesson_analysis')).toBe(runOf(before, 'lesson_analysis') + 1);
    for (const stage of ['transcription', 'excerpt_selection', 'pronunciation_assessment']) {
      expect(runOf(after, stage), stage).toBe(runOf(before, stage));
    }
    // A failed analysis never re-pays for transcription or assessment.
    expect(pipeline.speech.callsFor(ana.azureKey!)).toHaveLength(speechCalls);
    expect(pipeline.pronunciation.callsFor(ana.azureKey!)).toHaveLength(pronunciationCalls);
    expect(rowOf(await allRows(ana), lesson.lessonId)).toMatchObject({ status: 'ready', headline: 'Your first result' });
  }, 120_000);

  it('one_lesson_detail_reads_consistently_across_routes', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [
        readyParticipant(ana, 'a'),
        { speaker: bruno, branch: 'ready', utterances: [said('Bruno answers the question.', 10_000)] },
      ],
      scenario: defaultSituation(),
      cards: [markedCard(ana.id, 'ANA-CARD'), markedCard(bruno.id, 'BRUNO-CARD', 'Airline agent')],
    });
    const read = async (suffix: string) => {
      const response = await http().get(`/lessons/${lesson.lessonId}${suffix}`).set('Cookie', ana.cookie);
      expect(response.status, suffix).toBe(200);
      return response.body.data;
    };
    const [summary, scenario, transcript, pronunciation, analysis] = await Promise.all([
      read(''),
      read('/scenario'),
      read('/transcript'),
      read('/pronunciation'),
      read('/analysis'),
    ]);

    for (const view of [summary, scenario, transcript, pronunciation, analysis]) {
      expect(view.lessonId).toBe(lesson.lessonId);
    }
    expect(summary.status).toBe('ready');
    expect(analysis.status).toBe('ready');
    expect(summary.vocabularyDomain).toBe(scenario.situation.vocabularyDomain);
    expect(summary.scenarioTitle).toBe(scenario.situation.title);
    expect(scenario.myCard.background).toBe('Background ANA-CARD');

    // Every badge carries exactly the pronunciation section's scores for that excerpt.
    const badges = new Map(
      (transcript.utterances as Array<{ id: string; excerpt?: { pronunciation: unknown } }>)
        .filter((utterance) => utterance.excerpt)
        .map((utterance) => [utterance.id, utterance.excerpt!.pronunciation]),
    );
    expect(badges.size).toBe(2);
    for (const excerpt of pronunciation.excerpts as Array<{ utteranceId: string; pronunciation: unknown }>) {
      expect(badges.get(excerpt.utteranceId)).toEqual(excerpt.pronunciation);
    }
    // Every error's utterance is one of the caller's own transcript lines.
    const own = new Set(
      (transcript.utterances as Array<{ id: string; userId: string }>).filter((u) => u.userId === ana.id).map((u) => u.id),
    );
    for (const error of analysis.analysis.errors as Array<{ utteranceId: string }>) {
      expect(own.has(error.utteranceId)).toBe(true);
    }
    expect(pronunciation.result.overall).toEqual({ score: 72, delta: null });
  }, 60_000);

  it('no_lesson_route_exposes_an_audio_object', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [readyParticipant(ana, 'a'), readyParticipant(bruno, 'b')],
      scenario: defaultSituation(),
      cards: [markedCard(ana.id, 'A'), markedCard(bruno.id, 'B')],
    });
    const document = JSON.parse(await readFile(resolve(__dirname, '../../../../docs/api/openapi.json'), 'utf8')) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const getPaths = Object.entries(document.paths)
      .filter(([path, item]) => path.startsWith('/lessons') && 'get' in item)
      .map(([path]) => path);
    expect(getPaths).toEqual(
      expect.arrayContaining(['/lessons', '/lessons/{lessonId}', '/lessons/{lessonId}/scenario', '/lessons/{lessonId}/transcript']),
    );

    for (const path of getPaths) {
      const response = await http().get(path.replace('{lessonId}', lesson.lessonId)).set('Cookie', ana.cookie);
      expect(response.status, path).toBe(200);
      const body = JSON.stringify(response.body);
      for (const forbidden of [
        'audio.ogg',
        audioObjectKey(lesson.lessonId, ana.id),
        audioObjectKey(lesson.lessonId, bruno.id),
        'X-Amz-',
        'objectKey',
        'presigned',
      ]) {
        expect(body, `${path} carries ${forbidden}`).not.toContain(forbidden);
      }
    }
  }, 60_000);

  it('rejects_a_non_participant_and_requires_a_session', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const outsider = await seedSpeaker(pipeline.ctx, 'Outsider');
    const lesson = await makeHistoryLesson(pipeline.ctx, { participants: [{ speaker: ana, branch: 'ready' }] });

    for (const lessonId of [lesson.lessonId, '00000000-0000-4000-8000-000000000000']) {
      const response = await detail(lessonId, outsider);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CLASS004');
    }
    expect((await list(outsider)).body.data).toEqual({ lessons: [], nextCursor: null, totalStorageBytes: 0 });

    const malformed = await http().get('/lessons/not-a-uuid').set('Cookie', ana.cookie);
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VAL001');

    for (const path of ['/lessons', `/lessons/${lesson.lessonId}`]) {
      const response = await http().get(path);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH003');
    }
  }, 60_000);
});
