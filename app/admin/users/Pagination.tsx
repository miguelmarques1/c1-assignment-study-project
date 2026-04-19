import Link from "next/link";

export type PaginationProps = {
  page: number;
  totalPages: number;
  baseQuery: Record<string, string>;
};

function buildHref(baseQuery: Record<string, string>, page: number): string {
  const params = new URLSearchParams(baseQuery);
  params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

export function Pagination({ page, totalPages, baseQuery }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between text-sm text-muted"
    >
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-2">
        {prevDisabled ? (
          <span
            aria-disabled="true"
            className="rounded-md border border-border px-3 py-1.5 text-muted opacity-50"
          >
            Previous
          </span>
        ) : (
          <Link
            href={buildHref(baseQuery, page - 1)}
            className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Previous
          </Link>
        )}
        {nextDisabled ? (
          <span
            aria-disabled="true"
            className="rounded-md border border-border px-3 py-1.5 text-muted opacity-50"
          >
            Next
          </span>
        ) : (
          <Link
            href={buildHref(baseQuery, page + 1)}
            className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Next
          </Link>
        )}
      </div>
    </nav>
  );
}
