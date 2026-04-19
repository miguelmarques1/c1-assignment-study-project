"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminUserRow, SortColumn, SortDirection } from "@/app/_lib/admin/users-query";
import { UserActionButtons } from "@/app/admin/users/UserActionButtons";

export type UsersTableProps = {
  rows: AdminUserRow[];
  sort: SortColumn;
  direction: SortDirection;
  baseQuery: Record<string, string>;
  currentAdminId: string;
};

type HeaderColumn = {
  key: SortColumn;
  label: string;
};

const COLUMNS: HeaderColumn[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "createdAt", label: "Registration" },
  { key: "lastLoginAt", label: "Last login" },
  { key: "videoCount", label: "Videos" },
  { key: "status", label: "Status" },
];

function buildHeaderHref(
  baseQuery: Record<string, string>,
  column: SortColumn,
  currentSort: SortColumn,
  currentDir: SortDirection,
): string {
  const params = new URLSearchParams(baseQuery);
  const nextDir: SortDirection =
    currentSort === column && currentDir === "asc" ? "desc" : "asc";
  params.set("sort", column);
  params.set("dir", nextDir);
  params.delete("page");
  return `/admin/users?${params.toString()}`;
}

function formatDate(value: Date | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

export function UsersTable({
  rows,
  sort,
  direction,
  baseQuery,
  currentAdminId,
}: UsersTableProps) {
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
        No users match this filter.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {banner ? (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {banner}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted-surface text-left">
            <tr>
              {COLUMNS.map((col) => {
                const isActive = col.key === sort;
                const arrow = isActive ? (direction === "asc" ? " ↑" : " ↓") : "";
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className="px-3 py-2 font-medium text-foreground"
                  >
                    <Link
                      href={buildHeaderHref(baseQuery, col.key, sort, direction)}
                      aria-sort={
                        isActive ? (direction === "asc" ? "ascending" : "descending") : "none"
                      }
                      className="inline-flex items-center gap-1 text-foreground hover:text-accent"
                    >
                      {col.label}
                      {arrow}
                    </Link>
                  </th>
                );
              })}
              <th scope="col" className="px-3 py-2 text-right font-medium text-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelf = row.id === currentAdminId;
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground">{row.name}</td>
                  <td className="px-3 py-2 text-foreground">{row.email}</td>
                  <td className="px-3 py-2 text-muted">{formatDate(row.createdAt)}</td>
                  <td className="px-3 py-2 text-muted">{formatDate(row.lastLoginAt)}</td>
                  <td className="px-3 py-2 tabular-nums text-foreground">{row.videoCount}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.isSuspended
                          ? "inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                          : "inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                      }
                    >
                      {row.isSuspended ? "Suspended" : "Active"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <UserActionButtons
                      row={{
                        id: row.id,
                        name: row.name,
                        email: row.email,
                        isSuspended: row.isSuspended,
                        checksum: row.checksum,
                      }}
                      isSelf={isSelf}
                      onError={setBanner}
                      onSuccess={() => {
                        setBanner(null);
                        router.refresh();
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
