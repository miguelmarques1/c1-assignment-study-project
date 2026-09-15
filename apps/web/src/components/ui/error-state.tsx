import { Button } from './button';

interface ErrorStateProps {
  /** What failed, in plain language — no error codes. */
  title: string;
  description: string;
  /** Required: an error state without a way to retry is not representable. */
  onRetry: () => void;
}

export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-sm p-xl text-center">
      <p className="text-title-md text-error">{title}</p>
      <p className="text-body-md text-on-surface-variant">{description}</p>
      <Button variant="destructive" onClick={onRetry} className="mt-sm">
        Try again
      </Button>
    </div>
  );
}
