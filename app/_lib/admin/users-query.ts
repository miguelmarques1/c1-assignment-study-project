import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db";
import { userActionChecksum } from "@/app/_lib/admin/checksum";

export const PAGE_SIZE = 50;

export const SORT_COLUMNS = [
  "name",
  "email",
  "createdAt",
  "lastLoginAt",
  "videoCount",
  "status",
] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export type SortDirection = "asc" | "desc";

export function parseSort(value: unknown): SortColumn {
  if (typeof value === "string" && (SORT_COLUMNS as readonly string[]).includes(value)) {
    return value as SortColumn;
  }
  return "createdAt";
}

export function parseDirection(value: unknown): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

export function parsePage(value: unknown): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function parseSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 200);
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  isAdmin: boolean;
  isSuspended: boolean;
  videoCount: number;
  checksum: string;
};

export type ListUsersOptions = {
  search?: string;
  sort?: SortColumn;
  direction?: SortDirection;
  page?: number;
};

export type ListUsersResult = {
  rows: AdminUserRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function buildOrderBy(
  sort: SortColumn,
  direction: SortDirection,
): Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[] {
  switch (sort) {
    case "name":
      return { name: direction };
    case "email":
      return { email: direction };
    case "createdAt":
      return { createdAt: direction };
    case "lastLoginAt":
      return { lastLoginAt: direction };
    case "videoCount":
      return { videos: { _count: direction } };
    case "status":
      return [{ isSuspended: direction }, { createdAt: "desc" }];
  }
}

export async function listUsers(options: ListUsersOptions = {}): Promise<ListUsersResult> {
  const search = parseSearch(options.search ?? "");
  const sort = options.sort ?? "createdAt";
  const direction = options.direction ?? "desc";
  const page = options.page && options.page >= 1 ? Math.floor(options.page) : 1;

  const where: Prisma.UserWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  const orderBy = buildOrderBy(sort, direction);

  const [rawRows, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        isAdmin: true,
        isSuspended: true,
        _count: { select: { videos: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const rows: AdminUserRow[] = rawRows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    isAdmin: u.isAdmin,
    isSuspended: u.isSuspended,
    videoCount: u._count.videos,
    checksum: userActionChecksum({ isSuspended: u.isSuspended, updatedAt: u.updatedAt }),
  }));

  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / PAGE_SIZE);

  return { rows, totalCount, page, pageSize: PAGE_SIZE, totalPages };
}
