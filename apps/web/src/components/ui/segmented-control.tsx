'use client';

import { useRef, type KeyboardEvent } from 'react';

import { cn } from './cn';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The group's accessible name (`Time range`). */
  label: string;
}

/**
 * A choice within the page, unlike `NavPill`, whose entries are links. It is a
 * radio group: one stop in the tab order (the selected option), arrow keys
 * move and select, and the container and selected styles are `NavPill`'s.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next]!.value);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap items-center gap-xs rounded-lg border-2 border-outline-strong bg-surface-container p-xs"
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'rounded-md px-sm py-xs text-label-lg outline-offset-2 md:px-md outline-outline-strong transition-colors focus-visible:outline-2',
              selected
                ? 'border-2 border-outline-strong bg-surface-container-lowest text-on-surface'
                : 'border-2 border-surface-container text-on-surface-variant hover:text-on-surface',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
