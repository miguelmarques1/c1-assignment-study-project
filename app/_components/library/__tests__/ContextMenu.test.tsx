import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContextMenu, type ContextMenuItem } from "../ContextMenu";

function buildItems(includeRetry: boolean): ContextMenuItem[] {
  const base: ContextMenuItem[] = [
    { key: "open", label: "Open", onSelect: vi.fn() },
    { key: "rename", label: "Rename", onSelect: vi.fn() },
    { key: "edit", label: "Edit description", onSelect: vi.fn() },
    { key: "delete", label: "Delete", onSelect: vi.fn(), destructive: true },
  ];
  if (includeRetry) {
    base.push({ key: "retry", label: "Retry", onSelect: vi.fn() });
  }
  return base;
}

describe("ContextMenu", () => {
  it("menu_renders_all_items_for_failed_video", () => {
    render(<ContextMenu items={buildItems(true)} />);
    fireEvent.click(screen.getByRole("button", { name: /open actions menu/i }));
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Edit description" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Retry" })).toBeInTheDocument();
  });

  it("menu_hides_retry_for_non_failed_video", () => {
    render(<ContextMenu items={buildItems(false)} />);
    fireEvent.click(screen.getByRole("button", { name: /open actions menu/i }));
    expect(screen.queryByRole("menuitem", { name: "Retry" })).toBeNull();
  });

  it("menu_closes_on_escape", () => {
    render(<ContextMenu items={buildItems(false)} />);
    fireEvent.click(screen.getByRole("button", { name: /open actions menu/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("menu_closes_on_outside_click", () => {
    render(
      <div>
        <button data-testid="outside">outside</button>
        <ContextMenu items={buildItems(false)} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open actions menu/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("menu_invokes_select_handler", () => {
    const items = buildItems(false);
    render(<ContextMenu items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /open actions menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(items[1].onSelect).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
