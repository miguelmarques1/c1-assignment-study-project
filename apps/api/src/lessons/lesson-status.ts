import type {
  LessonHistoryFlag,
  LessonHistoryStatus,
  LessonScenarioStatus,
  OtherParticipantStage,
  ParticipantStageState,
  PipelineStage,
} from '@english-quest/shared';

import { PIPELINE_STAGE_ORDER, STORAGE_UNAVAILABLE_REASON } from '../pipeline/pipeline.constants';
import { LESSON_STATUS_REASONS } from './lessons.constants';

/** The lesson columns the derivation reads. */
export interface LessonStatusSource {
  status: string;
  recordingStatus: string;
  startedAt: Date | null;
  recordingFinalizedAt: Date | null;
}

/** A stage row as the derivation needs it. The caller's own rows carry `reason`; another participant's never do. */
export interface StageSnapshot {
  stage: string;
  status: string;
  reason?: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface BranchSnapshot {
  stage: string;
  status: string;
  failureReason?: string | null;
  launchedAt: Date | null;
  stages: StageSnapshot[];
}

export interface DerivedLessonStatus {
  status: LessonHistoryStatus;
  flags: LessonHistoryFlag[];
  activeStage: PipelineStage | null;
  statusReason: string | null;
}

/** The recording lifecycle before F07 has settled the lesson — no branch may exist yet. */
const RECORDING_NOT_FINALIZED = new Set(['idle', 'starting', 'recording', 'not_recording', 'finalizing']);

/**
 * Flags sit beside the status and never replace it (F19, A1): a partial or
 * no-scenario lesson can still be ready, blocked or failed. `no_scenario`
 * mirrors F11's context `none` — any situation that was not `ready` (A5).
 */
export function lessonFlags(lesson: LessonStatusSource, scenarioStatus: LessonScenarioStatus): LessonHistoryFlag[] {
  const flags: LessonHistoryFlag[] = [];
  if (lesson.recordingStatus === 'recording_partial') {
    flags.push('partial');
  }
  if (scenarioStatus !== 'ready') {
    flags.push('no_scenario');
  }
  if (lesson.status === 'ended_unexpectedly') {
    flags.push('ended_unexpectedly');
  }
  return flags;
}

/**
 * The caller's own status for one lesson, by the spec's precedence table
 * (section 2): the first matching row wins. Derived from the lesson's
 * recording status and the caller's own branch only, so another
 * participant's progress never changes it (A2). `Ready` means the caller's
 * analysis completed, whatever later stages are still doing (A3).
 */
export function deriveLessonStatus(
  lesson: LessonStatusSource,
  branch: BranchSnapshot | null,
  scenarioStatus: LessonScenarioStatus,
): DerivedLessonStatus {
  const flags = lessonFlags(lesson, scenarioStatus);
  const result = (
    status: LessonHistoryStatus,
    activeStage: PipelineStage | null,
    statusReason: string | null,
  ): DerivedLessonStatus => ({ status, flags, activeStage, statusReason });

  if (lesson.recordingStatus === 'too_short') {
    return result('too_short', null, LESSON_STATUS_REASONS.tooShort);
  }
  if (lesson.recordingStatus === 'recording_failed') {
    return result('recording_failed', null, LESSON_STATUS_REASONS.recordingFailed);
  }

  if (!branch) {
    if (RECORDING_NOT_FINALIZED.has(lesson.recordingStatus)) {
      return result('processing', 'recording', null);
    }
    if (lesson.recordingStatus === 'storage_unavailable') {
      return result('failed', 'recording', STORAGE_UNAVAILABLE_REASON);
    }
    return result('failed', null, LESSON_STATUS_REASONS.noBranch);
  }

  const stage = branch.stage as PipelineStage;
  if (branch.status === 'failed') {
    return result('failed', stage, branch.failureReason ?? null);
  }
  if (branch.status === 'storage_unavailable') {
    return result('failed', stage, STORAGE_UNAVAILABLE_REASON);
  }
  if (branch.status === 'blocked_missing_key') {
    const row = branch.stages.find((candidate) => candidate.stage === branch.stage);
    return result('blocked', stage, row?.reason ?? LESSON_STATUS_REASONS.blockedFallback);
  }

  const analysis = branch.stages.find((candidate) => candidate.stage === 'lesson_analysis');
  if (analysis?.status === 'completed') {
    return result('ready', null, null);
  }
  return result('processing', stage, null);
}

/** A stage row's status, collapsed to what another participant may know about it (F19, A10). */
function coarseState(status: string): ParticipantStageState {
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'failed') {
    return 'unavailable';
  }
  // queued, running, retrying and blocked_missing_key: someone else's key
  // state and retry are theirs, so blocked reads as still pending.
  return 'pending';
}

/**
 * Another participant's processing, one entry per stage of the shared
 * order, with no reason, provider, progress or retry anywhere — the
 * return type has no field for them. `recording` follows the same rule as
 * the caller's own pipeline view: done once the branch launched or moved
 * on, unavailable when it failed there.
 */
export function coarseStages(branch: BranchSnapshot | null, lesson: LessonStatusSource): OtherParticipantStage[] {
  const notStarted = (stage: PipelineStage): OtherParticipantStage => ({
    stage,
    state: 'not_started',
    startedAt: null,
    finishedAt: null,
  });

  return PIPELINE_STAGE_ORDER.map((stage): OtherParticipantStage => {
    if (stage === 'recording') {
      if (!branch) {
        return RECORDING_NOT_FINALIZED.has(lesson.recordingStatus)
          ? { stage, state: 'pending', startedAt: null, finishedAt: null }
          : { stage, state: 'unavailable', startedAt: null, finishedAt: null };
      }
      if (branch.stage !== 'recording' || branch.launchedAt) {
        return {
          stage,
          state: 'completed',
          startedAt: lesson.startedAt?.toISOString() ?? null,
          finishedAt: lesson.recordingFinalizedAt?.toISOString() ?? null,
        };
      }
      if (branch.status === 'failed' || branch.status === 'storage_unavailable') {
        return { stage, state: 'unavailable', startedAt: null, finishedAt: null };
      }
      return { stage, state: 'pending', startedAt: null, finishedAt: null };
    }

    const row = branch?.stages.find((candidate) => candidate.stage === stage);
    if (!row) {
      return notStarted(stage);
    }
    const state = coarseState(row.status);
    return state === 'completed'
      ? { stage, state, startedAt: row.startedAt?.toISOString() ?? null, finishedAt: row.finishedAt?.toISOString() ?? null }
      : { stage, state, startedAt: null, finishedAt: null };
  });
}
