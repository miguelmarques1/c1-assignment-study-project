import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { headlineText, type LessonDeltas } from '../../src/lessons/lesson-headline';
import {
  analysisOf,
  defaultSituation,
  makeHistoryLesson,
  markedCard,
  type HistoryParticipant,
} from './helpers/history-fixtures';
import {
  createPipelineTestContext,
  resetPipelineTables,
  seedSpeaker,
  type PipelineTestContext,
  type Speaker,
} from './helpers/pipeline-fixtures';

let pipeline: PipelineTestContext;
let documentPaths: Record<string, Record<string, unknown>>;

beforeAll(async () => {
  pipeline = await createPipelineTestContext();
  const document = JSON.parse(await readFile(resolve(__dirname, '../../../../docs/api/openapi.json'), 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
  };
  documentPaths = document.paths;
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  await resetPipelineTables(pipeline.ctx);
});

function http() {
  return request(pipeline.ctx.app.getHttpServer());
}

/**
 * A participant whose every private datum carries `marker`: card text,
 * error quotes, corrections and explanations, justifications, strengths,
 * topics, excerpt reasons, assessed words, worst words, distinctive scores,
 * and a blocked stage's reason and provider message. None of it may ever
 * reach another participant.
 */
function privateParticipant(speaker: Speaker, marker: string, scoreSeed: number): HistoryParticipant {
  return {
    speaker,
    branch: {
      stage: 'profile_update',
      status: 'blocked_missing_key',
      reason: `Reason ${marker}`,
      providerMessage: `Provider ${marker}`,
      blockedProvider: 'gemini',
    },
    // The transcript is shared by design, so its text carries no marker.
    utterances: [
      { startMs: 5_000 + scoreSeed * 100, endMs: 10_000 + scoreSeed * 100, text: 'I would have booked earlier if I knew.', confidence: 0.8 },
      { startMs: 20_000 + scoreSeed * 100, endMs: 25_000 + scoreSeed * 100, text: 'We should postpone the meeting.', confidence: 0.7 },
    ],
    excerpts: [
      {
        utterance: 0,
        reason: `Selected ${marker}`,
        scores: {
          pronunciation: 41.11 + scoreSeed,
          accuracy: 42.17 + scoreSeed,
          fluency: 43.19 + scoreSeed,
          prosody: 44.23 + scoreSeed,
          completeness: 90.31 + scoreSeed,
        },
        words: [{ word: `word${marker}`, accuracy: 51.7, errorTypes: [`Error${marker}`] }],
      },
    ],
    pronunciation: {
      pronunciation: 55.67 + scoreSeed,
      accuracy: 56.71 + scoreSeed,
      fluency: 57.73 + scoreSeed,
      prosody: 58.79 + scoreSeed,
      completeness: 80.83 + scoreSeed,
      worstWord: `worst${marker}`,
    },
    analysis: analysisOf(
      { grammar: 60, vocabulary: 61, fluency: 62, interaction: 63, comprehension: 64 },
      {
        justification: `Justification ${marker}`,
        strengths: [`Strength one ${marker}`, `Strength two ${marker}`, `Strength three ${marker}`],
        topics: [`Topic one ${marker}`, `Topic two ${marker}`, `Topic three ${marker}`],
        errors: [
          {
            quote: `Quote ${marker}`,
            correction: `Correction ${marker}`,
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

/**
 * The other participant's stored pronunciation scores, exactly as the API
 * would serialize them — `real` columns come back as float32 values such as
 * 44.16999816894531, so searching for the literal written is meaningless.
 */
async function storedScoresOf(userId: string): Promise<string[]> {
  const [assessments, results] = await Promise.all([
    pipeline.ctx.prisma.lessonExcerptAssessment.findMany({ where: { userId } }),
    pipeline.ctx.prisma.lessonPronunciationResult.findMany({ where: { userId } }),
  ]);
  return [...assessments, ...results]
    .flatMap((row) => [row.pronunciation, row.accuracy, row.fluency, row.prosody, row.completeness])
    .filter((value): value is number => value !== null)
    .map((value) => JSON.stringify(value));
}

/** Every GET under `/lessons` the document lists, filled in for one lesson. */
function lessonGetPaths(lessonId: string): string[] {
  return Object.entries(documentPaths)
    .filter(([path, item]) => path.startsWith('/lessons') && 'get' in item)
    .map(([path]) => path.replace('{lessonId}', lessonId));
}

describe('lesson privacy', () => {
  it('no_lesson_route_returns_another_participants_private_data', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [privateParticipant(ana, 'ANAMARK', 1), privateParticipant(bruno, 'BRUNOMARK', 2)],
      scenario: defaultSituation(),
      cards: [markedCard(ana.id, 'ANAMARK', 'The Traveler'), markedCard(bruno.id, 'BRUNOMARK', 'Airline agent')],
    });
    const paths = lessonGetPaths(lesson.lessonId);
    expect(paths.length).toBeGreaterThanOrEqual(8);

    const cases: Array<[Speaker, Speaker, string]> = [
      [ana, bruno, 'BRUNOMARK'],
      [bruno, ana, 'ANAMARK'],
    ];
    for (const [reader, other, otherMarker] of cases) {
      const otherScores = await storedScoresOf(other.id);
      const ownScores = await storedScoresOf(reader.id);
      expect(otherScores).toHaveLength(10);
      let sawOwnScore = false;
      const ownMarker = otherMarker === 'BRUNOMARK' ? 'ANAMARK' : 'BRUNOMARK';
      let sawOwn = false;
      for (const path of paths) {
        const response = await http().get(path).set('Cookie', reader.cookie);
        expect(response.status, path).toBe(200);
        const body = JSON.stringify(response.body);
        expect(body, `${path} as ${reader.displayName}`).not.toContain(otherMarker);
        // The other's excerpt and lesson scores, as serialized numbers.
        for (const score of otherScores) {
          expect(body, `${path} carries ${score}`).not.toContain(score);
        }
        sawOwn ||= body.includes(ownMarker);
        sawOwnScore ||= ownScores.some((score) => body.includes(score));
      }
      // The same routes do carry the reader's own private data — the absence above is not an empty response.
      expect(sawOwn).toBe(true);
      expect(sawOwnScore).toBe(true);
    }
  }, 90_000);

  it('the_list_carries_only_the_callers_headline', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const pair = (anaGrammar: number, brunoGrammar: number): HistoryParticipant[] => [
      { speaker: ana, branch: 'ready', utterances: [{ startMs: 0, endMs: 3_000, text: 'Hello there.', confidence: 0.9 }], analysis: analysisOf({ grammar: anaGrammar, vocabulary: 70, fluency: 70, interaction: 70, comprehension: 70 }) },
      { speaker: bruno, branch: 'ready', utterances: [{ startMs: 4_000, endMs: 7_000, text: 'Hi.', confidence: 0.9 }], analysis: analysisOf({ grammar: brunoGrammar, vocabulary: 70, fluency: 70, interaction: 70, comprehension: 70 }) },
    ];
    await makeHistoryLesson(pipeline.ctx, { participants: pair(60, 30) });
    const second = await makeHistoryLesson(pipeline.ctx, { participants: pair(64, 47) });

    const analysis = (await http().get(`/lessons/${second.lessonId}/analysis`).set('Cookie', ana.cookie)).body.data.analysis;
    const deltas = Object.fromEntries(
      (analysis.competencies as Array<{ competency: string; delta: number | null }>).map((c) => [c.competency, c.delta]),
    ) as LessonDeltas;
    deltas.pronunciation = null;

    const asAna = (await http().get('/lessons').set('Cookie', ana.cookie)).body;
    expect(asAna.data.lessons[0].headline).toBe(headlineText(deltas));
    expect(asAna.data.lessons[0].headline).toBe('Grammar +4');
    expect(JSON.stringify(asAna)).not.toContain('+17');

    const asBruno = (await http().get('/lessons').set('Cookie', bruno.cookie)).body;
    expect(asBruno.data.lessons[0].headline).toBe('Grammar +17');
    expect(JSON.stringify(asBruno)).not.toContain('+4');
  }, 60_000);

  it('there_is_no_export_route', async () => {
    const lessonOperations = Object.entries(documentPaths)
      .filter(([path]) => path.startsWith('/lessons'))
      .flatMap(([path, item]) => Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`))
      .sort();

    expect(lessonOperations).toEqual(
      [
        'GET /lessons',
        'GET /lessons/{lessonId}',
        'GET /lessons/{lessonId}/scenario',
        'GET /lessons/{lessonId}/recording',
        'POST /lessons/{lessonId}/recording/retry',
        'GET /lessons/{lessonId}/pipeline',
        'POST /lessons/{lessonId}/pipeline/retry',
        'GET /lessons/{lessonId}/transcript',
        'GET /lessons/{lessonId}/pronunciation',
        'GET /lessons/{lessonId}/analysis',
      ].sort(),
    );
    for (const path of Object.keys(documentPaths)) {
      expect(path).not.toMatch(/export|download|share|audio/i);
    }
  });
});
