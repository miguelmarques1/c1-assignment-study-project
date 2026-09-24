import { readFile, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

import { env } from '../config/env';

/**
 * The only place in the codebase that knows an object store exists. Every later
 * feature — lesson recordings, imported content, activity audio — goes through
 * this adapter, so moving from MinIO to S3 is an endpoint and credential change
 * rather than a code change.
 */
export const STORAGE_PREFIXES = ['lessons/', 'content/', 'activities/'] as const;

export type StoragePrefix = (typeof STORAGE_PREFIXES)[number];

/**
 * Thrown by `statObject` when the store itself could not be reached — a
 * network failure, not "this key doesn't exist". F07's finalizer relies on
 * telling the two apart: a missing object fails one participant's branch,
 * while an unreachable store puts the whole lesson in `storage_unavailable`.
 */
export class StorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super('The object store could not be reached.');
    this.name = 'StorageUnavailableError';
    this.cause = cause;
  }
}

/** The S3 SDK's own shape for "no such key", across both AWS S3 and MinIO. */
function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === 'NotFound' || candidate.$metadata?.httpStatusCode === 404;
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  readonly bucket: string;

  // No constructor parameters: Nest resolves them as providers, and a config
  // object argument makes the container look for an Object provider.
  constructor() {
    const config = env();
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
      // MinIO addresses buckets by path rather than by subdomain.
      forcePathStyle: true,
    });
  }

  /**
   * Creates the bucket and the prefix markers if they are missing. Safe to run
   * on every boot.
   */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }

    // Object stores have no directories; a zero-byte marker is what makes a
    // prefix addressable and visible in the console.
    for (const prefix of STORAGE_PREFIXES) {
      await this.putObject(`${prefix}.keep`, Buffer.alloc(0), 'application/octet-stream');
    }
  }

  async putObject(key: string, body: Buffer, contentType = 'application/octet-stream'): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    const stream = response.Body as Readable | undefined;
    if (!stream) {
      throw new Error(`Object ${key} returned an empty body.`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The byte size of an object, `null` when it does not exist, or a thrown
   * `StorageUnavailableError` when the store itself could not be reached —
   * the distinction `objectExists` above cannot make, because it treats
   * every failure as "false".
   */
  async statObject(key: string): Promise<number | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return response.ContentLength ?? 0;
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw new StorageUnavailableError(error);
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /**
   * Deletes every key in one request. F07 uses this to clear a participant's
   * egress segments once their assembled `audio.ogg` has been verified.
   * A no-op for an empty list — S3's own `DeleteObjectsCommand` rejects a
   * request with zero objects.
   */
  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((key) => ({ Key: key })) },
      }),
    );
  }

  /**
   * Uploads a local file. Buffered rather than streamed — every current
   * caller uploads an assembled lesson recording, bounded by the 120-minute
   * lesson cap (well under 50 MB at F07's mono 48 kbps Opus), so this matches
   * `getObject`/`putObject`'s own buffered style rather than adding chunked
   * upload machinery for a file size that never needs it.
   */
  async uploadFile(key: string, filePath: string, contentType = 'application/octet-stream'): Promise<void> {
    const body = await readFile(filePath);
    await this.putObject(key, body, contentType);
  }

  /** Downloads an object to a local file. See `uploadFile` for why this buffers rather than streams. */
  async downloadToFile(key: string, filePath: string): Promise<void> {
    const body = await this.getObject(key);
    await writeFile(filePath, body);
  }

  /** Liveness probe used by the health endpoint. */
  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  destroy(): void {
    this.client.destroy();
  }
}
