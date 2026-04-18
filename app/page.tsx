import { redirect } from "next/navigation";
import { Hero } from "@/app/_components/Hero";
import { HowItWorksStrip } from "@/app/_components/HowItWorksStrip";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getSession } from "@/app/_lib/session";

export default async function LandingPage() {
  const session = await getSession();
  if (session) {
    redirect("/app");
  }

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Hero />
        <HowItWorksStrip />
      </main>
      <SiteFooter />
    </>
  );
}
