import type { CardTone } from '@english-quest/design-tokens';
import type { ComponentPropsWithRef, ElementType, ReactNode } from 'react';

import { cn } from './cn';

const TONE_CLASSES: Record<CardTone, string> = {
  neutral: 'bg-surface-container-lowest text-on-surface',
  primary: 'bg-primary-container text-on-primary-container',
  info: 'bg-badge-info-bg text-badge-info-fg',
  success: 'bg-badge-success-bg text-badge-success-fg',
};

interface CardProps extends ComponentPropsWithRef<'div'> {
  tone?: CardTone;
  as?: Extract<ElementType, 'section' | 'article' | 'div'>;
  header?: ReactNode;
  footer?: ReactNode;
  /** Adds the mechanical press physics; the card must contain something focusable. */
  interactive?: boolean;
}

export function Card({
  tone = 'neutral',
  as: Tag = 'section',
  header,
  footer,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      {...rest}
      className={cn(
        'rounded-lg border-2 border-outline-strong p-lg shadow-card',
        interactive && 'press-card',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {header ? <div className="mb-md">{header}</div> : null}
      {children}
      {footer ? <div className="mt-md">{footer}</div> : null}
    </Tag>
  );
}
