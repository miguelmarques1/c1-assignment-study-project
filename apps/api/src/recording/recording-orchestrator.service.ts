import { Injectable, Logger } from '@nestjs/common';
import { EgressStatus, TrackSource, TrackType, type WebhookEvent } from 'livekit-server-sdk';

import { LiveKitService } from '../classroom/livekit.service';
import { CLASSROOM_ROOM_NAME } from '../classroom/classroom.constants';
import { EgressService } from './egress.service';
import { RecordingStateService } from './recording-state.service';
import { EGRESS_START_RETRY_DELAY_MS, MAX_EGRESS_RESTARTS, MAX_EGRESS_START_ATTEMPTS } from './recording.constants';

const UNEXPECTED_END_STATUSES = new Set([
  EgressStatus.EGRESS_FAILED,
  EgressStatus.EGRESS_ABORTED,
  EgressStatus.EGRESS_LIMIT_REACHED,
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** LiveKit's own event timestamp — never the API's receipt time, matching `LessonLifecycleService`. */
function eventTime(event: WebhookEvent): Date {
  return new Date(Number(event.createdAt) * 1000);
}

/** A `bigint` field of `0` means "not yet reported"; anything else is nanoseconds since epoch. */
function fromEgressNanos(nanos: bigint): Date | null {
  if (nanos === 0n) {
    return null;
  }
  return new Date(Number(nanos / 1_000_000n));
}

/**
 * Live recording behaviour: starting an egress per published microphone
 * track, retrying a failed start once, restarting an unexpectedly-ended
 * egress once, and moving the lesson between `starting`, `recording` and the
 * sticky `not_recording`. Resolves lessons directly through
 * `RecordingStateService`'s own Prisma queries rather than importing
 * `ClassroomModule`'s `LessonService` — the same avoid-a-circular-import
 * choice F06's `ScenarioService` made, since `ClassroomModule` imports this
 * module for the webhook wiring. For the same reason this module keeps its
 * own `LiveKitService` instance rather than importing `ClassroomModule`'s;
 * the class is a stateless SDK wrapper, so a second instance costs nothing.
 */
@Injectable()
export class RecordingOrchestrator {
  private readonly logger = new Logger(RecordingOrchestrator.name);

  constructor(
    private readonly state: RecordingStateService,
    private readonly egress: EgressService,
    private readonly liveKit: LiveKitService,
  ) {}

  /**
   * Called once, only on the webhook event that actually moved the lesson to
   * `live` (the caller checks this — a replayed `participant_joined` must
   * never start a second round of egress). Reads the room's live occupancy
   * because any track published during the waiting period already had its
   * own `track_published` event fire and ignored, per `onTrackPublished`.
   */
  async onLessonStarted(lessonId: string): Promise<void> {
    await this.state.markLessonStarting(lessonId);

    let participants;
    try {
      participants = await this.liveKit.listParticipants(CLASSROOM_ROOM_NAME);
    } catch (error) {
      this.logger.warn(
        `Could not list participants to start recording for lesson ${lessonId}: ${errorMessage(error)}`,
      );
      await this.state.markLessonNotRecording(lessonId);
      return;
    }

    for (const participant of participants) {
      const audioTrack = participant.tracks.find(
        (track) => track.type === TrackType.AUDIO && track.source === TrackSource.MICROPHONE,
      );
      if (audioTrack) {
        await this.startEgressForTrack(lessonId, participant.identity, audioTrack.sid);
      }
    }
  }

  /** A microphone published after the lesson was already live — a late joiner, a reconnect, or a rejoin. */
  async onTrackPublished(event: WebhookEvent): Promise<void> {
    const room = event.room?.name;
    const identity = event.participant?.identity;
    const track = event.track;
    if (!room || !identity || !track) {
      return;
    }
    if (track.type !== TrackType.AUDIO || track.source !== TrackSource.MICROPHONE) {
      return;
    }

    const lesson = await this.state.findLiveLesson(room);
    if (!lesson) {
      // Not live yet (still waiting — F06 may already be generating a
      // scenario over this room) or already ended. Either way, nothing to record.
      return;
    }

    await this.startEgressForTrack(lesson.id, identity, track.sid);
  }

  /** `egress_started` / `egress_updated`: only `EGRESS_ACTIVE` matters — that is what "recording" means. */
  async onEgressUpdated(event: WebhookEvent): Promise<void> {
    const info = event.egressInfo;
    if (!info || info.status !== EgressStatus.EGRESS_ACTIVE) {
      return;
    }

    const segment = await this.state.findSegmentByEgressId(info.egressId);
    if (!segment) {
      return;
    }

    const file = info.fileResults[0];
    const fileStartedAt = (file ? fromEgressNanos(file.startedAt) : null) ?? eventTime(event);

    const updated = await this.state.markSegmentActive(info.egressId, fileStartedAt);
    if (!updated || updated.status !== 'active') {
      // Already active (a replayed event) — the writes below already ran once.
      return;
    }

    await this.state.markParticipantRecording(segment.lessonId, segment.userId);
    await this.state.markLessonRecording(segment.lessonId, fileStartedAt);
  }

  /**
   * `egress_ended`. `unexpected` — the trigger for the single restart — is
   * `EGRESS_FAILED` / `EGRESS_ABORTED` / `EGRESS_LIMIT_REACHED` while the
   * lesson is still live. A clean end from the participant leaving or
   * unpublishing reports `EGRESS_COMPLETE`, never one of those three, so it
   * is never mistaken for a failure worth restarting.
   */
  async onEgressEnded(event: WebhookEvent): Promise<void> {
    const info = event.egressInfo;
    if (!info) {
      return;
    }

    const segment = await this.state.findSegmentByEgressId(info.egressId);
    if (!segment) {
      return;
    }

    const lesson = await this.state.getLesson(segment.lessonId);
    const unexpected = lesson?.status === 'live' && UNEXPECTED_END_STATUSES.has(info.status);
    const outcome: 'complete' | 'failed' = info.status === EgressStatus.EGRESS_COMPLETE ? 'complete' : 'failed';

    const file = info.fileResults[0];
    const fileEndedAt = (file ? fromEgressNanos(file.endedAt) : null) ?? eventTime(event);
    const fileStartedAt = (file ? fromEgressNanos(file.startedAt) : null) ?? segment.fileStartedAt;
    const durationMs =
      file && file.duration !== 0n
        ? Number(file.duration / 1_000_000n)
        : fileStartedAt
          ? fileEndedAt.getTime() - fileStartedAt.getTime()
          : null;
    const sizeBytes = file && file.size !== 0n ? Number(file.size) : null;

    const updated = await this.state.markSegmentEnded(info.egressId, {
      outcome,
      unexpected,
      fileStartedAt,
      fileEndedAt,
      durationMs,
      sizeBytes,
      error: outcome === 'failed' ? info.error || undefined : undefined,
    });
    if (!updated) {
      // Unknown egress id — acknowledged and ignored, per the webhook route's own rule.
      return;
    }
    if (updated.status !== outcome) {
      // Already terminal (a replayed event) — the restart, if any, already ran.
      return;
    }

    if (unexpected) {
      const attemptsSoFar = await this.state.countSegmentsForTrack(segment.trackSid);
      if (attemptsSoFar <= MAX_EGRESS_RESTARTS) {
        await this.startEgressForTrack(segment.lessonId, segment.userId, segment.trackSid);
        return; // The participant stays `recording` — a fresh segment is starting for them.
      }
    }

    await this.state.markParticipantStopped(segment.lessonId, segment.userId);
    if (unexpected) {
      // The restart budget is exhausted: this track's recording is incomplete for good.
      await this.state.markLessonNotRecording(segment.lessonId);
    }
  }

  /**
   * Starts an egress for one track, with one retry on a failed start. Safe
   * to call more than once for the same track — `findOpenSegmentForTrack`
   * makes a second call for a track already being handled a no-op.
   */
  private async startEgressForTrack(lessonId: string, userId: string, trackSid: string): Promise<void> {
    const existing = await this.state.findOpenSegmentForTrack(trackSid);
    if (existing) {
      return;
    }

    const segment = await this.state.createSegment(lessonId, userId, trackSid);
    if (segment.egressId || segment.status !== 'requested') {
      // A race with another handler for this same track already claimed it.
      return;
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_EGRESS_START_ATTEMPTS; attempt += 1) {
      try {
        const info = await this.egress.startTrackEgress({ trackId: trackSid, objectKey: segment.objectKey });
        await this.state.markSegmentStarting(segment.id, info.egressId, attempt);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_EGRESS_START_ATTEMPTS) {
          await sleep(EGRESS_START_RETRY_DELAY_MS);
        }
      }
    }

    this.logger.warn(
      `Egress failed to start for track ${trackSid} (lesson ${lessonId}, user ${userId}): ${errorMessage(lastError)}`,
    );
    await this.state.markSegmentFailedToStart(segment.id, MAX_EGRESS_START_ATTEMPTS, errorMessage(lastError));
    await this.state.markParticipantFailedToStart(lessonId, userId);
    await this.state.markLessonNotRecording(lessonId);
  }
}
