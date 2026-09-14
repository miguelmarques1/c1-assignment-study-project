import type { SpacingToken } from '@english-quest/design-tokens';
import type { ComponentPropsWithRef } from 'react';

import { cn } from './cn';

/**
 * Desktop column count, reflowing proportionally to the tablet/mobile
 * counts from the grid architecture (12/8/4). Complete literal strings only
 * — see the note in stack.tsx on why a template literal can't be used here.
 */
const COLUMN_CLASSES: Record<1 | 2 | 3 | 4 | 6 | 12, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
  6: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6',
  12: 'grid-cols-4 md:grid-cols-8 lg:grid-cols-12',
};

const GAP_CLASSES: Record<SpacingToken, string> = {
  xs: 'gap-xs',
  sm: 'gap-sm',
  md: 'gap-md',
  lg: 'gap-lg',
  xl: 'gap-xl',
};

interface GridProps extends ComponentPropsWithRef<'div'> {
  columns?: 1 | 2 | 3 | 4 | 6 | 12;
  gap?: SpacingToken;
}

export function Grid({ columns = 12, gap = 'md', className, children, ...rest }: GridProps) {
  return (
    <div {...rest} className={cn('grid', COLUMN_CLASSES[columns], GAP_CLASSES[gap], className)}>
      {children}
    </div>
  );
}
