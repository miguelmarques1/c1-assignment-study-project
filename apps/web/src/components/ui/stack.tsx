import type { SpacingToken } from '@english-quest/design-tokens';
import type { ComponentPropsWithRef } from 'react';

import { cn } from './cn';

/**
 * Tailwind's class scanner reads source text statically — a template
 * literal like `gap-${gap}` never appears verbatim in the file, so it can
 * never be generated. Every dynamic variant in this file resolves through a
 * lookup table of complete, literal class strings instead.
 */
const GAP_CLASSES: Record<SpacingToken, string> = {
  xs: 'gap-xs',
  sm: 'gap-sm',
  md: 'gap-md',
  lg: 'gap-lg',
  xl: 'gap-xl',
};

const ALIGN_CLASSES = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
} as const;

const JUSTIFY_CLASSES = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
} as const;

interface StackProps extends ComponentPropsWithRef<'div'> {
  direction?: 'row' | 'column';
  gap?: SpacingToken;
  align?: keyof typeof ALIGN_CLASSES;
  justify?: keyof typeof JUSTIFY_CLASSES;
  wrap?: boolean;
}

export function Stack({
  direction = 'column',
  gap = 'md',
  align,
  justify,
  wrap = false,
  className,
  children,
  ...rest
}: StackProps) {
  return (
    <div
      {...rest}
      className={cn(
        'flex',
        direction === 'row' ? 'flex-row' : 'flex-col',
        GAP_CLASSES[gap],
        align && ALIGN_CLASSES[align],
        justify && JUSTIFY_CLASSES[justify],
        wrap && 'flex-wrap',
        className,
      )}
    >
      {children}
    </div>
  );
}
