import type { RoleCard } from '@english-quest/shared';

import { EyeOffIcon, FlagIcon, LoadingState, WarningIcon } from '@/components/ui';

export interface RoleCardPanelProps {
  card: RoleCard | null;
  /** The assigned role label, present even before the card itself exists or if it failed. */
  roleLabel: string | null;
}

export const REGISTER_LABEL: Record<string, string> = {
  formal: 'Formal register',
  neutral: 'Neutral register',
  informal: 'Informal register',
};

export function OnlyYouBadge() {
  return (
    <span className="inline-flex items-center gap-xs rounded-full border-2 border-outline-strong bg-primary px-md py-xs text-label-sm uppercase tracking-wider text-on-primary shadow-button">
      <EyeOffIcon size={16} />
      Only you can see this
    </span>
  );
}

/**
 * The viewer's own private briefing — the waiting-room mockup's "secret
 * briefing" card. Marked as private in its first line, so it can never be
 * mistaken for something the other participant also sees.
 */
export function RoleCardPanel({ card, roleLabel }: RoleCardPanelProps) {
  return (
    <section
      aria-label="Your role card"
      className="flex flex-col gap-md rounded-lg border-2 border-outline-strong bg-badge-danger-bg p-lg shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-sm border-b-2 border-outline-strong/10 pb-xs">
        <OnlyYouBadge />
        {card?.status === 'ready' && card.register ? (
          <span className="rounded-sm border border-outline-strong bg-surface-container-lowest px-sm py-xs text-label-sm text-on-surface">
            {REGISTER_LABEL[card.register] ?? card.register}
          </span>
        ) : null}
      </div>

      {!card || card.status === 'pending' ? (
        <div className="flex flex-col gap-sm">
          <p className="text-body-md text-on-surface">Preparing your role card…</p>
          <LoadingState variant="text-block" label="Loading your role card" />
        </div>
      ) : card.status === 'failed' ? (
        <div className="flex flex-col gap-sm">
          <p className="text-body-md text-on-surface">
            Your role card could not be generated. You can still play this role.
          </p>
          {roleLabel ? (
            <p className="text-title-md text-on-surface">
              Your role: <strong>{roleLabel}</strong>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {roleLabel || card.background ? (
            <div className="flex flex-col gap-xs">
              {roleLabel ? <p className="text-title-lg text-on-surface">You are {roleLabel}</p> : null}
              {card.background ? <p className="text-body-md text-on-surface">{card.background}</p> : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            <div className="flex flex-col gap-xs rounded-md border-2 border-outline-strong bg-surface-container-lowest p-md shadow-button">
              <p className="flex items-center gap-xs text-label-md text-primary">
                <FlagIcon size={18} />
                Your objective:
              </p>
              <p className="text-body-md text-on-surface">{card.objective}</p>
            </div>
            <div className="flex flex-col gap-xs rounded-md border-2 border-outline-strong bg-surface-container-lowest p-md shadow-button">
              <p className="flex items-center gap-xs text-label-md text-error">
                <WarningIcon size={18} />
                Your constraint:
              </p>
              <p className="text-body-md text-on-surface">{card.constraint}</p>
            </div>
          </div>

          {card.targetExpressions && card.targetExpressions.length > 0 ? (
            <div className="flex flex-col gap-sm">
              <p className="text-label-sm uppercase tracking-widest text-on-surface">Expressions to try:</p>
              <ul className="flex flex-wrap gap-sm">
                {card.targetExpressions.map((expression) => (
                  <li
                    key={expression}
                    className="rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-xs text-label-md text-on-surface shadow-button"
                  >
                    {expression}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
