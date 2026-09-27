import Link from 'next/link';

import { Button } from './button';

/** A button for an action, or a link when the one thing to do is go somewhere else. */
type EmptyStateAction = { label: string; onClick: () => void } | { label: string; href: string };

interface EmptyStateProps {
  /** What is missing. */
  title: string;
  description: string;
  /** Exactly one action — the type forbids a list of them. */
  action?: EmptyStateAction;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-sm p-xl text-center">
      <p className="text-title-md text-on-surface">{title}</p>
      <p className="text-body-md text-on-surface-variant">{description}</p>
      {action && 'href' in action ? (
        <Link
          href={action.href}
          className="press-button mt-sm inline-flex items-center justify-center gap-sm rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-sm text-label-lg font-semibold text-on-surface outline-offset-2 outline-outline-strong focus-visible:outline-2"
        >
          {action.label}
        </Link>
      ) : action ? (
        <Button variant="neutral" onClick={action.onClick} className="mt-sm">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
