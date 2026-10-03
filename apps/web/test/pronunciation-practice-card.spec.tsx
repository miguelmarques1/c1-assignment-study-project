import type { CurrentPlanView, MaskedCredential, PlanActivityView, PlanSessionView, StudyPlanView } from '@english-quest/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PronunciationPracticeCard } from '@/components/dashboard/pronunciation-practice-card';
import type { ServerRead } from '@/lib/plans-server';

afterEach(() => {
  cleanup();
});

function activity(overrides: Partial<PlanActivityView> = {}): PlanActivityView {
  return {
    id: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21',
    day: 1,
    position: 1,
    kind: 'listening',
    contentItemId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d22',
    title: 'Listen: Ordering coffee',
    estimatedMinutes: 6,
    targetTags: [],
    rationale: 'Because listening is due.',
    isReview: false,
    carriedOver: false,
    state: 'pending',
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    skipReason: null,
    rating: null,
    notUseful: false,
    ...overrides,
  };
}

function session(day: number, overrides: Partial<PlanSessionView> = {}): PlanSessionView {
  return {
    day,
    estimatedMinutes: 17,
    state: 'not_started',
    completedAt: null,
    summary: { completed: 0, skipped: 0, correct: null, questions: null, timeSpentSeconds: null },
    activities: [activity({ day })],
    ...overrides,
  };
}

function plan(sessions: PlanSessionView[], overrides: Partial<StudyPlanView> = {}): StudyPlanView {
  return {
    id: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d23',
    status: 'active',
    origin: 'lesson',
    lessonId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d24',
    lessonDate: '2026-09-20T10:00:00.000Z',
    createdAt: '2026-09-20T10:00:00.000Z',
    activatedAt: '2026-09-20T10:00:00.000Z',
    archivedAt: null,
    summaryLine: '7 sessions · 21 activities',
    focusTags: [],
    notes: [],
    progress: { total: 21, completed: 0, skipped: 0, inProgress: 0, pending: 21, completionPercent: 0 },
    ratings: { tooEasy: 0, justRight: 0, tooHard: 0, notUseful: 0 },
    sessions,
    ...overrides,
  };
}

function sevenSessions(overrides: (day: number) => Partial<PlanSessionView> = () => ({})): PlanSessionView[] {
  return Array.from({ length: 7 }, (_, i) => session(i + 1, overrides(i + 1)));
}

function current(overrides: Partial<CurrentPlanView> = {}): ServerRead<CurrentPlanView> {
  return { ok: true, data: { serverTime: '2026-09-25T14:00:00.000Z', plan: null, preparing: null, failure: null, ...overrides } };
}

function validAzureCredential(): MaskedCredential {
  return { provider: 'azure_speech', status: 'valid', maskedKey: '••••abcd', region: 'brazilsouth', lastValidatedAt: '2026-09-20T10:00:00.000Z' };
}

describe('PronunciationPracticeCard', () => {
  it('shows_the_no_plan_message_with_no_action', () => {
    render(<PronunciationPracticeCard current={current()} credentials={[validAzureCredential()]} />);

    expect(screen.getByText('Read-aloud and speaking practice appear in your study plan after your first lesson.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('asks_for_the_azure_key_before_offering_an_activity', () => {
    const sessions = sevenSessions((day) => (day === 1 ? { activities: [activity({ day, kind: 'speaking' })] } : {}));
    render(<PronunciationPracticeCard current={current({ plan: plan(sessions) })} credentials={[]} />);

    expect(screen.getByText('Add your Azure Speech key to use speaking activities.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open settings' })).toHaveAttribute('href', '/settings');
  });

  it('links_to_the_earliest_unfinished_speaking_activity', () => {
    const sessions = sevenSessions((day) => {
      if (day === 1) return { activities: [activity({ day, position: 1, kind: 'listening', state: 'completed' })] };
      if (day === 2) {
        return {
          activities: [
            activity({ id: 'later', day, position: 2, kind: 'speaking', state: 'pending', title: 'Speak: Ordering coffee', estimatedMinutes: 8 }),
            activity({ id: 'earlier', day, position: 1, kind: 'pronunciation', state: 'pending', title: 'Read aloud: /θ/ as in "think"', estimatedMinutes: 4 }),
          ],
        };
      }
      return {};
    });
    render(<PronunciationPracticeCard current={current({ plan: plan(sessions) })} credentials={[validAzureCredential()]} />);

    expect(screen.getByText('Read aloud: /θ/ as in "think"')).toBeInTheDocument();
    expect(screen.getByText('4 min')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Practice now' })).toHaveAttribute('href', '/speaking/earlier');
  });

  it('shows_everything_done_when_no_speaking_activity_remains', () => {
    const sessions = sevenSessions((day) => ({ activities: [activity({ day, kind: 'speaking', state: 'completed' })] }));
    render(<PronunciationPracticeCard current={current({ plan: plan(sessions) })} credentials={[validAzureCredential()]} />);

    expect(screen.getByText('Every speaking activity in this plan is done.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See the full plan' })).toHaveAttribute('href', '/plan');
  });
});
