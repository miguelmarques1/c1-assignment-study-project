import { EmptyState } from '@/components/ui';

/**
 * Every reason the runner can't record right now: the server's own blocks
 * (`azure_key_missing`, `plan_archived`, `activity_skipped`, most
 * fundamental first per the API's own ordering) plus the local ones the
 * browser itself reports (A22, A31).
 */
export type SpeakingGate = 'azure_key_missing' | 'plan_archived' | 'activity_skipped' | 'mic_denied' | 'no_microphone' | 'unsupported';

const COPY: Record<SpeakingGate, { title: string; description: string }> = {
  azure_key_missing: {
    title: 'Azure Speech key needed',
    description: 'Add your Azure Speech key to use speaking activities.',
  },
  plan_archived: {
    title: 'Plan archived',
    description: 'This activity is no longer in your current plan.',
  },
  activity_skipped: {
    title: 'Activity skipped',
    description: 'This activity was skipped, so it takes no new recordings.',
  },
  mic_denied: {
    title: 'Microphone needed',
    description: 'English Quest needs microphone access for speaking activities.',
  },
  no_microphone: {
    title: 'No microphone found',
    description: 'No microphone was found. Connect one and try again.',
  },
  unsupported: {
    title: 'Browser not supported',
    description: 'Your browser cannot record audio here. Try a recent version of Chrome, Edge or Firefox.',
  },
};

export function SpeakingBlocked({ gate, onRetry }: { gate: SpeakingGate; onRetry?: () => void }) {
  const { title, description } = COPY[gate];

  if (gate === 'azure_key_missing') {
    return <EmptyState title={title} description={description} action={{ label: 'Open settings', href: '/settings' }} />;
  }

  if ((gate === 'mic_denied' || gate === 'no_microphone') && onRetry) {
    return <EmptyState title={title} description={description} action={{ label: 'Try again', onClick: onRetry }} />;
  }

  return <EmptyState title={title} description={description} />;
}
