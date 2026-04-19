import { getAdminMetrics } from "@/app/_lib/admin/metrics";
import { MetricCard } from "@/app/admin/users/MetricCard";

export default async function AdminDashboardPage() {
  const { totalUsers, totalVideos } = await getAdminMetrics();

  return (
    <>
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard title="Total users" value={totalUsers} />
        <MetricCard title="Total videos" value={totalVideos} />
      </div>
    </>
  );
}
