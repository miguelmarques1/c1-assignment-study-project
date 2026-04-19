"use client";

import { submitLibraryPreferences } from "@/app/_lib/videos/actions";
import {
  type LibrarySort,
  type LibraryView,
} from "@/app/_lib/videos/libraryValidation";

const SORT_LABEL: Record<LibrarySort, string> = {
  recent: "Most recent",
  oldest: "Oldest",
  title_asc: "Title A–Z",
};

type Props = {
  view: LibraryView;
  sort: LibrarySort;
};

export function LibraryHeader({ view, sort }: Props) {
  return (
    <div
      data-testid="library-header"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"
    >
      <h2 className="text-base font-semibold text-foreground">Your videos</h2>
      <div className="flex items-center gap-3">
        <form
          action={submitLibraryPreferences}
          className="inline-flex rounded-md border border-border bg-white p-0.5"
          aria-label="View mode"
        >
          {(["grid", "list"] as const).map((mode) => {
            const active = view === mode;
            return (
              <button
                key={mode}
                type="submit"
                name="view"
                value={mode}
                aria-pressed={active}
                data-testid={`view-toggle-${mode}`}
                className={`rounded px-2 py-1 text-xs font-medium capitalize transition-colors ${
                  active
                    ? "bg-accent text-white"
                    : "text-muted hover:bg-muted-surface hover:text-foreground"
                }`}
              >
                {mode}
              </button>
            );
          })}
        </form>
        <form
          action={submitLibraryPreferences}
          className="inline-flex items-center gap-2"
          aria-label="Sort order"
        >
          <label htmlFor="library-sort" className="text-xs font-medium text-muted">
            Sort
          </label>
          <select
            id="library-sort"
            name="sort"
            defaultValue={sort}
            data-testid="library-sort"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="h-8 rounded-md border border-border bg-white px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {(Object.keys(SORT_LABEL) as LibrarySort[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </select>
          <noscript>
            <button
              type="submit"
              className="rounded border border-border px-2 py-1 text-xs"
            >
              Apply
            </button>
          </noscript>
        </form>
      </div>
    </div>
  );
}
