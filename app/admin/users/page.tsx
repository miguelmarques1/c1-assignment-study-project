import { requireAdmin } from "@/app/_lib/admin/guard";
import {
  listUsers,
  parseDirection,
  parsePage,
  parseSearch,
  parseSort,
} from "@/app/_lib/admin/users-query";
import { UsersSearchInput } from "@/app/admin/users/UsersSearchInput";
import { UsersTable } from "@/app/admin/users/UsersTable";
import { Pagination } from "@/app/admin/users/Pagination";

type SearchParams = Record<string, string | string[] | undefined>;

function pickString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const search = parseSearch(pickString(params.q) ?? "");
  const sort = parseSort(pickString(params.sort));
  const direction = parseDirection(pickString(params.dir));
  const page = parsePage(pickString(params.page));

  const { rows, totalCount, totalPages, pageSize } = await listUsers({
    search,
    sort,
    direction,
    page,
  });

  const baseQuery: Record<string, string> = {};
  if (search) baseQuery.q = search;
  baseQuery.sort = sort;
  baseQuery.dir = direction;

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Users</h1>
        <p className="text-sm text-muted">
          {totalCount} {totalCount === 1 ? "user" : "users"}
          {totalPages > 0 ? ` · ${pageSize} per page` : ""}
        </p>
      </div>
      <UsersSearchInput initialValue={search} />
      <UsersTable
        rows={rows}
        sort={sort}
        direction={direction}
        baseQuery={baseQuery}
        currentAdminId={admin.id}
      />
      <Pagination page={page} totalPages={totalPages} baseQuery={baseQuery} />
    </>
  );
}
