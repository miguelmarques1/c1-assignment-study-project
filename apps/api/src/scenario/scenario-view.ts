import type { Register, Role, RoleCard, RoleCardStatus, SharedSituation, VocabularyDomain } from '@english-quest/shared';
import type { LessonRoleCard, LessonScenario } from '@prisma/client';

type SituationSource = Pick<
  LessonScenario,
  'status' | 'title' | 'setting' | 'premise' | 'roles' | 'vocabularyDomain' | 'discussionHooks'
>;

type OwnCardSource = Pick<
  LessonRoleCard,
  'status' | 'background' | 'objective' | 'constraintText' | 'register' | 'targetExpressions'
>;

/** The shared situation, present only once it is `ready` — every participant may see it. */
export function situationOf(scenario: SituationSource | null): SharedSituation | null {
  if (!scenario || scenario.status !== 'ready') {
    return null;
  }
  return {
    title: scenario.title,
    setting: scenario.setting!,
    premise: scenario.premise!,
    roles: scenario.roles as unknown as Role[],
    vocabularyDomain: scenario.vocabularyDomain as VocabularyDomain,
    discussionHooks: scenario.discussionHooks as unknown as string[],
  };
}

/**
 * The caller's own card. Both scenario views (F06's open lesson and F19's
 * past lesson) are built through this one function, and both hand it only
 * the row read by `(lessonId, callerId)` — there is no signature here that
 * takes a list of cards, so neither view can ever carry another's.
 */
export function ownCardOf(card: OwnCardSource | null): RoleCard | null {
  if (!card) {
    return null;
  }
  return {
    status: card.status as RoleCardStatus,
    background: card.background,
    objective: card.objective,
    constraint: card.constraintText,
    register: card.register as Register | null,
    targetExpressions: card.targetExpressions as unknown as string[] | null,
  };
}
