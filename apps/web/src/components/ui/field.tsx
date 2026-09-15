'use client';

import { useId, type ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/**
 * Shared styling for the text control every Field consumer renders through
 * the render prop — Field itself never renders the control, so this is the
 * one place its visual treatment is written rather than copied per caller.
 */
export const fieldControlClassName =
  'rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-sm text-body-md text-on-surface disabled:cursor-not-allowed disabled:opacity-60';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  /** Render prop so the id/aria wiring can never be forgotten at the call site. */
  children: (props: FieldControlProps) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter((value): value is string => Boolean(value)).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={id} className="text-label-md text-on-surface-variant">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="text-body-sm text-on-surface-variant">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-body-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
