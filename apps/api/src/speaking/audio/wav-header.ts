/** Why a body failed to parse as the canonical WAV this feature accepts (A30). */
export type WavHeaderFailureReason = 'not_riff' | 'not_pcm' | 'channels' | 'sample_rate' | 'bit_depth' | 'no_data';

export interface WavHeaderInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Byte offset of the `data` chunk's payload. */
  dataOffset: number;
  /** Resolved size of the payload: the declared chunk size, or the rest of the buffer when that size is 0 or runs past the end (A30). */
  dataBytes: number;
  durationMs: number;
}

export type WavHeaderResult = { ok: true; info: WavHeaderInfo } | { ok: false; reason: WavHeaderFailureReason };

const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const PCM_FORMAT_CODE = 1;
const REQUIRED_CHANNELS = 1;
const REQUIRED_SAMPLE_RATE = 16_000;
const REQUIRED_BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = REQUIRED_BITS_PER_SAMPLE / 8;

interface FmtInfo {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

/**
 * Parses a RIFF/WAVE body and checks it is exactly what this feature's
 * pipeline can score: PCM (format 1), 1 channel, 16,000 Hz, 16 bits, with a
 * `data` chunk (A30). Unknown chunks (`LIST`, and anything else between
 * `fmt ` and `data`) are skipped by walking past their declared size. A
 * `data` size of 0, or one that runs past the end of the body, is read as
 * "the rest of the body" — a tolerant reading of a writer that streamed the
 * file and never went back to patch the header's size field.
 */
export function parseWavHeader(buffer: Buffer): WavHeaderResult {
  if (
    buffer.length < RIFF_HEADER_BYTES ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return { ok: false, reason: 'not_riff' };
  }

  let fmt: FmtInfo | null = null;
  let dataOffset: number | null = null;
  let declaredDataBytes = 0;

  let offset = RIFF_HEADER_BYTES;
  while (offset + CHUNK_HEADER_BYTES <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + CHUNK_HEADER_BYTES;

    if (chunkId === 'fmt ' && chunkDataStart + 16 <= buffer.length) {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkDataStart),
        channels: buffer.readUInt16LE(chunkDataStart + 2),
        sampleRate: buffer.readUInt32LE(chunkDataStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkDataStart + 14),
      };
    } else if (chunkId === 'data') {
      dataOffset = chunkDataStart;
      declaredDataBytes = chunkSize;
      break;
    }

    // Chunks are word-aligned: an odd-sized chunk carries one pad byte.
    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt) {
    return { ok: false, reason: 'not_pcm' };
  }
  if (fmt.audioFormat !== PCM_FORMAT_CODE) {
    return { ok: false, reason: 'not_pcm' };
  }
  if (fmt.channels !== REQUIRED_CHANNELS) {
    return { ok: false, reason: 'channels' };
  }
  if (fmt.sampleRate !== REQUIRED_SAMPLE_RATE) {
    return { ok: false, reason: 'sample_rate' };
  }
  if (fmt.bitsPerSample !== REQUIRED_BITS_PER_SAMPLE) {
    return { ok: false, reason: 'bit_depth' };
  }
  if (dataOffset === null) {
    return { ok: false, reason: 'no_data' };
  }

  const dataBytes =
    declaredDataBytes === 0 || dataOffset + declaredDataBytes > buffer.length
      ? buffer.length - dataOffset
      : declaredDataBytes;
  if (dataBytes <= 0) {
    return { ok: false, reason: 'no_data' };
  }

  const durationMs = Math.round((dataBytes / (fmt.sampleRate * fmt.channels * BYTES_PER_SAMPLE)) * 1000);

  return {
    ok: true,
    info: { sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: fmt.bitsPerSample, dataOffset, dataBytes, durationMs },
  };
}
