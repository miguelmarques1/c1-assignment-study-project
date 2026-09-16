'use client';

import { Field, fieldControlClassName } from '@/components/ui';

export interface DeviceSelectProps {
  label: string;
  devices: MediaDeviceInfo[];
  selectedDeviceId?: string;
  onChange: (deviceId: string) => void;
  disabled?: boolean;
}

/** A `Field`-composed select for one `MediaDeviceKind`, shared by the preview and the in-call settings. */
export function DeviceSelect({ label, devices, selectedDeviceId, onChange, disabled }: DeviceSelectProps) {
  return (
    <Field label={label}>
      {(control) => (
        <select
          {...control}
          className={fieldControlClassName}
          value={selectedDeviceId ?? ''}
          disabled={disabled || devices.length === 0}
          onChange={(event) => onChange(event.target.value)}
        >
          {devices.length === 0 ? <option value="">No devices found</option> : null}
          {devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `${label} ${index + 1}`}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
