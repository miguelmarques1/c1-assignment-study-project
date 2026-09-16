export interface ReconnectingOverlayProps {
  /** `null` hides the overlay entirely. */
  secondsLeft: number | null;
}

/** Blocking overlay with the 30-second countdown shown on a network drop. */
export function ReconnectingOverlay({ secondsLeft }: ReconnectingOverlayProps) {
  if (secondsLeft === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-outline-strong p-md">
      <div
        role="alert"
        className="flex flex-col items-center gap-sm rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-modal"
      >
        <p className="text-title-lg text-on-surface">Reconnecting…</p>
        <p className="text-body-md text-on-surface-variant">{secondsLeft}s remaining</p>
      </div>
    </div>
  );
}
