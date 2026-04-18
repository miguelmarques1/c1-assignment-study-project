import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { getSession } from "@/app/_lib/session";
import { register } from "@/app/_lib/auth/register";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
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
                Create your account
              </h1>
              <p className="text-sm text-muted">
                Start uploading videos and get transcripts in minutes.
              </p>
            </div>
            <RegisterForm action={register} />
            <p className="text-sm text-muted">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
              >
                Log in
              </Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
