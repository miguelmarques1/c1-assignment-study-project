'use client';

import type { LocalVideoTrack } from 'livekit-client';
import { useEffect, useRef } from 'react';

import { CameraOffIcon, Meter, Stack } from '@/components/ui';
import { DeviceSelect } from './device-select';
import type { PreviewDeviceKind, PreviewDevices } from './use-media-preview';

function useAttachedVideo(track: LocalVideoTrack | null) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!track || !element) {
      return;
    }
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return ref;
}

export interface DevicePreviewProps {
  displayName: string;
  videoTrack: LocalVideoTrack | null;
  cameraDenied: boolean;
  level: number | null;
  devices: PreviewDevices;
  selectedDeviceId: Partial<Record<PreviewDeviceKind, string>>;
  onSelectDevice: (kind: PreviewDeviceKind, deviceId: string) => void;
}

/** Local video tile, level meter and the three device selects for the pre-join screen. */
export function DevicePreview({
  displayName,
  videoTrack,
  cameraDenied,
  level,
  devices,
  selectedDeviceId,
  onSelectDevice,
}: DevicePreviewProps) {
  const videoRef = useAttachedVideo(videoTrack);

  return (
    <Stack gap="md">
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border-2 border-outline-strong bg-surface-container-highest">
        {videoTrack && !cameraDenied ? (
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-sm text-on-surface-variant">
            <CameraOffIcon size={32} />
            <span className="text-body-sm">{displayName}</span>
          </div>
        )}
      </div>

      <Meter
        value={level ?? 0}
        state={level === null ? 'warming-up' : 'scored'}
        label="Microphone level"
      />

      <Stack gap="sm">
        <DeviceSelect
          label="Microphone"
          devices={devices.audioinput}
          selectedDeviceId={selectedDeviceId.audioinput}
          onChange={(id) => onSelectDevice('audioinput', id)}
        />
        <DeviceSelect
          label="Camera"
          devices={devices.videoinput}
          selectedDeviceId={selectedDeviceId.videoinput}
          onChange={(id) => onSelectDevice('videoinput', id)}
        />
        <DeviceSelect
          label="Speaker"
          devices={devices.audiooutput}
          selectedDeviceId={selectedDeviceId.audiooutput}
          onChange={(id) => onSelectDevice('audiooutput', id)}
        />
      </Stack>
    </Stack>
  );
}
