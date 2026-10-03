import { Injectable } from '@nestjs/common';
import type {
  PlanActivityState,
  WritingActivityView,
  WritingCorrectionView,
  WritingFailureCode,
  WritingLimitView,
  WritingScoreDimension,
} from '@english-quest/shared';
import type { WritingCorrection, WritingCorrectionError, WritingTask } from '@prisma/client';

import { correctionSegments } from '../analysis/correction-diff';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { groupErrors } from './output/error-groups';
import { highlightSegments } from './output/highlight-segments';
import { revisionSegments } from './output/revision-diff';
import { WRITING_FAILURE_MESSAGES, WRITING_SCORE_DIMENSIONS, WRITING_SCORE_LABELS } from './writing.constants';

export interface WritingViewInput {
  task: WritingTask;
  resolvedActivityId: string;
  planId: string;
  activityState: PlanActivityState;
  readOnly: boolean;
  title: string;
  /** The most recent correction request, whatever its outcome — the source of `failure` while `uncorrected`/`correction_failed`. */
  latestCorrection: WritingCorrection | null;
  /** The task's one succeeded correction, if any — the source of `correction` while `corrected`. */
  succeededCorrection: WritingCorrection | null;
  succeededCorrectionErrors: WritingCorrectionError[];
  geminiKeyUsable: boolean;
  limit: WritingLimitView;
  serverTime: Date;
}

const FAILURE_STATUSES = new Set(['uncorrected', 'correction_failed']);

/**
 * Maps a task and its corrections into the caller's own `WritingActivityView`
 * (spec §5). Every segment and group is computed here, at read time, from
 * the stored text, offsets and prior ledger counts — never cached — so a
 * relabelled tag or a taxonomy version bump is reflected on the next read
 * with no migration.
 */
@Injectable()
export class WritingViewBuilder {
  constructor(private readonly taxonomy: ErrorTaxonomyService) {}

  build(input: WritingViewInput): WritingActivityView {
    const { task } = input;
    const status = task.status as WritingActivityView['status'];

    const failure =
      FAILURE_STATUSES.has(status) && input.latestCorrection?.failureCode
        ? {
            code: input.latestCorrection.failureCode as WritingFailureCode,
            message: WRITING_FAILURE_MESSAGES[input.latestCorrection.failureCode as WritingFailureCode],
          }
        : null;

    const correction =
      status === 'corrected' && input.succeededCorrection
        ? this.buildCorrectionView(input.succeededCorrection, input.succeededCorrectionErrors)
        : null;

    return {
      activityId: input.resolvedActivityId,
      taskId: task.id,
      planId: input.planId,
      activityState: input.activityState,
      readOnly: input.readOnly,
      title: input.title,
      task: {
        heading: task.heading,
        statement: task.statement,
        targetTags: task.targetTags.map((tag) => ({ tag, label: this.taxonomy.labelOf(tag) })),
      },
      status,
      draft: {
        text: task.draftText,
        revision: task.draftRevision,
        savedAt: task.draftSavedAt?.toISOString() ?? null,
      },
      submittedAt: task.submittedAt?.toISOString() ?? null,
      failure,
      correction,
      submission: {
        geminiKeyUsable: input.geminiKeyUsable,
        dailyLimit: input.limit,
      },
      serverTime: input.serverTime.toISOString(),
    };
  }

  private buildCorrectionView(correction: WritingCorrection, errorRows: WritingCorrectionError[]): WritingCorrectionView {
    const scores: Record<WritingScoreDimension, number> = {
      grammar: correction.scoreGrammar!,
      vocabulary: correction.scoreVocabulary!,
      coherence: correction.scoreCoherence!,
      task_achievement: correction.scoreTaskAchievement!,
    };

    const errors = errorRows.map((row) => ({
      index: row.idx,
      quote: row.quote,
      tag: row.tag,
      tagLabel: this.taxonomy.labelOf(row.tag),
      correction: row.correction,
      correctionSegments: correctionSegments(row.quote, row.correction),
      explanation: row.explanation,
    }));

    const priorCounts = (correction.ledgerPriorCounts as Record<string, number> | null) ?? {};

    return {
      correctedAt: correction.finishedAt!.toISOString(),
      overallComment: correction.overallComment!,
      scores: WRITING_SCORE_DIMENSIONS.map((dimension) => ({
        dimension,
        label: WRITING_SCORE_LABELS[dimension],
        score: scores[dimension],
      })),
      text: highlightSegments(
        correction.submittedText,
        errorRows.map((row) => ({ index: row.idx, startOffset: row.startOffset, endOffset: row.endOffset })),
      ),
      revision: revisionSegments(correction.submittedText, correction.revisedText!),
      errors,
      errorGroups: groupErrors(
        errorRows.map((row) => ({ index: row.idx, tag: row.tag })),
        priorCounts,
        (tag) => this.taxonomy.labelOf(tag),
      ),
    };
  }
}
