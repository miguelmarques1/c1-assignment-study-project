import { Injectable } from '@nestjs/common';
import type {
  AnalysisCompetencyView,
  ErrorSeverity,
  LessonAnalysisResult,
  LessonAnalysisStatus,
  LessonAnalysisView,
} from '@english-quest/shared';

import { LessonAccessService } from '../pipeline/lesson-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorLedgerPort } from '../profile/error-ledger.port';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { LessonAnalysisReader, type StoredAnalysis } from './analysis-result.reader';
import { ANALYSIS_MISSING_CARD_NOTE } from './analysis.constants';
import { correctionSegments } from './correction-diff';
import { ordinalTimes } from './recurrence-label';

/** The ledger count from which an error card shows its recurrence badge (F19). */
const RECURRENCE_BADGE_MIN = 2;

/** Major first, then moderate, then minor — ties keep the stored (returned) order, since `Array.sort` is stable. */
const SEVERITY_ORDER: Record<ErrorSeverity, number> = { major: 0, moderate: 1, minor: 2 };

/** The PRD's fixed order for the five competency meters. */
const COMPETENCY_ORDER = ['grammar', 'vocabulary', 'fluency', 'interaction', 'comprehension'] as const;

/**
 * Route logic for `GET /lessons/:lessonId/analysis`: the caller's own
 * truthful state, derived from their branch and the `lesson_analysis` stage
 * row, never another participant's. Deltas and labels are computed here so
 * web and mobile render identically.
 */
@Injectable()
export class AnalysisService {
  constructor(
    private readonly access: LessonAccessService,
    private readonly reader: LessonAnalysisReader,
    private readonly prisma: PrismaService,
    private readonly taxonomy: ErrorTaxonomyService,
    private readonly ledger: ErrorLedgerPort,
  ) {}

  async getView(lessonId: string, callerId: string): Promise<LessonAnalysisView> {
    const lesson = await this.access.requireParticipant(lessonId, callerId);

    const branch = await this.prisma.lessonPipelineBranch.findUnique({
      where: { lessonId_userId: { lessonId, userId: callerId } },
    });
    if (!branch) {
      return { lessonId, status: 'unavailable', analysis: null };
    }

    const stageRow = await this.prisma.lessonPipelineStage.findUnique({
      where: { branchId_stage: { branchId: branch.id, stage: 'lesson_analysis' } },
    });
    if (!stageRow) {
      const status: LessonAnalysisStatus = branch.status === 'failed' ? 'unavailable' : 'pending';
      return { lessonId, status, analysis: null };
    }
    if (stageRow.status === 'failed') {
      return { lessonId, status: 'failed', analysis: null };
    }
    if (stageRow.status !== 'completed') {
      return { lessonId, status: 'pending', analysis: null };
    }

    const stored = await this.reader.forParticipant(lessonId, callerId);
    if (!stored) {
      // Unreachable in practice: the completing transaction always writes
      // the analysis before marking the stage row completed.
      return { lessonId, status: 'unavailable', analysis: null };
    }

    const [previous, occurrences] = await Promise.all([
      this.reader.previousFor(callerId, lesson.startedAt),
      this.ledger.occurrencesThrough(callerId, lessonId, [...new Set(stored.errors.map((error) => error.tag))]),
    ]);
    return { lessonId, status: 'ready', analysis: this.toView(stored, previous, occurrences) };
  }

  private toView(
    stored: StoredAnalysis,
    previous: StoredAnalysis | null,
    occurrences: Map<string, number>,
  ): LessonAnalysisResult {
    const competencies: AnalysisCompetencyView[] = COMPETENCY_ORDER.map((competency) => {
      const current = stored.competencies[competency];
      const before = previous?.competencies[competency];
      return {
        competency,
        score: current.score,
        justification: current.justification,
        delta: before ? current.score - before.score : null,
      };
    });

    const recurringSet = new Set(stored.recurringTags);
    const errors = [...stored.errors]
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      .map((error) => {
        const count = occurrences.get(error.tag) ?? 0;
        return {
          quote: error.quote,
          correction: error.correction,
          correctionSegments: correctionSegments(error.quote, error.correction),
          explanation: error.explanation,
          severity: error.severity,
          tag: error.tag,
          tagLabel: this.taxonomy.labelOf(error.tag),
          recurring: recurringSet.has(error.tag),
          recurrence: count >= RECURRENCE_BADGE_MIN ? { count, label: ordinalTimes(count) } : null,
          utteranceId: error.utteranceId,
        };
      });

    const notes: string[] = [];
    if (stored.transcriptTruncated) {
      notes.push('The opening of this lesson was left out of the analysis because the transcript was too long.');
    }
    if (stored.scenarioContext === 'situation_only') {
      notes.push(ANALYSIS_MISSING_CARD_NOTE);
    }

    return {
      competencies,
      strengths: stored.strengths,
      errors,
      recurringTags: stored.recurringTags,
      scenarioContext: stored.scenarioContext,
      scenarioFit: stored.scenarioFit,
      topicsToPractice: stored.topics,
      notes,
      analyzedAt: stored.createdAt.toISOString(),
    };
  }
}
