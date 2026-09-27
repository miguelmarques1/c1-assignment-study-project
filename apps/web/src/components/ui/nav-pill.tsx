'use client';

import { usePathname } from 'next/navigation';

import { cn } from './cn';

export interface NavDestination {
  href: string;
  label: string;
  /** Also active on every path below `href` (`/lessons` for `/lessons/…`). */
  matchPrefix?: boolean;
}

export interface NavPillProps {
  destinations: NavDestination[];
  /** The navigation landmark's accessible name, needed once a page has more than one. */
  label?: string;
  /** Show at every width. The header's pill hides below `md`; a page's section tabs cannot. */
  alwaysVisible?: boolean;
}

function isActive(pathname: string | null, destination: NavDestination): boolean {
  if (!pathname) {
    return false;
  }
  return pathname === destination.href || (destination.matchPrefix === true && pathname.startsWith(`${destination.href}/`));
}

/**
 * Driven by a list, not hardcoded markup — a later feature adds its
 * destination to the list passed in, rather than editing this component.
 */
export function NavPill({ destinations, label, alwaysVisible = false }: NavPillProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className={cn(
        'items-center gap-xs rounded-lg border-2 border-outline-strong bg-surface-container p-xs',
        alwaysVisible ? 'flex flex-wrap' : 'hidden md:flex',
      )}
    >
      {destinations.map((destination) => {
        const active = isActive(pathname, destination);
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
