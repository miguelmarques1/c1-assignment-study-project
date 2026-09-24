import { execFile } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';

import { firstLine } from '../credentials/validation/validation-outcome';
import {
  PRONUNCIATION_CLIP_DURATION_TOLERANCE_MS,
  PRONUNCIATION_CLIP_SAMPLE_RATE,
  PRONUNCIATION_MIN_CLIP_BYTES,
} from './pronunciation.constants';

const execFileAsync = promisify(execFile);

/** Thrown when ffmpeg itself fails, or the clip it produced is empty, too small, or too short to be real audio. */
export class ClipSliceError extends Error {
  override readonly name = 'ClipSliceError';
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

/**
 * Minimal RIFF/WAVE reader for our own PCM output. When `-ss` seeks past a
 * source's real content — which happens for a range that runs off the end
 * of the participant's `audio.ogg` — ffmpeg does not always fail or write an
 * empty file: it can exit 0 with a short clip covering only whatever led up
 * to EOF. A byte-size floor alone would accept that as real audio, so the
 * caller also checks this duration against what it asked for.
 */
async function wavDurationMs(filePath: string): Promise<number> {
  const buffer = await readFile(filePath);
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return 0;
  }
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      byteRate = buffer.readUInt32LE(body + 8);
    } else if (id === 'data') {
      dataSize = size;
    }
    offset = body + size + (size % 2);
  }
  return byteRate === 0 ? 0 : (dataSize / byteRate) * 1000;
}

/**
 * Cuts one excerpt's exact `[startMs, endMs)` range out of the participant's
 * `audio.ogg` into a 16 kHz mono 16-bit PCM WAV — the REST API's canonical
 * input. No padding: the cross-feature criterion is that the slice's range
 * matches the excerpt's timestamps exactly, and padding could also push a
 * 30 s excerpt past the REST cap. `-ss` before `-i` seeks the input; modern
 * ffmpeg still decodes-and-discards to the exact sample, so this stays both
 * fast and accurate.
 */
@Injectable()
export class ExcerptClipSlicer {
  private readonly logger = new Logger(ExcerptClipSlicer.name);

  async slice(sourcePath: string, startMs: number, endMs: number, outPath: string): Promise<void> {
    const startSec = (startMs / 1000).toFixed(3);
    const durationSec = ((endMs - startMs) / 1000).toFixed(3);

    try {
      await execFileAsync(
        ffmpegPath as unknown as string,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-ss',
          startSec,
          '-i',
          sourcePath,
          '-t',
          durationSec,
          '-ac',
          '1',
          '-ar',
          String(PRONUNCIATION_CLIP_SAMPLE_RATE),
          '-c:a',
          'pcm_s16le',
          outPath,
        ],
        { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      );
    } catch (error) {
      await rm(outPath, { force: true }).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`ffmpeg slice failed: ${message}`);
      throw new ClipSliceError(firstLine(message), error);
    }

    const size = await stat(outPath)
      .then((info) => info.size)
      .catch(() => 0);
    if (size < PRONUNCIATION_MIN_CLIP_BYTES) {
      await rm(outPath, { force: true }).catch(() => undefined);
      throw new ClipSliceError('The sliced clip was empty or too small to assess.');
    }

    const requestedMs = endMs - startMs;
    const actualMs = await wavDurationMs(outPath);
    if (actualMs < requestedMs - PRONUNCIATION_CLIP_DURATION_TOLERANCE_MS) {
      await rm(outPath, { force: true }).catch(() => undefined);
      throw new ClipSliceError('The sliced clip was shorter than the requested range.');
    }
  }
}
