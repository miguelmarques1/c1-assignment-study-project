'use client';

import { ThemeToggle } from '@/components/ui';

import { BadgeSection } from './sections/badge-section';
import { ButtonSection } from './sections/button-section';
import { CardSection } from './sections/card-section';
import { ChipSection } from './sections/chip-section';
import { EmptySection } from './sections/empty-section';
import { ErrorSection } from './sections/error-section';
import { FieldSection } from './sections/field-section';
import { GridSection } from './sections/grid-section';
import { IconSection } from './sections/icon-section';
import { LoadingSection } from './sections/loading-section';
import { MeterSection } from './sections/meter-section';
import { StackSection } from './sections/stack-section';

/**
 * Every component with every variant and state, side by side, in whichever
 * theme is active. The answer to "does something for this already exist" —
 * and the surface the visual regression suite clips its screenshots from.
 */
export default function DesignSystemPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-lg p-lg">
      <header className="flex items-center justify-between gap-md">
        <h1 className="text-headline-lg text-on-surface">Design System</h1>
        <ThemeToggle />
      </header>

      <ButtonSection />
      <CardSection />
      <BadgeSection />
      <MeterSection />
      <ChipSection />
      <FieldSection />
      <IconSection />
      <StackSection />
      <GridSection />
      <LoadingSection />
      <EmptySection />
      <ErrorSection />
    </div>
  );
}
