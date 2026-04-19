"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

export type ContextMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

type Props = {
  items: ContextMenuItem[];
  triggerLabel?: string;
};

export function ContextMenu({ items, triggerLabel = "Open actions menu" }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: globalThis.MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      const id = window.setTimeout(() => {
        itemRefs.current[0]?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  function handleTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = (activeIndex + 1) % items.length;
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = (activeIndex - 1 + items.length) % items.length;
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    }
  }

  function selectItem(item: ContextMenuItem, event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    item.onSelect();
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onKeyDown={handleTriggerKey}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted hover:border-border hover:bg-muted-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="sr-only">{triggerLabel}</span>
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          onKeyDown={handleMenuKey}
          className="absolute right-0 z-20 mt-1 w-44 origin-top-right rounded-md border border-border bg-white shadow-lg focus:outline-none"
        >
          <ul className="py-1">
            {items.map((item, index) => (
              <li key={item.key} role="none">
                <button
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitem"
                  onClick={(event) => selectItem(item, event)}
                  className={`block w-full px-3 py-1.5 text-left text-sm focus:outline-none focus:bg-muted-surface ${
                    item.destructive
                      ? "text-red-700 hover:bg-red-50"
                      : "text-foreground hover:bg-muted-surface"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
