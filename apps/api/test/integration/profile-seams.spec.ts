import { SchedulerRegistry } from '@nestjs/schedule';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/genai', async () => (await import('./helpers/fake-gemini')).fakeGeminiModule);

import { LessonAnalysisReader } from '../../src/analysis/analysis-result.reader';
import { ErrorLedgerPort } from '../../src/profile/error-ledger.port';
import type { ActivityOutcomeInput } from '../../src/profile/profile-ingestion.contract';
import { ProfileIngestionService } from '../../src/profile/profile-ingestion.service';
import { ProfileTagsPort } from '../../src/profile/profile-tags.port';
import { DAY_MS } from '../../src/profile/profile.constants';
import { LEDGER_FOCUS_SOURCE, PronunciationFocusPort } from '../../src/profile/pronunciation-focus.port';
import { RoleCardService } from '../../src/scenario/role-card.service';
import { ErrorTaxonomyService } from '../../src/taxonomy/error-taxonomy.service';
import { gemini } from './helpers/fake-gemini';
import {
  createPipelineTestContext,
  makeAnalysisReadyLesson,
  makeProfiledLesson,
  makeTranscribedLesson,
  resetPipelineTables,
  seedSpeaker,
  startAnalysis,
  startSelection,
  waitForStage,
  type PipelineTestContext,
  type ProfileOccurrenceSeed,
  type SeedUtterance,
} from './helpers/pipeline-fixtures';

let pipeline: PipelineTestContext;

const MINUTE = 60_000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/** An utterance every version-1 selection rule accepts, as F09's own suite builds them. */
function said(minute: number, confidence: number | null, seconds = 5, text?: string): SeedUtterance {
  const startMs = minute * MINUTE;
  return {
    startMs,
    endMs: startMs + seconds * 1_000,
    text: text ?? `At minute ${minute} we should really move the whole meeting`,
    confidence,
  };
}

function errors(tag: string, count: number, quote = 'a sentence'): ProfileOccurrenceSeed[] {
  return Array.from({ length: count }, (_, index) => ({ tag, quote: `${quote} ${index + 1}` }));
}

/** An assessed excerpt of the user's first utterance in `lessonId`, with Azure's word/phoneme alignment. */
async function seedAssessedWords(lessonId: string, userId: string, words: Array<{ word: string; phonemes: string[] }>) {
  const { prisma } = pipeline.ctx;
  const selection = await prisma.lessonExcerptSelection.findFirstOrThrow({ where: { lessonId, userId } });
  const utterance = await prisma.lessonUtterance.findFirstOrThrow({ where: { lessonId, userId }, orderBy: { idx: 'asc' } });
  const excerpt = await prisma.lessonExcerpt.create({
    data: {
      selectionId: selection.id,
      lessonId,
      userId,
      utteranceId: utterance.id,
      rank: 1,
      startMs: utterance.startMs,
      endMs: utterance.endMs,
      referenceText: utterance.text,
      selectionRuleVersion: '1',
      confidence: 0.6,
      wordCount: words.length,
      fillerShare: 0,
      focusWordCount: 0,
      reason: 'Selected',
    },
  });
  await prisma.lessonExcerptAssessment.create({
    data: {
      excerptId: excerpt.id,
      lessonId,
      userId,
      status: 'assessed',
      attempts: 1,
      clipStartMs: utterance.startMs,
      clipEndMs: utterance.endMs,
      assessedAt: new Date(),
      pronunciation: 70,
      accuracy: 70,
      fluency: 70,
      prosody: 70,
      completeness: 70,
      words: words.map((word, index) => ({
        word: word.word,
        accuracy: 50,
        errorTypes: [],
        offsetMs: index * 400,
        durationMs: 400,
        phonemes: word.phonemes.map((phoneme, at) => ({ phoneme, accuracy: 45, offsetMs: index * 400 + at * 100, durationMs: 100 })),
      })),
    },
  });
}

beforeAll(async () => {
  pipeline = await createPipelineTestContext();
  // Every stage here is started by the test itself; no sweep may start one behind its back.
  pipeline.ctx.app.get(SchedulerRegistry).deleteInterval('profile-reconciliation');
  pipeline.ctx.app.get(SchedulerRegistry).deleteInterval('pipeline-drain');
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  gemini.reset();
  await resetPipelineTables(pipeline.ctx);
});

describe('profile seams', () => {
  it('the_tags_port_returns_recurring_analysis_family_tags', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const grammarTags = pipeline.ctx.app.get(ErrorTaxonomyService).tagsInFamily('grammar').slice(0, 12);
    // Three lessons: twelve grammar tags three times each, and one phoneme tag once per lesson.
    for (const days of [3, 2, 1]) {
      await makeProfiledLesson(pipeline.ctx, ana.id, {
        startedAt: daysAgo(days),
        errors: grammarTags.map((tag) => ({ tag, quote: `${tag} in lesson ${days}` })),
        phonemes: [{ tag: 'phoneme:/θ/', exampleWords: ['think'] }],
      });
    }
    await makeProfiledLesson(pipeline.ctx, bruno.id, { startedAt: daysAgo(1), errors: errors('vocab:collocation', 3) });

    const tags = await pipeline.ctx.app.get(ProfileTagsPort).weaknessTagsFor(ana.id);

    const recorded = await pipeline.ctx.prisma.errorLedgerEntry.findMany({ where: { userId: ana.id } });
    expect(recorded.filter((entry) => entry.family === 'grammar' && entry.occurrenceCount === 3)).toHaveLength(12);
    expect(recorded.find((entry) => entry.tag === 'phoneme:/θ/')).toMatchObject({ occurrenceCount: 3 });
    expect(tags).toHaveLength(10);
    expect(tags.every((tag) => tag.startsWith('grammar:'))).toBe(true);
    expect(tags).not.toContain('phoneme:/θ/');
    expect(tags).not.toContain('vocab:collocation');
    expect(await pipeline.ctx.app.get(ProfileTagsPort).weaknessTagsFor(bruno.id)).toEqual(['vocab:collocation']);
  }, 60_000);

  it('the_role_card_request_carries_the_owners_weakness_tags', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withGeminiKey: true });
    await makeProfiledLesson(pipeline.ctx, ana.id, { startedAt: daysAgo(2), errors: errors('grammar:conditional-3', 3) });
    await makeProfiledLesson(pipeline.ctx, bruno.id, { startedAt: daysAgo(2), errors: errors('vocab:phrasal-verb', 3) });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said(1, 0.9)] },
      { speaker: bruno, utterances: [said(1, 0.9)] },
    ]);
    const scenario = await pipeline.ctx.prisma.lessonScenario.create({
      data: {
        lessonId: lesson.lessonId,
        status: 'ready',
        setting: 'A busy airport terminal.',
        premise: 'The last flight was cancelled.',
        vocabularyDomain: 'travel',
        roles: [
          { label: 'The Traveler', relationship: 'Passenger' },
          { label: 'The Airline Agent', relationship: 'Agent' },
        ],
        generatedBy: ana.id,
      },
    });

    const cards = pipeline.ctx.app.get(RoleCardService);
    await cards.ensureCard(lesson.lessonId, ana.id, scenario);
    await cards.ensureCard(lesson.lessonId, bruno.id, scenario);

    const anaCall = gemini.callsOf('card').find((call) => call.apiKey === ana.geminiKey)!;
    const brunoCall = gemini.callsOf('card').find((call) => call.apiKey === bruno.geminiKey)!;
    expect(anaCall.message).toContain('grammar:conditional-3');
    expect(anaCall.message).not.toContain('vocab:phrasal-verb');
    expect(brunoCall.message).toContain('vocab:phrasal-verb');
    expect(brunoCall.message).not.toContain('grammar:conditional-3');
  }, 60_000);

  it('the_analysis_input_carries_the_owners_recurring_tags', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withGeminiKey: true });
    await makeProfiledLesson(pipeline.ctx, ana.id, { startedAt: daysAgo(4), errors: errors('grammar:conditional-3', 3) });
    await makeProfiledLesson(pipeline.ctx, bruno.id, { startedAt: daysAgo(4), errors: errors('vocab:register', 3) });
    const line = 'If I would have known about it I would have come.';
    gemini.scriptAnalysis(ana.geminiKey!, {
      kind: 'ok',
      response: {
        competencies: {
          grammar: { score: 60, justification: 'x' },
          vocabulary: { score: 60, justification: 'x' },
          fluency: { score: 60, justification: 'x' },
          interaction: { score: 60, justification: 'x' },
          comprehension: { score: 60, justification: 'x' },
        },
        strengths: ['a', 'b', 'c'],
        errors: [
          { quote: line, tag: 'grammar:conditional-3', correction: 'If I had known', explanation: 'x', severity: 'major' },
        ],
        // A tag the profile does not hold is dropped by F11's output rules; the one it does hold is kept.
        recurring_tags: ['grammar:conditional-3', 'vocab:register'],
        scenario_fit: null,
        topics_to_practice: ['a', 'b', 'c'],
      },
    });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [{ startMs: 0, endMs: 4_000, text: line, confidence: 0.9 }] },
    ]);

    const branchId = lesson.branches.get(ana.id)!;
    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['completed']);

    const call = gemini.callsOf('analysis').find((entry) => entry.apiKey === ana.geminiKey)!;
    // The whole taxonomy is listed elsewhere in the message; the weakness line carries the owner's tags only.
    expect(/known recurring weaknesses, if any: (.*)$/m.exec(call.message)?.[1]?.trim()).toBe('grammar:conditional-3');
    const analysis = (await pipeline.ctx.app.get(LessonAnalysisReader).forParticipant(lesson.lessonId, ana.id))!;
    expect(analysis.recurringTags).toEqual(['grammar:conditional-3']);
    const stored = await pipeline.ctx.prisma.lessonAnalysis.findFirstOrThrow({ where: { userId: ana.id } });
    expect(stored.profileTagCount).toBe(1);
  }, 60_000);

  it('the_focus_port_returns_unmastered_phoneme_tags_and_a_matcher', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    await makeProfiledLesson(pipeline.ctx, ana.id, {
      startedAt: daysAgo(3),
      phonemes: [{ tag: 'phoneme:/θ/', exampleWords: ['think'] }],
      errors: errors('grammar:past-simple', 3),
    });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said(1, 0.9)] },
      { speaker: bruno, utterances: [said(1, 0.9)] },
    ]);
    await seedAssessedWords(lesson.lessonId, ana.id, [
      { word: 'Think,', phonemes: ['θ', 'ɪ', 'ŋ', 'k'] },
      { word: 'sing', phonemes: ['s', 'ɪ', 'ŋ'] },
    ]);
    // Bruno's own alignment of a θ word must never widen Ana's matcher.
    await seedAssessedWords(lesson.lessonId, bruno.id, [{ word: 'thorough', phonemes: ['θ', 'ɝ', 'oʊ'] }]);

    const focus = await pipeline.ctx.app.get(PronunciationFocusPort).focusFor(ana.id);

    expect(focus.source).toBe(LEDGER_FOCUS_SOURCE);
    expect(focus.tags).toEqual(['phoneme:/θ/']);
    expect(focus.matchesWord('think')).toBe(true);
    expect(focus.matchesWord('sing')).toBe(false);
    expect(focus.matchesWord('thorough')).toBe(false);
    expect(focus.matchesWord('three')).toBe(false);

    const empty = await pipeline.ctx.app.get(PronunciationFocusPort).focusFor(bruno.id);
    expect(empty).toMatchObject({ source: LEDGER_FOCUS_SOURCE, tags: [] });
    expect(empty.matchesWord('thorough')).toBe(false);
  }, 60_000);

  it('excerpt_selection_ranks_focus_words_on_ties', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    await makeProfiledLesson(pipeline.ctx, ana.id, { startedAt: daysAgo(5), phonemes: [{ tag: 'phoneme:/θ/', exampleWords: ['think'] }] });
    const earlier = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said(1, 0.9)] }]);
    await seedAssessedWords(earlier.lessonId, ana.id, [{ word: 'think', phonemes: ['θ', 'ɪ', 'ŋ', 'k'] }]);

    const plain = said(1, 0.7, 5, 'At minute one we should really move the whole meeting');
    const withFocus = said(8, 0.7, 5, 'At minute eight I think we should move the meeting');
    const lesson = await makeTranscribedLesson(pipeline, [{ speaker: ana, utterances: [plain, withFocus] }]);
    const branchId = lesson.branches.get(ana.id)!;

    await startSelection(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);

    const excerpts = await pipeline.ctx.prisma.lessonExcerpt.findMany({
      where: { lessonId: lesson.lessonId, userId: ana.id },
      orderBy: { rank: 'asc' },
    });
    expect(excerpts.map((excerpt) => [excerpt.referenceText, excerpt.focusWordCount])).toEqual([
      [withFocus.text, 1],
      [plain.text, 0],
    ]);
    const selection = await pipeline.ctx.prisma.lessonExcerptSelection.findFirstOrThrow({
      where: { lessonId: lesson.lessonId, userId: ana.id },
    });
    expect(selection).toMatchObject({ focusSource: LEDGER_FOCUS_SOURCE, focusTags: ['phoneme:/θ/'] });
  }, 60_000);

  it('the_ledger_port_counts_occurrences_up_to_and_including_the_lesson', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const tag = 'grammar:conditional-3';
    const first = await makeProfiledLesson(pipeline.ctx, ana.id, { startedAt: daysAgo(10), errors: errors(tag, 1) });
    const second = await makeProfiledLesson(pipeline.ctx, ana.id, { startedAt: daysAgo(6), errors: errors(tag, 1) });
    const third = await makeProfiledLesson(pipeline.ctx, ana.id, { startedAt: daysAgo(3), errors: errors(tag, 1) });
    const outcome: ActivityOutcomeInput = {
      userId: ana.id,
      activityId: crypto.randomUUID(),
      sourceKey: crypto.randomUUID(),
      activityType: 'grammar',
      occurredAt: daysAgo(1),
      measurements: [],
      errorOccurrences: [{ tag }],
      correctEncounters: [],
    };
    await pipeline.ctx.app.get(ProfileIngestionService).ingestActivityOutcome(outcome);
    const brunoLesson = await makeProfiledLesson(pipeline.ctx, bruno.id, { startedAt: daysAgo(8), errors: errors(tag, 4) });

    const port = pipeline.ctx.app.get(ErrorLedgerPort);
    const tags = [tag, 'vocab:register'];

    expect(await port.occurrencesThrough(ana.id, first, tags)).toEqual(new Map([[tag, 1]]));
    expect(await port.occurrencesThrough(ana.id, second, tags)).toEqual(new Map([[tag, 2]]));
    expect(await port.occurrencesThrough(ana.id, third, tags)).toEqual(new Map([[tag, 3]]));
    // Bruno's occurrences on the same tag never count toward Ana's badge, and vice versa.
    expect(await port.occurrencesThrough(bruno.id, brunoLesson, tags)).toEqual(new Map([[tag, 4]]));
    expect(await port.occurrencesThrough(ana.id, third, [])).toEqual(new Map());
  }, 60_000);
});
