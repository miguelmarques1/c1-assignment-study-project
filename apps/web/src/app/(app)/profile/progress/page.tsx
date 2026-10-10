import { ProgressScreen } from '@/components/progress/progress-screen';
import { getProgressView } from '@/lib/progress-server';

export const metadata = {
  title: 'Progress · English Quest',
};

/** How the caller's competencies have changed over time, and what keeps coming back (F20). */
export default async function ProgressPage() {
  const result = await getProgressView();

  return <ProgressScreen initialView={result.ok ? result.data : null} />;
}
