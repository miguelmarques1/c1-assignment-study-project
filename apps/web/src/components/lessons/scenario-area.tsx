import type { LessonScenarioView } from '@english-quest/shared';

import { RoleCardPanel } from '@/components/classroom/role-card-panel';
import { SituationCard } from '@/components/classroom/situation-card';

import { NO_SCENARIO_SENTENCE } from './result/scenario-fit';

/**
 * The past lesson's scenario exactly as it was on screen before the lesson:
 * the shared situation, read-only, and the caller's own card. The response
 * has no field for anyone else's card, so neither does this view.
 */
export function ScenarioArea({ view }: { view: LessonScenarioView }) {
  if (!view.situation) {
    return <p className="text-body-md text-on-surface-variant">{NO_SCENARIO_SENTENCE}</p>;
  }

  return (
    <div className="flex flex-col gap-lg">
      <SituationCard situation={view.situation} myRoleLabel={view.myRoleLabel} />
      {view.myCard && view.myCard.status !== 'pending' ? (
        <RoleCardPanel card={view.myCard} roleLabel={view.myRoleLabel} />
      ) : (
        <p className="text-body-md text-on-surface-variant">
          {view.myRoleLabel ? `You played ${view.myRoleLabel}, without a role card.` : 'You had no role card in this lesson.'}
        </p>
      )}
    </div>
  );
}
