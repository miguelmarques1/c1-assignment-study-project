import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import ffmpegPath from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AudioAssembler, AudioAssemblyError } from '../../src/recording/audio-assembler.service';

const execFileAsync = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;

/**
 * ffmpeg logs both info (probe output) and `-af volumedetect` results to
 * stderr regardless of whether the process exits 0 — so every helper below
 * reads stderr from either the resolved result or, for a bare probe with no
 * output, the rejection ffmpeg's own missing-output-file error produces.
 */
async function runFfmpeg(args: string[]): Promise<string> {
  try {
    const result = await execFileAsync(FFMPEG, args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
    return result.stderr;
  } catch (error) {
    return (error as { stderr?: string }).stderr ?? '';
  }
}

function parseDurationSeconds(stderr: string): number {
  const match = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr);
  if (!match) {
    throw new Error(`Could not find a Duration line in ffmpeg output:\n${stderr}`);
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseVolume(stderr: string): { mean: number; max: number } {
  const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?)/.exec(stderr);
  const max = /max_volume:\s*(-?\d+(?:\.\d+)?)/.exec(stderr);
  if (!mean || !max) {
    throw new Error(`Could not find volumedetect output in ffmpeg output:\n${stderr}`);
  }
  return { mean: Number(mean[1]), max: Number(max[1]) };
}

async function probeFile(filePath: string): Promise<{ durationSeconds: number; raw: string }> {
  const stderr = await runFfmpeg(['-hide_banner', '-i', filePath]);
  return { durationSeconds: parseDurationSeconds(stderr), raw: stderr };
}

/** Mean/max volume (dB) of the given time window — a near-silent window reads around -91 dB. */
async function volumeInWindow(filePath: string, startSeconds: number, endSeconds: number) {
  const stderr = await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'info',
    '-ss',
    String(startSeconds),
    '-to',
    String(endSeconds),
    '-i',
    filePath,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]);
  return parseVolume(stderr);
}

const SILENCE_DB_CEILING = -60;

describe('AudioAssembler', () => {
  let dir: string;
  /** A 5-second 440 Hz tone. */
  let toneShort: string;
  /** 30 s of silence followed by 2 s of an 880 Hz tone — used to mark a known offset inside one file. */
  let toneWithMarkerAt30s: string;
  /** Zero bytes — decodes to nothing, standing in for a corrupt segment. */
  let corrupt: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'audio-assembler-spec-'));

    toneShort = join(dir, 'tone-short.ogg');
    await execFileAsync(FFMPEG, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=5',
      '-ac',
      '1',
      '-ar',
      '48000',
      '-c:a',
      'libopus',
      toneShort,
    ]);

    toneWithMarkerAt30s = join(dir, 'tone-marker-30s.ogg');
    await execFileAsync(FFMPEG, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-t',
      '30',
      '-i',
      'anullsrc=r=48000:cl=mono',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:duration=2',
      '-filter_complex',
      '[0:a][1:a]concat=n=2:v=0:a=1[out]',
      '-map',
      '[out]',
      '-ac',
      '1',
      '-ar',
      '48000',
      '-c:a',
      'libopus',
      toneWithMarkerAt30s,
    ]);

    corrupt = join(dir, 'corrupt.ogg');
    await writeFile(corrupt, Buffer.from('not an ogg file'));
  }, 30_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('assembles_a_single_segment', async () => {
    const assembler = new AudioAssembler();
    const outputPath = join(dir, 'out-single.ogg');
    const start = new Date('2026-01-01T00:00:00.000Z');

    const result = await assembler.assemble(
      [{ filePath: toneShort, fileStartedAt: start, fileEndedAt: new Date(start.getTime() + 5_000) }],
      outputPath,
    );

    expect(result.durationMs).toBe(5_000);
    expect(result.recordingStartedAt).toEqual(start);

    const probe = await probeFile(outputPath);
    expect(probe.durationSeconds).toBeGreaterThan(4.9);
    expect(probe.durationSeconds).toBeLessThan(5.2);
    expect(probe.raw).toMatch(/Audio: opus, 48000 Hz, mono/);
  });

  it('fills_the_gap_between_segments_with_silence', async () => {
    const assembler = new AudioAssembler();
    const outputPath = join(dir, 'out-gap.ogg');
    const start = new Date('2026-01-01T00:00:00.000Z');

    const result = await assembler.assemble(
      [
        { filePath: toneShort, fileStartedAt: start, fileEndedAt: new Date(start.getTime() + 5_000) },
        {
          filePath: toneShort,
          fileStartedAt: new Date(start.getTime() + 40_000),
          fileEndedAt: new Date(start.getTime() + 45_000),
        },
      ],
      outputPath,
    );

    expect(result.durationMs).toBe(45_000);

    const tone = await volumeInWindow(outputPath, 1, 3);
    const gap = await volumeInWindow(outputPath, 15, 35);
    const secondTone = await volumeInWindow(outputPath, 41, 43);

    expect(tone.mean).toBeGreaterThan(SILENCE_DB_CEILING);
    expect(gap.mean).toBeLessThan(SILENCE_DB_CEILING);
    expect(secondTone.mean).toBeGreaterThan(SILENCE_DB_CEILING);
  });

  it('fills_a_timestamp_gap_inside_a_segment', async () => {
    // One segment whose own audio is 5 s long, but whose declared wall-clock
    // span is 25 s — standing in for a mute that leaves the file's own
    // content shorter than the time LiveKit reported it was open for.
    const assembler = new AudioAssembler();
    const outputPath = join(dir, 'out-internal-gap.ogg');
    const start = new Date('2026-01-01T00:00:00.000Z');

    const result = await assembler.assemble(
      [{ filePath: toneShort, fileStartedAt: start, fileEndedAt: new Date(start.getTime() + 25_000) }],
      outputPath,
    );

    // The declared span wins — not the 5 seconds the source file actually decodes to.
    expect(result.durationMs).toBe(25_000);
    const probe = await probeFile(outputPath);
    expect(probe.durationSeconds).toBeGreaterThan(24.5);

    const tail = await volumeInWindow(outputPath, 10, 24);
    expect(tail.mean).toBeLessThan(SILENCE_DB_CEILING);
  });

  it('offsets_map_to_wall_clock', async () => {
    const assembler = new AudioAssembler();
    const outputPath = join(dir, 'out-offsets.ogg');
    const start = new Date('2026-01-01T00:00:00.000Z');
    // Segment 2 starts 60s after segment 1 and carries its own marker at its
    // own second 30 — the output must place that marker at 60 + 30 = 90s.
    const segment2Start = new Date(start.getTime() + 60_000);

    await assembler.assemble(
      [
        { filePath: toneShort, fileStartedAt: start, fileEndedAt: new Date(start.getTime() + 5_000) },
        { filePath: toneWithMarkerAt30s, fileStartedAt: segment2Start, fileEndedAt: new Date(segment2Start.getTime() + 32_000) },
      ],
      outputPath,
    );

    const beforeMarker = await volumeInWindow(outputPath, 87, 89);
    const atMarker = await volumeInWindow(outputPath, 90.2, 91.8);

    expect(beforeMarker.mean).toBeLessThan(SILENCE_DB_CEILING);
    expect(atMarker.mean).toBeGreaterThan(SILENCE_DB_CEILING);
  });

  it('fails_cleanly_on_a_corrupt_segment', async () => {
    const assembler = new AudioAssembler();
    const outputPath = join(dir, 'out-corrupt.ogg');
    const start = new Date('2026-01-01T00:00:00.000Z');

    await expect(
      assembler.assemble(
        [{ filePath: corrupt, fileStartedAt: start, fileEndedAt: new Date(start.getTime() + 5_000) }],
        outputPath,
      ),
    ).rejects.toBeInstanceOf(AudioAssemblyError);

    expect(existsSync(outputPath)).toBe(false);
  });
});
