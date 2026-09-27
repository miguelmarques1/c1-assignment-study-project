import type { ReactNode } from 'react';

import { cn } from '@/components/ui';

export type StepTone = 'done' | 'active' | 'waiting' | 'attention' | 'idle';

export interface StepperStep {
  key: string;
  title: string;
  /** Always a word, never only a colour: `Done`, `Running`, `Blocked`… */
  state: string;
  tone: StepTone;
  detail?: ReactNode;
}

const MARKER: Record<StepTone, string> = {
  done: 'bg-tertiary',
  active: 'bg-primary',
  waiting: 'bg-surface-container-highest',
  attention: 'bg-error',
  idle: 'bg-surface-container',
};

const STATE_TEXT: Record<StepTone, string> = {
  done: 'text-tertiary',
  active: 'text-primary',
  waiting: 'text-on-surface-variant',
  attention: 'text-error',
  idle: 'text-on-surface-variant',
};

/** A vertical stepper: one row per step, the marker's colour always paired with the state's word. */
export function Stepper({ label, steps }: { label: string; steps: StepperStep[] }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step.key} className="flex gap-md">
          <div className="flex flex-col items-center" aria-hidden="true">
            <span className={cn('mt-xs h-4 w-4 shrink-0 rounded-full border-2 border-outline-strong', MARKER[step.tone])} />
            {index < steps.length - 1 ? <span className="w-1 flex-1 bg-outline-variant" /> : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-xs pb-md">
            <p className="flex flex-wrap items-baseline gap-sm">
              <span className="text-title-md text-on-surface">{step.title}</span>
              <span className={cn('text-label-md', STATE_TEXT[step.tone])}>{step.state}</span>
            </p>
            {step.detail}
          </div>
        </li>
      ))}
    </ol>
  );
}
