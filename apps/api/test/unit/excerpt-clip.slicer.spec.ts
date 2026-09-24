import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import ffmpegPath from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ClipSliceError, ExcerptClipSlicer } from '../../src/pronunciation/excerpt-clip.slicer';

const execFileAsync = promisify(execFile);

let workDir: string;
let sourcePath: string;
const slicer = new ExcerptClipSlicer();

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'excerpt-clip-slicer-spec-'));
  sourcePath = join(workDir, 'audio.ogg');
  await execFileAsync(ffmpegPath as unknown as string, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=330:duration=12',
    '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k',
    sourcePath,
  ]);
}, 60_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/** Minimal RIFF/WAVE reader — enough to check our own slicer's output. */
function readWavInfo(buffer: Buffer): { sampleRate: number; channels: number; bitsPerSample: number; durationMs: number } {
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      byteRate = buffer.readUInt32LE(body + 8);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (id === 'data') {
      dataSize = size;
    }
    offset = body + size + (size % 2);
  }
  return { sampleRate, channels, bitsPerSample, durationMs: byteRate === 0 ? 0 : (dataSize / byteRate) * 1000 };
}

describe('ExcerptClipSlicer', () => {
  it('cuts_the_exact_range_as_16k_mono_wav', async () => {
    const outPath = join(workDir, 'clip-1.wav');

    await slicer.slice(sourcePath, 3_000, 8_500, outPath);

    const info = readWavInfo(await readFile(outPath));
    expect(info.sampleRate).toBe(16_000);
    expect(info.channels).toBe(1);
    expect(info.bitsPerSample).toBe(16);
    expect(info.durationMs).toBeGreaterThanOrEqual(5_500 - 20);
    expect(info.durationMs).toBeLessThanOrEqual(5_500 + 20);
  });

  it('a_corrupt_source_raises_a_slice_error', async () => {
    const corruptPath = join(workDir, 'corrupt.ogg');
    await writeFile(corruptPath, Buffer.from('not an audio file at all, just garbage bytes'));
    const outPath = join(workDir, 'clip-corrupt.wav');

    await expect(slicer.slice(corruptPath, 0, 1_000, outPath)).rejects.toBeInstanceOf(ClipSliceError);
  });

  it('a_range_past_the_end_raises_a_slice_error', async () => {
    const outPath = join(workDir, 'clip-past-end.wav');

    await expect(slicer.slice(sourcePath, 20_000, 21_000, outPath)).rejects.toBeInstanceOf(ClipSliceError);
  });
});
