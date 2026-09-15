import type { ReactNode } from 'react';

interface SectionShellProps {
  title: string;
  /** Stable id the visual regression suite clips each screenshot against. */
  vrId: string;
  children: ReactNode;
}

export function SectionShell({ title, vrId, children }: SectionShellProps) {
  return (
    <section data-vr={vrId} className="flex flex-col gap-md rounded-lg border-2 border-outline-strong p-lg">
      <h2 className="text-headline-sm text-on-surface">{title}</h2>
      {children}
    </section>
  );
}
