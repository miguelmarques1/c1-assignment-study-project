import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { transcriptWordSchema } from '@english-quest/shared';
import { z } from 'zod';

import { INTERNAL_ERROR_REASON } from '../pipeline/pipeline.constants';
import {
  StageFailedError,
  type PipelineStageHandler,
  type StageRunContext,
} from '../pipeline/pipeline-stage.handler';
import { PipelineStageRegistry } from '../pipeline/pipeline-stage.registry';
import { PrismaService } from '../prisma/prisma.service';
import { ExcerptRulesService } from './excerpt-rules.service';
import { EXCERPT_SELECTION_RETRY_POLICY } from './excerpt-selection.constants';
import { selectExcerpts } from './excerpt-selector';
import { ExcerptWriter } from './excerpt-writer.service';
import { PronunciationFocusPort } from '../profile/pronunciation-focus.port';

const wordsSchema = z.array(transcriptWordSchema);

/**
 * The `excerpt_selection` stage: one participant's stored utterances, the
 * rules in force and their pronunciation focus, turned into the excerpts
 * F10 will assess. No model, no provider and no key, so it is never
 * blocked; completing it leaves the branch waiting at
 * `pronunciation_assessment`.
 */
@Injectable()
export class ExcerptSelectionStageHandler implements PipelineStageHandler, OnModuleInit {
  private readonly logger = new Logger(ExcerptSelectionStageHandler.name);

  readonly stage = 'excerpt_selection' as const;
  readonly provider = null;
  readonly retryPolicy = EXCERPT_SELECTION_RETRY_POLICY;

  constructor(
    private readonly registry: PipelineStageRegistry,
    private readonly prisma: PrismaService,
    private readonly rules: ExcerptRulesService,
    private readonly focus: PronunciationFocusPort,
    private readonly writer: ExcerptWriter,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async run(context: StageRunContext): Promise<void> {
    const { lessonId, userId } = context;
    const transcript = await this.prisma.lessonTranscript.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
      include: { utterances: { orderBy: { idx: 'asc' } } },
    });
    if (!transcript) {
      // F08 queues this stage in the transaction that writes the transcript,
      // so this is a broken invariant, not a user state. Retrying cannot make
      // a transcript appear.
      this.logger.error(`No transcript for branch ${context.branchId} (lesson ${lessonId}, user ${userId}).`);
      throw new StageFailedError('internal_error', INTERNAL_ERROR_REASON);
    }

    const rules = this.rules.current();
    const focus = await this.focus.focusFor(userId);
    const selection = selectExcerpts(
      transcript.utterances.map((utterance) => ({
        id: utterance.id,
        idx: utterance.idx,
        startMs: utterance.startMs,
        endMs: utterance.endMs,
        text: utterance.text,
        confidence: utterance.confidence,
        words: wordsSchema.parse(utterance.words),
      })),
      rules.rules,
      focus,
    );

    await context.complete((tx) =>
      this.writer.replace(tx, { lessonId, userId, transcriptId: transcript.id, rules, focus, selection }),
    );
  }
}
