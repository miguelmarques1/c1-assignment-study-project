import { Injectable } from '@nestjs/common';
import type {
  LessonDetailView,
  LessonList,
  LessonListQuery,
  LessonScenarioStatus,
  LessonSummary,
  OtherParticipantProcessing,
  RoleCardStatus,
  VocabularyDomain,
} from '@english-quest/shared';
import type { Lesson, Prisma } from '@prisma/client';

import { LessonAnalysisReader } from '../analysis/analysis-result.reader';
import { AppError } from '../common/app-error';
import { LessonAccessService } from '../pipeline/lesson-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { PronunciationResultReader } from '../pronunciation/pronunciation-result.reader';
import { decodeCursor, encodeCursor } from './lesson-cursor';
import { deltasByLesson, headlineText, type LessonDeltas } from './lesson-headline';
import { coarseStages, deriveLessonStatus, type BranchSnapshot } from './lesson-status';
import { HISTORY_LESSON_STATUSES } from './lessons.constants';

/** The caller's own branch: every column the status derivation may read, with its stage rows. */
const OWN_BRANCH_SELECT = {
  lessonId: true,
  stage: true,
  status: true,
  failureReason: true,
  launchedAt: true,
  stages: { select: { stage: true, status: true, reason: true, startedAt: true, finishedAt: true } },
} satisfies Prisma.LessonPipelineBranchSelect;

/**
 * Another participant's branch: pointer and timings only. `failure_reason`,
 * a stage's `reason`, `provider_message` and `blocked_provider` are never
 * selected, so no code path below could pass them on.
 */
const OTHER_BRANCH_SELECT = {
  userId: true,
  stage: true,
  status: true,
  launchedAt: true,
  stages: { select: { stage: true, status: true, startedAt: true, finishedAt: true } },
} satisfies Prisma.LessonPipelineBranchSelect;

type ParticipantRow = {
  lessonId: string;
  userId: string;
  joinedAt: Date;
  audioBytes: bigint | null;
  user: { displayName: string };
};

type ScenarioRow = { lessonId: string; status: string; title: string | null; vocabularyDomain: string | null };

type ListedLesson = Pick<
  Lesson,
  'id' | 'status' | 'startedAt' | 'endedAt' | 'durationSeconds' | 'recordingStatus' | 'recordingFinalizedAt'
>;

const LESSON_SELECT = {
  id: true,
  status: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  recordingStatus: true,
  recordingFinalizedAt: true,
} satisfies Prisma.LessonSelect;

/** Everything a page of summaries needs, loaded once per page rather than once per row. */
interface SummaryContext {
  callerId: string;
  participants: Map<string, ParticipantRow[]>;
  branches: Map<string, BranchSnapshot>;
  scenarios: Map<string, ScenarioRow>;
  deltas: Map<string, LessonDeltas>;
}

/**
 * F19's history reads: the caller's lessons with a status derived from
 * their own branch, and one lesson's summary with every other
 * participant's processing reduced to coarse states. Nothing here reads
 * another participant's role card, analysis, pronunciation rows or stage
 * reasons.
 */
@Injectable()
export class LessonHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LessonAccessService,
    private readonly analyses: LessonAnalysisReader,
    private readonly pronunciation: PronunciationResultReader,
  ) {}

  async list(callerId: string, query: LessonListQuery): Promise<LessonList> {
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw AppError.validationFailed([{ path: 'cursor', message: 'The cursor is not one this API issued.' }]);
    }

    const visible: Prisma.LessonWhereInput = {
      status: { in: [...HISTORY_LESSON_STATUSES] },
      startedAt: { not: null },
      participants: { some: { userId: callerId } },
    };
    const page = await this.prisma.lesson.findMany({
      where: {
        ...visible,
        ...(cursor
          ? {
              OR: [
                { startedAt: { lt: cursor.startedAt } },
                { startedAt: cursor.startedAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: LESSON_SELECT,
    });

    const hasMore = page.length > query.limit;
    const lessons = hasMore ? page.slice(0, query.limit) : page;
    const last = lessons[lessons.length - 1];

    const [context, storage] = await Promise.all([
      this.loadContext(
        callerId,
        lessons.map((lesson) => lesson.id),
      ),
      this.prisma.lessonParticipant.aggregate({ where: { lesson: visible }, _sum: { audioBytes: true } }),
    ]);

    return {
      lessons: lessons.map((lesson) => this.summary(lesson, context)),
      nextCursor: hasMore && last ? encodeCursor({ startedAt: last.startedAt!, id: last.id }) : null,
      totalStorageBytes: Number(storage._sum.audioBytes ?? 0n),
    };
  }

  async detail(lessonId: string, callerId: string): Promise<LessonDetailView> {
    await this.access.requireParticipant(lessonId, callerId);
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: LESSON_SELECT });
    // Only lessons the list would show have a history entry; an open or
    // abandoned lesson reads as not available, like one the caller never joined.
    if (!lesson?.startedAt || !(HISTORY_LESSON_STATUSES as readonly string[]).includes(lesson.status)) {
      throw AppError.notAParticipant();
    }

    const [context, myCard, others] = await Promise.all([
      this.loadContext(callerId, [lessonId]),
      this.prisma.lessonRoleCard.findUnique({
        where: { lessonId_userId: { lessonId, userId: callerId } },
        select: { status: true },
      }),
      this.prisma.lessonPipelineBranch.findMany({
        where: { lessonId, userId: { not: callerId } },
        select: OTHER_BRANCH_SELECT,
      }),
    ]);

    const summary = this.summary(lesson, context);
    const branchOf = new Map(others.map((branch) => [branch.userId, branch]));
    const otherParticipants: OtherParticipantProcessing[] = (context.participants.get(lessonId) ?? [])
      .filter((participant) => participant.userId !== callerId)
      .map((participant) => ({
        userId: participant.userId,
        displayName: participant.user.displayName,
        stages: coarseStages(branchOf.get(participant.userId) ?? null, lesson),
      }));

    return {
      ...summary,
      scenario: {
        status: this.scenarioStatus(context.scenarios.get(lessonId)),
        myCardStatus: (myCard?.status ?? null) as RoleCardStatus | null,
      },
      others: otherParticipants,
    };
  }

  /** Batched reads for a set of lessons — a constant number of queries, whatever the page size. */
  private async loadContext(callerId: string, lessonIds: string[]): Promise<SummaryContext> {
    if (lessonIds.length === 0) {
      return { callerId, participants: new Map(), branches: new Map(), scenarios: new Map(), deltas: new Map() };
    }

    const [participants, branches, scenarios, analysisTimeline, pronunciationTimeline] = await Promise.all([
      this.prisma.lessonParticipant.findMany({
        where: { lessonId: { in: lessonIds } },
        orderBy: [{ joinedAt: 'asc' }, { createdAt: 'asc' }],
        select: { lessonId: true, userId: true, joinedAt: true, audioBytes: true, user: { select: { displayName: true } } },
      }),
      this.prisma.lessonPipelineBranch.findMany({
        where: { lessonId: { in: lessonIds }, userId: callerId },
        select: OWN_BRANCH_SELECT,
      }),
      this.prisma.lessonScenario.findMany({
        where: { lessonId: { in: lessonIds } },
        select: { lessonId: true, status: true, title: true, vocabularyDomain: true },
      }),
      this.analyses.scoreTimelineFor(callerId),
      this.pronunciation.scoreTimelineFor(callerId),
    ]);

    const participantsByLesson = new Map<string, ParticipantRow[]>();
    for (const participant of participants) {
      const list = participantsByLesson.get(participant.lessonId) ?? [];
      list.push(participant);
      participantsByLesson.set(participant.lessonId, list);
    }

    return {
      callerId,
      participants: participantsByLesson,
      branches: new Map(branches.map((branch) => [branch.lessonId, branch])),
      scenarios: new Map(scenarios.map((scenario) => [scenario.lessonId, scenario])),
      deltas: deltasByLesson(analysisTimeline, pronunciationTimeline),
    };
  }

  private scenarioStatus(scenario: ScenarioRow | undefined): LessonScenarioStatus {
    return (scenario?.status ?? 'none') as LessonScenarioStatus;
  }

  private summary(lesson: ListedLesson, context: SummaryContext): LessonSummary {
    const scenario = context.scenarios.get(lesson.id);
    const scenarioStatus = this.scenarioStatus(scenario);
    const participants = context.participants.get(lesson.id) ?? [];
    const derived = deriveLessonStatus(lesson, context.branches.get(lesson.id) ?? null, scenarioStatus);
    const deltas = context.deltas.get(lesson.id);
    const ready = scenarioStatus === 'ready' && scenario;

    return {
      lessonId: lesson.id,
      startedAt: lesson.startedAt!.toISOString(),
      endedAt: lesson.endedAt?.toISOString() ?? null,
      durationSeconds: lesson.durationSeconds,
      participants: participants.map((participant) => ({
        userId: participant.userId,
        displayName: participant.user.displayName,
        isMe: participant.userId === context.callerId,
      })),
      scenarioTitle: ready ? scenario.title : null,
      vocabularyDomain: ready ? (scenario.vocabularyDomain as VocabularyDomain | null) : null,
      status: derived.status,
      flags: derived.flags,
      activeStage: derived.activeStage,
      statusReason: derived.statusReason,
      headline: derived.status === 'ready' && deltas ? headlineText(deltas) : null,
      storageBytes: participants.reduce((sum, participant) => sum + Number(participant.audioBytes ?? 0n), 0),
    };
  }
}
