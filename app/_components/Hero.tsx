import Link from "next/link";

export function Hero() {
  return (
    <section className="w-full">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-6 py-24 sm:py-32">
        <span className="inline-flex items-center rounded-full bg-muted-surface px-3 py-1 text-xs font-medium text-muted">
          Private video library with AI transcription
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl sm:leading-[1.1]">
          Turn every video you own into a searchable, readable archive.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted">
          VideoMax MBA uploads your personal videos, transcribes them with timestamps, and
          writes a structured summary — so you can find any moment, skim before you watch,
          and stop scrubbing through hours of footage.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Create account
          </Link>
          <span className="text-sm text-muted">Free while in beta · No credit card</span>
        </div>
      </div>
    </section>
  );
}
