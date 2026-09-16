'use client';

import {
  Button,
  CameraIcon,
  CameraOffIcon,
  HangUpIcon,
  MicrophoneIcon,
  MicrophoneOffIcon,
  SettingsIcon,
} from '@/components/ui';

export interface ControlBarProps {
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onOpenDeviceSettings: () => void;
  onEndLesson: () => void;
}

/**
 * Microphone, camera, device settings, the reserved scenario toggle (present
 * but disabled — F06 fills it in) and the end action.
 */
export function ControlBar({
  microphoneEnabled,
  cameraEnabled,
  onToggleMicrophone,
  onToggleCamera,
  onOpenDeviceSettings,
  onEndLesson,
}: ControlBarProps) {
  return (
    <div className="flex items-center justify-center gap-sm border-t-2 border-outline-strong p-md">
      <Button
        variant={microphoneEnabled ? 'neutral' : 'destructive'}
        aria-label={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        onClick={onToggleMicrophone}
      >
        {microphoneEnabled ? <MicrophoneIcon /> : <MicrophoneOffIcon />}
      </Button>
      <Button
        variant={cameraEnabled ? 'neutral' : 'destructive'}
        aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
        onClick={onToggleCamera}
      >
        {cameraEnabled ? <CameraIcon /> : <CameraOffIcon />}
      </Button>
      <Button variant="neutral" aria-label="Device settings" onClick={onOpenDeviceSettings}>
        <SettingsIcon />
      </Button>
      <Button variant="neutral" aria-label="Scenario — coming soon" disabled>
        Scenario
      </Button>
      <Button variant="destructive" aria-label="End lesson" onClick={onEndLesson}>
        <HangUpIcon />
        End lesson
      </Button>
    </div>
  );
}
