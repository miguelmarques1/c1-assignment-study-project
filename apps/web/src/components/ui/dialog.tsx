'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { CloseIcon } from './icons';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Action buttons, right-aligned on wide screens and stacked full-width on narrow ones. */
  footer?: ReactNode;
}

/**
 * A generic modal shell (F17 A25): `role="dialog"`, `aria-modal` and
 * `aria-labelledby`. Focus moves to the close button on open and returns to
 * whatever had it on close; Escape closes it. Follows the behaviour
 * `LedgerEntrySheet` and `EndLessonDialog` already hand-roll, without
 * changing either.
 */
export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-outline-strong/60 p-md backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-full w-full max-w-136 flex-col gap-md overflow-y-auto rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-modal"
      >
        <div className="flex items-start justify-between gap-md">
          <h2 id={titleId} className="text-headline-sm text-on-surface">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press-button flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-outline-strong bg-surface outline-offset-2 outline-outline-strong focus-visible:outline-2"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        {children}
        {footer ? (
          <div className="flex w-full flex-col-reverse items-center justify-end gap-md sm:flex-row">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
