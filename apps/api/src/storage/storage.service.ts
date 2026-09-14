import { Readable } from 'node:stream';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
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

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Liveness probe used by the health endpoint. */
  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  destroy(): void {
    this.client.destroy();
  }
}
