import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { getSession } from "@/app/_lib/session";
import { login } from "@/app/_lib/auth/login";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/app");
  }

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <section className="w-full">
          <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-6 py-16 sm:py-20">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Log in
              </h1>
              <p className="text-sm text-muted">
                Welcome back. Enter your credentials to continue.
              </p>
            </div>
            <LoginForm action={login} />
            <p className="text-sm text-muted">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-medium text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
              >
                Create account
              </Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
