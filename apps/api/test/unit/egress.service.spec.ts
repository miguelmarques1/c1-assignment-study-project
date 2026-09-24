import { EgressClient, type EgressInfo } from 'livekit-server-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '../../src/config/env';
import { EgressService, EgressUnavailableError } from '../../src/recording/egress.service';
import { TEST_MASTER_KEY, TEST_SESSION_SECRET } from '../integration/helpers/test-app';

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  API_PORT: '3001',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: TEST_SESSION_SECRET,
  BYOK_MASTER_KEY: TEST_MASTER_KEY,
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
  S3_BUCKET: 'english-quest',
  LIVEKIT_URL: 'http://localhost:7880',
  LIVEKIT_WS_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'devsecret',
} as NodeJS.ProcessEnv;

interface DirectFileOutputLike {
  filepath: string;
  disableManifest: boolean;
  output: {
    case: string;
    value: {
      bucket: string;
      accessKey: string;
      secret: string;
      region: string;
      endpoint: string;
      forcePathStyle: boolean;
    };
  };
}

describe('EgressService', () => {
  beforeEach(() => {
    Object.assign(process.env, VALID_ENV);
    delete process.env.EGRESS_S3_ENDPOINT;
    resetEnvCache();
  });

  it('requests_an_ogg_file_at_the_segment_key', async () => {
    const spy = vi
      .spyOn(EgressClient.prototype, 'startTrackEgress')
      .mockResolvedValue({ egressId: 'EG_test' } as EgressInfo);

    try {
      const service = new EgressService();
      await service.startTrackEgress({
        trackId: 'TR_abc123',
        objectKey: 'lessons/lesson-1/user-1/segments/segment-1.ogg',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      const [room, output, trackId] = spy.mock.calls[0]!;
      expect(room).toBe('classroom-main');
      expect(trackId).toBe('TR_abc123');

      const file = output as unknown as DirectFileOutputLike;
      expect(file.filepath).toBe('lessons/lesson-1/user-1/segments/segment-1.ogg');
      // No manifest file alongside the media — every object under a lesson must be audio.
      expect(file.disableManifest).toBe(true);
      expect(file.output.case).toBe('s3');
    } finally {
      spy.mockRestore();
    }
  });

  it('uploads_to_the_configured_store_with_path_style', async () => {
    const spy = vi
      .spyOn(EgressClient.prototype, 'startTrackEgress')
      .mockResolvedValue({ egressId: 'EG_test' } as EgressInfo);

    try {
      const service = new EgressService();
      await service.startTrackEgress({ trackId: 'TR_abc123', objectKey: 'k' });

      const [, output] = spy.mock.calls[0]!;
      const s3 = (output as unknown as DirectFileOutputLike).output.value;
      expect(s3.bucket).toBe('english-quest');
      expect(s3.accessKey).toBe('minioadmin');
      expect(s3.secret).toBe('minioadmin');
      expect(s3.region).toBe('us-east-1');
      expect(s3.endpoint).toBe('http://localhost:9000');
      expect(s3.forcePathStyle).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('prefers_the_egress_s3_endpoint_when_set', async () => {
    Object.assign(process.env, { EGRESS_S3_ENDPOINT: 'http://egress-minio:9000' });
    resetEnvCache();
    const spy = vi
      .spyOn(EgressClient.prototype, 'startTrackEgress')
      .mockResolvedValue({ egressId: 'EG_test' } as EgressInfo);

    try {
      const service = new EgressService();
      await service.startTrackEgress({ trackId: 'TR_abc123', objectKey: 'k' });

      const [, output] = spy.mock.calls[0]!;
      const s3 = (output as unknown as DirectFileOutputLike).output.value;
      expect(s3.endpoint).toBe('http://egress-minio:9000');
    } finally {
      spy.mockRestore();
    }
  });

  it('translates_a_transport_failure', async () => {
    // Nothing listens on this port — a real connection failure, matching
    // LiveKitService's own unit test rather than mocking the transport.
    Object.assign(process.env, { LIVEKIT_URL: 'http://127.0.0.1:1' });
    resetEnvCache();

    const service = new EgressService();

    try {
      await service.listEgress();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EgressUnavailableError);
      expect((error as Error).message).toBe('Egress could not be reached.');
      // The raw SDK/transport error text must never leak into the message.
      expect((error as Error).message).not.toContain('127.0.0.1');
    }
  });
});
