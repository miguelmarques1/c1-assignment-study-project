import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import ffmpegPath from 'ffmpeg-static';

import { StorageService } from '../../../src/storage/storage.service';
import { segmentObjectKey } from '../../../src/recording/recording.constants';

const execFileAsync = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;

/**
 * Generates a real Opus/Ogg tone of the given length and uploads it to the
 * exact object key a real egress would have written — standing in for what
 * LiveKit's own upload would have produced, so the finalizer's real
 * download-assemble-verify path runs against a real object, not a mock.
 */
export async function uploadTestSegment(params: {
  storage: StorageService;
  lessonId: string;
  userId: string;
  segmentId: string;
  durationSeconds: number;
}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'segment-fixture-'));
  try {
    const localPath = join(dir, 'segment.ogg');
    await execFileAsync(FFMPEG, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${params.durationSeconds}`,
      '-ac',
      '1',
      '-ar',
      '48000',
      '-c:a',
      'libopus',
      localPath,
    ]);

    const key = segmentObjectKey(params.lessonId, params.userId, params.segmentId);
    await params.storage.uploadFile(key, localPath);
    return key;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
