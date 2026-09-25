import { Injectable } from '@nestjs/common';
import { registerSchema, roleSchema, transcriptWordSchema, type Register, type ScenarioContext } from '@english-quest/shared';
import type { LessonRoleCard, LessonScenario } from '@prisma/client';
import { z } from 'zod';

import { PrismaService } from '../prisma/prisma.service';
import { ProfileTagsPort } from '../profile/profile-tags.port';
import { PronunciationResultReader, type StoredPronunciationView } from '../pronunciation/pronunciation-result.reader';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { mergeTranscript, type TranscriptTrack } from '../transcription/transcript-merge';
import {
  ANALYSIS_CHARS_PER_TOKEN,
  ANALYSIS_NO_PRONUNCIATION_SAMPLE_SENTENCE,
  ANALYSIS_SCENARIO_STATUS_SENTENCES,
  ANALYSIS_TRANSCRIPT_TOKEN_BUDGET,
} from './analysis.constants';
import { fitToBudget, renderTranscriptLines, type AnalysisTranscriptTurn } from './analysis-transcript';

const rolesArraySchema = z.array(roleSchema);
const expressionsArraySchema = z.array(z.string());
const wordsSchema = z.array(transcriptWordSchema);

export interface AnalysisPromptVariables {
  transcript: string;
  truncation_note: string;
  scenario_status: string;
  situation: string;
  role_card: string;
  pronunciation: string;
  taxonomy: string;
  recurring_weakness_tags: string;
}

export interface AnalysisTruncation {
  othersOmittedBeforeMs: number | null;
  ownOmittedBeforeMs: number | null;
  droppedOthers: number;
  droppedOwn: number;
}

/** Everything the stage handler needs, besides the model's own response: what was sent, and what the output rules and the writer will need afterward. */
export interface AnalysisInput {
  variables: AnalysisPromptVariables;
  scenarioContext: ScenarioContext;
  roleLabel: string | null;
  /** Only set for `full` — what the fit's `expressionsUsed`/`expressionsNotUsed` partition. */
  registerExpected: Register | null;
  cardTargetExpressions: string[];
  pronunciationContext: 'assessed' | 'no_sample';
  transcriptTokensEstimated: number;
  transcriptTruncated: boolean;
  truncation: AnalysisTruncation | null;
  /** The profile port's own tags, for the recurring-tag filter. */
  profileTags: string[];
  taxonomyVersion: string;
  /** The owner's own utterances (id + text), whether or not the transcript kept them under budget — what quotes are matched against. */
  ownUtterances: Array<{ id: string; text: string }>;
  /** Null only for a lesson somehow still without a finalized duration — the curator's long-lesson flag never fires without it. */
  lessonDurationSeconds: number | null;
}

/**
 * Reads and renders everything the `lesson-analysis` prompt needs for one
 * participant: the merged transcript (budgeted and labelled), the scenario
 * and — only for its own owner — the role card, the pronunciation summary,
 * the taxonomy listing and the profile's weakness tags. Never reads another
 * participant's role card.
 */
@Injectable()
export class AnalysisInputBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pronunciation: PronunciationResultReader,
    private readonly profileTags: ProfileTagsPort,
    private readonly taxonomy: ErrorTaxonomyService,
  ) {}

  async build(lessonId: string, userId: string): Promise<AnalysisInput> {
    const [lesson, participants, utterances, pronunciationView, scenario, roleCard, weaknessTags] = await Promise.all([
      this.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } }),
      this.prisma.lessonParticipant.findMany({ where: { lessonId } }),
      this.prisma.lessonUtterance.findMany({ where: { lessonId }, orderBy: [{ userId: 'asc' }, { idx: 'asc' }] }),
      this.pronunciation.forParticipant(lessonId, userId),
      this.prisma.lessonScenario.findUnique({ where: { lessonId } }),
      // Only ever the owner's own card: never read for another participant.
      this.prisma.lessonRoleCard.findUnique({ where: { lessonId_userId: { lessonId, userId } } }),
      this.profileTags.weaknessTagsFor(userId),
    ]);

    if (!pronunciationView) {
      // F10 always writes a result (even `no_sample`) before completing, so
      // a branch reaching this stage without one is a bug, not a product
      // state — thrown plain, so the runner's generic retry-then-fail path
      // (internal_error) handles it, the same way F10 treated a missing
      // selection as unreachable.
      throw new Error(`No pronunciation result for lesson ${lessonId}, participant ${userId}.`);
    }

    const tracks: TranscriptTrack[] = participants.map((participant) => ({
      userId: participant.userId,
      recordingStartedAt: participant.recordingStartedAt,
      utterances: utterances
        .filter((utterance) => utterance.userId === participant.userId)
        .map((utterance) => ({
          id: utterance.id,
          idx: utterance.idx,
          startMs: utterance.startMs,
          endMs: utterance.endMs,
          text: utterance.text,
          confidence: utterance.confidence,
          words: wordsSchema.parse(utterance.words),
        })),
    }));

    const merged = mergeTranscript(lesson.startedAt, userId, tracks);
    const ownUtterances = merged
      .filter((utterance) => utterance.userId === userId)
      .map((utterance) => ({ id: utterance.id, text: utterance.text }));

    const turns: AnalysisTranscriptTurn[] = merged.map((utterance) => ({
      userId: utterance.userId,
      startMs: utterance.startMs,
      text: utterance.text,
    }));
    const lines = renderTranscriptLines(turns, userId);
    const budget = fitToBudget(lines, ANALYSIS_TRANSCRIPT_TOKEN_BUDGET, ANALYSIS_CHARS_PER_TOKEN);

    const scenarioContext = this.deriveScenarioContext(scenario, roleCard);
    const { situation, roleCardText, cardTargetExpressions, registerExpected, roleLabel } = this.renderScenario(
      scenarioContext,
      scenario,
      roleCard,
    );

    const { context: pronunciationContext, text: pronunciationText } = this.renderPronunciation(pronunciationView);
    const { listing: taxonomyListing, version: taxonomyVersion } = this.renderTaxonomy();

    return {
      variables: {
        transcript: budget.transcript,
        truncation_note: budget.truncationNote,
        scenario_status: ANALYSIS_SCENARIO_STATUS_SENTENCES[scenarioContext],
        situation,
        role_card: roleCardText,
        pronunciation: pronunciationText,
        taxonomy: taxonomyListing,
        recurring_weakness_tags: weaknessTags.join(', '),
      },
      scenarioContext,
      roleLabel,
      registerExpected,
      cardTargetExpressions,
      pronunciationContext,
      transcriptTokensEstimated: budget.estimatedTokens,
      transcriptTruncated: budget.truncated,
      truncation: budget.truncated
        ? {
            othersOmittedBeforeMs: budget.othersOmittedBeforeMs,
            ownOmittedBeforeMs: budget.ownOmittedBeforeMs,
            droppedOthers: budget.droppedOthers,
            droppedOwn: budget.droppedOwn,
          }
        : null,
      profileTags: weaknessTags,
      taxonomyVersion,
      ownUtterances,
      lessonDurationSeconds: lesson.durationSeconds,
    };
  }

  /**
   * `full` needs both a ready situation and the owner's own ready card —
   * without a card there is nothing to score register or expressions
   * against. `situation_only` still orients the model with the situation
   * and the owner's assigned role label. `none` covers every other case:
   * no scenario was ever generated, it failed, or it is still pending.
   */
  private deriveScenarioContext(scenario: LessonScenario | null, roleCard: LessonRoleCard | null): ScenarioContext {
    if (!scenario || scenario.status !== 'ready') {
      return 'none';
    }
    if (roleCard && roleCard.status === 'ready') {
      return 'full';
    }
    return 'situation_only';
  }

  private renderScenario(
    context: ScenarioContext,
    scenario: LessonScenario | null,
    roleCard: LessonRoleCard | null,
  ): {
    situation: string;
    roleCardText: string;
    cardTargetExpressions: string[];
    registerExpected: Register | null;
    roleLabel: string | null;
  } {
    if (context === 'none') {
      return { situation: '', roleCardText: '', cardTargetExpressions: [], registerExpected: null, roleLabel: null };
    }

    const situation = this.renderSituation(scenario!);

    if (context === 'situation_only') {
      const roleLabel = roleCard?.roleLabel ?? null;
      return {
        situation,
        roleCardText: roleLabel ? `Your role: ${roleLabel}` : '',
        cardTargetExpressions: [],
        registerExpected: null,
        roleLabel,
      };
    }

    const card = roleCard!;
    const cardTargetExpressions = expressionsArraySchema.parse(card.targetExpressions);
    return {
      situation,
      roleCardText: this.renderFullRoleCard(card, cardTargetExpressions),
      cardTargetExpressions,
      registerExpected: card.register ? registerSchema.parse(card.register) : null,
      roleLabel: card.roleLabel,
    };
  }

  private renderSituation(scenario: LessonScenario): string {
    const roles = rolesArraySchema.parse(scenario.roles);
    const rolesText = roles.map((role) => `${role.label} (${role.relationship})`).join('; ');
    return [
      `Setting: ${scenario.setting ?? ''}`,
      `Premise: ${scenario.premise ?? ''}`,
      `Roles and relationships: ${rolesText}`,
      `Vocabulary domain: ${scenario.vocabularyDomain ?? ''}`,
    ].join('\n');
  }

  private renderFullRoleCard(card: LessonRoleCard, expressions: string[]): string {
    return [
      `Your role: ${card.roleLabel ?? ''}`,
      `Background: ${card.background ?? ''}`,
      `Objective: ${card.objective ?? ''}`,
      `Constraint: ${card.constraintText ?? ''}`,
      `Register: ${card.register ?? ''}`,
      `Target expressions: ${expressions.join('; ')}`,
    ].join('\n');
  }

  private renderPronunciation(view: StoredPronunciationView): { context: 'assessed' | 'no_sample'; text: string } {
    if (view.result && view.result.status === 'assessed' && view.result.scores) {
      const scores = view.result.scores;
      const phonemesText =
        view.result.worstPhonemes.length > 0
          ? view.result.worstPhonemes
              .map(
                (phoneme) =>
                  `/${phoneme.phoneme}/ (mean ${phoneme.meanAccuracy.toFixed(1)}, ${phoneme.occurrences} occurrences, example word "${phoneme.exampleWord}")`,
              )
              .join('; ')
          : 'none';
      const text =
        `Pronunciation ${scores.pronunciation.toFixed(1)}, Accuracy ${scores.accuracy.toFixed(1)}, ` +
        `Fluency ${scores.fluency.toFixed(1)}, Prosody ${scores.prosody !== null ? scores.prosody.toFixed(1) : 'not measured'}, ` +
        `Completeness ${scores.completeness.toFixed(1)}. Worst phonemes: ${phonemesText}.`;
      return { context: 'assessed', text };
    }
    return { context: 'no_sample', text: ANALYSIS_NO_PRONUNCIATION_SAMPLE_SENTENCE };
  }

  private renderTaxonomy(): { listing: string; version: string } {
    const current = this.taxonomy.current();
    const analysisTagSet = new Set(current.analysisTags);
    const listing = current.tags
      .filter((tag) => analysisTagSet.has(tag.tag))
      .map((tag) => `${tag.tag} — ${tag.label}: ${tag.description}`)
      .join('\n');
    return { listing, version: current.version };
  }
}
