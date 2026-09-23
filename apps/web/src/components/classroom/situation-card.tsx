import type { Role, SharedSituation } from '@english-quest/shared';

import { BookIcon, ChatIcon, CheckCircleIcon, cn, HelpIcon, RefreshIcon, VerifiedIcon } from '@/components/ui';

/** `(2 rerolls left)`, `(1 reroll left)`. */
function rerollsLeft(count: number): string {
  return `(${count} reroll${count === 1 ? '' : 's'} left)`;
}

function RoleTile({ role, mine }: { role: Role; mine: boolean }) {
  return (
    <li
      className={cn(
        'flex flex-col gap-xs rounded-md border-2 border-outline-strong p-md shadow-button',
        mine ? 'bg-badge-danger-bg' : 'bg-surface-container-lowest',
      )}
    >
      <div className="flex items-center justify-between gap-sm">
        <span
          className={cn(
            'rounded-sm border border-outline-strong px-sm py-xs text-label-sm',
            mine && 'bg-primary text-on-primary',
            !mine && 'bg-surface-container-highest text-on-surface-variant',
          )}
        >
          {mine ? 'Your role' : "Partner's role"}
        </span>
        {mine ? <VerifiedIcon size={20} /> : <HelpIcon size={20} />}
      </div>
      <h3 className="text-title-lg text-on-surface">{role.label}</h3>
      <p className={cn('text-body-md', mine ? 'text-primary' : 'text-on-surface-variant')}>{role.relationship}</p>
    </li>
  );
}

export interface SituationCardProps {
  situation: SharedSituation;
  /** The viewer's own role — highlighted; every other seat reads as a partner's. */
  myRoleLabel: string | null;
  rerollsRemaining: number;
  canReroll: boolean;
  rerolling: boolean;
  onReroll: () => void;
}

/**
 * The shared situation as the waiting-room mockup lays it out: the domain
 * and the reroll action on top, the title and premise as prose, one tile per
 * seat with its relationship, and the discussion hooks in a two-column grid.
 */
export function SituationCard({
  situation,
  myRoleLabel,
  rerollsRemaining,
  canReroll,
  rerolling,
  onReroll,
}: SituationCardProps) {
  return (
    <section
      aria-label="Today's situation"
      className="flex flex-col gap-md rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-card"
    >
      <div className="flex flex-col gap-xs border-b-2 border-surface-container-highest pb-sm">
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <span className="inline-flex items-center gap-xs rounded-full border-2 border-outline-strong bg-surface-container-lowest px-md py-xs text-label-sm uppercase tracking-wider text-on-surface shadow-button">
            <BookIcon size={16} />
            {situation.vocabularyDomain}
          </span>
          <button
            type="button"
            onClick={onReroll}
            disabled={!canReroll || rerolling}
            className="press-button inline-flex items-center gap-xs rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-xs text-label-md text-on-surface outline-offset-2 outline-outline-strong focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon size={16} />
            New situation
            <span className="text-on-surface-variant">{rerollsLeft(rerollsRemaining)}</span>
          </button>
        </div>
        {rerollsRemaining === 0 ? (
          <p className="text-right text-body-sm text-on-surface-variant">
            You have used all 3 rerolls for this lesson.
          </p>
        ) : !canReroll ? (
          <p className="text-right text-body-sm text-on-surface-variant">
            Only the participant who opened the room can change the situation.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-xs">
        {situation.title ? <h2 className="text-headline-md text-on-surface">{situation.title}</h2> : null}
        <p className="text-body-lg text-on-surface-variant">
          “{situation.setting} {situation.premise}”
        </p>
      </div>

      <div className="flex flex-col gap-xs">
        <p className="text-label-sm uppercase tracking-widest text-on-surface-variant">Roles in this conversation:</p>
        <ul className="grid grid-cols-1 gap-md md:grid-cols-2">
          {situation.roles.map((role) => (
            <RoleTile key={role.label} role={role} mine={role.label === myRoleLabel} />
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-xs">
        <p className="flex items-center gap-xs text-label-sm uppercase tracking-widest text-on-surface-variant">
          <ChatIcon size={16} />
          Talk about:
        </p>
        <ul className="grid grid-cols-1 gap-sm sm:grid-cols-2">
          {situation.discussionHooks.map((hook) => (
            <li
              key={hook}
              className="flex items-start gap-xs rounded-sm border border-outline-strong bg-surface-container p-sm text-body-md text-on-surface"
            >
              <CheckCircleIcon size={18} className="mt-xs shrink-0" />
              {hook}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
