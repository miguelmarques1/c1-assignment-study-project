import type { ScenarioContext, ScenarioFitView } from '@english-quest/shared';

import { REGISTER_LABEL } from '@/components/classroom/role-card-panel';
import { Badge, Chip } from '@/components/ui';

export const NO_SCENARIO_SENTENCE = 'No scenario was in play for this lesson.';

function ExpressionGroup({ title, expressions }: { title: string; expressions: string[] }) {
  return (
    <div className="flex flex-col gap-xs">
      <h3 className="text-title-md text-on-surface">{title}</h3>
      {expressions.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">None</p>
      ) : (
        <ul aria-label={title} className="flex flex-wrap gap-sm">
          {expressions.map((expression) => (
            <li key={expression}>
              <Chip tone={title === 'Used' ? 'success' : 'neutral'}>{expression}</Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * How the caller fit the scenario: the role, the register the card asked
 * for and whether it was matched, and the card's target expressions split
 * into used and not used (F11 partitions them exactly).
 */
export function ScenarioFit({ fit, context }: { fit: ScenarioFitView | null; context: ScenarioContext }) {
  if (!fit) {
    return context === 'none' ? (
      <section aria-labelledby="fit-heading" className="flex flex-col gap-sm">
        <h2 id="fit-heading" className="text-headline-sm text-on-surface">
          Scenario fit
        </h2>
        <p className="text-body-md text-on-surface-variant">{NO_SCENARIO_SENTENCE}</p>
      </section>
    ) : null;
  }

  return (
    <section aria-labelledby="fit-heading" className="flex flex-col gap-md">
      <h2 id="fit-heading" className="text-headline-sm text-on-surface">
        Scenario fit
      </h2>
      <p className="text-body-md text-on-surface">
        You played <strong>{fit.roleLabel}</strong>.
      </p>
      <div className="flex flex-wrap items-center gap-sm">
        <span className="text-body-md text-on-surface">
          Expected: {REGISTER_LABEL[fit.registerExpected] ?? fit.registerExpected}
        </span>
        <Badge status={fit.registerMatched ? 'success' : 'warning'}>
          {fit.registerMatched ? 'Register matched' : 'Register missed'}
        </Badge>
      </div>
      <p className="text-body-md text-on-surface-variant">{fit.registerComment}</p>
      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <ExpressionGroup title="Used" expressions={fit.expressionsUsed} />
        <ExpressionGroup title="Not used" expressions={fit.expressionsNotUsed} />
      </div>
    </section>
  );
}
