'use client';

import type { ReactNode } from 'react';

import {
  BookIcon,
  Button,
  cn,
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
  /** Rendered in a popover above the bar while open. */
  deviceSettings: ReactNode | null;
  onEndLesson: () => void;
  scenarioPanelOpen: boolean;
  onToggleScenarioPanel: () => void;
  /**
   * In the waiting room the scenario is already the page's main column, so
   * the toggle reads as pressed and does nothing — as in the mockup, where
   * `Scenario` is the selected tab of the waiting room's bar.
   */
  scenarioAlwaysShown: boolean;
}

/**
 * The floating control bar both call mockups share, sticky to the bottom of
 * the viewport: media toggles and device settings on the left, the scenario
 * toggle in the middle, the end action on the right.
 */
export function ControlBar({
  microphoneEnabled,
  cameraEnabled,
  onToggleMicrophone,
  onToggleCamera,
  onOpenDeviceSettings,
  deviceSettings,
  onEndLesson,
  scenarioPanelOpen,
  onToggleScenarioPanel,
  scenarioAlwaysShown,
}: ControlBarProps) {
  const scenarioPressed = scenarioAlwaysShown || scenarioPanelOpen;

  return (
    <div className="sticky bottom-md z-30 mx-auto w-full max-w-200 px-md">
      <div className="relative flex items-center justify-between gap-sm rounded-lg border-2 border-outline-strong bg-surface p-sm shadow-modal">
        {deviceSettings ? (
          <div className="absolute bottom-full left-0 mb-sm flex w-72 flex-col gap-sm rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-md shadow-modal">
            {deviceSettings}
          </div>
        ) : null}

        <div className="flex items-center gap-xs sm:gap-sm">
          <span className="relative">
            <Button
              variant={microphoneEnabled ? 'neutral' : 'destructive'}
              aria-label={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              onClick={onToggleMicrophone}
            >
              {microphoneEnabled ? <MicrophoneIcon /> : <MicrophoneOffIcon />}
            </Button>
            {microphoneEnabled ? (
              <span
                aria-hidden="true"
                className="absolute top-xs right-xs h-2 w-2 rounded-full bg-badge-success-bg"
              />
            ) : null}
          </span>
          <Button
            variant={cameraEnabled ? 'neutral' : 'destructive'}
            aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            onClick={onToggleCamera}
          >
            {cameraEnabled ? <CameraIcon /> : <CameraOffIcon />}
          </Button>
          <Button
            variant="neutral"
            aria-label="Device settings"
            aria-expanded={Boolean(deviceSettings)}
            onClick={onOpenDeviceSettings}
          >
            <SettingsIcon />
          </Button>
        </div>

        <button
          type="button"
          onClick={scenarioAlwaysShown ? undefined : onToggleScenarioPanel}
          aria-disabled={scenarioAlwaysShown}
          aria-pressed={scenarioPressed}
          aria-label={
            scenarioAlwaysShown
              ? 'Scenario shown on this page'
              : scenarioPanelOpen
                ? 'Hide scenario panel'
                : 'Show scenario panel'
          }
          className={cn(
            'press-button inline-flex items-center gap-xs rounded-md border-2 border-outline-strong px-md py-sm text-label-lg outline-offset-2 outline-outline-strong focus-visible:outline-2 aria-disabled:cursor-default',
            scenarioPressed && 'bg-badge-warning-bg text-badge-warning-fg',
            !scenarioPressed && 'bg-surface-container-lowest text-on-surface',
          )}
        >
          <BookIcon />
          <span className="hidden sm:inline">Scenario</span>
        </button>

        <Button variant="destructive" aria-label="End lesson" onClick={onEndLesson}>
          <span className="inline-flex items-center gap-xs">
            <HangUpIcon />
            <span className="hidden sm:inline">End lesson</span>
          </span>
        </Button>
      </div>
    </div>
  );
}
