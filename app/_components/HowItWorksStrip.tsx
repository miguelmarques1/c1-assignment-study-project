const steps = [
  {
    title: "Upload",
    description:
      "Drag and drop any MP4, MOV, MKV, WEBM, or AVI file up to 2GB. We take it from there.",
  },
  {
    title: "Transcribe",
    description:
      "Whisper produces timestamped segments with automatic language detection. Click any line to jump there.",
  },
  {
    title: "Summarize",
    description:
      "GPT-4.1 nano writes a short overview and extracts the key topics — read first, watch second.",
  },
];

export function HowItWorksStrip() {
  return (
    <section className="w-full border-t border-border bg-muted-surface">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          How it works
        </h2>
        <ol className="mt-10 grid gap-10 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold text-foreground">
                {index + 1}
              </span>
              <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
