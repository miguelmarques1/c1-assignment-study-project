import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Pagination } from "../Pagination";

describe("Pagination", () => {
  it("renders_nothing_when_total_pages_le_1", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} baseQuery={{}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("prev_is_disabled_on_first_page", () => {
    render(
      <Pagination
        page={1}
        totalPages={3}
        baseQuery={{ sort: "createdAt", dir: "desc" }}
      />,
    );
    const prev = screen.getByText("Previous");
    expect(prev.tagName).toBe("SPAN");
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    const next = screen.getByText("Next");
    expect(next.tagName).toBe("A");
  });

  it("next_is_disabled_on_last_page", () => {
    render(
      <Pagination
        page={3}
        totalPages={3}
        baseQuery={{ sort: "createdAt", dir: "desc" }}
      />,
    );
    const next = screen.getByText("Next");
    expect(next.tagName).toBe("SPAN");
    expect(next.getAttribute("aria-disabled")).toBe("true");
  });

  it("preserves_other_query_params", () => {
    render(
      <Pagination
        page={2}
        totalPages={3}
        baseQuery={{ q: "ada", sort: "email", dir: "asc" }}
      />,
    );
    const next = screen.getByText("Next") as HTMLAnchorElement;
    expect(next.getAttribute("href")).toContain("q=ada");
    expect(next.getAttribute("href")).toContain("sort=email");
    expect(next.getAttribute("href")).toContain("dir=asc");
    expect(next.getAttribute("href")).toContain("page=3");
  });
});
