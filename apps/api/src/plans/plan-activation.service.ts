import { Injectable } from '@nestjs/common';
import type { StudyPlanActivity } from '@prisma/client';

import { ContentBankService } from '../content/content-bank.service';
import type { ComposedPlan } from './plan-composer.service';
import { deterministicNoteCode } from './plan-composer.service';
import { PLAN_NOTES, PLAN_NOTE_ORDER } from './plan.constants';
import { selectCarryOver, type CarryOverCandidate } from './composition/carry-over';
import { atLeast, precedenceOf } from './composition/precedence';
import { focusTagsOf } from './composition/summary-line';
import { packSessions } from './composition/session-packer';
import { NewActivityRow, PlanRepository, type TxClient } from './plan.repository';

export type ActivationOutcome = 'activated' | 'archived_on_arrival' | 'existing';

export interface ActivationResult {
  planId: string;
  outcome: ActivationOutcome;
}

function activityToCarryCandidate(activity: StudyPlanActivity): CarryOverCandidate {
  return {
    id: activity.id,
    kind: activity.kind as CarryOverCandidate['kind'],
    contentItemId: activity.contentItemId,
    title: activity.title,
    targetTags: activity.targetTags,
    estimatedMinutes: activity.estimatedMinutes,
    isReview: activity.isReview,
    state: activity.state as 'pending' | 'in_progress',
    startedAt: activity.startedAt,
    day: activity.day,
    position: activity.position,
  };
}

/**
 * The one place a plan is written. Runs inside the caller's transaction
 * (the `plan_generation` stage's `complete`, or the request job's own),
 * under a per-user advisory lock: idempotent per (user, lesson, origin),
 * archives on arrival when outranked, otherwise carries over, packs,
 * archives the previous plan, inserts the new one and records servings
 * (spec §5 `PlanActivationService.activate`, A2, A11, A13, A19, A20).
 */
@Injectable()
export class PlanActivationService {
  constructor(
    private readonly repository: PlanRepository,
    private readonly content: ContentBankService,
  ) {}

  async activate(tx: TxClient, userId: string, composed: ComposedPlan, lessonTime: Date): Promise<ActivationResult> {
    await this.repository.lock(tx, userId);

    const existingForBuild = await this.repository.findByLessonOrigin(tx, userId, composed.lessonId, composed.origin);
    if (existingForBuild) {
      return { planId: existingForBuild.id, outcome: 'existing' };
    }

    const now = new Date();
    const buildPrecedence = precedenceOf(lessonTime, composed.origin);
    const active = await this.repository.findActive(tx, userId);
    const activePrecedence = active ? precedenceOf(active.precedenceAt, active.origin as ComposedPlan['origin']) : null;
    const outranked = activePrecedence !== null && atLeast(activePrecedence, buildPrecedence);

    if (outranked) {
      const planId = await this.repository.insertPlan(tx, {
        userId,
        lessonId: composed.lessonId,
        origin: composed.origin,
        status: 'archived',
        precedenceAt: lessonTime,
        composition: composed.composition,
        deterministicReason: composed.deterministicReason,
        generalMaterial: composed.generalMaterial,
        notes: this.notesFor(composed),
        focusTags: [],
        promptId: composed.promptId,
        promptVersion: composed.promptVersion,
        model: composed.model,
        modelSelectionStats: composed.modelSelectionStats,
        generationRunId: composed.generationRunId,
        rulesVersion: composed.rulesVersion,
        rulesFingerprint: composed.rulesFingerprint,
        taxonomyVersion: composed.taxonomyVersion,
        supersededByPlanId: active!.id,
        createdAt: now,
        activatedAt: null,
        archivedAt: now,
      });
      return { planId, outcome: 'archived_on_arrival' };
    }

    const carryOverSource = (active?.activities ?? []).filter((activity) => activity.state === 'pending' || activity.state === 'in_progress');
    const carried = selectCarryOver(
      carryOverSource.map(activityToCarryCandidate),
      new Set([...composed.tagPriority.keys()]),
      composed.rules,
      composed.rationaleCtx,
    );

    // Archiving the previous active plan before inserting the new one
    // matters, not just for tidiness: `ux_study_plans_user_active` is a
    // plain (non-deferrable) unique index on `user_id` where `status =
    // 'active'`, checked immediately on each write. Inserting the new
    // active row first — even inside the same transaction — would violate
    // it while the old row is still active.
    if (active) {
      await this.repository.archive(tx, active.id, now);
    }

    const sessions = packSessions(carried, composed.selection, composed.rules);
    const planId = await this.repository.insertPlan(tx, {
      userId,
      lessonId: composed.lessonId,
      origin: composed.origin,
      status: 'active',
      precedenceAt: lessonTime,
      composition: composed.composition,
      deterministicReason: composed.deterministicReason,
      generalMaterial: composed.generalMaterial,
      notes: this.notesFor(composed),
      focusTags: focusTagsOf(
        sessions.flatMap((session) => session.activities),
        composed.tagPriority,
      ),
      promptId: composed.promptId,
      promptVersion: composed.promptVersion,
      model: composed.model,
      modelSelectionStats: composed.modelSelectionStats,
      generationRunId: composed.generationRunId,
      rulesVersion: composed.rulesVersion,
      rulesFingerprint: composed.rulesFingerprint,
      taxonomyVersion: composed.taxonomyVersion,
      supersededByPlanId: null,
      createdAt: now,
      activatedAt: now,
      archivedAt: null,
    });

    const activityRows: NewActivityRow[] = sessions.flatMap((session) =>
      session.activities.map(
        (activity): NewActivityRow => ({
          userId,
          day: activity.day,
          position: activity.position,
          kind: activity.kind,
          contentItemId: activity.contentItemId,
          title: activity.title,
          targetTags: activity.targetTags,
          isReview: activity.isReview,
          estimatedMinutes: activity.estimatedMinutes,
          rationale: activity.rationale,
          rationaleSource: activity.placement === 'model' ? 'model' : 'template',
          placement: activity.placement,
          carriedFromActivityId: activity.carriedFromActivityId,
          state: activity.state,
          startedAt: activity.startedAt,
        }),
      ),
    );
    await this.repository.insertActivities(tx, planId, activityRows);

    const servedItemIds = [...new Set(activityRows.flatMap((row) => (row.contentItemId ? [row.contentItemId] : [])))];
    await this.content.recordServed(userId, servedItemIds, tx);

    return { planId, outcome: 'activated' };
  }

  private notesFor(composed: ComposedPlan): Array<{ code: string; text: string }> {
    const codes: string[] = [];
    if (composed.origin === 'recording_failed') {
      codes.push('recording_failed');
    }
    const deterministicCode = deterministicNoteCode(composed.deterministicReason);
    if (deterministicCode && !codes.includes(deterministicCode)) {
      codes.push(deterministicCode);
    }
    if (composed.generalMaterial) {
      codes.push('general_material');
    }
    for (const note of composed.selection.notes) {
      if (!codes.includes(note)) {
        codes.push(note);
      }
    }
    const ordered = PLAN_NOTE_ORDER.filter((code) => codes.includes(code));
    return ordered.map((code) => ({ code, text: PLAN_NOTES[code] }));
  }
}
