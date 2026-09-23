import { BookIcon, ChatIcon, CloseIcon, EyeOffIcon } from '@/components/ui';
import { REGISTER_LABEL } from './role-card-panel';
import type { UseScenarioResult } from './use-scenario';

export interface ScenarioPanelProps {
  scenario: UseScenarioResult;
  onClose: () => void;
}

/**
 * The in-call "Scenario brief" column, toggled from the control bar. Reads
 * whatever `useScenario` last cached — it does not poll on its own, since
 * the scenario is immutable once the lesson has started.
 */
export function ScenarioPanel({ scenario, onClose }: ScenarioPanelProps) {
  const { view, loading } = scenario;
  const situation = !loading && view?.status === 'ready' ? view.situation : null;
  const card = view?.myCard ?? null;

  return (
    <aside
      aria-label="Scenario panel"
      className="flex w-full flex-col gap-md rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-card"
    >
      <div className="flex items-center justify-between gap-sm border-b-2 border-outline-strong pb-sm">
        <h2 className="flex items-center gap-xs text-headline-sm text-on-surface">
          <BookIcon size={20} />
          Scenario brief
        </h2>
        <div className="flex items-center gap-xs">
          {situation ? (
            <span className="rounded-full border border-outline-strong bg-badge-info-bg px-sm py-xs text-label-sm uppercase text-badge-info-fg">
              {situation.vocabularyDomain}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scenario panel"
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-outline-strong bg-surface-container outline-offset-2 outline-outline-strong focus-visible:outline-2"
          >
            <CloseIcon size={18} />
          </button>
        </div>
      </div>

      {!situation ? (
        <p className="text-body-sm text-on-surface-variant">No scenario for this lesson.</p>
      ) : (
        <>
          <div className="flex flex-col gap-xs">
            <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">Context &amp; setting</p>
            <p className="text-body-md text-on-surface">{situation.setting}</p>
            <p className="text-body-md text-on-surface">{situation.premise}</p>
          </div>

          <div className="rounded-md border-2 border-outline-strong bg-surface-container p-md">
            <p className="mb-xs flex items-center gap-xs text-label-md text-on-surface">
              <ChatIcon size={16} />
              Talk about:
            </p>
            <ul className="list-disc space-y-xs pl-md text-body-sm text-on-surface">
              {situation.discussionHooks.map((hook) => (
                <li key={hook}>{hook}</li>
              ))}
            </ul>
          </div>

          <section
            aria-label="Your role card"
            className="flex flex-col gap-sm rounded-md border-2 border-outline-strong bg-badge-warning-bg p-md"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-sm bg-badge-warning-fg px-xs py-xs text-label-sm uppercase tracking-wider text-surface-container-lowest">
                Only you can see this
              </span>
              <EyeOffIcon size={18} />
            </div>
            {view?.myRoleLabel ? (
              <p className="text-title-md text-on-surface">Your role: {view.myRoleLabel}</p>
            ) : null}
            {card?.status === 'ready' ? (
              <div className="flex flex-col gap-xs text-body-sm text-on-surface">
                <p>
                  <strong>Your objective:</strong> {card.objective}
                </p>
                <p>
                  <strong>Your constraint:</strong> {card.constraint}
                </p>
                {card.register ? <p className="text-on-surface-variant">{REGISTER_LABEL[card.register]}</p> : null}
              </div>
            ) : card?.status === 'failed' ? (
              <p className="text-body-sm text-on-surface">
                Your role card could not be generated. You can still play this role.
              </p>
            ) : (
              <p className="text-body-sm text-on-surface-variant">Your role card is still being prepared.</p>
            )}
          </section>

          {card?.status === 'ready' && card.targetExpressions && card.targetExpressions.length > 0 ? (
            <div className="flex flex-col gap-xs">
              <p className="text-label-md uppercase tracking-wider text-on-surface">Expressions to try</p>
              <ul className="flex flex-wrap gap-xs">
                {card.targetExpressions.map((expression) => (
                  <li
                    key={expression}
                    className="rounded-md border-2 border-outline-strong bg-surface px-sm py-xs text-label-sm text-on-surface shadow-button"
                  >
                    “{expression}”
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}
