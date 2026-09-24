import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { promisify } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';

import {
  ASSEMBLED_AUDIO_BITRATE,
  ASSEMBLED_AUDIO_CHANNELS,
  ASSEMBLED_AUDIO_SAMPLE_RATE,
} from './recording.constants';

const execFileAsync = promisify(execFile);

/** One egress's local file plus the wall-clock span it was recorded over. */
export interface AssemblySegment {
  filePath: string;
  fileStartedAt: Date;
  fileEndedAt: Date;
}

export interface AssemblyResult {
  outputPath: string;
  /** Second 0 of the output — the earliest segment's own start. */
  recordingStartedAt: Date;
  /** The full assembled span, filled gaps included — what F08 and F10 offset against. */
  durationMs: number;
}

/** Thrown when ffmpeg itself fails — a corrupt or unreadable segment, most likely. */
export class AudioAssemblyError extends Error {
  constructor(cause: unknown) {
    super('Recording could not be processed.');
    this.name = 'AudioAssemblyError';
    this.cause = cause;
  }
}

/**
 * Turns a participant's segments into one continuous file. Track egress
 * writes each segment as Opus passthrough, so gaps are real: a reconnect or
 * a `Rejoin classroom` opens a new segment with its own start time, and any
 * shortfall inside a segment (relative to the wall-clock span LiveKit itself
 * reported for it) is silence, not lost audio.
 *
 * The mechanism is one `amix` over per-segment `adelay`s rather than a
 * silence-file-and-concat pipeline: each segment is normalized and delayed
 * to its true offset from the participant's first segment, then mixed with
 * `normalize=0` (segments never overlap, so summing them is exactly
 * concatenation) and hard-trimmed to the declared total span with `-t`. That
 * final trim is what makes the output's length follow the timestamps
 * LiveKit recorded for each segment, not whatever a segment's own audio
 * happens to decode to — the file F08 and F10 read must have offset N always
 * mean the same wall-clock moment.
 */
@Injectable()
export class AudioAssembler {
  private readonly logger = new Logger(AudioAssembler.name);

  async assemble(segments: AssemblySegment[], outputPath: string): Promise<AssemblyResult> {
    if (segments.length === 0) {
      throw new AudioAssemblyError(new Error('No segments to assemble.'));
    }

    const ordered = [...segments].sort(
      (a, b) => a.fileStartedAt.getTime() - b.fileStartedAt.getTime(),
    );
    const [first, ...rest] = ordered;
    if (!first) {
      // Unreachable: the length check above guarantees at least one element.
      throw new AudioAssemblyError(new Error('No segments to assemble.'));
    }
    const origin = first.fileStartedAt;
    const end = rest.reduce(
      (latest, segment) => (segment.fileEndedAt > latest ? segment.fileEndedAt : latest),
      first.fileEndedAt,
    );
    const totalMs = Math.max(end.getTime() - origin.getTime(), 0);

    const inputArgs = ordered.flatMap((segment) => ['-i', segment.filePath]);

    const perSegmentFilters = ordered.map((segment, index) => {
      const offsetMs = Math.max(segment.fileStartedAt.getTime() - origin.getTime(), 0);
      return (
        `[${index}:a]aformat=sample_rates=${ASSEMBLED_AUDIO_SAMPLE_RATE}:channel_layouts=mono,` +
        `adelay=${offsetMs}:all=1[a${index}]`
      );
    });
    const mixInputs = ordered.map((_segment, index) => `[a${index}]`).join('');
    const totalSeconds = (totalMs / 1000).toFixed(3);
    const filterComplex = [
      ...perSegmentFilters,
      // `amix` stops emitting once its longest input ends — it does not hold
      // silence to any particular length. A segment whose own audio is
      // shorter than the wall-clock span LiveKit reported for it (a mute
      // near the end of an egress, most often) would otherwise cut the
      // whole mix short. `apad`'s `whole_dur` is what actually extends the
      // stream to the declared total; the `-t` output option below is only
      // a safety trim, since apad never shortens anything.
      `${mixInputs}amix=inputs=${ordered.length}:duration=longest:normalize=0,` +
        `apad=whole_dur=${totalSeconds}[mixed]`,
    ].join(';');

    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[mixed]',
      '-t',
      totalSeconds,
      '-ac',
      String(ASSEMBLED_AUDIO_CHANNELS),
      '-ar',
      String(ASSEMBLED_AUDIO_SAMPLE_RATE),
      '-c:a',
      'libopus',
      '-b:a',
      ASSEMBLED_AUDIO_BITRATE,
      outputPath,
    ];

    try {
      await execFileAsync(ffmpegPath as unknown as string, args, {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      // A failed run can still leave a partial file at outputPath.
      await rm(outputPath, { force: true }).catch(() => undefined);
      this.logger.warn(`ffmpeg assembly failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new AudioAssemblyError(error);
    }

    return { outputPath, recordingStartedAt: origin, durationMs: totalMs };
  }
}
