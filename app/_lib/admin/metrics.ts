import { prisma } from "@/app/_lib/db";

export type AdminMetrics = {
  totalUsers: number;
  totalVideos: number;
};

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const [totalUsers, totalVideos] = await Promise.all([
    prisma.user.count(),
    prisma.video.count(),
  ]);
  return { totalUsers, totalVideos };
}
