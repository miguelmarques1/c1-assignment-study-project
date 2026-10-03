/** `MediaRecorder` cannot emit WAV natively (A22): this is the browser-side encoder that makes it one. */

const BYTES_PER_SAMPLE = 2;
const SAMPLE_MAX = 32_767;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/** Mono float samples in `[-1, 1]` to a canonical 44-byte-header 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const dataSize = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, Math.round(clamped * SAMPLE_MAX), true);
    offset += BYTES_PER_SAMPLE;
  }

  return new Uint8Array(buffer);
}

/** Downmixes to mono and resamples to 16 kHz via an `OfflineAudioContext`, the browser's own resampler. */
export async function resampleTo16kMono(buffer: AudioBuffer): Promise<Float32Array> {
  const SAMPLE_RATE = 16_000;
  const frameCount = Math.ceil(buffer.duration * SAMPLE_RATE);
  const offlineContext = new OfflineAudioContext(1, frameCount, SAMPLE_RATE);

  const mono = offlineContext.createBuffer(1, buffer.length, buffer.sampleRate);
  const monoData = mono.getChannelData(0);
  const channels = buffer.numberOfChannels;
  for (let i = 0; i < buffer.length; i++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      sum += buffer.getChannelData(channel)[i]!;
    }
    monoData[i] = sum / channels;
  }

  const source = offlineContext.createBufferSource();
  source.buffer = mono;
  source.connect(offlineContext.destination);
  source.start();

  const rendered = await offlineContext.startRendering();
  return rendered.getChannelData(0);
}
