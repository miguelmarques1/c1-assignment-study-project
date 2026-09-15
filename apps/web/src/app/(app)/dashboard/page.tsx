export const metadata = {
  title: 'Dashboard · English Quest',
};

/**
 * Landing target for a successful login and the mounting point later features
 * extend — the classroom entry point, the study plan and the lesson history all
 * attach here.
 */
export default function DashboardPage() {
  return (
    <main className="flex flex-col gap-sm">
      <h2 className="text-headline-sm text-on-surface">Dashboard</h2>
      <p className="text-body-md text-on-surface-variant">
        You are signed in. Lessons, your study plan and your progress will appear here as the
        remaining features land.
      </p>
    </main>
  );
}
