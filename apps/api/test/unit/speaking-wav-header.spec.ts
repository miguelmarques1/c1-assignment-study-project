import { describe, expect, it } from 'vitest';

import { parseWavHeader } from '../../src/speaking/audio/wav-header';

interface WavOptions {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  audioFormat?: number;
  dataBytes?: number;
  /** Overrides the `data` chunk's declared size field, independent of the actual bytes written. */
  declaredDataSize?: number;
  /** An extra chunk (e.g. `LIST`) inserted between `fmt ` and `data`. */
  extraChunk?: { id: string; body: Buffer };
}

function buildWav(options: WavOptions = {}): Buffer {
  const sampleRate = options.sampleRate ?? 16_000;
  const channels = options.channels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const audioFormat = options.audioFormat ?? 1;
  const dataBytes = options.dataBytes ?? 3_200; // 100 ms at 16 kHz mono 16-bit
  const data = Buffer.alloc(dataBytes, 1);

  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(audioFormat, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 8);
  fmt.writeUInt16LE(channels * (bitsPerSample / 8), 12);
  fmt.writeUInt16LE(bitsPerSample, 14);

  const fmtChunk = Buffer.concat([Buffer.from('fmt '), u32(16), fmt]);
  const extraChunk = options.extraChunk
    ? Buffer.concat([Buffer.from(options.extraChunk.id.padEnd(4).slice(0, 4)), u32(options.extraChunk.body.length), options.extraChunk.body])
    : Buffer.alloc(0);
  const dataChunk = Buffer.concat([Buffer.from('data'), u32(options.declaredDataSize ?? dataBytes), data]);

  const riffBody = Buffer.concat([Buffer.from('WAVE'), fmtChunk, extraChunk, dataChunk]);
  return Buffer.concat([Buffer.from('RIFF'), u32(riffBody.length), riffBody]);
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

describe('parseWavHeader', () => {
  it('parses_a_canonical_16khz_mono_pcm_header', () => {
    const result = parseWavHeader(buildWav());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.info.sampleRate).toBe(16_000);
      expect(result.info.channels).toBe(1);
      expect(result.info.bitsPerSample).toBe(16);
      expect(result.info.dataBytes).toBe(3_200);
    }
  });

  it('skips_unknown_chunks_before_data', () => {
    const result = parseWavHeader(buildWav({ extraChunk: { id: 'LIST', body: Buffer.from('INFOxxxx') } }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.info.dataBytes).toBe(3_200);
    }
  });

  it('treats_a_zero_data_size_as_the_rest_of_the_body', () => {
    const result = parseWavHeader(buildWav({ dataBytes: 1_600, declaredDataSize: 0 }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.info.dataBytes).toBe(1_600);
    }
  });

  it('treats_a_declared_size_past_the_end_as_the_rest_of_the_body', () => {
    const result = parseWavHeader(buildWav({ dataBytes: 1_600, declaredDataSize: 999_999 }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.info.dataBytes).toBe(1_600);
    }
  });

  it('rejects_stereo', () => {
    const result = parseWavHeader(buildWav({ channels: 2 }));

    expect(result).toEqual({ ok: false, reason: 'channels' });
  });

  it('rejects_44100_hz', () => {
    const result = parseWavHeader(buildWav({ sampleRate: 44_100 }));

    expect(result).toEqual({ ok: false, reason: 'sample_rate' });
  });

  it('rejects_8_bit', () => {
    const result = parseWavHeader(buildWav({ bitsPerSample: 8, dataBytes: 1_600 }));

    expect(result).toEqual({ ok: false, reason: 'bit_depth' });
  });

  it('rejects_non_pcm_format', () => {
    const result = parseWavHeader(buildWav({ audioFormat: 3 }));

    expect(result).toEqual({ ok: false, reason: 'not_pcm' });
  });

  it('rejects_a_non_riff_body', () => {
    const result = parseWavHeader(Buffer.from('not a wav file at all'));

    expect(result).toEqual({ ok: false, reason: 'not_riff' });
  });

  it('rejects_a_wave_body_with_no_data_chunk', () => {
    const fmt = Buffer.alloc(16);
    fmt.writeUInt16LE(1, 0);
    fmt.writeUInt16LE(1, 2);
    fmt.writeUInt32LE(16_000, 4);
    fmt.writeUInt32LE(32_000, 8);
    fmt.writeUInt16LE(2, 12);
    fmt.writeUInt16LE(16, 14);
    const fmtChunk = Buffer.concat([Buffer.from('fmt '), u32(16), fmt]);
    const riffBody = Buffer.concat([Buffer.from('WAVE'), fmtChunk]);
    const buffer = Buffer.concat([Buffer.from('RIFF'), u32(riffBody.length), riffBody]);

    expect(parseWavHeader(buffer)).toEqual({ ok: false, reason: 'no_data' });
  });

  it('computes_duration_from_data_bytes', () => {
    // 32,000 bytes/s at 16 kHz mono 16-bit: 16,000 bytes is exactly 500 ms.
    const result = parseWavHeader(buildWav({ dataBytes: 16_000 }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.info.durationMs).toBe(500);
    }
  });
});
