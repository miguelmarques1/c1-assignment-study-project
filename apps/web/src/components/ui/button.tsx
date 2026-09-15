'use client';

import type { ButtonSize, ButtonVariant } from '@english-quest/design-tokens';
import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cn } from './cn';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary',
  secondary: 'bg-secondary text-on-secondary',
  neutral: 'bg-surface-container-lowest text-on-surface',
  destructive: 'bg-error text-on-error',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-sm py-xs text-label-md',
  md: 'px-md py-sm text-label-lg',
  lg: 'px-lg py-sm text-title-md',
};

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
} & Omit<ComponentPropsWithRef<'button'>, 'children' | 'aria-label'>;

/**
 * Exactly one of `children` or `aria-label` is required — an icon-only
 * button with neither fails typecheck instead of shipping unlabelled.
 */
type ButtonWithLabelText = ButtonBaseProps & { children: ReactNode; 'aria-label'?: string };
type ButtonWithAriaLabel = ButtonBaseProps & { children?: ReactNode; 'aria-label': string };

export type ButtonProps = ButtonWithLabelText | ButtonWithAriaLabel;

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = 'Working…',
  fullWidth = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'press-button inline-flex items-center justify-center gap-sm rounded-md border-2 border-outline-strong font-semibold outline-offset-2 outline-outline-strong focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      <span aria-live="polite">{loading ? loadingLabel : children}</span>
    </button>
  );
}
