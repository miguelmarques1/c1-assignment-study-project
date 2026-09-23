'use client';

import type { ReactNode } from 'react';

import { Field, fieldControlClassName } from '@/components/ui';

export interface DeviceSelectProps {
  label: string;
  devices: MediaDeviceInfo[];
  selectedDeviceId?: string;
  onChange: (deviceId: string) => void;
  disabled?: boolean;
  /** The label row's right-hand slot: a device status, a `Test sound` action. */
  labelAside?: ReactNode;
}

/** A `Field`-composed select for one `MediaDeviceKind`, shared by the preview and the in-call settings. */
export function DeviceSelect({
  label,
  devices,
  selectedDeviceId,
  onChange,
  disabled,
  labelAside,
}: DeviceSelectProps) {
  return (
    <Field label={label} labelAside={labelAside}>
      {(control) => (
        <select
          {...control}
          className={`w-full ${fieldControlClassName}`}
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
