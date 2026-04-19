import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const push = vi.fn();
let currentSearchParams = new URLSearchParams("");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => currentSearchParams,
}));

import { UsersSearchInput } from "../UsersSearchInput";

describe("UsersSearchInput", () => {
  beforeEach(() => {
    push.mockReset();
    currentSearchParams = new URLSearchParams("");
  });

  it("debounces_submit_by_300ms", () => {
    vi.useFakeTimers();
    try {
      render(<UsersSearchInput initialValue="" debounceMs={300} />);
      const input = screen.getByRole("searchbox");
      fireEvent.change(input, { target: { value: "a" } });
      fireEvent.change(input, { target: { value: "ad" } });
      fireEvent.change(input, { target: { value: "ada" } });
      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(push).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(push).toHaveBeenCalledTimes(1);
      expect(push.mock.calls[0][0]).toContain("q=ada");
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves_sort_and_dir_on_submit", () => {
    vi.useFakeTimers();
    try {
      currentSearchParams = new URLSearchParams("sort=email&dir=asc&page=3");
      render(<UsersSearchInput initialValue="" debounceMs={100} />);
      fireEvent.change(screen.getByRole("searchbox"), {
        target: { value: "ada" },
      });
      act(() => {
        vi.advanceTimersByTime(150);
      });
      const url = push.mock.calls[0][0] as string;
      expect(url).toContain("sort=email");
      expect(url).toContain("dir=asc");
      expect(url).toContain("q=ada");
      expect(url).not.toContain("page=");
    } finally {
      vi.useRealTimers();
    }
  });
});
