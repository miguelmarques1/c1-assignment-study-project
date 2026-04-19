"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function UsersSearchInput({
  initialValue,
  debounceMs = 300,
}: {
  initialValue: string;
  debounceMs?: number;
}) {
  const [value, setValue] = useState(initialValue);
  const router = useRouter();
  const searchParams = useSearchParams();
  const latestValueRef = useRef(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestValueRef.current = initialValue;
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function submit(next: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next) {
      params.set("q", next);
    } else {
      params.delete("q");
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/admin/users?${qs}` : "/admin/users");
  }

  function handleChange(next: string) {
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (latestValueRef.current !== next) {
        latestValueRef.current = next;
        submit(next);
      }
    }, debounceMs);
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (timerRef.current) clearTimeout(timerRef.current);
        latestValueRef.current = value;
        submit(value);
      }}
      className="flex items-center gap-2"
    >
      <label htmlFor="admin-users-search" className="sr-only">
        Search users by name or email
      </label>
      <input
        id="admin-users-search"
        type="search"
        name="q"
        value={value}
        placeholder="Search by name or email"
        onChange={(event) => handleChange(event.target.value)}
        className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    </form>
  );
}
