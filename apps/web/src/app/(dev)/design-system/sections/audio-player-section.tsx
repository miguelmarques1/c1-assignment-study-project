'use client';

import { useEffect, useState } from 'react';

import { AudioPlayer } from '@/components/ui';

import { SectionShell } from './section-shell';

/** Half a second of 8 kHz mono 16-bit silence with a valid RIFF header, so the gallery needs no audio binary. */
function silentWav(): Blob {
  const sampleRate = 8000;
  const dataSize = sampleRate; // 0.5 s of 2-byte samples
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataSize, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

export function AudioPlayerSection() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(silentWav());
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, []);

  return (
    <SectionShell title="Audio player" vrId="audio-player">
      <div className="flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <p className="text-label-md text-on-surface-variant">Ready: press Play to see it playing</p>
          {src ? <AudioPlayer src={src} label="Sample audio" /> : null}
        </div>
        <div className="flex flex-col gap-xs">
          <p className="text-label-md text-on-surface-variant">Error</p>
          <AudioPlayer src="/design-system/missing-audio.mp3" label="Missing audio" />
        </div>
      </div>
    </SectionShell>
  );
}
