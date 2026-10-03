import { Injectable } from '@nestjs/common';
import type { WritingActivityView } from '@english-quest/shared';
import type { WritingTask } from '@prisma/client';

import { AppError } from '../common/app-error';
import type { ResolvedActivity } from '../plans/plan-activity-state.service';
import { PlanActivityStateService } from '../plans/plan-activity-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ErrorLedgerReader } from '../profile/error-ledger.reader';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { composeTask } from './composition/task-composer';
import { limitState, limitWindowStart } from './writing-limit';
import { resolveWritingActivity } from './writing-resolve';
import { WritingTaskRulesService } from './writing-task-rules.service';
import { WritingViewBuilder } from './writing-view.builder';
import { WritingRepository, type TxClient } from './writing.repository';
import { WRITING_ANALYSIS_FAMILIES } from './writing.constants';

/**
 * Route logic for opening and reading a writing activity, and for saving
 * its draft (F17 §5). Every method resolves the caller's activity id
 * forward through F15's carry-over lineage first, so an old id (a stale
 * bookmark, a carried-over device) still reaches the same task.
 */
@Injectable()
export class WritingActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanActivityStateService,
    private readonly repository: WritingRepository,
    private readonly rules: WritingTaskRulesService,
    private readonly ledger: ErrorLedgerReader,
    private readonly taxonomy: ErrorTaxonomyService,
    private readonly credentials: CredentialsService,
    private readonly viewBuilder: WritingViewBuilder,
  ) {}

  /**
   * The first open composes and stores the task and marks the activity
   * started, all inside one transaction holding the resolved activity row
   * locked (A4). Every later open — from any device, or an older id in the
   * lineage — returns the same task. An archived plan's activity that was
   * never opened is rejected; one already opened is returned read-only.
   */
  async open(userId: string, activityId: string, now: Date): Promise<WritingActivityView> {
    return this.prisma.$transaction(async (tx) => {
      const resolved = await resolveWritingActivity(this.plans, userId, activityId, tx);

      await this.repository.lockActivity(tx, resolved.activityId);
      let task = await this.repository.findTaskByLineage(tx, resolved.lineage);
      let readOnly = false;

      if (!task) {
        if (resolved.planStatus === 'archived') {
          throw AppError.planActivityNotInCurrentPlan(activityId);
        }
        task = await this.composeAndStore(tx, userId, resolved, now);
        await this.plans.markStarted(userId, resolved.activityId, { at: now }, tx);
      } else if (resolved.planStatus === 'archived') {
        readOnly = true;
      }

      const title = await this.activityTitle(tx, resolved.activityId);
      return this.buildView(tx, userId, task, resolved, readOnly, title, now);
    });
  }

  /** Read-only, with no state change — what both clients poll while `correcting` (spec §5). */
  async read(userId: string, activityId: string, now: Date): Promise<WritingActivityView> {
    const resolved = await resolveWritingActivity(this.plans, userId, activityId, this.prisma);
    const task = await this.repository.findTaskByLineage(this.prisma, resolved.lineage);
    if (!task) {
      throw AppError.writingTaskNotStarted();
    }
    const readOnly = resolved.planStatus === 'archived';
    const title = await this.activityTitle(this.prisma, resolved.activityId);
    return this.buildView(this.prisma, userId, task, resolved, readOnly, title, now);
  }

  /**
   * A compare-and-set save (A5): a stale `baseRevision` whose text differs
   * from the server copy is rejected with that copy attached, unless the
   * incoming text is identical, in which case it succeeds idempotently. A
   * save is rejected outright while `correcting` or once `corrected`
   * (WRIT007), and one accepted while `uncorrected`/`correction_failed`
   * returns the task to `draft` (A12).
   */
  async saveDraft(
    userId: string,
    activityId: string,
    input: { text: string; baseRevision: number; activeSecondsDelta: number },
    now: Date,
  ): Promise<{ revision: number; savedAt: string; status: 'draft' }> {
    return this.prisma.$transaction(async (tx) => {
      const resolved = await resolveWritingActivity(this.plans, userId, activityId, tx);
      const lookedUp = await this.repository.findTaskByLineage(tx, resolved.lineage);
      if (!lookedUp) {
        throw AppError.writingTaskNotStarted();
      }
      if (resolved.planStatus === 'archived') {
        throw AppError.planActivityNotInCurrentPlan(activityId);
      }

      const task = (await this.repository.taskForUpdate(tx, lookedUp.id))!;
      if (task.status === 'correcting' || task.status === 'corrected') {
        throw AppError.writingAlreadySubmitted();
      }

      if (input.baseRevision < task.draftRevision) {
        if (input.text === task.draftText) {
          // The identical text at a stale revision — a retried request whose response was lost — is accepted
          // idempotently rather than rejected, still crediting the caller's active seconds (A5).
          await this.repository.addActiveSeconds(tx, task.id, input.activeSecondsDelta);
          return { revision: task.draftRevision, savedAt: task.draftSavedAt!.toISOString(), status: 'draft' };
        }
        throw AppError.writingDraftConflict({
          text: task.draftText,
          revision: task.draftRevision,
          savedAt: task.draftSavedAt?.toISOString() ?? null,
        });
      }

      if (input.text === task.draftText && input.baseRevision === task.draftRevision) {
        await this.repository.addActiveSeconds(tx, task.id, input.activeSecondsDelta);
        return { revision: task.draftRevision, savedAt: task.draftSavedAt?.toISOString() ?? now.toISOString(), status: 'draft' };
      }

      const revision = task.draftRevision + 1;
      await this.repository.updateDraft(tx, task.id, {
        text: input.text,
        revision,
        savedAt: now,
        activeSeconds: task.activeSeconds + input.activeSecondsDelta,
      });
      return { revision, savedAt: now.toISOString(), status: 'draft' };
    });
  }

  private async activityTitle(client: TxClient | PrismaService, activityId: string): Promise<string> {
    const activity = await client.studyPlanActivity.findUniqueOrThrow({ where: { id: activityId }, select: { title: true } });
    return activity.title;
  }

  private async composeAndStore(tx: TxClient, userId: string, resolved: ResolvedActivity, now: Date): Promise<WritingTask> {
    const loadedRules = this.rules.current();
    const [entries, recurring, recentScenarioIds] = await Promise.all([
      this.ledger.entriesFor(userId, { includeRetired: false, now }),
      this.ledger.recurringFor(userId, now),
      this.repository.recentScenarioIds(tx, userId, loadedRules.rules.scenarioNoRepeatWithin),
    ]);

    const isAnalysisTag = (tag: string): boolean => WRITING_ANALYSIS_FAMILIES.includes(this.taxonomy.familyOf(tag) ?? '');
    // Most-recently-seen first for the non-recurring remainder (`entriesFor`'s own sort), recurring tags ranked ahead (A3).
    const analysisUnmastered = entries.filter((entry) => entry.state !== 'mastered' && isAnalysisTag(entry.tag));
    const analysisUnmasteredTags = new Set(analysisUnmastered.map((entry) => entry.tag));
    const recurringRanked = recurring.map((entry) => entry.tag).filter((tag) => analysisUnmasteredTags.has(tag));
    const recurringSet = new Set(recurringRanked);
    const remainingRanked = analysisUnmastered.filter((entry) => !recurringSet.has(entry.tag)).map((entry) => entry.tag);
    const unmasteredRanked = [...recurringRanked, ...remainingRanked];

    const composed = composeTask({
      activityId: resolved.lineage[0]!,
      activityTags: resolved.targetTags,
      unmasteredRanked,
      recentScenarioIds,
      rules: loadedRules.rules,
      labelOf: (tag) => this.taxonomy.labelOf(tag),
    });

    return this.repository.insertTask(tx, {
      userId,
      activityId: resolved.activityId,
      heading: composed.heading,
      statement: composed.statement,
      statementWords: composed.statementWords,
      targetTags: composed.targetTags.map((tag) => tag.tag),
      scenarioId: composed.scenarioId,
      rulesVersion: loadedRules.version,
      rulesFingerprint: loadedRules.fingerprint,
      taxonomyVersion: this.taxonomy.current().version,
    });
  }

  private async buildView(
    client: TxClient | PrismaService,
    userId: string,
    task: WritingTask,
    resolved: ResolvedActivity,
    readOnly: boolean,
    title: string,
    now: Date,
  ): Promise<WritingActivityView> {
    const [credentialList, latestCorrection, succeededCorrection, requestedAts] = await Promise.all([
      this.credentials.list(userId),
      this.repository.latestCorrectionForTask(client, task.id),
      this.repository.succeededCorrectionForTask(client, task.id),
      this.repository.requestedAtsSince(client, userId, limitWindowStart(now)),
    ]);
    const gemini = credentialList.find((credential) => credential.provider === 'gemini');
    const geminiKeyUsable = !!gemini && gemini.status !== 'missing' && gemini.status !== 'invalid';
    const succeededErrors = succeededCorrection ? await this.repository.errorsForCorrection(client, succeededCorrection.id) : [];

    return this.viewBuilder.build({
      task,
      resolvedActivityId: resolved.activityId,
      planId: resolved.planId,
      activityState: resolved.state,
      readOnly,
      title,
      latestCorrection,
      succeededCorrection,
      succeededCorrectionErrors: succeededErrors,
      geminiKeyUsable,
      limit: limitState(requestedAts, now),
      serverTime: now,
    });
  }
}
