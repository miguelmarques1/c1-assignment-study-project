import type { ActivityContext } from '@english-quest/shared';

import { EmptyState } from '@/components/ui';
import { TODAY_HREF } from '@/lib/activity-navigation';
import type { UnavailableReason } from './use-objective-runner';

/** The terminal states, on the shared empty-state convention. */
export function ActivityUnavailable({ reason, activity }: { reason: UnavailableReason; activity: ActivityContext }) {
  switch (reason) {
    case 'replaced':
      return (
        <EmptyState
          title="This activity is no longer in your current plan."
          description="Your plan was refreshed after a newer lesson."
          action={{ label: 'Go to your plan', href: '/plan' }}
        />
      );
    case 'skipped':
      return (
        <EmptyState
          title="You skipped this activity."
          description={activity.skipReason ? `Reason: ${activity.skipReason}` : 'It stays in your plan as skipped.'}
          action={{ label: 'Back to Today', href: TODAY_HREF }}
        />
      );
    case 'not_runnable':
      return (
        <EmptyState
          title="This activity could not be corrected."
          description="Something is wrong with its questions. You can skip it and carry on."
          action={{ label: 'Back to Today', href: TODAY_HREF }}
        />
      );
    case 'not_objective':
      return (
        <EmptyState
          title="This activity isn't available here."
          description="Open it from your plan."
          action={{ label: 'Go to your plan', href: '/plan' }}
        />
      );
  }
}
