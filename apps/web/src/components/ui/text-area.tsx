'use client';

import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from 'react';

import { cn } from './cn';
import { Field } from './field';

/** Owns its own padding, for the same reason `TextField`'s `baseControlClassName` does — see that file's comment. */
const baseControlClassName =
  'w-full rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-sm text-body-md text-on-surface disabled:cursor-not-allowed disabled:opacity-60';

type BaseTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'id' | 'className' | 'aria-describedby' | 'aria-invalid'
>;

export interface TextAreaProps extends BaseTextareaProps {
  label: string;
  /** Rendered at the end of the label row. */
  labelAside?: ReactNode;
  hint?: string;
  error?: string | null;
  /** Grows to fill its container's height instead of sizing to `rows`; the caller gives that container a height. */
  fill?: boolean;
  /** Renders the value as non-editable, styled like a disabled control but still selectable and readable by assistive tech. */
  readOnlyPresentation?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, labelAside, hint, error, fill = false, readOnlyPresentation = false, rows = 6, ...textareaProps },
  ref,
) {
  return (
    <Field
      label={label}
      labelAside={labelAside}
      hint={hint}
      error={error}
      className={fill ? 'flex h-full min-h-0 flex-1 flex-col gap-xs' : undefined}
    >
      {(fieldProps) => (
        <textarea
          {...fieldProps}
          {...textareaProps}
          ref={ref}
          rows={fill ? undefined : rows}
          readOnly={readOnlyPresentation || textareaProps.readOnly}
          aria-readonly={readOnlyPresentation || undefined}
          className={cn(
            baseControlClassName,
            fill ? 'h-full min-h-0 flex-1 resize-none' : 'resize-y',
            readOnlyPresentation && 'bg-surface-container text-on-surface-variant',
          )}
        />
      )}
    </Field>
  );
});
