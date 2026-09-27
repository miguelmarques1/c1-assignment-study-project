import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { promisify } from 'node:util';

import ffmpegPath from 'ffmpeg-static';

import { firstLine } from '../../credentials/validation/validation-outcome';
import { AUDIO_CONTENT_TYPES, AUDIO_FILE_NAME_PATTERN, MAX_AUDIO_BYTES } from '../content-constants';

const execFileAsync = promisify(execFile);

/** A full decode of a 100 MB file takes seconds; this only stops a wedged ffmpeg from hanging the batch. */
const DECODE_TIMEOUT_MS = 5 * 60 * 1000;

export interface ProbedAudio {
  fileName: string;
  bytes: number;
  /** SHA-256 hex of the file's bytes, compared with the stored `media_checksum`. */
  checksum: string;
  durationSeconds: number;
  contentType: string;
}

export type ProbeResult = { ok: true; audio: ProbedAudio } | { ok: false; reason: string };

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

export function contentTypeFor(fileName: string): string | null {
  return AUDIO_CONTENT_TYPES[extname(fileName).toLowerCase()] ?? null;
}

/** Decimal units, as the PRD's own `4.2 MB uploaded` line reads. */
export function formatSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${(bytes / 1_000).toFixed(1)} KB`;
}

/**
 * Decodes the whole first audio stream and returns the last `out_time_us`
 * ffmpeg reports, or null when nothing decoded. A full decode, rather than a
 * header read, yields the true duration of a VBR MP3 without a Xing header
 * and proves the file plays end to end. `-progress` output is `key=value`,
 * so nothing parses human-oriented log text. Warnings on stderr don't reject
 * the file: real-world MP3s often carry harmless frame glitches.
 */
async function decodedMicroseconds(filePath: string): Promise<{ micros: number | null; error: string | null }> {
  try {
    const { stdout } = await execFileAsync(
      ffmpegPath as unknown as string,
      ['-nostdin', '-hide_banner', '-v', 'error', '-i', filePath, '-map', '0:a:0', '-f', 'null', '-progress', 'pipe:1', '-nostats', '-'],
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: DECODE_TIMEOUT_MS },
    );
    let micros: number | null = null;
    for (const line of stdout.split(/\r?\n/)) {
      const match = /^out_time_us=(\d+)$/.exec(line.trim());
      if (match) {
        micros = Number(match[1]);
      }
    }
    return { micros, error: null };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    const message = stderr || (error instanceof Error ? error.message : String(error));
    // `[mp3 @ 0x55d0c8e0] Failed to read frame size` → `Failed to read frame size`.
    return { micros: null, error: firstLine(message).replace(/^\[[^\]]*\]\s*/, '') };
  }
}

/**
 * Inspects one listening audio file. Every problem comes back as a skip
 * reason, never as an exception, so one bad file never stops the batch.
 */
export async function probeAudio(filePath: string): Promise<ProbeResult> {
  const fileName = basename(filePath);
  if (!AUDIO_FILE_NAME_PATTERN.test(fileName)) {
    return { ok: false, reason: `audio file name "${fileName}" may only contain letters, digits, ".", "_" and "-"` };
  }

  const contentType = contentTypeFor(fileName);
  if (!contentType) {
    return { ok: false, reason: `"${fileName}" is not a supported audio file (.mp3, .m4a, .wav, .ogg)` };
  }

  const { size } = await stat(filePath);
  if (size === 0) {
    return { ok: false, reason: 'audio file is empty' };
  }
  if (size > MAX_AUDIO_BYTES) {
    return { ok: false, reason: `audio file is ${formatSize(size)}, over the ${formatSize(MAX_AUDIO_BYTES)} limit` };
  }

  const { micros, error } = await decodedMicroseconds(filePath);
  if (error !== null) {
    return { ok: false, reason: `audio file could not be decoded: ${error}` };
  }
  if (!micros) {
    return { ok: false, reason: 'audio file could not be decoded: no audio samples' };
  }

  return {
    ok: true,
    audio: {
      fileName,
      bytes: size,
      checksum: await sha256File(filePath),
      // Sub-second clips round up to 1: the column's CHECK requires a positive duration.
      durationSeconds: Math.max(1, Math.round(micros / 1_000_000)),
      contentType,
    },
  };
}
