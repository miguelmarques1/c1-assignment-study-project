export function MetricCard({
  title,
  value,
}: {
  title: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted-surface px-6 py-8">
      <div className="text-sm font-medium text-muted">{title}</div>
      <div className="mt-2 text-4xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
