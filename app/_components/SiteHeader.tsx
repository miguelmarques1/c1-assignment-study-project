import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="w-full border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          VideoMax <span className="text-muted font-medium">MBA</span>
        </Link>
        <nav aria-label="Primary">
          <Link
            href="/login"
            className="text-sm font-medium text-foreground hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm px-2 py-1"
          >
            Log in
          </Link>
        </nav>
      </div>
    </header>
  );
}
