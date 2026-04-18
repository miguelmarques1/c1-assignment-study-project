export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto w-full border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-2 px-6 py-8 sm:flex-row sm:items-center">
        <p className="text-sm font-medium text-foreground">VideoMax MBA</p>
        <p className="text-sm text-muted">
          © {year} VideoMax MBA · Your private, searchable video library.
        </p>
      </div>
    </footer>
  );
}
