'use client';

import { usePathname } from 'next/navigation';

import { cn } from './cn';

export interface NavDestination {
  href: string;
  label: string;
}

export interface NavPillProps {
  destinations: NavDestination[];
}

/**
 * Driven by a list, not hardcoded markup — a later feature adds its
 * destination to the list passed in, rather than editing this component.
 */
export function NavPill({ destinations }: NavPillProps) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-xs rounded-lg border-2 border-outline-strong bg-surface-container p-xs md:flex">
      {destinations.map((destination) => {
        const active = pathname === destination.href;
        return (
          <a
            key={destination.href}
            href={destination.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-md py-xs text-label-lg transition-colors',
              active
                ? 'border-2 border-outline-strong bg-surface-container-lowest text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            {destination.label}
          </a>
        );
      })}
    </nav>
  );
}
