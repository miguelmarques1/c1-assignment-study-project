'use client';

import { useState, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from './cn';
import { Field } from './field';
import { EyeIcon, EyeOffIcon } from './icons';

/**
 * Deliberately not `fieldControlClassName` plus extra classes: Tailwind's
 * generated stylesheet order — not the order classes appear in a string —
 * decides which utility wins when two target the same property, so `px-md`
 * from the shared constant cannot be reliably overridden by an appended
 * `pl-xl`. This control owns its own padding instead.
 */
const baseControlClassName =
  'w-full rounded-md border-2 border-outline-strong bg-surface-container-lowest py-sm text-body-md text-on-surface disabled:cursor-not-allowed disabled:opacity-60';

type BaseInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'className' | 'aria-describedby' | 'aria-invalid'
>;

export interface TextFieldProps extends BaseInputProps {
  label: string;
  /** Rendered at the end of the label row — an example value, a hint link. */
  labelAside?: ReactNode;
  hint?: string;
  error?: string | null;
  /** Rendered inside the control's leading edge; always `aria-hidden`. */
  leadingIcon?: ReactNode;
  /** Adds the show/hide control; only meaningful alongside `type="password"`. */
  revealable?: boolean;
  /** Renders the value as non-editable, with no reveal control regardless of `revealable`. */
  readOnlyPresentation?: boolean;
}

export function TextField({
  label,
  labelAside,
  hint,
  error,
  leadingIcon,
  revealable = false,
  readOnlyPresentation = false,
  type = 'text',
  ...inputProps
}: TextFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const showReveal = revealable && !readOnlyPresentation;
  const resolvedType = showReveal ? (revealed ? 'text' : 'password') : type;

  return (
    <Field label={label} labelAside={labelAside} hint={hint} error={error}>
      {(fieldProps) => (
        <div className="relative flex items-center">
          {leadingIcon ? (
            <span className="pointer-events-none absolute left-sm flex items-center">{leadingIcon}</span>
          ) : null}
          <input
            {...fieldProps}
            {...inputProps}
            type={resolvedType}
            readOnly={readOnlyPresentation || inputProps.readOnly}
            className={cn(
              baseControlClassName,
              leadingIcon ? 'pl-xl' : 'pl-md',
              showReveal ? 'pr-xl' : 'pr-md',
            )}
          />
          {showReveal ? (
            <button
              type="button"
              onClick={() => setRevealed((value) => !value)}
              aria-pressed={revealed}
              aria-label={revealed ? 'Hide password' : 'Show password'}
              className="absolute right-sm flex items-center justify-center rounded-sm text-on-surface-variant outline-offset-2 outline-outline-strong hover:text-on-surface focus-visible:outline-2"
            >
              {revealed ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          ) : null}
        </div>
      )}
    </Field>
  );
}
