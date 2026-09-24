import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resetEnvCache } from '../../src/config/env';
import { StorageService, StorageUnavailableError } from '../../src/storage/storage.service';
import { TEST_MASTER_KEY, TEST_SESSION_SECRET } from './helpers/test-app';
import { startMinio, TEST_MINIO_ACCESS_KEY, TEST_MINIO_BUCKET, TEST_MINIO_SECRET_KEY, type StartedMinio } from './helpers/minio';

/**
 * F01's scheduled storage-adapter debt, paid off here (see project memory
 * `storage-test-debt-f01`): round trip, stat hit/miss, the unavailable-store
 * distinction, streamed upload/download and bulk delete, none of which had
 * automated coverage before F07 — the first feature that actually writes
 * objects (`putObject`/`getObject`/`ensureBucket` were only ever exercised
 * indirectly, at boot and by the `/health` probe).
 */
describe('StorageService', () => {
  let minio: StartedMinio;

  beforeAll(async () => {
    minio = await startMinio();

    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      SESSION_SECRET: TEST_SESSION_SECRET,
      BYOK_MASTER_KEY: TEST_MASTER_KEY,
      S3_ENDPOINT: minio.endpoint,
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY: TEST_MINIO_ACCESS_KEY,
      S3_SECRET_KEY: TEST_MINIO_SECRET_KEY,
      S3_BUCKET: TEST_MINIO_BUCKET,
      LIVEKIT_URL: 'http://localhost:7880',
      LIVEKIT_WS_URL: 'ws://localhost:7880',
      LIVEKIT_API_KEY: 'devkey',
      LIVEKIT_API_SECRET: 'devsecret',
    });
    resetEnvCache();

    const bootstrap = new StorageService();
    await bootstrap.ensureBucket();
    bootstrap.destroy();
  }, 180_000);

  afterAll(async () => {
    await minio?.stop();
    resetEnvCache();
  });

  it('round_trips_an_object', async () => {
    const storage = new StorageService();
    try {
      await storage.putObject('lessons/round-trip.bin', Buffer.from('hello world'));
      const body = await storage.getObject('lessons/round-trip.bin');
      expect(body.toString('utf8')).toBe('hello world');
    } finally {
      storage.destroy();
    }
  });

  it('stat_returns_the_size_of_an_existing_object', async () => {
    const storage = new StorageService();
    try {
      await storage.putObject('lessons/stat-hit.bin', Buffer.from('twelve bytes'));
      const size = await storage.statObject('lessons/stat-hit.bin');
      expect(size).toBe(Buffer.byteLength('twelve bytes'));
    } finally {
      storage.destroy();
    }
  });

  it('stat_returns_null_for_a_missing_object', async () => {
    const storage = new StorageService();
    try {
      const size = await storage.statObject('lessons/does-not-exist.bin');
      expect(size).toBeNull();
    } finally {
      storage.destroy();
    }
  });

  it('stat_throws_storage_unavailable_when_the_store_is_unreachable', async () => {
    Object.assign(process.env, { S3_ENDPOINT: 'http://127.0.0.1:1' });
    resetEnvCache();
    const storage = new StorageService();

    try {
      await expect(storage.statObject('lessons/anything.bin')).rejects.toBeInstanceOf(
        StorageUnavailableError,
      );
    } finally {
      storage.destroy();
      Object.assign(process.env, { S3_ENDPOINT: minio.endpoint });
      resetEnvCache();
    }
  });

  it('uploads_and_downloads_a_file_by_stream', async () => {
    const storage = new StorageService();
    const dir = await mkdtemp(join(tmpdir(), 'storage-spec-'));
    try {
      const localIn = join(dir, 'in.bin');
      const localOut = join(dir, 'out.bin');
      await writeFile(localIn, Buffer.from('streamed content, byte for byte'));

      await storage.uploadFile('lessons/streamed.bin', localIn);
      await storage.downloadToFile('lessons/streamed.bin', localOut);

      const roundTrip = await readFile(localOut);
      expect(roundTrip.toString('utf8')).toBe('streamed content, byte for byte');
    } finally {
      await rm(dir, { recursive: true, force: true });
      storage.destroy();
    }
  });

  it('deletes_objects', async () => {
    const storage = new StorageService();
    try {
      await storage.putObject('lessons/delete-a.bin', Buffer.from('a'));
      await storage.putObject('lessons/delete-b.bin', Buffer.from('b'));

      await storage.deleteObjects(['lessons/delete-a.bin', 'lessons/delete-b.bin']);

      expect(await storage.statObject('lessons/delete-a.bin')).toBeNull();
      expect(await storage.statObject('lessons/delete-b.bin')).toBeNull();
    } finally {
      storage.destroy();
    }
  });

  it('delete_objects_is_a_no_op_for_an_empty_list', async () => {
    const storage = new StorageService();
    try {
      await expect(storage.deleteObjects([])).resolves.toBeUndefined();
    } finally {
      storage.destroy();
    }
  });

  it('ensure_bucket_is_idempotent_on_a_second_boot', async () => {
    const storage = new StorageService();
    try {
      await expect(storage.ensureBucket()).resolves.toBeUndefined();
      await expect(storage.ensureBucket()).resolves.toBeUndefined();
      expect(await storage.objectExists('lessons/.keep')).toBe(true);
    } finally {
      storage.destroy();
    }
  });
});
