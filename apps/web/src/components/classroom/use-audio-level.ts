'use client';

import { useEffect, useState } from 'react';

/**
 * An `AnalyserNode` over the given audio track, sampled on every animation
 * frame. Shared between the pre-join preview and the in-call waiting state —
 * both need a live level meter, one over a `LocalAudioTrack`'s raw
 * `MediaStreamTrack`, the other over a track publication's.
 */
export function useAudioLevel(mediaStreamTrack: MediaStreamTrack | null | undefined): number | null {
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    // No Web Audio API in the test environment (jsdom) — degrade to "no
    // reading" rather than throwing, the same as having no track at all.
    if (!mediaStreamTrack || typeof AudioContext === 'undefined') {
      setLevel(null);
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame: number;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      setLevel(Math.min(100, Math.round((average / 255) * 200)));
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => undefined);
    };
  }, [mediaStreamTrack]);

  return level;
}
