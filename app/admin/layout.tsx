import Link from "next/link";
import { requireAdmin } from "@/app/_lib/admin/guard";
import { LogoutButton } from "@/app/_components/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="flex min-h-full flex-col">
      <header className="w-full border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-8">
            <Link
              href="/admin"
              className="text-lg font-semibold tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
            >
              VideoMax <span className="text-muted font-medium">Admin</span>
            </Link>
            <nav aria-label="Admin" className="flex items-center gap-4">
              <Link
                href="/admin"
                className="text-sm font-medium text-foreground hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm px-2 py-1"
              >
                Dashboard
              </Link>
              <Link
                href="/admin/users"
                className="text-sm font-medium text-foreground hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm px-2 py-1"
              >
                Users
              </Link>
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
