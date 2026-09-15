import { Button } from './button';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

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
      {action ? (
        <Button variant="neutral" onClick={action.onClick} className="mt-sm">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
