import type { ParticipantInfo } from 'livekit-server-sdk';

import { LiveKitService } from '../../../src/classroom/livekit.service';
import type { EgressUnavailableError } from '../../../src/recording/egress.service';

/**
 * Overrides only `listParticipants` — `LiveKitService` is also the class
 * `ClassroomWebhookController.verifyWebhook` and `ClassroomService`'s
 * token/room calls depend on, and overriding the provider by class token
 * replaces every registration of it in the app (both `ClassroomModule`'s and
 * `RecordingModule`'s own instance). Extending the real class keeps webhook
 * signature verification genuine — these suites still sign real JWTs — while
 * only `listParticipants` (the one call `RecordingOrchestrator.onLessonStarted`
 * makes) needs to be scripted per test, without a real LiveKit server.
 */
export class FakeLiveKitService extends LiveKitService {
  participantsToReturn: ParticipantInfo[] = [];
  listParticipantsError: Error | null = null;

  override async listParticipants(): Promise<ParticipantInfo[]> {
    if (this.listParticipantsError) {
      throw this.listParticipantsError;
    }
    return this.participantsToReturn;
  }
}

export interface FakeEgressResult {
  egressId: string;
}

/**
 * Stands in for `EgressService`. Each call to `startTrackEgress` consumes
 * the next queued outcome (a result or a thrown error), so a test can script
 * "fails once, then succeeds" for the retry path, or "always fails" for the
 * exhausted-retry path — without needing a real egress process at all.
 */
export class FakeEgressService {
  private startOutcomes: Array<FakeEgressResult | Error> = [];
  private nextAutoId = 1;
  readonly startCalls: Array<{ trackId: string; objectKey: string }> = [];
  readonly stopCalls: string[] = [];
  egressesStillTracked: string[] = [];

  /** Queues one outcome per call to `startTrackEgress`, consumed in order. */
  queueStart(...outcomes: Array<FakeEgressResult | Error>): void {
    this.startOutcomes.push(...outcomes);
  }

  async startTrackEgress(params: { trackId: string; objectKey: string }): Promise<FakeEgressResult> {
    this.startCalls.push(params);
    const outcome = this.startOutcomes.shift();
    if (outcome instanceof Error) {
      throw outcome;
    }
    if (outcome) {
      return outcome;
    }
    return { egressId: `EG_auto_${this.nextAutoId++}` };
  }

  async stopEgress(egressId: string): Promise<void> {
    this.stopCalls.push(egressId);
  }

  async listEgress(): Promise<Array<{ egressId: string }>> {
    return this.egressesStillTracked.map((egressId) => ({ egressId }));
  }
}

export function makeEgressUnavailable(message = 'simulated transport failure'): Error {
  const error = new Error(message) as EgressUnavailableError;
  error.name = 'EgressUnavailableError';
  return error;
}
