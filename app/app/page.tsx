import { redirect } from "next/navigation";
import { LogoutButton } from "@/app/_components/LogoutButton";
import { getSession } from "@/app/_lib/session";

export default async function AppHomePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border px-6 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Library</h1>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
        <p className="text-muted">Your videos will appear here.</p>
      </main>
    </div>
  );
}
