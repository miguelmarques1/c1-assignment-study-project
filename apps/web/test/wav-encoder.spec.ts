import { describe, expect, it } from 'vitest';

import { encodeWav } from '@/lib/wav-encoder';

describe('encodeWav', () => {
  it('writes_a_44_byte_pcm_header_for_16khz_mono', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5]), 16_000);
    const view = new DataView(wav.buffer);

    expect(readAscii(view, 0, 4)).toBe('RIFF');
    expect(readAscii(view, 8, 4)).toBe('WAVE');
    expect(readAscii(view, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000); // sample rate
    expect(view.getUint32(28, true)).toBe(32_000); // byte rate: sampleRate * blockAlign
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(readAscii(view, 36, 4)).toBe('data');
  });

  it('clamps_samples_to_16_bit', () => {
    const wav = encodeWav(new Float32Array([2, -2, 1, -1]), 16_000);
    const view = new DataView(wav.buffer);

    expect(view.getInt16(44, true)).toBe(32_767);
    expect(view.getInt16(46, true)).toBe(-32_767);
    expect(view.getInt16(48, true)).toBe(32_767);
    expect(view.getInt16(50, true)).toBe(-32_767);
  });

  it('data_size_matches_sample_count', () => {
    const samples = new Float32Array(100).fill(0.1);
    const wav = encodeWav(samples, 16_000);
    const view = new DataView(wav.buffer);

    expect(view.getUint32(40, true)).toBe(200); // 100 samples * 2 bytes
    expect(view.getUint32(4, true)).toBe(36 + 200); // RIFF chunk size
    expect(wav.byteLength).toBe(44 + 200);
  });
});

function readAscii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i++) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text;
}
